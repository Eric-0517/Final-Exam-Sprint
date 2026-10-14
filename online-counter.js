
(function () {
  "use strict";

  function initOnlineCounter() {
    var countElement = document.getElementById("online-count");

    if (!countElement) {
      console.error("[在線人數] 找不到 #online-count，請檢查 HTML。");
      return;
    }

    function showError(message) {
      countElement.textContent = message;
    }

    if (!window.supabase ||
        typeof window.supabase.createClient !== "function") {
      showError("統計程式載入失敗");
      console.error(
        "[在線人數] Supabase SDK 未載入，請檢查 CDN 和 script 順序。"
      );
      return;
    }

    var SUPABASE_URL =
      "https://hcegldjvhyrzfahkzmpp.supabase.co";

    var SUPABASE_KEY =
      "sb_publishable_nWbqisDG6KgmTDG7g6O5Sg_PF3c_bAV";

    var client;

    try {
      client = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          },
          realtime: {
            params: {
              log_level: "info"
            }
          }
        }
      );
    } catch (error) {
      showError("初始化失敗");
      console.error("[在線人數] 初始化失敗：", error);
      return;
    }

    var presenceKey =
      window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : Date.now().toString(36) +
          Math.random().toString(36).slice(2);

    var channel = client.channel("exam-sprint-online", {
      config: {
        presence: {
          key: presenceKey
        }
      }
    });

    var subscribed = false;
    var disposed = false;
    var timeoutId;

    function updateCount() {
      if (!subscribed || disposed) {
        return;
      }

      var state = channel.presenceState();
      var count = Object.keys(state).length;

      showError(count + " 人");
      console.log("[在線人數] 目前在線：", count);
    }

    timeoutId = setTimeout(function () {
      if (!subscribed && !disposed) {
        showError("連線逾時");
        console.error(
          "[在線人數] 12 秒內未成功連線，請檢查 Console。"
        );
      }
    }, 12000);

    channel
      .on("presence", { event: "sync" }, updateCount)
      .subscribe(function (status, err) {
        console.log("[在線人數] Supabase 狀態：", status);

        if (err) {
          console.error("[在線人數] 連線錯誤：", err);
        }

        if (disposed) {
          return;
        }

        if (status === "SUBSCRIBED") {
          subscribed = true;
          clearTimeout(timeoutId);

          channel.track({
            online_at: new Date().toISOString()
          }).then(function (result) {
            if (result !== "ok") {
              console.error(
                "[在線人數] Presence 註冊結果：",
                result
              );
            }
          }).catch(function (error) {
            console.error("[在線人數] 註冊失敗：", error);
            showError("註冊失敗");
          });

          updateCount();
        } else if (status === "CHANNEL_ERROR") {
          subscribed = false;
          showError("連線錯誤");
        } else if (status === "TIMED_OUT") {
          subscribed = false;
          showError("連線逾時");
        } else if (status === "CLOSED") {
          subscribed = false;
          showError("連線已關閉");
        }
      });

    window.addEventListener("pagehide", function () {
      disposed = true;
      subscribed = false;
      clearTimeout(timeoutId);

      client.removeChannel(channel).catch(function (error) {
        console.warn("[在線人數] 關閉連線時發生錯誤：", error);
      });
    }, { once: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initOnlineCounter,
      { once: true }
    );
  } else {
    initOnlineCounter();
  }
})();
