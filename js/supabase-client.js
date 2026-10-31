(() => {
  "use strict";

  const SUPABASE_URL = "https://hcegldjvhyrzfahkzmpp.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_nWbqisDG6KgmTDG7g6O5Sg_PF3c_bAV";

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("Supabase SDK 尚未載入，請先載入 @supabase/supabase-js@2。");
    return;
  }

  window.SUPABASE_URL = SUPABASE_URL;
  window.SUPABASE_PUBLISHABLE_KEY = SUPABASE_PUBLISHABLE_KEY;

  window.sb = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
})();
