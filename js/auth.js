
(() => {
  "use strict";

  const get = id => document.getElementById(id);
  let signingIn = false;

  function getClient() {
    return window.sb && window.sb.auth ? window.sb : null;
  }

  function renderUser(user) {
    const loggedIn = Boolean(user);
    const metadata = user?.user_metadata || {};
    const displayName =
      metadata.full_name ||
      metadata.name ||
      user?.email ||
      "已登入使用者";

    const avatarUrl = metadata.avatar_url || metadata.picture || "";

    // 導覽列帳號
    const navUser = get("authUser");
    const navAvatar = get("authAvatar");
    const navName = get("authName");
    const navEmail = get("authEmail");
    const navLogin = get("googleLoginBtn");
    const navLogout = get("logoutBtn");
    const profileLink = get("profileNavLink");

    if (navUser) navUser.hidden = !loggedIn;
    if (navLogin) navLogin.hidden = loggedIn;
    if (navLogout) navLogout.hidden = !loggedIn;
    if (profileLink) profileLink.hidden = !loggedIn;

    if (navName) navName.textContent = displayName;
    if (navEmail) navEmail.textContent = user?.email || "";

    if (navAvatar) {
      navAvatar.hidden = !loggedIn || !avatarUrl;
      if (avatarUrl) navAvatar.src = avatarUrl;
      else navAvatar.removeAttribute("src");
    }

    // 個人中心頁面帳號
    const profileUser = get("profileUser");
    const profileAvatar = get("profileAvatar");
    const profileName = get("profileName");
    const profileEmail = get("profileEmail");
    const profileLogin = get("profileGoogleLoginBtn");
    const profileLogout = get("profileLogoutBtn");
    const signedOut = get("signedOut");

    if (profileUser) profileUser.hidden = !loggedIn;
    if (profileLogin) profileLogin.hidden = loggedIn;
    if (profileLogout) profileLogout.hidden = !loggedIn;
    if (signedOut) signedOut.hidden = loggedIn;

    if (profileName) profileName.textContent = displayName;
    if (profileEmail) profileEmail.textContent = user?.email || "";

    if (profileAvatar) {
      profileAvatar.hidden = !loggedIn || !avatarUrl;
      if (avatarUrl) profileAvatar.src = avatarUrl;
      else profileAvatar.removeAttribute("src");
    }

    const hint = document.querySelector(".nav-account-hint");
    if (hint) {
      hint.textContent = loggedIn
        ? "已登入：" + (user.email || displayName)
        : "登入後同步個人成績、錯題與收藏題型";
    }
  }

  async function signInWithGoogle() {
    const client = getClient();

    if (!client) {
      alert("Supabase 尚未設定完成，請檢查 js/supabase-client.js。");
      return;
    }

    if (signingIn) return;
    signingIn = true;

    try {
      const redirectTo =
        window.location.origin + window.location.pathname +
        window.location.search;

      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo }
      });

      if (error) throw error;
    } catch (error) {
      console.error("Google 登入失敗：", error);
      alert("Google 登入失敗：" + error.message);
    } finally {
      signingIn = false;
    }
  }

  async function signOut() {
    const client = getClient();

    if (!client) {
      alert("Supabase 尚未設定完成。");
      return;
    }

    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;

      renderUser(null);

      if (window.location.pathname.endsWith("/profile.html")) {
        const message = get("profileMessage");
        if (message) message.textContent = "已登出帳號。";

        ["attempts", "wrongQuestions", "bookmarks", "sessions"].forEach(id => {
          const element = get(id);
          if (element) {
            element.innerHTML =
              '<div class="empty">請先使用 Google 登入。</div>';
          }
        });
      }
    } catch (error) {
      console.error("登出失敗：", error);
      alert("登出失敗：" + error.message);
    }
  }

  async function initAuth() {
    const client = getClient();

    if (!client) {
      console.error("找不到 window.sb，請確認 Supabase Script 載入順序。");
      return;
    }

    [
      "googleLoginBtn",
      "profileGoogleLoginBtn"
    ].forEach(id => {
      const button = get(id);
      if (button) button.addEventListener("click", signInWithGoogle);
    });

    [
      "logoutBtn",
      "profileLogoutBtn"
    ].forEach(id => {
      const button = get(id);
      if (button) button.addEventListener("click", signOut);
    });

    client.auth.onAuthStateChange((_event, session) => {
      renderUser(session?.user || null);
    });

    const { data, error } = await client.auth.getSession();

    if (error) {
      console.error("讀取登入狀態失敗：", error);
      return;
    }

    renderUser(data.session?.user || null);
  }

  window.AuthUI = {
    init: initAuth,
    signInWithGoogle,
    signOut
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAuth);
  } else {
    initAuth();
  }
})();
