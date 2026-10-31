(() => {
    "use strict";

    const DRIVE_API =
        "https://hcegldjvhyrzfahkzmpp.supabase.co/functions/v1/drive-video";

    const FILE_BUCKET = "exclusive-files";

    const $ = (id) => document.getElementById(id);

    let currentObjectUrl = null;
    let currentVideoController = null;
    let resourceLoadPromise = null;
    let authSubscription = null;

    function showMessage(message, icon = "info") {
        if (window.Swal) {
            window.Swal.fire({
                text: message,
                icon,
                confirmButtonText: "確定"
            });
        } else {
            alert(message);
        }
    }

    async function getSession() {
        if (!window.sb) {
            throw new Error("Supabase 尚未初始化");
        }

        const { data, error } = await window.sb.auth.getSession();

        if (error) throw error;

        const session = data?.session;

        if (!session?.access_token) {
            throw new Error("請先登入帳號");
        }

        return session;
    }

    function getApiHeaders(session, extraHeaders = {}) {
        const apiKey = window.SUPABASE_PUBLISHABLE_KEY;

        if (!apiKey) {
            throw new Error("找不到 Supabase Publishable Key");
        }

        return {
            Authorization: `Bearer ${session.access_token}`,
            apikey: apiKey,
            ...extraHeaders
        };
    }

    async function driveRequest(path, options = {}) {
        const session = await getSession();

        const response = await fetch(`${DRIVE_API}${path}`, {
            ...options,
            headers: getApiHeaders(session, options.headers || {})
        });

        if (!response.ok) {
            let message = `請求失敗（${response.status}）`;

            try {
                const result = await response.json();
                message = result.error || message;
            } catch (_) {}

            throw new Error(message);
        }

        return response;
    }

    function formatSize(bytes) {
        if (!bytes || bytes <= 0) return "大小未知";

        const units = ["B", "KB", "MB", "GB"];
        let size = bytes;
        let index = 0;

        while (size >= 1024 && index < units.length - 1) {
            size /= 1024;
            index++;
        }

        return `${size.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    function renderVideoList(videos) {
        const container = $("exclusiveVideoList");

        if (!container) return;

        if (!videos.length) {
            container.innerHTML = `
                <div class="exclusive-empty">
                    目前沒有可觀看的影片
                </div>
            `;
            return;
        }

        container.innerHTML = videos.map(video => `
            <article class="exclusive-resource-card exclusive-video-card">
                <div class="exclusive-resource-icon">
                    <img
                        src="video.png"
                        alt=""
                        onerror="this.style.display='none'"
                    >
                </div>

                <div class="exclusive-resource-info">
                    <h3>${escapeHTML(video.title)}</h3>
                    <p>${escapeHTML(formatSize(video.fileSize))}</p>
                </div>

                <button
                    type="button"
                    class="exclusive-resource-button"
                    data-play-video="${escapeHTML(video.id)}"
                >
                    播放影片
                </button>
            </article>
        `).join("");

        container.querySelectorAll("[data-play-video]").forEach(button => {
            button.addEventListener("click", () => {
                const video = videos.find(
                    item => item.id === button.dataset.playVideo
                );

                if (video) openVideo(video);
            });
        });
    }

    async function loadDriveVideos() {
        const container = $("exclusiveVideoList");

        if (!container) return;

        container.innerHTML = `
            <div class="exclusive-loading">
                正在載入影片...
            </div>
        `;

        try {
            const response = await driveRequest("/videos");
            const result = await response.json();

            renderVideoList(result.videos || []);
        } catch (error) {
            console.error("[exclusive] 載入影片失敗：", error);

            container.innerHTML = `
                <div class="exclusive-error">
                    ${escapeHTML(error.message)}
                </div>
            `;
        }
    }

    async function openVideo(video) {
        const modal = $("exclusiveVideoModal");
        const playerContainer = $("exclusiveVideoPlayer");
        const title = $("exclusiveVideoModalTitle");

        if (!modal || !playerContainer) return;

        closeVideo();

        modal.hidden = false;
        document.body.style.overflow = "hidden";

        if (title) title.textContent = video.title;

        playerContainer.innerHTML = `
            <div class="exclusive-player-loading">
                正在取得安全播放連線...
            </div>
        `;

        const controller = new AbortController();
        currentVideoController = controller;

        try {
            const ticketResponse = await driveRequest("/ticket", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    fileId: video.id
                }),
                signal: controller.signal
            });

            const ticketData = await ticketResponse.json();

            if (!ticketData.streamUrl) {
                throw new Error("無法取得播放連線");
            }

            playerContainer.innerHTML = `
                <div class="exclusive-player-loading">
                    正在載入影片，請稍候...
                </div>
            `;

            const session = await getSession();

            const streamResponse = await fetch(ticketData.streamUrl, {
                method: "GET",
                headers: getApiHeaders(session),
                signal: controller.signal
            });

            if (!streamResponse.ok) {
                let message = `影片讀取失敗（${streamResponse.status}）`;

                try {
                    const result = await streamResponse.json();
                    message = result.error || message;
                } catch (_) {}

                throw new Error(message);
            }

            const blob = await streamResponse.blob();

            if (controller.signal.aborted) return;

            if (!blob.size) {
                throw new Error("影片內容是空的");
            }

            currentObjectUrl = URL.createObjectURL(blob);

            const player = document.createElement("video");

            player.id = "exclusiveDrivePlayer";
            player.controls = true;
            player.playsInline = true;
            player.preload = "metadata";
            player.setAttribute("controlsList", "nodownload");

            const source = document.createElement("source");
            source.src = currentObjectUrl;
            source.type = ticketData.file?.mimeType || "video/mp4";

            player.appendChild(source);

            player.appendChild(
                document.createTextNode("您的瀏覽器不支援影片播放。")
            );

            player.addEventListener("error", () => {
                showMessage(
                    "影片格式無法播放，請確認檔案是否為支援的 MP4 格式。",
                    "error"
                );
            });

            playerContainer.innerHTML = "";
            playerContainer.appendChild(player);

            const playResult = player.play();

            if (playResult && typeof playResult.catch === "function") {
                playResult.catch(() => {});
            }

        } catch (error) {
            if (error.name === "AbortError") return;

            console.error("[exclusive] 播放失敗：", error);

            playerContainer.innerHTML = `
                <div class="exclusive-error">
                    ${escapeHTML(error.message)}
                </div>
            `;
        }
    }

    function closeVideo() {
        if (currentVideoController) {
            currentVideoController.abort();
            currentVideoController = null;
        }

        const playerContainer = $("exclusiveVideoPlayer");

        if (playerContainer) {
            const player = playerContainer.querySelector("video");

            if (player) {
                player.pause();
                player.removeAttribute("src");

                player.querySelectorAll("source").forEach(source => {
                    source.removeAttribute("src");
                });

                player.load();
            }

            playerContainer.innerHTML = "";
        }

        if (currentObjectUrl) {
            URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = null;
        }

        const modal = $("exclusiveVideoModal");

        if (modal) modal.hidden = true;

        document.body.style.overflow = "";
    }

    async function loadFiles() {
        const container = $("exclusiveFileList");

        if (!container || !window.sb) return;

        container.innerHTML = `
            <div class="exclusive-loading">
                正在載入檔案...
            </div>
        `;

        try {
            const { data: files, error } = await window.sb
                .storage
                .from(FILE_BUCKET)
                .list("", {
                    limit: 100,
                    sortBy: {
                        column: "name",
                        order: "asc"
                    }
                });

            if (error) throw error;

            const validFiles = (files || []).filter(file =>
                file.name &&
                !file.name.startsWith(".")
            );

            if (!validFiles.length) {
                container.innerHTML = `
                    <div class="exclusive-empty">
                        目前沒有可下載的檔案
                    </div>
                `;
                return;
            }

            const items = await Promise.all(
                validFiles.map(async file => {
                    const { data, error } = await window.sb
                        .storage
                        .from(FILE_BUCKET)
                        .createSignedUrl(file.name, 300);

                    if (error) {
                        console.error(
                            "[exclusive] 檔案簽名失敗：",
                            file.name,
                            error
                        );

                        return null;
                    }

                    return {
                        name: file.name,
                        size: file.metadata?.size || 0,
                        url: data.signedUrl
                    };
                })
            );

            const readyFiles = items.filter(Boolean);

            if (!readyFiles.length) {
                container.innerHTML = `
                    <div class="exclusive-empty">
                        目前沒有可下載的檔案
                    </div>
                `;
                return;
            }

            container.innerHTML = readyFiles.map(file => `
                <article class="exclusive-resource-card">
                    <div class="exclusive-resource-icon">
                        <span>檔案</span>
                    </div>

                    <div class="exclusive-resource-info">
                        <h3>${escapeHTML(file.name)}</h3>
                        <p>${escapeHTML(formatSize(file.size))}</p>
                    </div>

                    <a
                        class="exclusive-resource-button"
                        href="${escapeHTML(file.url)}"
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                    >
                        下載檔案
                    </a>
                </article>
            `).join("");

        } catch (error) {
            console.error("[exclusive] 載入檔案失敗：", error);

            container.innerHTML = `
                <div class="exclusive-error">
                    ${escapeHTML(error.message)}
                </div>
            `;
        }
    }

    async function loadResources() {
        if (resourceLoadPromise) return resourceLoadPromise;

        resourceLoadPromise = Promise.all([
            loadDriveVideos(),
            loadFiles()
        ]).finally(() => {
            resourceLoadPromise = null;
        });

        return resourceLoadPromise;
    }

    function initializeResources() {
        const app = $("app");

        if (!app) return;

        const start = () => {
            if (!app.classList.contains("exclusive-authorized")) {
                return;
            }

            loadResources();
        };

        start();

        document.addEventListener(
            "exclusive-access-ready",
            start
        );

        if (window.sb?.auth) {
            const { data } = window.sb.auth.onAuthStateChange(() => {
                if (app.classList.contains("exclusive-authorized")) {
                    loadResources();
                } else {
                    closeVideo();

                    const videos = $("exclusiveVideoList");
                    const files = $("exclusiveFileList");

                    if (videos) videos.innerHTML = "";
                    if (files) files.innerHTML = "";
                }
            });

            authSubscription = data?.subscription || null;
        }

        $("exclusiveVideoClose")?.addEventListener(
            "click",
            closeVideo
        );

        document.querySelectorAll(
            "[data-close-exclusive-video]"
        ).forEach(element => {
            element.addEventListener("click", closeVideo);
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape") closeVideo();
        });
    }

    window.closeExclusiveVideo = closeVideo;
    window.loadExclusiveResources = loadResources;

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initializeResources
        );
    } else {
        initializeResources();
    }
})();
