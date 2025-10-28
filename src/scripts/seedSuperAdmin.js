// back-end/src/scripts/forceRoleSuperadmin.js

require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});

const { supabaseAdmin } = require("../supabase");

// put your actual Supabase user ID here:
const USER_ID = "1549d9ff-fff3-46f7-b48e-a4446eb81ba4";

(async () => {
  try {
    if (!supabaseAdmin) {
      console.error("❌ supabaseAdmin is not initialized. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env");
      process.exit(1);
    }

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(USER_ID, {
      app_metadata: { role: "superadmin" },
      user_metadata: { name: "Master Admin" },
    });

    if (error) {
      console.error("❌ Failed to update user metadata:", error);
      process.exit(1);
    }

    console.log("✅ Updated user:");
    console.log({
      id: data.user.id,
      email: data.user.email,
      app_metadata: data.user.app_metadata,
      user_metadata: data.user.user_metadata,
    });

    process.exit(0);
  } catch (err) {
    console.error("❌ Unexpected error:", err);
    process.exit(1);
  }
})();
