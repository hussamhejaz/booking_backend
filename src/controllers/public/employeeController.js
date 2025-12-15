// src/controllers/public/employeeController.js
const { supabaseAdmin } = require("../../supabase");
const { assertServiceBelongsToSalon } = require("../owner/employeeController");

// GET /api/public/:salonId/services/:serviceId/employees
async function listPublicServiceEmployees(req, res) {
  try {
    const { salonId, serviceId } = req.params;

    if (!salonId || !serviceId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_PARAMETERS",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    await assertServiceBelongsToSalon(salonId, serviceId);

    const { data: links, error } = await supabaseAdmin
      .from("service_employees")
      .select("employee_id")
      .eq("salon_id", salonId)
      .eq("service_id", serviceId);

    if (error) {
      console.error("listPublicServiceEmployees links error:", error);
      return res.status(500).json({
        ok: false,
        error: "FETCH_EMPLOYEES_FAILED",
      });
    }

    const ids = (links || []).map((link) => link.employee_id);

    if (!ids.length) {
      return res.json({
        ok: true,
        service_id: serviceId,
        employees: [],
      });
    }

    const { data: employees, error: employeesError } = await supabaseAdmin
      .from("employees")
      .select("id, full_name, role, phone, email, is_active")
      .eq("salon_id", salonId)
      .eq("is_active", true)
      .in("id", ids);

    if (employeesError) {
      console.error("listPublicServiceEmployees employees error:", employeesError);
      return res.status(500).json({
        ok: false,
        error: "FETCH_EMPLOYEES_FAILED",
      });
    }

    return res.json({
      ok: true,
      service_id: serviceId,
      employees: employees || [],
    });
  } catch (err) {
    console.error("listPublicServiceEmployees fatal:", err);
    const status = err.status || 500;
    return res.status(status).json({
      ok: false,
      error: err.message || "SERVER_ERROR",
      details: err.details,
    });
  }
}

module.exports = {
  listPublicServiceEmployees,
};
