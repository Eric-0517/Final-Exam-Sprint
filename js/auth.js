(() => {
  "use strict";

  const get = id => document.getElementById(id);

  let signingIn = false;
  let signingOut = false;
  let loginAlertShown = false;
  let initialized = false;
  let permissionCheckId = 0;

  const LOGIN_ALERT_KEY = "auth_login_success_pending";

  function getClient() {
    return window.sb && window.sb.auth ? window.sb : null;
  }

  function showSuccess(title) {
    if (window.Swal && typeof window.Swal.fire === "function") {
      return window.Swal.fire({
        icon: "success",
        title,
        showConfirmButton: false,
        timer: 1500,
        timerProgressBar: true
      });
    }

    return Promise.resolve();
  }

  function showError(title, message) {
    if (window.Swal && typeof window.Swal.fire === "function") {
      return window.Swal.fire({
        icon: "error",
        title,
        text: message,
        confirmButtonText: "確定"
      });
    }

    alert(title + "：" + message);
    return Promise.resolve();
  }

  function setVisible(element, visible) {
    if (!element) return;

    element.hidden = !visible;
    element.style.display = visible ? "" : "none";
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

    const navUser = get("authUser");
    const navAvatar = get("authAvatar");
    const navName = get("authName");
    const navEmail = get("authEmail");
    const navLogin = get("googleLoginBtn");
    const navLogout = get("logoutBtn");
    const profileLink = get("profileNavLink");

    setVisible(navUser, loggedIn);
    setVisible(navLogin, !loggedIn);
    setVisible(navLogout, loggedIn);
    setVisible(profileLink, loggedIn);

    if (navName) navName.textContent = loggedIn ? displayName : "";
    if (navEmail) navEmail.textContent = loggedIn ? user.email || "" : "";

    if (navAvatar) {
      setVisible(navAvatar, loggedIn && Boolean(avatarUrl));

      if (loggedIn && avatarUrl) {
        navAvatar.src = avatarUrl;
      } else {
        navAvatar.removeAttribute("src");
      }
    }

    const profileUser = get("profileUser");
    const profileAvatar = get("profileAvatar");
    const profileName = get("profileName");
    const profileEmail = get("profileEmail");
    const profileLogin = get("profileGoogleLoginBtn");
    const profileLogout = get("profileLogoutBtn");
    const signedOut = get("signedOut");

    setVisible(profileUser, loggedIn);
    setVisible(profileLogin, !loggedIn);
    setVisible(profileLogout, loggedIn);
    setVisible(signedOut, !loggedIn);

    if (profileName) {
      profileName.textContent = loggedIn ? displayName : "";
    }

    if (profileEmail) {
      profileEmail.textContent = loggedIn ? user.email || "" : "";
    }

    if (profileAvatar) {
      setVisible(profileAvatar, loggedIn && Boolean(avatarUrl));

      if (loggedIn && avatarUrl) {
        profileAvatar.src = avatarUrl;
      } else {
        profileAvatar.removeAttribute("src");
      }
    }

    document.querySelectorAll(".nav-account-hint, #authHint").forEach(hint => {
      hint.textContent = loggedIn
        ? "已登入：" + (user.email || displayName)
        : "登入後同步個人成績、錯題與收藏題型";
    });
  }

  function setExclusiveAccess(authorized) {
    const app = get("app");
    if (!app) return;

    const wasAuthorized = app.classList.contains("exclusive-authorized");

    app.classList.toggle("exclusive-authorized", authorized);

    if (authorized) {
      document.dispatchEvent(
        new CustomEvent("exclusive-access-ready")
      );
    } else if (wasAuthorized) {
      window.closeExclusiveVideo?.();

      const videos = get("exclusiveVideoList");
      const files = get("exclusiveFileList");

      if (videos) videos.innerHTML = "";
      if (files) files.innerHTML = "";
    }
  }

  async function checkExclusivePermission(user) {
    const checkId = ++permissionCheckId;

    if (!user) {
      setExclusiveAccess(false);
      return false;
    }

    const client = getClient();

    if (!client) {
      setExclusiveAccess(false);
      return false;
    }

    try {
      const { data, error } = await client
        .from("user_permissions")
        .select("has_access")
        .eq("user_id", user.id)
        .maybeSingle();

      if (checkId !== permissionCheckId) return false;

      if (error) throw error;

      const authorized = data?.has_access === true;

      setExclusiveAccess(authorized);

      console.log(
        "[auth] 專屬內容授權：",
        authorized ? "已授權" : "未授權"
      );

      return authorized;

    } catch (error) {
      if (checkId !== permissionCheckId) return false;

      console.error("[auth] 權限驗證失敗：", error);

      setExclusiveAccess(false);

      return false;
    }
  }

  async function signInWithGoogle() {
    const client = getClient();

    if (!client) {
      alert("Supabase 尚未設定完成，請檢查 js/supabase-client.js。");
      return;
    }

    if (signingIn || signingOut) return;
    signingIn = true;

    const buttons = [
      get("googleLoginBtn"),
      get("profileGoogleLoginBtn")
    ].filter(Boolean);

    buttons.forEach(button => {
      button.disabled = true;
    });

    try {
      const redirectTo =
        window.location.origin +
        window.location.pathname +
        window.location.search;

      sessionStorage.setItem(LOGIN_ALERT_KEY, "true");

      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo }
      });

      if (error) throw error;

    } catch (error) {
      sessionStorage.removeItem(LOGIN_ALERT_KEY);

      console.error("Google 登入失敗：", error);

      await showError(
        "登入失敗",
        error.message || "請稍後再試。"
      );

    } finally {
      signingIn = false;

      buttons.forEach(button => {
        button.disabled = false;
      });
    }
  }

  async function signOut() {
    const client = getClient();

    if (!client) {
      alert("Supabase 尚未設定完成。");
      return;
    }

    if (signingIn || signingOut) return;
    signingOut = true;

    const buttons = [
      get("logoutBtn"),
      get("profileLogoutBtn")
    ].filter(Boolean);

    buttons.forEach(button => {
      button.disabled = true;
    });

    try {
      ++permissionCheckId;

      setExclusiveAccess(false);

      const { error } = await client.auth.signOut();

      if (error) throw error;

      sessionStorage.removeItem(LOGIN_ALERT_KEY);

      renderUser(null);

      if (window.location.pathname.endsWith("/profile.html")) {
        const message = get("profileMessage");

        if (message) {
          message.textContent = "已登出帳號。";
        }

        ["attempts", "wrongQuestions", "bookmarks", "sessions"].forEach(id => {
          const element = get(id);

          if (element) {
            element.innerHTML =
              '<div class="empty">請先使用 Google 登入。</div>';
          }
        });
      }

      await showSuccess("登出成功！");

    } catch (error) {
      console.error("登出失敗：", error);

      await showError(
        "登出失敗",
        error.message || "請稍後再試。"
      );

    } finally {
      signingOut = false;

      buttons.forEach(button => {
        button.disabled = false;
      });
    }
  }

  function handleLoginSuccess() {
    if (
      sessionStorage.getItem(LOGIN_ALERT_KEY) === "true" &&
      !loginAlertShown
    ) {
      sessionStorage.removeItem(LOGIN_ALERT_KEY);
      loginAlertShown = true;

      setTimeout(() => {
        showSuccess("登入成功！").finally(() => {
          loginAlertShown = false;
        });
      }, 300);
    }
  }

  async function syncSession(session) {
    renderUser(session?.user || null);

    if (session?.user) {
      await checkExclusivePermission(session.user);
    } else {
      ++permissionCheckId;
      setExclusiveAccess(false);
    }
  }

  async function initAuth() {
    if (initialized) return;

    const client = getClient();

    if (!client) {
      console.error(
        "找不到 window.sb，請確認 Supabase SDK 與 js/supabase-client.js 的載入順序。"
      );
      return;
    }

    initialized = true;

    [
      "googleLoginBtn",
      "profileGoogleLoginBtn"
    ].forEach(id => {
      const button = get(id);

      if (button && button.dataset.authBound !== "true") {
        button.dataset.authBound = "true";
        button.addEventListener("click", signInWithGoogle);
      }
    });

    [
      "logoutBtn",
      "profileLogoutBtn"
    ].forEach(id => {
      const button = get(id);

      if (button && button.dataset.authBound !== "true") {
        button.dataset.authBound = "true";
        button.addEventListener("click", signOut);
      }
    });

    client.auth.onAuthStateChange((event, sessionNow) => {
      renderUser(sessionNow?.user || null);

      if (event === "SIGNED_IN" && sessionNow?.user) {
        handleLoginSuccess();
      }

      if (event === "SIGNED_OUT") {
        sessionStorage.removeItem(LOGIN_ALERT_KEY);
      }

      setTimeout(() => {
        syncSession(sessionNow);
      }, 0);
    });

    const {
      data: { session },
      error
    } = await client.auth.getSession();

    if (error) {
      console.error("讀取登入狀態失敗：", error);
      setExclusiveAccess(false);
      return;
    }

    await syncSession(session);

    if (session?.user) {
      handleLoginSuccess();
    }
  }

  window.AuthUI = {
    init: initAuth,
    signInWithGoogle,
    signOut,
    checkExclusivePermission
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAuth, { once: true });
  } else {
    initAuth();
  }
})();
