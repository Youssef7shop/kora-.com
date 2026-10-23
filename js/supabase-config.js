(function () {
  "use strict";

  const SUPABASE_URL =
    "https://wftcbzufmcjwyzyichml.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_ApmI13vCQ93xxioPg7fMxA_jXVgTihi";

  console.log("[NOVA] كنبدأو إعداد Supabase...");

  function initializeSupabase() {
    if (!window.supabase) {
      console.error(
        "[NOVA] مكتبة Supabase ما تحمّلاتش. راجع CDN."
      );
      return;
    }

    if (typeof window.supabase.createClient !== "function") {
      console.error(
        "[NOVA] createClient ما موجوداش فمكتبة Supabase."
      );
      return;
    }

    if (window.novaClient) {
      window.supabaseClient = window.novaClient;
      console.log("[NOVA] الاتصال موجود من قبل.");
      return;
    }

    try {
      const client = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
      );

      window.novaClient = client;
      window.supabaseClient = client;

      console.log("[NOVA] Supabase تهيّأ بنجاح.");
    } catch (error) {
      console.error(
        "[NOVA] فشل إنشاء الاتصال:",
        error
      );
    }
  }

  initializeSupabase();
})();