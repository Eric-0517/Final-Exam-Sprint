(() => {
  "use strict";

  const FILE_BUCKET = "exclusive-files";
  const VIDEO_TABLE = "exclusive_videos";
  const FILE_SIGNED_URL_SECONDS = 300;
  const PAGE_SIZE = 100;

  const sb = window.sb;
  const $ = id => document.getElementById(id);

  let isLoading = false;
  let hasLoaded = false;

  function formatName(filename) {
    return filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  }

  function formatSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "大小未知";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function getExtension(filename) {
    const index = filename.lastIndexOf(".");
    return index >= 0 ? filename.slice(index + 1).toLowerCase() : "";
  }

  function showMessage(container, message) {
    if (!container) return;

    const element = document.createElement("div");
    element.className = "exclusive-empty";
    element.textContent = message;
    container.replaceChildren(element);
  }

  async function withTimeout(promise, milliseconds, message) {
    let timer;

    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(message)), milliseconds);
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function listFiles(bucket) {
    const files = [];
    let offset = 0;

    while (true) {
      const result = await withTimeout(
        sb.storage.from(bucket).list("", {
          limit: PAGE_SIZE,
          offset,
          sortBy: { column: "name", order: "asc" }
        }),
        15000,
        `讀取 ${bucket} 逾時，請檢查網路或 Supabase 設定。`
      );

      const { data, error } = result;

      if (error) throw error;
      if (!data || data.length === 0) break;

      files.push(
        ...data.filter(file =>
          file.name &&
          !file.name.startsWith(".") &&
          file.id
        )
      );

      if (data.length < PAGE_SIZE) break;
      offset += data.length;
    }

    return files;
  }

  async function loadYouTubeVideos() {
    const { data, error } = await withTimeout(
      sb.from(VIDEO_TABLE)
        .select("id,title,youtube_id,description,category,sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      15000,
      "讀取 YouTube 影片逾時，請檢查網路或 Supabase 設定。"
    );

    if (error) throw error;

    return (data || []).filter(video =>
      video.youtube_id &&
      /^[a-zA-Z0-9_-]{11}$/.test(video.youtube_id)
    );
  }

  async function createFileUrl(filename) {
    const { data, error } = await withTimeout(
      sb.storage
        .from(FILE_BUCKET)
        .createSignedUrl(
          filename,
          FILE_SIGNED_URL_SECONDS,
          { download: filename }
        ),
      15000,
      `產生檔案網址逾時：${filename}`
    );

    if (error) throw error;
    if (!data?.signedUrl) throw new Error("檔案下載網址產生失敗");

    return data.signedUrl;
  }

  function openVideo(video) {
    const modal = $("exclusiveVideoModal");
    const player = $("exclusiveVideoPlayer");
    const title = $("exclusiveVideoModalTitle");

    if (!modal || !player) return;

    title.textContent = video.title || "影片播放";

    const iframe = document.createElement("iframe");

    iframe.src =
      `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.youtube_id)}` +
      "?autoplay=1&rel=0&playsinline=1";

    iframe.title = video.title || "YouTube 影片播放器";
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";

    player.replaceChildren(iframe);

    modal.hidden = false;
    document.body.classList.add("exclusive-video-open");

    $("exclusiveVideoClose")?.focus();
  }

  function closeVideo() {
    const modal = $("exclusiveVideoModal");
    const player = $("exclusiveVideoPlayer");

    if (!modal) return;

    if (player) {
      player.replaceChildren();
    }

    modal.hidden = true;
    document.body.classList.remove("exclusive-video-open");
  }

  window.closeExclusiveVideo = closeVideo;

  function createVideoCard(video) {
    const article = document.createElement("article");
    article.className = "exclusive-item exclusive-youtube-item";

    const thumbnailButton = document.createElement("button");
    thumbnailButton.type = "button";
    thumbnailButton.className = "exclusive-youtube-thumbnail";
    thumbnailButton.setAttribute(
      "aria-label",
      `播放影片：${video.title || "未命名影片"}`
    );

    const thumbnail = document.createElement("img");
    thumbnail.src =
      `https://img.youtube.com/vi/${encodeURIComponent(video.youtube_id)}/hqdefault.jpg`;
    thumbnail.alt = "";
    thumbnail.loading = "lazy";

    const playIcon = document.createElement("span");
    playIcon.className = "exclusive-youtube-play";
    playIcon.setAttribute("aria-hidden", "true");
    playIcon.textContent = "▶";

    thumbnailButton.append(thumbnail, playIcon);
    thumbnailButton.addEventListener("click", () => openVideo(video));

    const body = document.createElement("div");
    body.className = "exclusive-item-body";

    const tag = document.createElement("span");
    tag.className = "exclusive-tag";
    tag.textContent = video.category || "線上影片";

    const title = document.createElement("h3");
    title.textContent = video.title || "未命名影片";

    const description = document.createElement("p");
    description.textContent = video.description || "觀看教學影片，加強觀念與考試重點。";

    const playButton = document.createElement("button");
    playButton.type = "button";
    playButton.className = "exclusive-download-button";
    playButton.textContent = "立即觀看";
    playButton.addEventListener("click", () => openVideo(video));

    body.append(tag, title, description, playButton);
    article.append(thumbnailButton, body);

    return article;
  }

  function createFileCard(file, url) {
    const article = document.createElement("article");
    article.className = "exclusive-item";

    const preview = document.createElement("div");
    preview.className = "exclusive-file-preview";
    preview.setAttribute("aria-hidden", "true");

    preview.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <path d="M14 2v6h6"/>
        <path d="M8 13h8M8 17h8"/>
      </svg>
    `;

    const body = document.createElement("div");
    body.className = "exclusive-item-body";

    const ext = getExtension(file.name).toUpperCase() || "FILE";

    const tag = document.createElement("span");
    tag.className = "exclusive-tag";
    tag.textContent = `${ext} 教材`;

    const title = document.createElement("h3");
    title.textContent = formatName(file.name);

    const description = document.createElement("p");
    description.textContent = "檔案可下載。";

    const actions = document.createElement("div");
    actions.className = "exclusive-file-actions";

    const size = document.createElement("span");
    size.className = "exclusive-file-size";
    size.textContent = formatSize(file.metadata?.size);

    const download = document.createElement("a");
    download.className = "exclusive-download-button";
    download.href = url;
    download.textContent = "下載檔案";
    download.setAttribute("download", file.name);
    download.rel = "noopener noreferrer";

    actions.append(size, download);
    body.append(tag, title, description, actions);
    article.append(preview, body);

    return article;
  }

  async function renderVideos() {
    const container = $("exclusiveVideoList");
    if (!container) return;

    showMessage(container, "正在載入影片……");

    try {
      const videos = await loadYouTubeVideos();

      if (!videos.length) {
        showMessage(container, "目前尚無影片。");
        return;
      }

      container.replaceChildren(
        ...videos.map(createVideoCard)
      );
    } catch (error) {
      console.error("[專屬教材] YouTube 影片載入失敗：", error);
      showMessage(
        container,
        error.message || "影片載入失敗，請檢查 Supabase 資料表及權限。"
      );
    }
  }

  async function renderFiles() {
    const container = $("exclusiveFileList");
    if (!container) return;

    showMessage(container, "正在載入教材……");

    try {
      const files = await listFiles(FILE_BUCKET);

      if (!files.length) {
        showMessage(container, "目前尚無檔案。");
        return;
      }

      const cards = await Promise.all(
        files.map(async file => {
          try {
            const url = await createFileUrl(file.name);
            return createFileCard(file, url);
          } catch (error) {
            console.error(`[專屬教材] 無法載入檔案：${file.name}`, error);
            return null;
          }
        })
      );

      const validCards = cards.filter(Boolean);

      if (!validCards.length) {
        showMessage(container, "檔案網址產生失敗，請檢查 Storage 權限及 Console 錯誤。");
        return;
      }

      container.replaceChildren(...validCards);
    } catch (error) {
      console.error("[專屬教材] 檔案載入失敗：", error);
      showMessage(
        container,
        error.message || "教材載入失敗，請檢查登入狀態、權限及網路連線。"
      );
    }
  }

  async function loadResources() {
    if (isLoading || hasLoaded) return;

    if (!sb) {
      console.error("[專屬教材] Supabase 尚未初始化。");
      showMessage($("exclusiveVideoList"), "Supabase 尚未初始化，請重新整理頁面。");
      showMessage($("exclusiveFileList"), "Supabase 尚未初始化，請重新整理頁面。");
      return;
    }

    const videoContainer = $("exclusiveVideoList");
    const fileContainer = $("exclusiveFileList");

    if (!videoContainer || !fileContainer) {
      console.error("[專屬教材] 找不到影片或檔案容器，請檢查 HTML 的 ID。");
      return;
    }

    isLoading = true;

    try {
      await Promise.all([
        renderVideos(),
        renderFiles()
      ]);

      hasLoaded = true;
    } catch (error) {
      console.error("[專屬教材] 資源載入失敗：", error);
    } finally {
      isLoading = false;
    }
  }

  $("exclusiveVideoClose")?.addEventListener("click", closeVideo);

  document.querySelectorAll("[data-close-exclusive-video]").forEach(element => {
    element.addEventListener("click", closeVideo);
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeVideo();
  });

  document.addEventListener("exclusive-access-ready", loadResources);

  if (document.documentElement.classList.contains("exclusive-authorized")) {
    loadResources();
  }
})();
