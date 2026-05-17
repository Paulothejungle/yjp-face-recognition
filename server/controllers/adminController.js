const { supabaseAdmin } = require('../lib/supabase');

/**
 * POST /api/admin/cleanup-metadata
 * Hapus photo_url dari user_metadata semua user agar JWT tidak membengkak
 * Endpoint ini hanya bisa diakses admin
 */
async function cleanupMetadata(req, res) {
  try {
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) throw error;

    let cleaned = 0;
    for (const user of users.users) {
      const meta = user.user_metadata || {};
      if (meta.photo_url) {
        const newMeta = { ...meta };
        delete newMeta.photo_url;
        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          user_metadata: newMeta
        });
        cleaned++;
      }
    }

    return res.json({
      message: `Berhasil membersihkan metadata photo_url dari ${cleaned} user`,
      total_users: users.users.length,
      cleaned
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { cleanupMetadata };
