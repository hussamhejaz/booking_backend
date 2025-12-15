// src/controllers/owner/employeeController.js
const { supabaseAdmin } = require("../../supabase");

function need(body, field) {
  if (
    body[field] === undefined ||
    body[field] === null ||
    String(body[field]).trim() === ""
  ) {
    throw new Error(`Missing field: ${field}`);
  }
}

async function assertServiceBelongsToSalon(salonId, serviceId) {
  const { data, error } = await supabaseAdmin
    .from("services")
    .select("id, name, duration_minutes, price")
    .eq("id", serviceId)
    .eq("salon_id", salonId)
    .single();

  if (error || !data) {
    const err = new Error("SERVICE_NOT_FOUND");
    err.status = 404;
    throw err;
  }

  return data;
}

async function validateServiceIds(salonId, serviceIds = []) {
  if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
    return [];
  }

  const uniqueIds = [...new Set(serviceIds.filter(Boolean))];

  const { data, error } = await supabaseAdmin
    .from("services")
    .select("id")
    .eq("salon_id", salonId)
    .in("id", uniqueIds);

  if (error) {
    const err = new Error("SERVICE_LOOKUP_FAILED");
    err.status = 500;
    err.details = error.message;
    throw err;
  }

  if (!data || data.length !== uniqueIds.length) {
    const missing = uniqueIds.filter(
      (id) => !(data || []).some((svc) => svc.id === id)
    );
    const err = new Error("SERVICE_NOT_IN_SALON");
    err.status = 400;
    err.details = `Unknown service IDs: ${missing.join(", ")}`;
    throw err;
  }

  return uniqueIds;
}

async function validateEmployeesBelongToSalon(salonId, employeeIds = []) {
  const unique = [...new Set(employeeIds.filter(Boolean))];
  if (unique.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("employees")
    .select("id")
    .eq("salon_id", salonId)
    .in("id", unique);

  if (error) {
    const err = new Error("EMPLOYEE_LOOKUP_FAILED");
    err.status = 500;
    err.details = error.message;
    throw err;
  }

  if (!data || data.length !== unique.length) {
    const missing = unique.filter(
      (id) => !(data || []).some((emp) => emp.id === id)
    );
    const err = new Error("EMPLOYEE_NOT_IN_SALON");
    err.status = 400;
    err.details = `Unknown employee IDs: ${missing.join(", ")}`;
    throw err;
  }

  return unique;
}

async function attachServiceAssignments(salonId, employees = []) {
  const ids = employees.map((e) => e.id).filter(Boolean);
  if (!ids.length) return employees;

  const { data: links, error } = await supabaseAdmin
    .from("service_employees")
    .select(
      `
        employee_id,
        service_id,
        services:service_id (id, name, duration_minutes, price, section_id)
      `
    )
    .eq("salon_id", salonId)
    .in("employee_id", ids);

  if (error) {
    console.error("attachServiceAssignments lookup error:", error);
    return employees;
  }

  const map = new Map();
  (links || []).forEach((link) => {
    const arr = map.get(link.employee_id) || [];
    arr.push(
      link.services || {
        id: link.service_id,
      }
    );
    map.set(link.employee_id, arr);
  });

  return employees.map((emp) => ({
    ...emp,
    services: map.get(emp.id) || [],
  }));
}

async function upsertEmployeeServices(salonId, employeeId, serviceIds) {
  if (serviceIds === undefined) {
    return attachServiceAssignments(salonId, [{ id: employeeId }]).then(
      (res) => res[0]?.services || []
    );
  }

  if (!Array.isArray(serviceIds)) {
    const err = new Error("INVALID_SERVICE_IDS");
    err.status = 400;
    throw err;
  }

  const validatedIds = await validateServiceIds(salonId, serviceIds);

  await supabaseAdmin
    .from("service_employees")
    .delete()
    .eq("salon_id", salonId)
    .eq("employee_id", employeeId);

  if (validatedIds.length > 0) {
    const rows = validatedIds.map((serviceId) => ({
      salon_id: salonId,
      employee_id: employeeId,
      service_id: serviceId,
    }));

    const { error: insertError } = await supabaseAdmin
      .from("service_employees")
      .insert(rows);

    if (insertError) {
      const err = new Error("SERVICE_ASSIGNMENTS_FAILED");
      err.status = 500;
      err.details = insertError.message;
      throw err;
    }
  }

  const { data: services } = await supabaseAdmin
    .from("service_employees")
    .select(
      `
        services:service_id (id, name, duration_minutes, price, section_id)
      `
    )
    .eq("salon_id", salonId)
    .eq("employee_id", employeeId);

  return (services || []).map((row) => row.services || row);
}

async function listEmployees(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const includeServices = req.query.include_services === "true";

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { data: employees, error } = await supabaseAdmin
      .from("employees")
      .select("*")
      .eq("salon_id", salonId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("listEmployees error:", error);
      return res.status(500).json({
        ok: false,
        error: "FETCH_EMPLOYEES_FAILED",
      });
    }

    const payload = includeServices
      ? await attachServiceAssignments(salonId, employees || [])
      : employees || [];

    return res.json({
      ok: true,
      employees: payload,
    });
  } catch (err) {
    console.error("listEmployees fatal:", err);
    const status = err.status || 500;
    return res.status(status).json({
      ok: false,
      error: err.message || "SERVER_ERROR",
      details: err.details,
    });
  }
}

