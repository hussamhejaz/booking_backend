const { supabaseAdmin } = require("../../supabase");

async function fetchServiceSlots(serviceIds = []) {
  if (!supabaseAdmin || !serviceIds.length) {
    return {};
  }

  const { data, error } = await supabaseAdmin
    .from("service_time_slots")
    .select("service_id, slot_time, duration_minutes, is_active")
    .in("service_id", serviceIds)
    .order("slot_time", { ascending: true });

  if (error) {
    console.error("fetchServiceSlots error:", error);
    return {};
  }

  return (data || []).reduce((acc, slot) => {
    if (!acc[slot.service_id]) {
      acc[slot.service_id] = [];
    }
    acc[slot.service_id].push({
      slot_time: slot.slot_time,
      duration_minutes: slot.duration_minutes,
      is_active: slot.is_active,
    });
    return acc;
  }, {});
}

// GET /api/public/:salonId/services
async function listPublicServices(req, res) {
  try {
    const { salonId } = req.params;

    if (!salonId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_SALON_ID",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    // First, verify the salon exists and is active
    const { data: salon, error: salonError } = await supabaseAdmin
      .from("salons")
      .select("id, name, brand_color, is_active")
      .eq("id", salonId)
      .eq("is_active", true)
      .single();

    if (salonError || !salon) {
      return res.status(404).json({
        ok: false,
        error: "SALON_NOT_FOUND",
      });
    }

    // Get all active services for this salon with their sections and features
    const { data: services, error: servicesError } = await supabaseAdmin
      .from("services")
      .select(`
        id,
        name,
        description,
        price,
        duration_minutes,
        is_active,
        section_id,
        sections (
          id,
          name,
          subtitle,
          icon_key
        ),
        service_features (
          id,
          name,
          is_checked
        )
      `)
      .eq("salon_id", salonId)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (servicesError) {
      console.error("listPublicServices error:", servicesError);
      return res.status(500).json({
        ok: false,
        error: "FETCH_SERVICES_FAILED",
        details: servicesError.message,
      });
    }

    const serviceIds = (services || []).map((service) => service.id);
    const slotsMap = await fetchServiceSlots(serviceIds);

    // Group services by section for better organization
    const servicesBySection = (services || []).reduce((acc, service) => {
      const sectionId = service.section_id;
      if (!acc[sectionId]) {
        acc[sectionId] = {
          section: service.sections,
          services: []
        };
      }
      
      // Clean up service data and ensure features array
      const cleanService = {
        id: service.id,
        name: service.name,
        description: service.description,
        price: service.price,
        duration_minutes: service.duration_minutes,
        features: service.service_features || [],
        time_slots: slotsMap[service.id] || [],
      };
      
      acc[sectionId].services.push(cleanService);
      return acc;
    }, {});

    return res.json({
      ok: true,
      salon: {
        id: salon.id,
        name: salon.name,
        brand_color: salon.brand_color
      },
      servicesBySection: servicesBySection,
      allServices: (services || []).map(service => ({
        id: service.id,
        name: service.name,
        description: service.description,
        price: service.price,
        duration_minutes: service.duration_minutes,
        section_id: service.section_id,
        section_name: service.sections?.name,
        features: service.service_features || [],
        time_slots: slotsMap[service.id] || [],
      }))
    });
  } catch (err) {
    console.error("listPublicServices fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// GET /api/public/:salonId/sections/:sectionId/services
async function listPublicServicesBySection(req, res) {
  try {
    const { salonId, sectionId } = req.params;

    if (!salonId || !sectionId) {
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

    // Verify salon exists and is active
    const { data: salon, error: salonError } = await supabaseAdmin
      .from("salons")
      .select("id, is_active")
      .eq("id", salonId)
      .eq("is_active", true)
      .single();

    if (salonError || !salon) {
      return res.status(404).json({
        ok: false,
        error: "SALON_NOT_FOUND",
      });
    }

    // Verify section exists and belongs to this salon
    const { data: section, error: sectionError } = await supabaseAdmin
      .from("sections")
      .select("id, name, subtitle, icon_key")
      .eq("id", sectionId)
      .eq("salon_id", salonId)
      .eq("is_active", true)
      .single();

    if (sectionError || !section) {
      return res.status(404).json({
        ok: false,
        error: "SECTION_NOT_FOUND",
      });
    }

    // Get active services for this specific section
    const { data: services, error: servicesError } = await supabaseAdmin
      .from("services")
      .select(`
        id,
        name,
        description,
        price,
        duration_minutes,
        is_active,
        service_features (
          id,
          name,
          is_checked
        )
      `)
      .eq("salon_id", salonId)
      .eq("section_id", sectionId)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (servicesError) {
      console.error("listPublicServicesBySection error:", servicesError);
      return res.status(500).json({
        ok: false,
        error: "FETCH_SERVICES_FAILED",
        details: servicesError.message,
      });
    }

    const serviceIds = (services || []).map((service) => service.id);
    const slotsMap = await fetchServiceSlots(serviceIds);

    return res.json({
      ok: true,
      section: section,
      services: (services || []).map(service => ({
        id: service.id,
        name: service.name,
        description: service.description,
        price: service.price,
        duration_minutes: service.duration_minutes,
        features: service.service_features || [],
        time_slots: slotsMap[service.id] || [],
      }))
    });
  } catch (err) {
    console.error("listPublicServicesBySection fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// GET /api/public/:salonId/services/:serviceId
async function getPublicServiceById(req, res) {
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

    // Verify salon exists and is active
    const { data: salon, error: salonError } = await supabaseAdmin
      .from("salons")
      .select("id, is_active")
      .eq("id", salonId)
      .eq("is_active", true)
      .single();

    if (salonError || !salon) {
      return res.status(404).json({
        ok: false,
        error: "SALON_NOT_FOUND",
      });
    }

    // Get the specific service with its section and features
    const { data: service, error: serviceError } = await supabaseAdmin
      .from("services")
      .select(`
        id,
        name,
        description,
        price,
        duration_minutes,
        is_active,
        section_id,
        sections (
          id,
          name,
          subtitle,
          icon_key
        ),
        service_features (
          id,
          name,
          is_checked
        )
      `)
      .eq("id", serviceId)
      .eq("salon_id", salonId)
      .eq("is_active", true)
      .single();

    if (serviceError || !service) {
      return res.status(404).json({
        ok: false,
        error: "SERVICE_NOT_FOUND",
      });
    }

    let timeSlots = [];
    try {
      const slotsMap = await fetchServiceSlots([service.id]);
      timeSlots = slotsMap[service.id] || [];
    } catch (slotErr) {
      console.error("getPublicServiceById slots error:", slotErr);
    }

    return res.json({
      ok: true,
      service: {
        id: service.id,
        name: service.name,
        description: service.description,
        price: service.price,
        duration_minutes: service.duration_minutes,
        section: service.sections,
        features: service.service_features || [],
        time_slots: timeSlots,
      }
    });
  } catch (err) {
    console.error("getPublicServiceById fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

// GET /api/public/:salonId/services/search
async function searchPublicServices(req, res) {
  try {
    const { salonId } = req.params;
    const { q: searchQuery, section: sectionId } = req.query;

    if (!salonId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_SALON_ID",
      });
    }

    if (!supabaseAdmin) {
      return res.status(500).json({
        ok: false,
        error: "SUPABASE_NOT_CONFIGURED",
      });
    }

    // Verify salon exists and is active
    const { data: salon, error: salonError } = await supabaseAdmin
      .from("salons")
      .select("id, is_active")
      .eq("id", salonId)
      .eq("is_active", true)
      .single();

    if (salonError || !salon) {
      return res.status(404).json({
        ok: false,
        error: "SALON_NOT_FOUND",
      });
    }

    let query = supabaseAdmin
      .from("services")
      .select(`
        id,
        name,
        description,
        price,
        duration_minutes,
        section_id,
        sections (
          id,
          name,
          subtitle,
          icon_key
        ),
        service_features (
          id,
          name,
          is_checked
        )
      `)
      .eq("salon_id", salonId)
      .eq("is_active", true);

    // Apply search filter if provided
    if (searchQuery && searchQuery.trim() !== "") {
      query = query.or(`name.ilike.%${searchQuery.trim()}%,description.ilike.%${searchQuery.trim()}%`);
    }

    // Apply section filter if provided
    if (sectionId && sectionId !== "all") {
      query = query.eq("section_id", sectionId);
    }

    query = query.order("display_order", { ascending: true })
                .order("created_at", { ascending: true });

    const { data: services, error: servicesError } = await query;

    if (servicesError) {
      console.error("searchPublicServices error:", servicesError);
      return res.status(500).json({
        ok: false,
        error: "SEARCH_SERVICES_FAILED",
        details: servicesError.message,
      });
    }

    const serviceIds = (services || []).map((service) => service.id);
    const slotsMap = await fetchServiceSlots(serviceIds);

    return res.json({
      ok: true,
      searchQuery: searchQuery || "",
      sectionFilter: sectionId || "all",
      services: (services || []).map(service => ({
        id: service.id,
        name: service.name,
        description: service.description,
        price: service.price,
        duration_minutes: service.duration_minutes,
        section: service.sections,
        features: service.service_features || [],
        time_slots: slotsMap[service.id] || [],
      }))
    });
  } catch (err) {
    console.error("searchPublicServices fatal:", err);
    return res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
    });
  }
}

module.exports = {
  listPublicServices,
  listPublicServicesBySection,
  getPublicServiceById,
  searchPublicServices,
};
