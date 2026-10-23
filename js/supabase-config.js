// js/supabase-config.js
(function () {
  "use strict";

  const SUPABASE_URL =
    "https://wftcbzufmcjwyzyichml.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_ApmI13vCQ93xxioPg7fMxA_jXVgTihi";

  function initSupabase() {
    if (
      !window.supabase ||
      typeof window.supabase.createClient !== "function"
    ) {
      console.error(
        "[NOVA] Supabase library not loaded."
      );
      return;
    }

    // ما ننشؤوش اتصال ثاني إلا كان موجود
    if (window.novaClient?.auth) {
      window.supabaseClient = window.novaClient;
      return;
    }

    try {
      const client = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
      );

      window.novaClient = client;
      window.supabaseClient = client;

      console.log("[NOVA] Supabase initialized successfully.");
    } catch (error) {
      console.error(
        "[NOVA] Supabase initialization failed:",
        error
      );
    }
  }

  initSupabase();
})();