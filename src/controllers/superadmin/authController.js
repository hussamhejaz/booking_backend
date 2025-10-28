// src/controllers/superadmin/authController.js
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { supabaseAdmin } = require("../../supabase");

// validate body
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(3),
});

async function loginSuperAdmin(req, res) {
  // 1. body validation
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "INVALID_PAYLOAD",
      details: parsed.error.flatten(),
    });
  }

  const { email, password } = parsed.data;

  // 2. sign in with Supabase
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data?.user) {
    return res.status(401).json({
      ok: false,
      error: "BAD_CREDENTIALS",
    });
  }

  const user = data.user;
  const role = user.app_metadata?.role;

  // 3. block anyone who’s not a superadmin
  if (role !== "superadmin") {
    return res.status(403).json({
      ok: false,
      error: "NOT_SUPERADMIN",
    });
  }

  // 4. issue dashboard token
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role,
      name: user.user_metadata?.name || "Super Admin",
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES || "7d" }
  );

  // 5. send formatted response
  return res.json({
    ok: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      role,
      name: user.user_metadata?.name || null,
      created_at: user.created_at,
    },
  });
}

module.exports = {
  loginSuperAdmin,
};
