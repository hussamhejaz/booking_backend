// src/middleware/requireSuperAdmin.js
const jwt = require("jsonwebtoken");

module.exports = function requireSuperAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const parts = header.split(" ");
    const token =
      parts.length === 2 && parts[0] === "Bearer" ? parts[1] : null;

    if (!token) {
      return res
        .status(401)
        .json({ ok: false, error: "Missing token" });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // IMPORTANT: match what loginSuperAdmin() puts in the token
    // role should be "superadmin"
    if (!payload || payload.role !== "superadmin") {
      return res
        .status(403)
        .json({ ok: false, error: "Forbidden" });
    }

    // attach to request for logging/auditing if needed
    req.superAdmin = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      name: payload.name,
    };

    next();
  } catch (e) {
    return res
      .status(401)
      .json({ ok: false, error: "Invalid or expired token" });
  }
};
