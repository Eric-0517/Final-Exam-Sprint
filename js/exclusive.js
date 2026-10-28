
(() => {
  "use strict";

  const HOME_URL = "./index.html";
  const EXCLUSIVE_URL = "./exclusive.html";
  const sb = window.sb;

  if (!sb) {
    console.error("[專屬教材] Supabase 尚未初始化，請確認先載入 js/supabase-client.js。");
    return;
  }

  async function getCurrentUser() {
    const { data, error } = await sb.auth.getUser();

    if (error) {
      console.error("[專屬教材] 取得登入使用者失敗：", error.message);
      return null;
    }

    return data.user || null;
  }

  async function hasAccess(userId) {
    const { data, error } = await sb
      .from("user_permissions")
      .select("has_access")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[專屬教材] 讀取權限失敗：", error.message);
      throw error;
    }

    return data?.has_access === true;
  }

  function showMessage(title, message, icon = "info") {
    if (window.Swal) {
      return window.Swal.fire({
        title,
        text: message,
        icon,
        confirmButtonText: "確定",
        customClass: {
          popup: "study-swal-popup"
        }
      });
    }

    alert(`${title}\n${message}`);
    return Promise.resolve();
  }

  async function redeemCode(code) {
    const cleanCode = String(code || "").trim();

    if (!cleanCode) {
      await showMessage("請輸入開通碼", "開通碼不能為空。", "warning");
      return false;
    }

    const { data, error } = await sb.rpc("redeem_access_code", {
      p_code: cleanCode
    });

    if (error) {
      console.error("[專屬教材] 開通碼驗證失敗：", error.message);

      await showMessage(
        "兌換失敗",
        "目前無法驗證開通碼，請稍後再試。",
        "error"
      );

      return false;
    }

    if (!data?.success) {
      await showMessage(
        "無法開通",
        data?.message || "開通碼無效、已使用完畢或已過期。",
        "warning"
      );

      return false;
    }

    await showMessage(
      "開通成功",
      data.message || "專屬學習資源權限已開通。",
      "success"
    );

    return true;
  }

  async function requestCode() {
    if (!window.Swal) {
      const code = window.prompt("請輸入開通碼");
      if (!code?.trim()) return false;

      return redeemCode(code);
    }

    const result = await window.Swal.fire({
      title: "開通專屬權限",
      text: "此頁面僅限已開通帳號使用，請輸入開通碼。",
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
      customClass: {
        popup: "study-swal-popup"
      },
      inputValidator: value => {
        if (!value?.trim()) {
          return "請先輸入開通碼。";
        }
      }
    });

    if (!result.isConfirmed || !result.value) {
      return false;
    }

    return redeemCode(result.value);
  }

  async function handleExclusiveClick(event) {
    event.preventDefault();

    const link = document.getElementById("exclusiveNavLink");

    try {
      const user = await getCurrentUser();

      if (!user) {
        await showMessage(
          "無權限瀏覽",
          "請先使用 Google 帳號登入，才能瀏覽專屬影音與教材。",
          "warning"
        );
        return;
      }

      const allowed = await hasAccess(user.id);

      if (link) {
        link.classList.toggle("has-access", allowed);
      }

      if (allowed) {
        window.location.href = EXCLUSIVE_URL;
        return;
      }

      if (window.Swal) {
        const result = await window.Swal.fire({
          title: "尚未開通",
          text: "你目前沒有瀏覽權限，是否輸入開通碼？",
          icon: "warning",
          showCancelButton: true,
          confirmButtonText: "輸入開通碼",
          cancelButtonText: "取消",
          customClass: {
            popup: "study-swal-popup"
          }
        });

        if (!result.isConfirmed) return;
      } else {
        const proceed = window.confirm(
          "你目前沒有瀏覽權限，是否輸入開通碼？"
        );

        if (!proceed) return;
      }

      const redeemed = await requestCode();

      if (!redeemed) return;

      const updatedAccess = await hasAccess(user.id);

      if (link) {
        link.classList.toggle("has-access", updatedAccess);
      }

      if (updatedAccess) {
        window.location.href = EXCLUSIVE_URL;
      } else {
        await showMessage(
          "尚未取得權限",
          "目前尚未確認你的帳號已開通，請重新登入或稍後再試。",
          "warning"
        );
      }
    } catch (error) {
      console.error("[專屬教材] 點擊處理失敗：", error);

      await showMessage(
        "系統暫時無法使用",
        "權限檢查失敗，請稍後再試，並確認網路連線。",
        "error"
      );
    }
  }

  async function initExclusivePage() {
    try {
      const user = await getCurrentUser();

      if (!user) {
        window.location.replace(HOME_URL);
        return;
      }

      const allowed = await hasAccess(user.id);

      if (!allowed) {
        window.location.replace(HOME_URL);
        return;
      }

      document.documentElement.classList.add("exclusive-authorized");

      document.dispatchEvent(
        new CustomEvent("exclusive-access-ready", {
          detail: {
            userId: user.id
          }
        })
      );
    } catch (error) {
      console.error("[專屬教材] 頁面權限檢查失敗：", error);
      window.location.replace(HOME_URL);
    }
  }

  function initNavigation() {
    const link = document.getElementById("exclusiveNavLink");

    if (!link) {
      console.error(
        "[專屬教材] 找不到 #exclusiveNavLink，請檢查 index.html 的連結 ID。"
      );
      return;
    }

    link.addEventListener("click", handleExclusiveClick);

    async function refreshAccess() {
      try {
        const user = await getCurrentUser();
        const allowed = user ? await hasAccess(user.id) : false;

        link.classList.toggle("has-access", allowed);
      } catch (error) {
        link.classList.remove("has-access");
        console.error("[專屬教材] 更新導覽列權限失敗：", error);
      }
    }

    refreshAccess();

    sb.auth.onAuthStateChange(() => {
      refreshAccess();
    });
  }

  if (location.pathname.endsWith("/exclusive.html") ||
      location.pathname.endsWith("exclusive.html")) {
    initExclusivePage();
  } else {
    initNavigation();
  }
})();
