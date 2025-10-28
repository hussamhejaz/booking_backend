// src/supabase.js
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

// pull env vars
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// helpful warnings so you don't lose 30 mins debugging :)
if (!SUPABASE_URL) {
  console.warn("⚠️ Missing SUPABASE_URL in .env");
}
if (!SUPABASE_ANON_KEY) {
  console.warn("⚠️ Missing SUPABASE_ANON_KEY in .env (public key)");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("⚠️ Missing SUPABASE_SERVICE_ROLE_KEY in .env (service role key)");
}

/**
 * supabaseAdmin:
 * - Uses SERVICE_ROLE_KEY
 * - Full admin powers (manage users, update metadata, etc.)
 * - NEVER expose this key to the browser / frontend
 */
const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null;

/**
 * supabasePublic:
 * - Uses ANON_KEY
 * - Safe for public operations (reading public tables with RLS, etc.)
 * - You *can* expose this to frontend apps
 *
 * We might not need this yet in the backend, but it's convenient to export now.
 */
const supabasePublic =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null;

module.exports = {
  supabaseAdmin,
  supabasePublic,
};

