let youtubePlayer = null;
let youtubeApiReady = false;
let pendingVideo = null;

function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) {
    youtubeApiReady = true;
    return Promise.resolve();
  }

  return new Promise(resolve => {
    if (window.onYouTubeIframeAPIReady) {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous();
        youtubeApiReady = true;
        resolve();
      };
    } else {
      window.onYouTubeIframeAPIReady = () => {
        youtubeApiReady = true;
        resolve();
      };
    }

    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
  });
}

async function openVideo(video) {
  const modal = $("exclusiveVideoModal");
  const playerContainer = $("exclusiveVideoPlayer");
  const title = $("exclusiveVideoModalTitle");

  if (!modal || !playerContainer) return;

  pendingVideo = video;
  title.textContent = video.title || "影片播放";

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
          音量
        </button>
      </div>
    </div>
  `;

  await loadYouTubeAPI();

  if (!modal || modal.hidden || pendingVideo !== video) return;

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
        event.target.playVideo();
        bindCustomControls();
      },
      onStateChange: event => {
        const button = $("customPlayPause");

        if (!button) return;

        button.textContent =
          event.data === YT.PlayerState.PLAYING ? "Ⅱ" : "▶";
      }
    }
  });
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "00:00";

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);

  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function bindCustomControls() {
  const playPause = $("customPlayPause");
  const seek = $("customSeek");
  const mute = $("customMute");

  if (!playPause || !seek || !mute) return;

  playPause.addEventListener("click", () => {
    if (!youtubePlayer) return;

    if (youtubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
      youtubePlayer.pauseVideo();
    } else {
      youtubePlayer.playVideo();
    }
  });

  mute.addEventListener("click", () => {
    if (!youtubePlayer) return;

    if (youtubePlayer.isMuted()) {
      youtubePlayer.unMute();
      mute.textContent = "音量";
    } else {
      youtubePlayer.mute();
      mute.textContent = "靜音";
    }
  });

  seek.addEventListener("input", () => {
    if (!youtubePlayer) return;

    const duration = youtubePlayer.getDuration();

    if (duration > 0) {
      youtubePlayer.seekTo(
        duration * Number(seek.value) / 100,
        true
      );
    }
  });

  if (window.youtubeProgressTimer) {
    clearInterval(window.youtubeProgressTimer);
  }

  window.youtubeProgressTimer = setInterval(() => {
    if (!youtubePlayer || !$("customSeek")) return;

    const duration = youtubePlayer.getDuration();
    const current = youtubePlayer.getCurrentTime();

    if (duration > 0) {
      $("customSeek").value = current / duration * 100;
    }

    $("customCurrentTime").textContent = formatTime(current);
    $("customDuration").textContent = formatTime(duration);
  }, 500);
}

function closeVideo() {
  const modal = $("exclusiveVideoModal");
  const playerContainer = $("exclusiveVideoPlayer");

  pendingVideo = null;

  if (window.youtubeProgressTimer) {
    clearInterval(window.youtubeProgressTimer);
    window.youtubeProgressTimer = null;
  }

  if (youtubePlayer) {
    youtubePlayer.destroy();
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
  article.className = "exclusive-item";

  const iconButton = document.createElement("button");
  iconButton.type = "button";
  iconButton.className = "exclusive-video-icon";
  iconButton.setAttribute("aria-label", `播放影片：${video.title}`);

  const icon = document.createElement("img");
  icon.src = "video.png";
  icon.alt = "影片";
  icon.loading = "lazy";

  iconButton.appendChild(icon);
  iconButton.addEventListener("click", () => openVideo(video));

  const body = document.createElement("div");
  body.className = "exclusive-item-body";

  const tag = document.createElement("span");
  tag.className = "exclusive-tag";
  tag.textContent = video.category || "線上影片";

  const title = document.createElement("h3");
  title.textContent = video.title || "未命名影片";
  title.tabIndex = 0;
  title.className = "exclusive-video-title";
  title.addEventListener("click", () => openVideo(video));
  title.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openVideo(video);
    }
  });

  const description = document.createElement("p");
  description.textContent =
    video.description || "目前就數學。";

  body.append(tag, title, description);
  article.append(iconButton, body);

  return article;
}
