(() => {
    "use strict";

    const DRIVE_API =
        "https://hcegldjvhyrzfahkzmpp.supabase.co/functions/v1/drive-video";

    const FILE_BUCKET = "exclusive-files";

    const TICKET_REFRESH_BEFORE = 300;
    const TICKET_RETRY_DELAY = 30000;

    const $ = (id) => document.getElementById(id);

    let currentVideoController = null;
    let currentVideoId = null;
    let currentStreamUrl = null;
    let ticketRefreshTimer = null;
    let refreshInProgress = false;
    let resourceLoadPromise = null;
    let authSubscription = null;
    let initialized = false;

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
                message = result.error || result.message || message;
            } catch (_) {}

            const error = new Error(message);
            error.status = response.status;

            throw error;
        }

        return response;
    }

    async function getVideoTicket(fileId, signal) {
        const response = await driveRequest("/ticket", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                fileId
            }),
            signal
        });

        const result = await response.json();

        if (!result.streamUrl) {
            throw new Error("無法取得播放連線");
        }

        return result;
    }

    function clearTicketRefreshTimer() {
        if (ticketRefreshTimer) {
            clearTimeout(ticketRefreshTimer);
            ticketRefreshTimer = null;
        }
    }

    function scheduleTicketRefresh(ticketData, player) {
        clearTicketRefreshTimer();

        const expiresIn = Number(ticketData.expiresIn) || 1800;

        const refreshSeconds = Math.max(
            30,
            expiresIn - TICKET_REFRESH_BEFORE
        );

        console.log(
            `[exclusive] 將於 ${refreshSeconds} 秒後更新播放票券`
        );

        ticketRefreshTimer = setTimeout(() => {
            refreshVideoTicket(player);
        }, refreshSeconds * 1000);
    }

    async function refreshVideoTicket(player) {
        if (refreshInProgress) return;
        if (!currentVideoId || !currentVideoController) return;
        if (currentVideoController.signal.aborted) return;

        const playerContainer = $("exclusiveVideoPlayer");

        if (
            !playerContainer ||
            playerContainer.querySelector("video") !== player
        ) {
            return;
        }

        refreshInProgress = true;

        const videoId = currentVideoId;
        const controller = currentVideoController;

        try {
            console.log("[exclusive] 開始更新播放票券");

            const ticketData = await getVideoTicket(
                videoId,
                controller.signal
            );

            if (
                controller.signal.aborted ||
                currentVideoId !== videoId ||
                currentVideoController !== controller ||
                playerContainer.querySelector("video") !== player
            ) {
                return;
            }

            const previousTime = player.currentTime || 0;
            const wasPlaying = !player.paused && !player.ended;

            console.log("[exclusive] 播放票券更新成功");

            currentStreamUrl = ticketData.streamUrl;

            player.src = currentStreamUrl;
            player.load();

            const restorePlayback = () => {
                if (
                    controller.signal.aborted ||
                    currentVideoId !== videoId ||
                    playerContainer.querySelector("video") !== player
                ) {
                    return;
                }

                if (Number.isFinite(previousTime) && previousTime > 0) {
                    const targetTime = Math.min(
                        previousTime,
                        Number.isFinite(player.duration)
                            ? Math.max(0, player.duration - 0.5)
                            : previousTime
                    );

                    try {
                        player.currentTime = targetTime;
                    } catch (error) {
                        console.warn(
                            "[exclusive] 無法恢復播放位置：",
                            error
                        );
                    }
                }

                if (wasPlaying) {
                    const playResult = player.play();

                    if (playResult?.catch) {
                        playResult.catch(error => {
                            console.warn(
                                "[exclusive] 更新後無法自動恢復播放：",
                                error.message
                            );
                        });
                    }
                }

                console.log(
                    "[exclusive] 已恢復播放位置：",
                    player.currentTime
                );
            };

            player.addEventListener(
                "loadedmetadata",
                restorePlayback,
                { once: true }
            );

            scheduleTicketRefresh(ticketData, player);

        } catch (error) {
            if (error.name === "AbortError") return;

            console.error(
                "[exclusive] 更新播放票券失敗：",
                error
            );

            if (
                currentVideoId !== videoId ||
                currentVideoController !== controller ||
                controller.signal.aborted
            ) {
                return;
            }

            if (error.status === 401 || error.status === 403) {
                clearTicketRefreshTimer();

                showMessage(
                    "登入或觀看權限已失效，請重新登入後再播放影片。",
                    "warning"
                );

                return;
            }

            console.log("[exclusive] 將於 30 秒後重試更新票券");

            clearTicketRefreshTimer();

            ticketRefreshTimer = setTimeout(() => {
                refreshVideoTicket(player);
            }, TICKET_RETRY_DELAY);

        } finally {
            refreshInProgress = false;
        }
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

    function cleanVideoTitle(filename) {
        return String(filename || "")
            .replace(/\.(mp4|m4v|mov|mkv|webm|avi|mpeg|mpg)$/i, "");
    }

    function renderVideoList(videos) {
        const container = $("exclusiveVideoList");

        if (!container) {
            console.error("[exclusive] 找不到 #exclusiveVideoList");
            return;
        }

        if (!Array.isArray(videos) || videos.length === 0) {
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
                    <h3>${escapeHTML(cleanVideoTitle(video.title))}</h3>
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

        console.log("[exclusive] 影片清單已顯示：", videos.length);
    }

    async function loadDriveVideos() {
        const container = $("exclusiveVideoList");

        if (!container) {
            console.error("[exclusive] 找不到影片容器");
            return;
        }

        container.innerHTML = `
            <div class="exclusive-loading">
                正在載入影片...
            </div>
        `;

        try {
            const response = await driveRequest("/videos");
            const result = await response.json();

            console.log("[exclusive] Google Drive 影片資料：", result);

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

        if (!modal || !playerContainer) {
            console.error("[exclusive] 找不到影片播放器");
            return;
        }

        closeVideo();

        modal.hidden = false;
        document.body.style.overflow = "hidden";

        if (title) {
            title.textContent = cleanVideoTitle(video.title);
        }

        playerContainer.innerHTML = `
            <div class="exclusive-player-loading">
                正在取得安全播放連線...
            </div>
        `;

        const controller = new AbortController();

        currentVideoController = controller;
        currentVideoId = video.id;

        try {
            const ticketData = await getVideoTicket(
                video.id,
                controller.signal
            );

            if (controller.signal.aborted) return;
            if (currentVideoId !== video.id) return;

            currentStreamUrl = ticketData.streamUrl;

            const player = document.createElement("video");

            player.id = "exclusiveDrivePlayer";
            player.controls = true;
            player.playsInline = true;
            player.preload = "metadata";

            player.setAttribute("controlsList", "nodownload");
            player.setAttribute("controls", "");

            player.style.width = "100%";
            player.style.maxHeight = "75vh";
            player.style.display = "block";
            player.style.background = "#000";

            player.addEventListener("loadedmetadata", () => {
                console.log("[exclusive] 影片資訊載入完成", {
                    duration: player.duration,
                    width: player.videoWidth,
                    height: player.videoHeight
                });
            });

            player.addEventListener("error", () => {
                const mediaError = player.error;

                console.error("[exclusive] 影片播放錯誤：", {
                    code: mediaError?.code,
                    message: mediaError?.message
                });

                showMessage(
                    "影片載入失敗，請重新開啟播放，或確認影片格式是否受瀏覽器支援。",
                    "error"
                );
            });

            player.addEventListener("waiting", () => {
                console.log("[exclusive] 影片正在載入資料...");
            });

            player.addEventListener("canplay", () => {
                console.log("[exclusive] 影片已可以播放");
            });

            player.addEventListener("seeking", () => {
                console.log(
                    "[exclusive] 正在跳轉播放位置：",
                    player.currentTime
                );
            });

            player.src = currentStreamUrl;

            playerContainer.innerHTML = "";
            playerContainer.appendChild(player);

            player.load();

            scheduleTicketRefresh(ticketData, player);

            const playResult = player.play();

            if (playResult?.catch) {
                playResult.catch(error => {
                    console.log(
                        "[exclusive] 瀏覽器未自動播放，請手動按播放鍵：",
                        error.message
                    );
                });
            }

        } catch (error) {
            if (error.name === "AbortError") return;

            console.error("[exclusive] 播放失敗：", error);

            if (currentVideoController !== controller) return;

            playerContainer.innerHTML = `
                <div class="exclusive-error">
                    ${escapeHTML(error.message)}
                </div>
            `;
        }
    }

    function closeVideo() {
        clearTicketRefreshTimer();

        refreshInProgress = false;

        if (currentVideoController) {
            currentVideoController.abort();
            currentVideoController = null;
        }

        currentVideoId = null;
        currentStreamUrl = null;

        const playerContainer = $("exclusiveVideoPlayer");

        if (playerContainer) {
            const player = playerContainer.querySelector("video");

            if (player) {
                player.pause();
                player.removeAttribute("src");
                player.load();
            }

            playerContainer.innerHTML = "";
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
                        <img
                            src="pdf.png"
                            alt=""
                            onerror="this.style.display='none'"
                        >
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
        if (initialized) return;

        const app = $("app");

        if (!app) {
            console.error("[exclusive] 找不到 #app");
            return;
        }

        initialized = true;

        const start = async () => {
            if (!app.classList.contains("exclusive-authorized")) {
                console.log("[exclusive] 尚未取得觀看權限");
                return;
            }

            console.log("[exclusive] 權限確認完成，開始載入資源");

            await loadResources();
        };

        start();

        document.addEventListener(
            "exclusive-access-ready",
            start
        );

        if (window.sb?.auth) {
            const { data } = window.sb.auth.onAuthStateChange(
                (event, session) => {
                    setTimeout(() => {
                        if (
                            session &&
                            app.classList.contains("exclusive-authorized")
                        ) {
                            loadResources();
                        } else {
                            closeVideo();

                            const videos = $("exclusiveVideoList");
                            const files = $("exclusiveFileList");

                            if (videos) videos.innerHTML = "";
                            if (files) files.innerHTML = "";
                        }
                    }, 0);
                }
            );

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
