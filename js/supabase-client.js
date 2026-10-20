
(function () {
  "use strict";

  window.novaClient = null;

  if (
    !window.supabase ||
    typeof window.supabase.createClient !== "function"
  ) {
    console.error("NOVA MARKET: Supabase library failed to load.");
    return;
  }

  if (
    typeof window.novaSupabaseConfigured !== "function" ||
    !window.novaSupabaseConfigured()
  ) {
    console.warn(
      "NOVA MARKET: Add your Supabase project URL and publishable key in js/supabase-config.js"
    );
    return;
  }

  window.novaClient = window.supabase.createClient(
    window.NOVA_SUPABASE_URL,
    window.NOVA_SUPABASE_ANON_KEY
  );

  console.log("NOVA MARKET: Supabase client initialized.");
})();
