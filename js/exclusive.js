(() => {
  "use strict";

  const HOME_URL = "./index.html";
  const EXCLUSIVE_URL = "./exclusive.html";

  const sb = window.sb;

  if (!sb) {
    console.error("Supabase 尚未初始化，請確認先載入 js/supabase-client.js。");
    return;
  }

  async function getCurrentUser() {
    const { data, error } = await sb.auth.getUser();
    if (error) return null;
    return data.user || null;
  }

  async function hasAccess(userId) {
    const { data, error } = await sb
      .from("user_permissions")
      .select("has_access")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("讀取權限失敗：", error.message);
      return false;
    }

    return data?.has_access === true;
  }

  function showMessage(title, message, icon = "info") {
    if (window.Swal) {
      return Swal.fire({
        title,
        text: message,
        icon,
        confirmButtonText: "確定",
        customClass: { popup: "study-swal-popup" }
      });
    }

    alert(`${title}\n${message}`);
    return Promise.resolve();
  }

  async function redeemCode(code) {
    const { data, error } = await sb.rpc("redeem_access_code", {
      p_code: code.trim()
    });

    if (error) {
      console.error("兌換失敗：", error.message);
      await showMessage("兌換失敗", "目前無法驗證兌換碼，請稍後再試。", "error");
      return false;
    }

    if (!data?.success) {
      await showMessage("無法開通", data?.message || "兌換碼無效。", "warning");
      return false;
    }

    await showMessage("開通成功", data.message || "權限已開通。", "success");
    return true;
  }

  async function requestCode() {
    if (!window.Swal) {
      const code = prompt("請輸入開通碼");
      if (!code?.trim()) return false;
      return redeemCode(code);
    }

    const result = await Swal.fire({
      title: "開通權限",
      text: "請輸入開通碼。",
      input: "text",
      inputPlaceholder: "輸入開通碼",
      inputAttributes: {
        autocapitalize: "characters",
        autocomplete: "off",
        maxlength: "200"
      },
      showCancelButton: true,
      confirmButtonText: "確認開通",
      cancelButtonText: "取消",
      customClass: { popup: "study-swal-popup" },
      inputValidator: value => {
        if (!value?.trim()) return "請先輸入開通碼。";
      }
    });

    if (!result.isConfirmed || !result.value) return false;
    return redeemCode(result.value);
  }

  async function handleExclusiveClick(event) {
    event.preventDefault();

    const user = await getCurrentUser();

    if (!user) {
      await showMessage("無權限瀏覽", "請先使用 Google 帳號登入。", "warning");
      return;
    }

    if (await hasAccess(user.id)) {
      window.location.href = EXCLUSIVE_URL;
      return;
    }

    const redeemed = await requestCode();

    if (redeemed && await hasAccess(user.id)) {
      window.location.href = EXCLUSIVE_URL;
    }
  }

  async function initExclusivePage() {
    const user = await getCurrentUser();

    if (!user) {
      window.location.replace(HOME_URL);
      return;
    }

    if (!await hasAccess(user.id)) {
      window.location.replace(HOME_URL);
      return;
    }

    document.documentElement.classList.add("exclusive-authorized");
    document.dispatchEvent(new CustomEvent("exclusive-access-ready", {
      detail: { userId: user.id }
    }));
  }

  function initNavigation() {
    const link = document.getElementById("exclusiveNavLink");
    if (!link) return;

    link.addEventListener("click", handleExclusiveClick);

    getCurrentUser().then(async user => {
      if (!user) {
        link.classList.remove("has-access");
        return;
      }

      const allowed = await hasAccess(user.id);
      link.classList.toggle("has-access", allowed);
    });
  }

  if (location.pathname.endsWith("/exclusive.html") ||
      location.pathname.endsWith("exclusive.html")) {
    initExclusivePage();
  } else {
    initNavigation();
  }
})();
