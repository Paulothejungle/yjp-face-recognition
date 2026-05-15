const { supabaseAdmin } = require('../lib/supabase');

/**
 * Middleware: verifikasi JWT dari Supabase Auth
 * Inject req.user dan req.role ke request
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Token tidak ditemukan' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized: Token tidak valid' });
    }

    // Ambil role dari tabel profiles
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, employee_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({ error: 'Forbidden: Profil tidak ditemukan' });
    }

    req.user = user;
    req.role = profile.role;
    req.employeeId = profile.employee_id;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Server error saat autentikasi' });
  }
}

/**
 * Middleware: hanya admin yang boleh akses
 */
function adminOnly(req, res, next) {
  if (req.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Hanya admin yang dapat mengakses' });
  }
  next();
}

module.exports = { authenticate, adminOnly };