async function getEmployeeById(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { employeeId } = req.params;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { data: employee, error } = await supabaseAdmin
      .from("employees")
      .select("*")
      .eq("id", employeeId)
      .eq("salon_id", salonId)
      .single();

    if (error || !employee) {
      return res.status(404).json({
        ok: false,
        error: "EMPLOYEE_NOT_FOUND",
      });
    }

    const [withServices] = await attachServiceAssignments(salonId, [employee]);

    return res.json({
      ok: true,
      employee: withServices || employee,
    });
  } catch (err) {
    console.error("getEmployeeById fatal:", err);
    const status = err.status || 500;
    return res.status(status).json({
      ok: false,
      error: err.message || "SERVER_ERROR",
      details: err.details,
    });
  }
}

async function createEmployee(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    need(req.body, "full_name");

    const {
      full_name,
      role,
      phone,
      email,
      is_active = true,
      service_ids,
    } = req.body;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { data: employee, error } = await supabaseAdmin
      .from("employees")
      .insert([
        {
          salon_id: salonId,
          full_name: full_name.trim(),
          role: role?.trim() || null,
          phone: phone?.trim() || null,
          email: email?.trim() || null,
          is_active,
        },
      ])
      .select("*")
      .single();

    if (error) {
      console.error("createEmployee error:", error);
      return res.status(500).json({
        ok: false,
        error: "CREATE_EMPLOYEE_FAILED",
        details: error.message,
      });
    }

    let services = [];
    if (service_ids !== undefined) {
      services = await upsertEmployeeServices(salonId, employee.id, service_ids);
    }

    return res.status(201).json({
      ok: true,
      employee: {
        ...employee,
        services,
      },
    });
  } catch (err) {
    console.error("createEmployee fatal:", err);
    const status = err.status || 500;
    return res.status(status).json({
      ok: false,
      error: err.message || "SERVER_ERROR",
      details: err.details,
    });
  }
}

async function updateEmployee(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { employeeId } = req.params;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { data: existing, error: checkError } = await supabaseAdmin
      .from("employees")
      .select("id")
      .eq("id", employeeId)
      .eq("salon_id", salonId)
      .single();

    if (checkError || !existing) {
      return res.status(404).json({
        ok: false,
        error: "EMPLOYEE_NOT_FOUND",
      });
    }

    const {
      full_name,
      role,
      phone,
      email,
      is_active,
      service_ids,
    } = req.body;

    const updates = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (role !== undefined) updates.role = role;
    if (phone !== undefined) updates.phone = phone;
    if (email !== undefined) updates.email = email;
    if (is_active !== undefined) updates.is_active = is_active;
    updates.updated_at = new Date().toISOString();

    const { data: employee, error } = await supabaseAdmin
      .from("employees")
      .update(updates)
      .eq("id", employeeId)
      .eq("salon_id", salonId)
      .select("*")
      .single();

    if (error) {
      console.error("updateEmployee error:", error);
      return res.status(500).json({
        ok: false,
        error: "UPDATE_EMPLOYEE_FAILED",
        details: error.message,
      });
    }

    const services = await upsertEmployeeServices(
      salonId,
      employeeId,
      service_ids
    );

    return res.json({
      ok: true,
      employee: {
        ...employee,
        services,
      },
    });
  } catch (err) {
    console.error("updateEmployee fatal:", err);
    const status = err.status || 500;
    return res.status(status).json({
      ok: false,
      error: err.message || "SERVER_ERROR",
      details: err.details,
    });
  }
}

