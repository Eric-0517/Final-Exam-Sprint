(() => {
  "use strict";

  const VIDEO_BUCKET = "exclusive-videos";
  const FILE_BUCKET = "exclusive-files";
  const VIDEO_SIGNED_URL_SECONDS = 300;
  const FILE_SIGNED_URL_SECONDS = 300;
  const PAGE_SIZE = 100;

  const sb = window.sb;
  const $ = id => document.getElementById(id);

  let isLoading = false;
  let hasLoaded = false;

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function formatName(filename) {
    return filename
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ");
  }

  function formatSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "大小未知";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function getExtension(filename) {
    const index = filename.lastIndexOf(".");
    return index >= 0 ? filename.slice(index + 1).toLowerCase() : "";
  }

  function getVideoMime(filename) {
    switch (getExtension(filename)) {
      case "webm":
        return "video/webm";
      case "ogv":
        return "video/ogg";
      default:
        return "video/mp4";
    }
  }

  function showMessage(container, message) {
    container.replaceChildren();

    const messageElement = document.createElement("div");
    messageElement.className = "exclusive-empty";
    messageElement.textContent = message;

    container.appendChild(messageElement);
  }

  async function listFiles(bucket) {
    const files = [];
    let offset = 0;

    while (true) {
      const { data, error } = await sb.storage.from(bucket).list("", {
        limit: PAGE_SIZE,
        offset,
        sortBy: {
          column: "name",
          order: "asc"
        }
      });

      if (error) throw error;
      if (!data || data.length === 0) break;

      files.push(
        ...data.filter(file =>
          file.name &&
          !file.name.startsWith(".") &&
          !file.id === false
        )
      );

      if (data.length < PAGE_SIZE) break;
      offset += data.length;
    }

    return files;
  }

  async function createVideoUrl(filename) {
    const { data, error } = await sb.storage
      .from(VIDEO_BUCKET)
      .createSignedUrl(filename, VIDEO_SIGNED_URL_SECONDS);

    if (error) throw error;
    if (!data?.signedUrl) throw new Error("影片網址產生失敗");

    return data.signedUrl;
  }

  async function createFileUrl(filename) {
    const { data, error } = await sb.storage
      .from(FILE_BUCKET)
      .createSignedUrl(
        filename,
        FILE_SIGNED_URL_SECONDS,
        { download: filename }
      );

    if (error) throw error;
    if (!data?.signedUrl) throw new Error("檔案下載網址產生失敗");

    return data.signedUrl;
  }

  function createVideoCard(file, url) {
    const article = document.createElement("article");
    article.className = "exclusive-item";

    const video = document.createElement("video");
    video.className = "exclusive-video";
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;
    video.disablePictureInPicture = true;
    video.setAttribute("controlsList", "nodownload noremoteplayback");
    video.setAttribute("disableRemotePlayback", "");
    video.setAttribute("aria-label", formatName(file.name));

    const source = document.createElement("source");
    source.src = url;
    source.type = getVideoMime(file.name);

    video.appendChild(source);

    const body = document.createElement("div");
    body.className = "exclusive-item-body";

    const tag = document.createElement("span");
    tag.className = "exclusive-tag";
    tag.textContent = "影片";

    const title = document.createElement("h3");
    title.textContent = formatName(file.name);

    const size = document.createElement("p");
    size.textContent = formatSize(file.metadata?.size);

    body.append(tag, title, size);
    article.append(video, body);

    return article;
  }

  function createFileCard(file, url) {
    const article = document.createElement("article");
    article.className = "exclusive-item";

    const preview = document.createElement("div");
    preview.className = "exclusive-file-preview";
    preview.setAttribute("aria-hidden", "true");

    preview.innerHTML = 
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <path d="M14 2v6h6"/>
        <path d="M8 13h8M8 17h8"/>
      </svg>
    ;

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

  async function renderBucket(bucket, containerId, createUrl, renderCard, emptyText) {
    const container = $(containerId);
    if (!container) return;

    showMessage(container, "正在載入資源……");

    try {
      const files = await listFiles(bucket);

      if (!files.length) {
        showMessage(container, emptyText);
        return;
      }

      const cards = await Promise.all(
        files.map(async file => {
          try {
            const url = await createUrl(file.name);
            return renderCard(file, url);
          } catch (error) {
            console.error(`無法載入檔案：${file.name}`, error);
            return null;
          }
        })
      );

      const validCards = cards.filter(Boolean);

      if (!validCards.length) {
        showMessage(container, "資源暫時無法載入，請稍後再試。");
        return;
      }

      container.replaceChildren(...validCards);
    } catch (error) {
      console.error(`讀取 Bucket ${bucket} 失敗：`, error);
      showMessage(container, "載入失敗，請確認登入狀態、權限及網路連線。");
    }
  }

  async function loadResources() {
    if (isLoading || hasLoaded) return;

    if (!sb) {
      console.error(
        "Supabase 尚未初始化，請確認 js/supabase-client.js 的載入順序。"
      );
      return;
    }

    const videoContainer = $("exclusiveVideoList");
    const fileContainer = $("exclusiveFileList");

    if (!videoContainer || !fileContainer) return;

    isLoading = true;

    try {
      await Promise.all([
        renderBucket(
          VIDEO_BUCKET,
          "exclusiveVideoList",
          createVideoUrl,
          createVideoCard,
          "目前尚無影片。"
        ),
        renderBucket(
          FILE_BUCKET,
          "exclusiveFileList",
          createFileUrl,
          createFileCard,
          "目前尚無檔案。"
        )
      ]);

      hasLoaded = true;
    } finally {
      isLoading = false;
    }
  }

  document.addEventListener("exclusive-access-ready", loadResources);
})();
