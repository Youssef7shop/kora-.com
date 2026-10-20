
window.NOVA_SUPABASE_URL = "https://wftcbzufmcjwyzyichml.supabase.co";
window.NOVA_SUPABASE_ANON_KEY = "sb_publishable_ApmI13vCQ93xxioPg7fMxA_jXVgTihi";

window.novaSupabaseConfigured = function () {
  return (
    window.NOVA_SUPABASE_URL.startsWith("https://") &&
    !window.NOVA_SUPABASE_URL.includes("YOUR-PROJECT") &&
    !!window.NOVA_SUPABASE_ANON_KEY &&
    !window.NOVA_SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")
  );
};
