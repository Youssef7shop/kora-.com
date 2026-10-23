(function () {
  "use strict";

  window.novaRedirectByRole = async function () {
    const client = window.novaClient || window.supabaseClient;

    if (!client?.auth) {
      window.location.replace("login.html");
      return;
    }

    try {
      const { data: sessionData, error: sessionError } =
        await client.auth.getSession();

      if (sessionError) throw sessionError;

      const user = sessionData.session?.user;

      if (!user) {
        window.location.replace("login.html");
        return;
      }

      const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      const role = String(profile?.role || "client").toLowerCase();
      const currentPage = window.location.pathname.split("/").pop();

      if (role === "admin" || role === "super_admin") {
        if (currentPage !== "admin.html") {
          window.location.replace("admin.html");
        }
        return;
      }

      if (currentPage === "admin.html") {
        window.location.replace("dashboard.html");
        return;
      }

      if (
        currentPage === "login.html" ||
        currentPage === "register.html"
      ) {
        window.location.replace("dashboard.html");
      }
    } catch (error) {
      console.error("[NOVA] Role verification failed:", error);
      document.dispatchEvent(
        new CustomEvent("nova-role-check-failed")
      );
    }
  };
})();
