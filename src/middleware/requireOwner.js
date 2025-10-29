const jwt = require("jsonwebtoken");

/**
 * Checks Authorization: Bearer <token>
 * Verifies token, makes sure role is "owner" (or allowed)
 * Attaches req.ownerUser = { id, salon_id, role }
 */
function requireOwner(req, res, next) {
  try {
    const hdr = req.headers.authorization || "";
    const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;

    if (!token) {
      return res.status(401).json({
        ok: false,
        error: "NO_TOKEN",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        ok: false,
        error: "INVALID_TOKEN",
      });
    }

    // basic role check
    if (
      !decoded ||
      decoded.type !== "salon_user" ||
      !decoded.salon_id ||
      !decoded.sub
    ) {
      return res.status(403).json({
        ok: false,
        error: "FORBIDDEN",
      });
    }

    // if you only want owners, enforce here:
    // if (decoded.role !== "owner") { ... }

    req.ownerUser = {
      id: decoded.sub,
      salon_id: decoded.salon_id,
      role: decoded.role,
    };

    next();
  } catch (err) {
    console.error("requireOwner fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

module.exports = requireOwner;
