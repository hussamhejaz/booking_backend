const { supabaseAdmin } = require("../../supabase");

function ensure(body, field) {
  if (
    body[field] === undefined ||
    body[field] === null ||
    String(body[field]).trim() === ""
  ) {
    throw new Error(`Missing field: ${field}`);
  }
}

async function createPublicContact(req, res) {
  try {
    ensure(req.body, "name");
    ensure(req.body, "phone");
    ensure(req.body, "msg");

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const {
      name,
      phone,
      msg,
      email,
      salon_id = null,
      source = "public_web",
    } = req.body;

    const payload = {
      name: String(name).trim(),
      phone: String(phone).trim(),
      email: email ? String(email).trim() : null,
      message: String(msg).trim(),
      salon_id,
      source,
      status: "new",
    };

    const { data, error } = await supabaseAdmin
      .from("contact_messages")
      .insert([payload])
      .select("*")
      .single();

    if (error) {
      console.error("createPublicContact error:", error);
      return res.status(500).json({
        ok: false,
        error: "CREATE_CONTACT_FAILED",
        details: error.message,
      });
    }

    return res.status(201).json({
      ok: true,
      contact: data,
    });
  } catch (err) {
    console.error("createPublicContact fatal:", err);
    const status = err.message?.startsWith("Missing field") ? 400 : 500;
    return res.status(status).json({
      ok: false,
      error: err.message || "SERVER_ERROR",
    });
  }
}

module.exports = {
  createPublicContact,
};
