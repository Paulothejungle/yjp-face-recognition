const { supabaseAdmin } = require('../lib/supabase');

/**
 * GET /api/profile/me
 * Ambil data profil karyawan yang sedang login
 */
async function getProfile(req, res) {
  try {
    if (!req.employeeId) {
      // Admin tidak punya employee record, ambil dari auth user
      const { data: user } = await supabaseAdmin.auth.admin.getUserById(req.user.id);
      return res.json({
        id: null,
        name: user?.user_metadata?.name || 'Admin',
        email: req.user.email,
        photo_url: user?.user_metadata?.photo_url || null,
        role: 'admin'
      });
    }

    const { data, error } = await supabaseAdmin
      .from('employees')
      .select('id, name, email, photo_url')
      .eq('id', req.employeeId)
      .single();

    if (error) throw error;
    return res.json({ ...data, role: req.role });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * PUT /api/profile/me/photo
 * Upload foto profil — simpan HANYA di tabel employees (BUKAN di user_metadata)
 * agar JWT token tidak membengkak dan menyebabkan error 494.
 * Body: { base64, mimeType }
 */
async function uploadPhoto(req, res) {
  const { base64, mimeType } = req.body;

  if (!base64) {
    return res.status(400).json({ error: 'Data foto tidak valid' });
  }

  try {
    const photoUrl = base64; // simpan sebagai data URL

    if (req.employeeId) {
      // Karyawan biasa: simpan di tabel employees
      const { error } = await supabaseAdmin
        .from('employees')
        .update({ photo_url: photoUrl })
        .eq('id', req.employeeId);
      if (error) throw error;
    } else {
      // Admin: simpan di tabel profiles (tambahkan kolom photo_url jika belum ada)
      // Untuk sementara, buat employee record untuk admin jika belum ada
      // Cari employee record berdasarkan email
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(req.user.id);
      const adminEmail = authUser?.user?.email;

      if (adminEmail) {
        // Cek apakah ada employee record untuk admin
        const { data: emp } = await supabaseAdmin
          .from('employees')
          .select('id')
          .eq('email', adminEmail)
          .maybeSingle();

        if (emp) {
          await supabaseAdmin.from('employees').update({ photo_url: photoUrl }).eq('id', emp.id);
        }
      }
    }

    // PENTING: Jangan simpan photo ke user_metadata agar JWT tetap kecil.
    // Hapus photo_url dari user_metadata jika ada (mencegah JWT 494 error)
    const { data: existingUser } = await supabaseAdmin.auth.admin.getUserById(req.user.id);
    const existingMeta = { ...(existingUser?.user?.user_metadata || {}) };
    if (existingMeta.photo_url) {
      delete existingMeta.photo_url;
      await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
        user_metadata: existingMeta
      });
    }

    return res.json({ photo_url: photoUrl });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * PUT /api/profile/me
 * Update nama profil
 */
async function updateProfile(req, res) {
  const { name } = req.body;
  try {
    if (req.employeeId) {
      const { data, error } = await supabaseAdmin
        .from('employees')
        .update({ name })
        .eq('id', req.employeeId)
        .select()
        .single();
      if (error) throw error;
      return res.json(data);
    }

    // Admin: update di auth metadata
    await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
      user_metadata: { name }
    });
    return res.json({ name });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * PUT /api/profile/me/password
 * User/admin ganti password sendiri — butuh verifikasi password lama
 */
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Password lama dan baru wajib diisi' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password baru minimal 8 karakter' });
  }

  try {
    // Verifikasi password lama dengan mencoba login
    const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: req.user.email,
      password: currentPassword
    });
    if (signInError) {
      return res.status(401).json({ error: 'Password lama tidak benar' });
    }

    // Update password baru
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      req.user.id,
      { password: newPassword }
    );
    if (updateError) throw updateError;

    return res.json({ message: 'Password berhasil diubah' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { getProfile, uploadPhoto, updateProfile, changePassword };
