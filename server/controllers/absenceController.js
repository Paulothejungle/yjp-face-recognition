const { supabaseAdmin } = require('../lib/supabase');

/** Cek apakah hari ini Minggu */
function isSunday() {
  return new Date().getDay() === 0;
}

/** Cek apakah deadline 17:00 sudah lewat hari ini */
function isDeadlinePassed() {
  const now = new Date();
  const deadline = new Date(now);
  deadline.setHours(17, 0, 0, 0);
  return now > deadline;
}

/**
 * GET /api/absences
 * Admin: semua data | Karyawan: milik sendiri
 */
async function getAll(req, res) {
  try {
    let query = supabaseAdmin
      .from('absences')
      .select('id, date, type, reason, photo_url, status, admin_note, created_at, employee_id, employees(id, name, email, photo_url)')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (req.role !== 'admin') {
      if (!req.employeeId) return res.status(403).json({ error: 'Akses ditolak' });
      query = query.eq('employee_id', req.employeeId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/absences
 * Karyawan submit izin atau sakit hari ini
 */
async function create(req, res) {
  const { type, reason, photo_url } = req.body;

  if (!type || !['izin', 'sakit'].includes(type)) {
    return res.status(400).json({ error: 'Tipe harus "izin" atau "sakit"' });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Keterangan wajib diisi' });
  }
  if (!photo_url) {
    return res.status(400).json({
      error: type === 'izin' ? 'Foto bukti wajib diupload untuk izin' : 'Foto surat dokter wajib diupload untuk sakit'
    });
  }
  if (!req.employeeId) {
    return res.status(403).json({ error: 'Hanya karyawan yang bisa submit izin' });
  }

  // Blokir hari Minggu
  if (isSunday()) {
    return res.status(400).json({ error: 'Hari Minggu adalah hari libur. Tidak dapat mengajukan izin.' });
  }

  // Cek batas waktu jam 17:00
  if (isDeadlinePassed()) {
    return res.status(400).json({
      error: 'Batas waktu pengajuan sudah lewat (17:00). Tidak dapat mengajukan izin untuk hari ini.'
    });
  }

  const today = new Date().toISOString().split('T')[0];

  // Cek apakah sudah ada pengajuan hari ini
  const { data: existing } = await supabaseAdmin
    .from('absences')
    .select('id, type')
    .eq('employee_id', req.employeeId)
    .eq('date', today)
    .maybeSingle();

  if (existing) {
    return res.status(409).json({ error: `Sudah ada pengajuan "${existing.type}" untuk hari ini` });
  }

  // Cek apakah sudah hadir hari ini
  const { data: attendance } = await supabaseAdmin
    .from('attendance')
    .select('id')
    .eq('employee_id', req.employeeId)
    .eq('date', today)
    .maybeSingle();

  if (attendance) {
    return res.status(400).json({ error: 'Anda sudah tercatat hadir hari ini, tidak perlu mengajukan izin' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('absences')
      .insert({
        employee_id: req.employeeId,
        date: today,
        type,
        reason: reason.trim(),
        photo_url,
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * PUT /api/absences/:id/confirm
 * Admin approve atau reject pengajuan
 */
async function confirm(req, res) {
  const { id } = req.params;
  const { status, admin_note } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status harus "approved" atau "rejected"' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('absences')
      .update({ status, admin_note: admin_note || null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, status, admin_note, employees(name)')
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * PUT /api/absences/:id
 * Admin edit data absen (tipe, alasan, status, catatan)
 */
async function update(req, res) {
  const { id } = req.params;
  const { type, reason, status, admin_note } = req.body;

  const updates = { updated_at: new Date().toISOString() };
  if (type && ['izin', 'sakit', 'alpa'].includes(type)) updates.type = type;
  if (reason !== undefined) updates.reason = reason;
  if (status && ['pending', 'approved', 'rejected'].includes(status)) updates.status = status;
  if (admin_note !== undefined) updates.admin_note = admin_note;

  try {
    const { data, error } = await supabaseAdmin
      .from('absences')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/absences/process-alpa
 * Proses alpa otomatis: karyawan yg tidak hadir dan tidak ada pengajuan → insert alpa
 * Hanya bisa dijalankan setelah jam 17:00
 */
async function processAlpa(req, res) {
  if (!isDeadlinePassed()) {
    return res.status(400).json({ error: 'Proses alpa hanya bisa dilakukan setelah jam 17:00' });
  }

  const now = new Date();
  const dayOfWeek = now.getDay();

  if (dayOfWeek === 0) {
    return res.json({ message: 'Hari Minggu, tidak ada proses alpa', processed: 0 });
  }

  const today = now.toISOString().split('T')[0];

  try {
    // Semua karyawan aktif
    const { data: employees, error: empError } = await supabaseAdmin
      .from('employees')
      .select('id, name')
      .eq('is_active', true);
    if (empError) throw empError;

    // Yang sudah hadir
    const { data: attendances } = await supabaseAdmin
      .from('attendance')
      .select('employee_id')
      .eq('date', today);
    const presentIds = new Set((attendances || []).map(a => a.employee_id));

    // Yang sudah ada pengajuan
    const { data: existing } = await supabaseAdmin
      .from('absences')
      .select('employee_id')
      .eq('date', today);
    const submittedIds = new Set((existing || []).map(a => a.employee_id));

    // Yang belum hadir dan belum ada pengajuan → alpa
    const alpaList = employees.filter(e => !presentIds.has(e.id) && !submittedIds.has(e.id));

    if (alpaList.length === 0) {
      return res.json({ message: 'Semua karyawan sudah hadir atau ada pengajuan. Tidak ada yang perlu diproses.', processed: 0 });
    }

    const { error: insertError } = await supabaseAdmin
      .from('absences')
      .insert(alpaList.map(e => ({
        employee_id: e.id,
        date: today,
        type: 'alpa',
        reason: 'Tidak hadir tanpa keterangan',
        status: 'approved'
      })));

    if (insertError) throw insertError;

    return res.json({
      message: `${alpaList.length} karyawan berhasil diproses sebagai alpa`,
      processed: alpaList.length,
      employees: alpaList.map(e => e.name)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { getAll, create, confirm, update, processAlpa };
