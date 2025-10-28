// src/controllers/debugController.js
const { supabase } = require("../supabase");

async function testSupabase(req, res, next) {
  try {
    

    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error("Supabase auth error:", authError);
      return res.status(500).json({
        ok: false,
        step: "auth.getUser",
        error: authError.message || authError,
      });
    }

    return res.json({
      ok: true,
      message: "Supabase connection looks good 🎉",
      userCheck: authData || null,
      url: process.env.SUPABASE_URL,
    });
  } catch (err) {
    console.error("Unexpected supabase test error:", err);
    next(err);
  }
}

module.exports = { testSupabase };
