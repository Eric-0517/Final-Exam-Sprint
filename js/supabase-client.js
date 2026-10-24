(() => {
  "use strict";

  const SUPABASE_URL = "https://hcegldjvhyrzfahkzmpp.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_nWbqisDG6KgmTDG7g6O5Sg_PF3c_bAV";

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("Supabase SDK 尚未載入，請先載入 @supabase/supabase-js@2。");
    return;
  }

  if (SUPABASE_URL.includes("請填入") || SUPABASE_PUBLISHABLE_KEY.includes("請填入")) {
    console.warn("請先設定 js/supabase-client.js 的 Supabase URL 與 Publishable Key。");
  }

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
