(() => {
    "use strict";

    const DRIVE_API =
        "https://exam-sprint-video.0147zeo.workers.dev";

    const FILE_BUCKET = "exclusive-files";
    const PROGRESS_SAVE_INTERVAL = 10000;
    const SESSION_REFRESH_INTERVAL = 5 * 60 * 1000;

    const $ = (id) => document.getElementById(id);

    let currentVideoController = null;
    let currentVideoId = null;
    let currentVideo = null;
    let currentStreamUrl = null;
    let sessionRefreshTimer = null;
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
            credentials: "include",
            headers: getApiHeaders(
                session,
                options.headers || {}
            )
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

    async function initializeDriveSession() {
        await driveRequest("/session", {
            method: "POST"
        });

        console.log("[exclusive] Cloudflare 播放驗證完成");
    }

    function scheduleSessionRefresh() {
        clearTimeout(sessionRefreshTimer);

        sessionRefreshTimer = setTimeout(async () => {
            if (!currentVideoId || !currentVideoController) return;
            if (currentVideoController.signal.aborted) return;

            try {
                await initializeDriveSession();

                console.log("[exclusive] 播放驗證已更新");
            } catch (error) {
                console.error(
                    "[exclusive] 更新播放驗證失敗：",
                    error
                );

                if (error.status === 401 || error.status === 403) {
                    showMessage(
                        "登入或觀看權限已失效，請重新登入。",
                        "warning"
                    );

                    return;
                }
            }

            if (currentVideoId && currentVideoController) {
                scheduleSessionRefresh();
            }
        }, SESSION_REFRESH_INTERVAL);
    }

    async function clearDriveSession() {
        clearTimeout(sessionRefreshTimer);
        sessionRefreshTimer = null;

        try {
            await fetch(`${DRIVE_API}/logout`, {
                method: "POST",
                credentials: "include"
            });
        } catch (error) {
            console.warn(
                "[exclusive] 清除播放驗證失敗：",
                error
            );
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

    function isValidPlayer(player, video, controller) {
        const playerContainer = $("exclusiveVideoPlayer");

        return Boolean(
            playerContainer &&
            playerContainer.querySelector("video") === player &&
            currentVideoId === video.id &&
            currentVideoController === controller &&
            !controller.signal.aborted
        );
    }

    async function getVideoWatchProgress(video) {
        try {
            if (!window.sb) return null;

            const {
                data: { user },
                error: userError
            } = await window.sb.auth.getUser();

            if (userError) throw userError;
            if (!user) return null;

            const { data, error } = await window.sb
                .from("video_watch_history")
                .select("last_position_seconds,duration_seconds,completed_at")
                .eq("user_id", user.id)
                .eq("video_id", String(video.id))
                .maybeSingle();

            if (error) throw error;

            return data;

        } catch (error) {
            console.error(
                "[exclusive] 讀取播放進度失敗：",
                error
            );

            return null;
        }
    }

    async function saveVideoWatchHistory(
        video,
        position = 0,
        duration = null,
        completed = false
    ) {
        try {
            if (!window.sb) return false;

            const {
                data: { user },
                error: userError
            } = await window.sb.auth.getUser();

            if (userError) throw userError;
            if (!user) return false;

            const payload = {
                user_id: user.id,
                video_id: String(video.id),
                video_title: cleanVideoTitle(video.title),
                category: video.category || "線上影片",
                watched_at: new Date().toISOString(),
                last_position_seconds: completed
                    ? 0
                    : Math.max(0, Number(position) || 0),
                duration_seconds:
                    Number.isFinite(duration) && duration > 0
                        ? duration
                        : null,
                completed_at: completed
                    ? new Date().toISOString()
                    : null
            };

            const { error } = await window.sb
                .from("video_watch_history")
                .upsert(payload, {
                    onConflict: "user_id,video_id"
                });

            if (error) throw error;

            console.log(
                completed
                    ? "[exclusive] 影片已完成"
                    : "[exclusive] 播放進度已儲存",
                {
                    video: video.title,
                    position: payload.last_position_seconds,
                    duration: payload.duration_seconds
                }
            );

            return true;

        } catch (error) {
            console.error(
                "[exclusive] 儲存觀看進度失敗：",
                error
            );

            return false;
        }
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
                    item => String(item.id) === button.dataset.playVideo
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

        await closeVideo();

        modal.hidden = false;
        document.body.style.overflow = "hidden";

        if (title) {
            title.textContent = cleanVideoTitle(video.title);
        }

        playerContainer.innerHTML = `
            <div class="exclusive-player-loading">
                正在驗證播放權限...
            </div>
        `;

        const controller = new AbortController();

        currentVideoController = controller;
        currentVideoId = video.id;
        currentVideo = video;

        try {
            const [_, savedProgress] = await Promise.all([
                initializeDriveSession(),
                getVideoWatchProgress(video)
            ]);

            if (controller.signal.aborted) return;
            if (currentVideoId !== video.id) return;

            currentStreamUrl =
                `${DRIVE_API}/stream/${encodeURIComponent(video.id)}`;

            scheduleSessionRefresh();

            const player = document.createElement("video");

            player.id = "exclusiveDrivePlayer";
            player.controls = true;
            player.playsInline = true;
            player.preload = "metadata";
            player.crossOrigin = "use-credentials";

            player.setAttribute("controlsList", "nodownload");

            player.style.width = "100%";
            player.style.maxHeight = "75vh";
            player.style.display = "block";
            player.style.background = "#000";

            let progressSaveTimer = null;
            let restoredPosition = false;
            let saveQueue = Promise.resolve();

            const isCurrent = () => {
                return isValidPlayer(player, video, controller);
            };

            const saveProgress = (completed = false) => {
                if (!isCurrent()) return Promise.resolve(false);

                const position = completed
                    ? 0
                    : Math.max(0, player.currentTime || 0);

                const duration = player.duration;

                const task = saveQueue.then(async () => {
                    if (!isCurrent()) return false;

                    return saveVideoWatchHistory(
                        video,
                        position,
                        duration,
                        completed
                    );
                });

                saveQueue = task.catch(error => {
                    console.error(
                        "[exclusive] 進度儲存佇列錯誤：",
                        error
                    );
                });

                return task;
            };

            player._saveProgress = saveProgress;

            player.addEventListener("playing", () => {
                if (!isCurrent()) return;

                console.log("[exclusive] 開始播放：", video.title);
            });

            player.addEventListener("timeupdate", () => {
                if (!isCurrent() || progressSaveTimer) return;

                progressSaveTimer = setTimeout(() => {
                    progressSaveTimer = null;

                    if (isCurrent() && !player.paused && !player.ended) {
                        saveProgress();
                    }
                }, PROGRESS_SAVE_INTERVAL);
            });

            player.addEventListener("pause", () => {
                if (!isCurrent() || player.ended) return;

                saveProgress();
            });

            player.addEventListener("ended", () => {
                if (progressSaveTimer) {
                    clearTimeout(progressSaveTimer);
                    progressSaveTimer = null;
                }

                saveProgress(true);
            });

            player.addEventListener("loadedmetadata", () => {
                if (!isCurrent() || restoredPosition) return;

                restoredPosition = true;

                const completed = Boolean(savedProgress?.completed_at);

                const savedPosition = completed
                    ? 0
                    : Number(savedProgress?.last_position_seconds) || 0;

                if (
                    savedPosition > 5 &&
                    Number.isFinite(player.duration) &&
                    player.duration > 0 &&
                    savedPosition < player.duration - 3
                ) {
                    try {
                        player.currentTime = savedPosition;

                        console.log(
                            "[exclusive] 已恢復播放位置：",
                            savedPosition
                        );
                    } catch (error) {
                        console.warn(
                            "[exclusive] 恢復播放位置失敗：",
                            error
                        );
                    }
                }
            });

            player.addEventListener("error", () => {
                if (!isCurrent()) return;

                console.error("[exclusive] 影片播放錯誤：", {
                    code: player.error?.code,
                    message: player.error?.message
                });

                showMessage(
                    "影片載入失敗，請確認播放驗證及網路連線。",
                    "error"
                );
            });

            player.addEventListener("waiting", () => {
                console.log("[exclusive] 影片正在載入資料...");
            });

            player.addEventListener("canplay", () => {
                console.log("[exclusive] 影片已可以播放");
            });

            player.src = currentStreamUrl;

            playerContainer.innerHTML = "";
            playerContainer.appendChild(player);

            player.load();

            const playResult = player.play();

            if (playResult?.catch) {
                playResult.catch(error => {
                    console.log(
                        "[exclusive] 請手動按播放鍵：",
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

    async function closeVideo() {
        clearTimeout(sessionRefreshTimer);
        sessionRefreshTimer = null;

        const playerContainer = $("exclusiveVideoPlayer");
        const player = playerContainer?.querySelector("video");

        if (
            player &&
            !player.ended &&
            typeof player._saveProgress === "function"
        ) {
            try {
                await player._saveProgress();
            } catch (error) {
                console.error(
                    "[exclusive] 儲存進度失敗：",
                    error
                );
            }
        }

        if (player) {
            player.pause();
            player.removeAttribute("src");
            player.load();
        }

        if (currentVideoController) {
            currentVideoController.abort();
            currentVideoController = null;
        }

        currentVideoId = null;
        currentVideo = null;
        currentStreamUrl = null;

        if (playerContainer) {
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
                .from("exclusive_files")
                .select("id,storage_path,display_name,category,file_type,created_at")
                .order("created_at", { ascending: false });

            if (error) throw error;

            if (!files || files.length === 0) {
                container.innerHTML = `
                    <div class="exclusive-empty">
                        目前沒有可下載的檔案
                    </div>
                `;
                return;
            }

            const items = await Promise.all(
                files.map(async file => {
                    if (!file.storage_path) return null;

                    const displayName =
                        file.display_name ||
                        file.storage_path.split("/").pop();

                    const { data, error } = await window.sb
                        .storage
                        .from(FILE_BUCKET)
                        .createSignedUrl(
                            file.storage_path,
                            300,
                            {
                                download: displayName
                            }
                        );

                    if (error) {
                        console.error(
                            "[exclusive] 檔案簽名失敗：",
                            file.storage_path,
                            error
                        );

                        return null;
                    }

                    return {
                        id: file.id,
                        name: displayName,
                        path: file.storage_path,
                        category: file.category || "其他",
                        fileType: file.file_type || "",
                        createdAt: file.created_at,
                        url: data.signedUrl
                    };
                })
            );

            const readyFiles = items.filter(Boolean);

            if (!readyFiles.length) {
                container.innerHTML = `
                    <div class="exclusive-empty">
                        檔案載入失敗，請稍後再試。
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
                        <p>
                            ${escapeHTML(file.category)}
                            ${file.fileType
                                ? `｜${escapeHTML(file.fileType.toUpperCase())}`
                                : ""}
                        </p>
                    </div>

                    <a
                        class="exclusive-resource-button"
                        href="${escapeHTML(file.url)}"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        下載檔案
                    </a>
                </article>
            `).join("");

            console.log(
                "[exclusive] 中文檔案清單載入成功：",
                readyFiles.length
            );

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
                            clearDriveSession();

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
