
(function () {
  "use strict";

  var countElement = document.getElementById("online-count");

  if (!countElement || !window.supabase) {
    return;
  }

  var SUPABASE_URL = "https://hcegldjvhyrzfahkzmpp.supabase.co";
  var SUPABASE_KEY = "sb_publishable_nWbqisDG6KgmTDG7g6O5Sg_PF3c_bAV";

  if (
    SUPABASE_URL.indexOf("YOUR_") !== -1 ||
    SUPABASE_KEY.indexOf("YOUR_") !== -1
  ) {
    countElement.textContent = "尚未設定";
    return;
  }

  var client = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    }
  );

  var presenceKey;

  if (window.crypto && window.crypto.randomUUID) {
    presenceKey = window.crypto.randomUUID();
  } else {
    presenceKey =
      Date.now().toString(36) +
      Math.random().toString(36).slice(2);
  }

  var channel = client.channel("exam-sprint-online", {
    config: {
      presence: {
        key: presenceKey
      }
    }
  });

  var subscribed = false;
  var disposed = false;

  function updateCount() {
    if (!subscribed || disposed) {
      return;
    }

    var state = channel.presenceState();
    var count = Object.keys(state).length;

    countElement.textContent = count + " 人";
  }

  channel
    .on("presence", { event: "sync" }, updateCount)
    .subscribe(function (status) {
      if (disposed) {
        return;
      }

      if (status === "SUBSCRIBED") {
        subscribed = true;
        updateCount();

        channel.track({
          online_at: new Date().toISOString()
        }).catch(function () {
          countElement.textContent = "連線異常";
        });
      } else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        subscribed = false;
        countElement.textContent = "暫時無法取得";
      }
    });

  window.addEventListener("pagehide", function () {
    disposed = true;
    subscribed = false;

    client.removeChannel(channel).catch(function () {});
  });
})();