async function deleteEmployee(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { employeeId } = req.params;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    const { data: existing, error: checkError } = await supabaseAdmin
      .from("employees")
      .select("id, full_name")
      .eq("id", employeeId)
      .eq("salon_id", salonId)
      .single();

    if (checkError || !existing) {
      return res.status(404).json({
        ok: false,
        error: "EMPLOYEE_NOT_FOUND",
      });
    }

    const { error } = await supabaseAdmin
      .from("employees")
      .delete()
      .eq("id", employeeId)
      .eq("salon_id", salonId);

    if (error) {
      if (error.code === "23503") {
        // FK constraint (e.g., bookings.employee_id)
        return res.status(400).json({
          ok: false,
          error: "EMPLOYEE_IN_USE",
          details:
            "Employee is linked to existing bookings. Reassign or remove those bookings before deleting.",
        });
      }
      console.error("deleteEmployee error:", error);
      return res.status(500).json({
        ok: false,
        error: "DELETE_EMPLOYEE_FAILED",
        details: error.message,
      });
    }

    return res.json({
      ok: true,
      deletedEmployeeId: employeeId,
      deletedName: existing.full_name,
    });
  } catch (err) {
    console.error("deleteEmployee fatal:", err);
    const status = err.status || 500;
    return res.status(status).json({
      ok: false,
      error: err.message || "SERVER_ERROR",
      details: err.details,
    });
  }
}

async function listEmployeesForService(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { serviceId } = req.params;
    const activeOnly = req.query.active_only !== "false";

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
      console.error("listEmployeesForService links error:", error);
      return res.status(500).json({
        ok: false,
        error: "FETCH_EMPLOYEES_FAILED",
        details: error.message,
      });
    }

    const employeeIds = (links || []).map((link) => link.employee_id);

    if (!employeeIds.length) {
      return res.json({
        ok: true,
        service_id: serviceId,
        employees: [],
      });
    }

    let query = supabaseAdmin
      .from("employees")
      .select("*")
      .eq("salon_id", salonId)
      .in("id", employeeIds);

    if (activeOnly) {
      query = query.eq("is_active", true);
    }

    const { data: employees, error: employeesError } = await query;

    if (employeesError) {
      console.error("listEmployeesForService employees error:", employeesError);
      return res.status(500).json({
        ok: false,
        error: "FETCH_EMPLOYEES_FAILED",
        details: employeesError.message,
      });
    }

    return res.json({
      ok: true,
      service_id: serviceId,
      employees: employees || [],
    });
  } catch (err) {
    console.error("listEmployeesForService fatal:", err);
    const status = err.status || 500;
    return res.status(status).json({
      ok: false,
      error: err.message || "SERVER_ERROR",
      details: err.details,
    });
  }
}

async function setEmployeesForService(req, res) {
  try {
    const salonId = req.ownerUser.salon_id;
    const { serviceId } = req.params;
    const { employee_ids } = req.body;

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    await assertServiceBelongsToSalon(salonId, serviceId);

    if (employee_ids !== undefined && !Array.isArray(employee_ids)) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_EMPLOYEE_IDS",
        details: "employee_ids must be an array of employee IDs",
      });
    }

    const validEmployeeIds = await validateEmployeesBelongToSalon(
      salonId,
      employee_ids || []
    );

    await supabaseAdmin
      .from("service_employees")
      .delete()
      .eq("salon_id", salonId)
      .eq("service_id", serviceId);

    if (validEmployeeIds.length > 0) {
      const rows = validEmployeeIds.map((employeeId) => ({
        salon_id: salonId,
        service_id: serviceId,
        employee_id: employeeId,
      }));

      const { error: insertError } = await supabaseAdmin
        .from("service_employees")
        .insert(rows);

      if (insertError) {
        console.error("setEmployeesForService insert error:", insertError);
        return res.status(500).json({
          ok: false,
          error: "ASSIGN_EMPLOYEES_FAILED",
          details: insertError.message,
        });
      }
    }

    let employees = [];
    if (validEmployeeIds.length > 0) {
      const { data } = await supabaseAdmin
        .from("employees")
        .select("*")
        .eq("salon_id", salonId)
        .in("id", validEmployeeIds);
      employees = data || [];
    }

    return res.json({
      ok: true,
      service_id: serviceId,
      employees,
    });
  } catch (err) {
    console.error("setEmployeesForService fatal:", err);
    const status = err.status || 500;
    return res.status(status).json({
      ok: false,
      error: err.message || "SERVER_ERROR",
      details: err.details,
    });
  }
}

module.exports = {
  listEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  listEmployeesForService,
  setEmployeesForService,
  // Exported for reuse in public controllers
  assertServiceBelongsToSalon,
};
