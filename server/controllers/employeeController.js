const { supabaseAdmin } = require('../lib/supabase');

/** GET /api/employees */
async function getAll(req, res) {
  try {
    const { data, error } = await supabaseAdmin
      .from('employees')
      .select('*, face_descriptors(id)')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/** GET /api/employees/with-descriptors — untuk face recognition */
async function getAllWithDescriptors(req, res) {
  try {
    const { data, error } = await supabaseAdmin
      .from('employees')
      .select('id, name, photo_url, face_descriptors(descriptor)')
      .eq('is_active', true);
    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/** POST /api/employees */
async function create(req, res) {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nama, email, dan password wajib diisi' });
  }

  try {
    // 1. Buat user di Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'user', name }
    });
    if (authError) return res.status(400).json({ error: authError.message });

    // 2. Insert ke tabel employees
    const { data: employee, error: empError } = await supabaseAdmin
      .from('employees')
      .insert({ name, email })
      .select()
      .single();
    if (empError) throw empError;

    // 3. Insert ke profiles
    await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user.id,
        role: 'user',
        employee_id: employee.id
      });

    return res.status(201).json(employee);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/** POST /api/employees/:id/face */
async function saveFaceDescriptor(req, res) {
  const { id } = req.params;
  const { descriptor } = req.body;
  if (!descriptor || !Array.isArray(descriptor)) {
    return res.status(400).json({ error: 'Descriptor wajah tidak valid' });
  }

  try {
    // Hapus descriptor lama, ganti baru
    await supabaseAdmin.from('face_descriptors').delete().eq('employee_id', id);

    const { data, error } = await supabaseAdmin
      .from('face_descriptors')
      .insert({ employee_id: id, descriptor })
      .select()
      .single();
    if (error) throw error;

    return res.json({ message: 'Descriptor wajah berhasil disimpan', data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/** DELETE /api/employees/:id/face */
async function resetFace(req, res) {
  const { id } = req.params;
  try {
    const { error } = await supabaseAdmin
      .from('face_descriptors')
      .delete()
      .eq('employee_id', id);
    if (error) throw error;
    return res.json({ message: 'Data wajah karyawan berhasil direset' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/** PUT /api/employees/:id */
async function update(req, res) {
  const { id } = req.params;
  const { name, photo_url } = req.body;
  try {
    const { data, error } = await supabaseAdmin
      .from('employees')
      .update({ name, photo_url })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/** DELETE /api/employees/:id — soft delete: nonaktifkan akun */
async function remove(req, res) {
  const { id } = req.params;
  try {
    // Nonaktifkan di tabel employees
    const { data: emp, error: empError } = await supabaseAdmin
      .from('employees')
      .update({ is_active: false })
      .eq('id', id)
      .select('email')
      .single();
    if (empError) throw empError;

    // Nonaktifkan user di Supabase Auth (ban user)
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const authUser = users?.users?.find(u => u.email === emp.email);
    if (authUser) {
      await supabaseAdmin.auth.admin.updateUserById(authUser.id, { ban_duration: '876600h' });
    }

    return res.json({ message: 'Karyawan berhasil dinonaktifkan' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { getAll, getAllWithDescriptors, create, saveFaceDescriptor, resetFace, update, remove };
