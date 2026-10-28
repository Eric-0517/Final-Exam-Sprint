(() => {
  "use strict";

  const VIDEO_BUCKET = "exclusive-videos";
  const FILE_BUCKET = "exclusive-files";
  const SIGNED_URL_SECONDS = 3600;
  const PAGE_SIZE = 100;

  const sb = window.sb;

  const $ = id => document.getElementById(id);

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
    container.innerHTML = `<div class="exclusive-empty">${escapeHTML(message)}</div>`;
  }

  async function listFiles(bucket) {
    const files = [];
    let offset = 0;

    while (true) {
      const { data, error } = await sb.storage.from(bucket).list("", {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" }
      });

      if (error) throw error;
      if (!data || data.length === 0) break;

      files.push(...data.filter(file => file.name && !file.name.startsWith(".")));

      if (data.length < PAGE_SIZE) break;
      offset += data.length;
    }

    return files;
  }

  async function createSignedUrl(bucket, filename, download = false) {
    const options = download ? { download: filename } : undefined;

    const { data, error } = await sb.storage
      .from(bucket)
      .createSignedUrl(filename, SIGNED_URL_SECONDS, options);

    if (error) throw error;
    return data.signedUrl;
  }

  function videoCard(file, url) {
    const title = formatName(file.name);
    const size = formatSize(file.metadata?.size);

    return `
      <article class="exclusive-item">
        <video
          class="exclusive-video"
          controls
          preload="metadata"
          playsinline
          aria-label="${escapeHTML(title)}"
        >
          <source src="${escapeHTML(url)}" type="${getVideoMime(file.name)}">
          你的瀏覽器不支援影片播放。
        </video>
        <div class="exclusive-item-body">
          <span class="exclusive-tag">線上影片</span>
          <h3>${escapeHTML(title)}</h3>
          <p>${escapeHTML(size)}</p>
        </div>
      </article>
    `;
  }

  function getVideoMime(filename) {
    switch (getExtension(filename)) {
      case "webm": return "video/webm";
      case "ogv": return "video/ogg";
      default: return "video/mp4";
    }
  }

  function fileCard(file, url) {
    const title = formatName(file.name);
    const ext = getExtension(file.name).toUpperCase() || "FILE";
    const size = formatSize(file.metadata?.size);

    return `
      <article class="exclusive-item">
        <div class="exclusive-file-preview" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <path d="M14 2v6h6"/>
            <path d="M8 13h8M8 17h8"/>
          </svg>
        </div>
        <div class="exclusive-item-body">
          <span class="exclusive-tag">${escapeHTML(ext)} 教材</span>
          <h3>${escapeHTML(title)}</h3>
          <p>教材檔案，可下載保存。</p>
          <div class="exclusive-file-actions">
            <span class="exclusive-file-size">${escapeHTML(size)}</span>
            <a
              class="exclusive-download-button"
              href="${escapeHTML(url)}"
              target="_blank"
              rel="noopener noreferrer"
              download="${escapeHTML(file.name)}"
            >下載檔案</a>
          </div>
        </div>
      </article>
    `;
  }

  async function renderBucket(bucket, containerId, renderCard, emptyText) {
    const container = $(containerId);

    if (!container) return;

    showMessage(container, "正在載入資源……");

    try {
      const files = await listFiles(bucket);

      if (!files.length) {
        showMessage(container, emptyText);
        return;
      }

      const cards = await Promise.all(files.map(async file => {
        try {
          const url = await createSignedUrl(
            bucket,
            file.name,
            containerId === "exclusiveFileList"
          );

          return renderCard(file, url);
        } catch (error) {
          console.error(`無法產生檔案連結：${file.name}`, error);
          return "";
        }
      }));

      const validCards = cards.filter(Boolean);

      if (!validCards.length) {
        showMessage(container, "資源暫時無法載入，請稍後再試。");
        return;
      }

      container.innerHTML = validCards.join("");
    } catch (error) {
      console.error(`讀取 Bucket ${bucket} 失敗：`, error);
      showMessage(container, "載入失敗，請確認 Storage 權限設定及網路連線。");
    }
  }

  async function loadResources() {
    if (!sb) {
      console.error("Supabase 尚未初始化，請確認 js/supabase-client.js 載入順序。");
      return;
    }

    const videoContainer = $("exclusiveVideoList");
    const fileContainer = $("exclusiveFileList");

    if (!videoContainer || !fileContainer) return;

    await Promise.all([
      renderBucket(
        VIDEO_BUCKET,
        "exclusiveVideoList",
        videoCard,
        "目前尚未上傳影片。"
      ),
      renderBucket(
        FILE_BUCKET,
        "exclusiveFileList",
        fileCard,
        "目前尚未上傳教材檔案。"
      )
    ]);
  }

  document.addEventListener("exclusive-access-ready", loadResources);
})();
