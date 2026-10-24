(() => {
  "use strict";

  const waitForClient = () => window.sb && window.sb.auth;

  async function signInWithGoogle() {
    if (!waitForClient()) {
      alert("Supabase 尚未設定完成，請檢查 js/supabase-client.js。");
      return;
    }

    const redirectTo = window.location.origin + window.location.pathname +
      window.location.search;

    const { error } = await window.sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo }
    });

    if (error) {
      console.error(error);
      alert("Google 登入失敗：" + error.message);
    }
  }

  async function signOut() {
    if (!waitForClient()) return;
    const { error } = await window.sb.auth.signOut();
    if (error) {
      console.error(error);
      alert("登出失敗：" + error.message);
    } else {
      window.location.reload();
    }
  }

  function renderUser(user) {
    const loginBtn = document.getElementById("googleLoginBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    const userBox = document.getElementById("authUser");
    const avatar = document.getElementById("authAvatar");
    const name = document.getElementById("authName");
    const email = document.getElementById("authEmail");

    if (loginBtn) loginBtn.hidden = Boolean(user);
    if (logoutBtn) logoutBtn.hidden = !user;
    if (userBox) userBox.hidden = !user;

    if (user) {
      const metadata = user.user_metadata || {};
      const displayName = metadata.full_name || metadata.name || user.email || "已登入使用者";
      if (name) name.textContent = displayName;
      if (email) email.textContent = user.email || "";
      if (avatar) {
        const url = metadata.avatar_url || metadata.picture || "";
        if (url) {
          avatar.src = url;
          avatar.hidden = false;
        } else {
          avatar.removeAttribute("src");
          avatar.hidden = true;
        }
      }
    }
  }

  async function initAuth() {
    if (!waitForClient()) {
      console.warn("找不到 window.sb，請確認 script 載入順序。");
      return;
    }

    const loginBtn = document.getElementById("googleLoginBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    if (loginBtn) loginBtn.addEventListener("click", signInWithGoogle);
    if (logoutBtn) logoutBtn.addEventListener("click", signOut);

    const { data: { session } } = await window.sb.auth.getSession();
    renderUser(session ? session.user : null);

    window.sb.auth.onAuthStateChange((_event, sessionNow) => {
      renderUser(sessionNow ? sessionNow.user : null);
    });
  }

  window.AuthUI = { init: initAuth, signInWithGoogle, signOut };
  document.addEventListener("DOMContentLoaded", initAuth);
})();
