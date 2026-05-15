const { supabaseAdmin } = require('../lib/supabase');

/** GET /api/settings */
async function getSettings(req, res) {
  try {
    const { data, error } = await supabaseAdmin
      .from('settings').select('*').eq('id', 1).single();
    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/** PUT /api/settings */
async function updateSettings(req, res) {
  const { office_lat, office_lng, radius_meters, check_in_deadline, check_out_start } = req.body;
  try {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .update({ office_lat, office_lng, radius_meters, check_in_deadline, check_out_start, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select()
      .single();
    if (error) throw error;
    return res.json({ message: 'Pengaturan berhasil disimpan', data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { getSettings, updateSettings };
