const { createClient } = require('@supabase/supabase-js');

// Client biasa (anon key) — untuk operasi yang merespect RLS
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Client admin (service role) — bypass RLS, untuk operasi admin server-side
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

module.exports = { supabase, supabaseAdmin };
