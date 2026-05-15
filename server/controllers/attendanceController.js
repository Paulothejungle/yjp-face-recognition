const { supabaseAdmin } = require('../lib/supabase');

/** Hitung jarak dua koordinat dalam meter (Haversine formula) */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // radius bumi dalam meter
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * POST /api/attendance/checkin
 * Body: { employee_id, lat, lng }
 */
async function checkIn(req, res) {
  const { employee_id, lat, lng } = req.body;
  const employeeId = req.role === 'admin' ? employee_id : req.employeeId;

  if (!employeeId) return res.status(400).json({ error: 'Employee ID tidak ditemukan' });
  if (!lat || !lng) return res.status(400).json({ error: 'Koordinat lokasi wajib disertakan' });

  try {
    // Ambil settings (koordinat kantor & radius)
    const { data: settings } = await supabaseAdmin
      .from('settings').select('*').eq('id', 1).single();

    const distance = haversineDistance(lat, lng, settings.office_lat, settings.office_lng);
    const isInArea = distance <= settings.radius_meters;

    // Tolak jika di luar radius
    if (!isInArea) {
      return res.status(403).json({
        error: `Absen ditolak: Anda berada ${Math.round(distance)}m dari kantor. Maksimum radius adalah ${settings.radius_meters}m.`,
        distance: Math.round(distance),
        max_radius: settings.radius_meters
      });
    }

    const now = new Date();
    const wibTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jakarta"}));
    const day = wibTime.getDay(); // 0=Minggu, 1=Senin... 6=Sabtu
    const currentHour = wibTime.getHours();
    const currentMinute = wibTime.getMinutes();
    
    // Format YYYY-MM-DD sesuai WIB
    const wibYear = wibTime.getFullYear();
    const wibMonth = String(wibTime.getMonth() + 1).padStart(2, '0');
    const wibDateStr = String(wibTime.getDate()).padStart(2, '0');
    const today = `${wibYear}-${wibMonth}-${wibDateStr}`;

    if (day === 0) {
      return res.status(403).json({ error: 'Hari Minggu libur, absen masuk tidak diizinkan.' });
    }

    // Cek apakah sudah absen masuk hari ini
    const { data: existing } = await supabaseAdmin
      .from('attendance')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('date', today)
      .single();

    if (existing?.check_in) {
      return res.status(409).json({ error: 'Sudah melakukan absen masuk hari ini' });
    }

    // Tentukan status: terlambat atau hadir (Batas 07:30)
    const isLate = currentHour > 7 || (currentHour === 7 && currentMinute > 30);
    const status = isLate ? 'terlambat' : 'hadir';

    // Upsert attendance
    const { data, error } = await supabaseAdmin
      .from('attendance')
      .upsert({
        employee_id: employeeId,
        date: today,
        check_in: now.toISOString(),
        check_in_lat: lat,
        check_in_lng: lng,
        check_in_location_status: 'dalam_area',
        status
      }, { onConflict: 'employee_id,date' })
      .select()
      .single();

    if (error) throw error;

    return res.json({
      message: isLate ? `Absen masuk berhasil (Terlambat ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')})` : 'Absen masuk berhasil',
      data,
      status,
      distance: Math.round(distance)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/attendance/checkout
 * Body: { employee_id, lat, lng }
 */
async function checkOut(req, res) {
  const { employee_id, lat, lng } = req.body;
  const employeeId = req.role === 'admin' ? employee_id : req.employeeId;

  if (!employeeId) return res.status(400).json({ error: 'Employee ID tidak ditemukan' });
  if (!lat || !lng) return res.status(400).json({ error: 'Koordinat lokasi wajib disertakan' });

  try {
    const { data: settings } = await supabaseAdmin
      .from('settings').select('*').eq('id', 1).single();

    const distance = haversineDistance(lat, lng, settings.office_lat, settings.office_lng);
    const isInArea = distance <= settings.radius_meters;

    if (!isInArea) {
      return res.status(403).json({
        error: `Absen keluar ditolak: Anda berada ${Math.round(distance)}m dari kantor.`,
        distance: Math.round(distance),
        max_radius: settings.radius_meters
      });
    }

    const now = new Date();
    const wibTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jakarta"}));
    const day = wibTime.getDay(); // 0=Minggu, 1=Senin... 6=Sabtu
    const currentHour = wibTime.getHours();
    
    // Format YYYY-MM-DD sesuai WIB
    const wibYear = wibTime.getFullYear();
    const wibMonth = String(wibTime.getMonth() + 1).padStart(2, '0');
    const wibDateStr = String(wibTime.getDate()).padStart(2, '0');
    const today = `${wibYear}-${wibMonth}-${wibDateStr}`;

    if (day === 0) {
      return res.status(403).json({ error: 'Hari Minggu libur, absen keluar tidak diizinkan.' });
    }

    // Validasi jam pulang
    if (day >= 1 && day <= 5) { // Senin - Jumat
      if (currentHour < 17) {
        return res.status(403).json({ error: 'Belum waktunya pulang. Absen keluar baru bisa dilakukan jam 17:00.' });
      }
    } else if (day === 6) { // Sabtu
      if (currentHour < 12) {
        return res.status(403).json({ error: 'Belum waktunya pulang. Absen keluar baru bisa dilakukan jam 12:00.' });
      }
    }

    const { data: existing } = await supabaseAdmin
      .from('attendance')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('date', today)
      .single();

    if (!existing?.check_in) {
      return res.status(400).json({ error: 'Belum melakukan absen masuk hari ini' });
    }
    if (existing?.check_out) {
      return res.status(409).json({ error: 'Sudah melakukan absen keluar hari ini' });
    }

    const { data, error } = await supabaseAdmin
      .from('attendance')
      .update({
        check_out: now.toISOString(),
        check_out_lat: lat,
        check_out_lng: lng,
        check_out_location_status: 'dalam_area'
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;

    return res.json({ message: 'Absen keluar berhasil', data, distance: Math.round(distance) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/attendance/me?date=YYYY-MM-DD
 */
async function getMyAttendance(req, res) {
  const { date, start_date, end_date } = req.query;
  try {
    let query = supabaseAdmin
      .from('attendance')
      .select('*, employees(name)')
      .eq('employee_id', req.employeeId)
      .order('date', { ascending: false });

    if (date) query = query.eq('date', date);
    if (start_date) query = query.gte('date', start_date);
    if (end_date) query = query.lte('date', end_date);

    const { data, error } = await query;
    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/attendance?start_date=&end_date=&employee_id= (admin)
 */
async function getAll(req, res) {
  const { start_date, end_date, employee_id, date } = req.query;
  try {
    let query = supabaseAdmin
      .from('attendance')
      .select('*, employees(name)')
      .order('date', { ascending: false })
      .order('check_in', { ascending: false });

    if (date) query = query.eq('date', date);
    if (start_date) query = query.gte('date', start_date);
    if (end_date) query = query.lte('date', end_date);
    if (employee_id) query = query.eq('employee_id', employee_id);

    const { data, error } = await query;
    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/attendance/today-summary (admin dashboard)
 */
async function todaySummary(req, res) {
  const today = new Date().toISOString().split('T')[0];
  try {
    const { data: employees } = await supabaseAdmin
      .from('employees').select('id').eq('is_active', true);

    const { data: attendance } = await supabaseAdmin
      .from('attendance')
      .select('*, employees(name, photo_url)')
      .eq('date', today);

    const totalKaryawan = employees?.length || 0;
    const hadir = attendance?.filter(a => a.status === 'hadir').length || 0;
    const terlambat = attendance?.filter(a => a.status === 'terlambat').length || 0;
    const sudahAbsen = attendance?.length || 0;
    const alpha = totalKaryawan - sudahAbsen;

    return res.json({ totalKaryawan, hadir, terlambat, alpha, detail: attendance });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { checkIn, checkOut, getMyAttendance, getAll, todaySummary };
