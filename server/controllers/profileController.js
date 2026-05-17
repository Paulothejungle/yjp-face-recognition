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
 * Upload foto profil ke Supabase Storage, update photo_url di employees/auth metadata
 * Body: { base64, fileName, mimeType }
 */
async function uploadPhoto(req, res) {
  const { base64, fileName, mimeType } = req.body;

  if (!base64 || !fileName) {
    return res.status(400).json({ error: 'Data foto tidak valid' });
  }

  try {
    // Konversi base64 → Buffer
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Tentukan path di Storage
    const ext = fileName.split('.').pop() || 'jpg';
    const userId = req.user.id;
    const storagePath = `profiles/${userId}/avatar.${ext}`;

    // Upload ke Supabase Storage bucket "avatars"
    const { error: uploadError } = await supabaseAdmin.storage
      .from('avatars')
      .upload(storagePath, buffer, {
        contentType: mimeType || 'image/jpeg',
        upsert: true
      });

    if (uploadError) throw uploadError;

    // Dapatkan public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('avatars')
      .getPublicUrl(storagePath);

    const photoUrl = urlData.publicUrl;

    // Update di tabel employees (jika bukan admin murni)
    if (req.employeeId) {
      await supabaseAdmin
        .from('employees')
        .update({ photo_url: photoUrl })
        .eq('id', req.employeeId);
    }

    // Update juga di auth metadata
    await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
      user_metadata: { photo_url: photoUrl }
    });

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
