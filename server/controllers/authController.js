const { supabaseAdmin } = require('../lib/supabase');

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email dan password wajib diisi' });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: 'Email atau password salah' });

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, employee_id, photo_url, employees(name, photo_url)')
      .eq('id', data.user.id)
      .single();

    return res.json({
      token: data.session.access_token,
      role: profile?.role || 'user',
      employee_id: profile?.employee_id,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: profile?.employees?.name || null,
        // Karyawan: employees.photo_url | Admin: profiles.photo_url
        photo_url: profile?.employees?.photo_url || profile?.photo_url || null,
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
}

/**
 * POST /api/auth/logout
 */
async function logout(req, res) {
  try {
    await supabaseAdmin.auth.signOut();
    return res.json({ message: 'Berhasil logout' });
  } catch (err) {
    return res.status(500).json({ error: 'Server error saat logout' });
  }
}

/**
 * GET /api/auth/me
 */
async function me(req, res) {
  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, employee_id, photo_url, employees(name, photo_url)')
      .eq('id', req.user.id)
      .single();

    return res.json({
      id: req.user.id,
      email: req.user.email,
      role: profile?.role,
      employee_id: profile?.employee_id,
      name: profile?.employees?.name || null,
      photo_url: profile?.employees?.photo_url || profile?.photo_url || null,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { login, logout, me };
