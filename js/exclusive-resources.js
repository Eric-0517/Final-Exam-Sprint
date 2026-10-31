(() => {
  "use strict";

  const VIDEO_TABLE = "exclusive_videos";
  const VIDEO_BUCKET = "exclusive-videos";
  const FILE_BUCKET = "exclusive-files";

  const $ = id => document.getElementById(id);

  let youtubePlayer = null;
  let youtubeApiPromise = null;
  let youtubeProgressTimer = null;
  let pendingVideo = null;
  let loadingResources = false;
  let resourcesLoaded = false;

  function getSupabase() {
    if (window.sb) return window.sb;

    if (window.supabaseClient) return window.supabaseClient;

    throw new Error("找不到 Supabase Client，請確認 supabase-client.js 已正確載入。");
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function showMessage(container, message) {
    if (!container) return;

    container.innerHTML = `
      <div class="exclusive-empty">
        ${escapeHTML(message)}
      </div>
    `;
  }

  function loadYouTubeAPI() {
    if (window.YT && window.YT.Player) {
      return Promise.resolve();
    }

    if (youtubeApiPromise) {
      return youtubeApiPromise;
    }

    youtubeApiPromise = new Promise((resolve, reject) => {
      let settled = false;

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        youtubeApiPromise = null;
        reject(new Error("YouTube 播放器 API 載入逾時，請檢查網路或瀏覽器是否封鎖 YouTube。"));
      }, 20000);

      const finish = () => {
        if (settled) return;
        if (!window.YT || !window.YT.Player) return;

        settled = true;
        clearTimeout(timeout);
        resolve();
      };

      const previousCallback = window.onYouTubeIframeAPIReady;

      window.onYouTubeIframeAPIReady = function () {
        try {
          if (typeof previousCallback === "function") {
            previousCallback();
          }
        } catch (error) {
          console.error("原有 YouTube API callback 發生錯誤：", error);
        }

        finish();
      };

      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        script.async = true;

        script.onerror = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          youtubeApiPromise = null;
          reject(new Error("無法載入 YouTube 播放器 API。"));
        };

        document.head.appendChild(script);
      }

      if (window.YT && window.YT.Player) {
        finish();
      }
    });

    return youtubeApiPromise;
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return "00:00";
    }

    const minutes = Math.floor(seconds / 60);
    const remaining = Math.floor(seconds % 60);

    return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  }

  function updatePlayerControls() {
    if (!youtubePlayer) return;

    const seek = $("customSeek");
    const currentTime = $("customCurrentTime");
    const durationText = $("customDuration");

    if (!seek || !currentTime || !durationText) return;

    try {
      const duration = youtubePlayer.getDuration();
      const current = youtubePlayer.getCurrentTime();

      if (duration > 0) {
        seek.value = String(current / duration * 100);
      }

      currentTime.textContent = formatTime(current);
      durationText.textContent = formatTime(duration);
    } catch (error) {
      console.warn("更新影片進度失敗：", error);
    }
  }

  function bindCustomControls() {
    const playPause = $("customPlayPause");
    const seek = $("customSeek");
    const mute = $("customMute");

    if (!playPause || !seek || !mute) return;

    playPause.addEventListener("click", () => {
      if (!youtubePlayer) return;

      const state = youtubePlayer.getPlayerState();

      if (state === YT.PlayerState.PLAYING) {
        youtubePlayer.pauseVideo();
      } else {
        youtubePlayer.playVideo();
      }
    });

    mute.addEventListener("click", () => {
      if (!youtubePlayer) return;

      if (youtubePlayer.isMuted()) {
        youtubePlayer.unMute();
        mute.textContent = "靜音";
      } else {
        youtubePlayer.mute();
        mute.textContent = "音量";
      }
    });

    seek.addEventListener("change", () => {
      if (!youtubePlayer) return;

      const duration = youtubePlayer.getDuration();

      if (duration > 0) {
        youtubePlayer.seekTo(
          duration * Number(seek.value) / 100,
          true
        );
      }
    });

    if (youtubeProgressTimer) {
      clearInterval(youtubeProgressTimer);
    }

    youtubeProgressTimer = setInterval(updatePlayerControls, 500);
  }

  async function openVideo(video) {
    const modal = $("exclusiveVideoModal");
    const playerContainer = $("exclusiveVideoPlayer");
    const title = $("exclusiveVideoModalTitle");

    if (!modal || !playerContainer) {
      console.error("找不到影片播放器 Modal，請確認 HTML 元素 ID。");
      return;
    }

    if (!video || !/^[a-zA-Z0-9_-]{11}$/.test(video.youtube_id || "")) {
      alert("影片 ID 無效，請確認 Supabase 資料表中的 youtube_id。");
      return;
    }

    closeVideo();

    pendingVideo = video;

    if (title) {
      title.textContent = video.title || "影片播放";
    }

    modal.hidden = false;
    document.body.classList.add("exclusive-video-open");

    playerContainer.innerHTML = `
      <div class="custom-youtube-player">
        <div id="youtubePlayerFrame"></div>

        <div class="custom-player-controls">
          <button type="button" id="customPlayPause" aria-label="播放或暫停">
            ▶
          </button>

          <span id="customCurrentTime">00:00</span>

          <input
            type="range"
            id="customSeek"
            min="0"
            max="100"
            value="0"
            aria-label="影片進度"
          >

          <span id="customDuration">00:00</span>

          <button type="button" id="customMute" aria-label="靜音">
            靜音
          </button>
        </div>
      </div>
    `;

    try {
      await loadYouTubeAPI();

      if (modal.hidden || pendingVideo !== video) return;

      if (youtubePlayer) {
        youtubePlayer.destroy();
        youtubePlayer = null;
      }

      youtubePlayer = new YT.Player("youtubePlayerFrame", {
        width: "100%",
        height: "100%",
        videoId: video.youtube_id,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          playsinline: 1,
          modestbranding: 1,
          enablejsapi: 1
        },
        events: {
          onReady: event => {
            if (pendingVideo !== video) return;

            event.target.playVideo();
            bindCustomControls();
          },

          onStateChange: event => {
            const button = $("customPlayPause");

            if (!button) return;

            button.textContent =
              event.data === YT.PlayerState.PLAYING ? "Ⅱ" : "▶";

            updatePlayerControls();
          },

          onError: event => {
            console.error("YouTube 播放錯誤：", event.data);

            const container = $("exclusiveVideoPlayer");

            if (container) {
              const errorMessage = document.createElement("div");
              errorMessage.className = "exclusive-empty";
              errorMessage.textContent =
                `影片無法播放（錯誤代碼：${event.data}）。請確認影片允許嵌入播放。`;

              container.appendChild(errorMessage);
            }
          }
        }
      });

    } catch (error) {
      console.error("播放器初始化失敗：", error);

      playerContainer.innerHTML = `
        <div class="exclusive-empty">
          ${escapeHTML(error.message || "播放器載入失敗")}
        </div>
      `;
    }
  }

  function closeVideo() {
    const modal = $("exclusiveVideoModal");
    const playerContainer = $("exclusiveVideoPlayer");

    pendingVideo = null;

    if (youtubeProgressTimer) {
      clearInterval(youtubeProgressTimer);
      youtubeProgressTimer = null;
    }

    if (youtubePlayer) {
      try {
        youtubePlayer.destroy();
      } catch (error) {
        console.warn("關閉播放器時發生錯誤：", error);
      }

      youtubePlayer = null;
    }

    if (playerContainer) {
      playerContainer.replaceChildren();
    }

    if (modal) {
      modal.hidden = true;
    }

    document.body.classList.remove("exclusive-video-open");
  }

  window.closeExclusiveVideo = closeVideo;

  function createVideoCard(video) {
    const article = document.createElement("article");
    article.className = "exclusive-item exclusive-video-card";

    const iconButton = document.createElement("button");
    iconButton.type = "button";
    iconButton.className = "exclusive-video-icon";
    iconButton.setAttribute("aria-label", `播放影片：${video.title || "未命名影片"}`);

    const icon = document.createElement("img");
    icon.src = "video.png";
    icon.alt = "影片";
    icon.loading = "lazy";

    icon.onerror = () => {
      icon.style.display = "none";
    };

    iconButton.appendChild(icon);
    iconButton.addEventListener("click", () => openVideo(video));

    const body = document.createElement("div");
    body.className = "exclusive-item-body";

    const tag = document.createElement("span");
    tag.className = "exclusive-tag";
    tag.textContent = video.category || "線上影片";

    const title = document.createElement("h3");
    title.className = "exclusive-video-title";
    title.textContent = video.title || "未命名影片";
    title.tabIndex = 0;
    title.setAttribute("role", "button");

    title.addEventListener("click", () => openVideo(video));

    title.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openVideo(video);
      }
    });

    const description = document.createElement("p");
    description.textContent = video.description || "線上教學影片";

    body.append(tag, title, description);
    article.append(iconButton, body);

    return article;
  }

  async function loadYouTubeVideos() {
    const container = $("exclusiveVideoList");

    if (!container) {
      console.error("找不到 exclusiveVideoList。");
      return;
    }

    showMessage(container, "正在載入影片...");

    try {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from(VIDEO_TABLE)
        .select("id,title,youtube_id,description,category,sort_order,is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;

      container.replaceChildren();

      const videos = (data || []).filter(video =>
        /^[a-zA-Z0-9_-]{11}$/.test(video.youtube_id || "")
      );

      if (videos.length === 0) {
        showMessage(container, "目前沒有可觀看的影片。");
        return;
      }

      videos.forEach(video => {
        container.appendChild(createVideoCard(video));
      });

    } catch (error) {
      console.error("影片列表載入失敗：", error);

      showMessage(
        container,
        `影片載入失敗：${error.message || "未知錯誤"}`
      );
    }
  }

  function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "大小未知";

    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let index = 0;

    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index++;
    }

    return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  }

  function createFileCard(file, url) {
    const article = document.createElement("article");
    article.className = "exclusive-item";

    const preview = document.createElement("div");
    preview.className = "exclusive-file-preview";
    preview.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"
        aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <path d="M14 2v6h6"/>
        <path d="M8 13h8M8 17h8"/>
      </svg>
    `;

    const body = document.createElement("div");
    body.className = "exclusive-item-body";

    const title = document.createElement("h3");
    title.textContent = file.name;

    const description = document.createElement("p");
    description.textContent = "專屬教材與學習資源";

    const actions = document.createElement("div");
    actions.className = "exclusive-file-actions";

    const size = document.createElement("span");
    size.className = "exclusive-file-size";
    size.textContent = formatFileSize(file.metadata?.size);

    const download = document.createElement("a");
    download.className = "exclusive-download-button";
    download.href = url;
    download.target = "_blank";
    download.rel = "noopener noreferrer";
    download.download = file.name;
    download.textContent = "下載檔案";

    actions.append(size, download);
    body.append(title, description, actions);
    article.append(preview, body);

    return article;
  }

  async function loadFiles() {
    const container = $("exclusiveFileList");

    if (!container) return;

    showMessage(container, "正在載入教材...");

    try {
      const supabase = getSupabase();

      const { data: files, error } = await supabase.storage
        .from(FILE_BUCKET)
        .list("", {
          limit: 100,
          sortBy: {
            column: "name",
            order: "asc"
          }
        });

      if (error) throw error;

      container.replaceChildren();

      const validFiles = (files || []).filter(file =>
        file.name &&
        file.name !== ".emptyFolderPlaceholder" &&
        !file.name.startsWith(".")
      );

      if (validFiles.length === 0) {
        showMessage(container, "目前沒有可下載的教材。");
        return;
      }

      for (const file of validFiles) {
        const { data, error: urlError } = await supabase.storage
          .from(FILE_BUCKET)
          .createSignedUrl(file.name, 3600);

        if (urlError) {
          console.error(`取得檔案網址失敗：${file.name}`, urlError);
          continue;
        }

        if (data?.signedUrl) {
          container.appendChild(createFileCard(file, data.signedUrl));
        }
      }

      if (!container.children.length) {
        showMessage(container, "目前沒有可下載的教材，或檔案權限不足。");
      }

    } catch (error) {
      console.error("教材載入失敗：", error);

      showMessage(
        container,
        `教材載入失敗：${error.message || "未知錯誤"}`
      );
    }
  }

  async function loadResources() {
    if (loadingResources) return;

    loadingResources = true;

    try {
      await Promise.all([
        loadYouTubeVideos(),
        loadFiles()
      ]);

      resourcesLoaded = true;

    } finally {
      loadingResources = false;
    }
  }

  function initializeCloseEvents() {
    const closeButton = $("exclusiveVideoClose");

    if (closeButton) {
      closeButton.addEventListener("click", closeVideo);
    }

    document.querySelectorAll("[data-close-exclusive-video]")
      .forEach(element => {
        element.addEventListener("click", closeVideo);
      });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        const modal = $("exclusiveVideoModal");

        if (modal && !modal.hidden) {
          closeVideo();
        }
      }
    });
  }

  function initializeResources() {
    initializeCloseEvents();

    if (document.documentElement.classList.contains("exclusive-authorized")) {
      loadResources();
    }

    document.addEventListener("exclusive-access-ready", () => {
      if (!resourcesLoaded) {
        loadResources();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeResources);
  } else {
    initializeResources();
  }

})();
