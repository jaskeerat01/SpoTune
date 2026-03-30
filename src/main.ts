/**
 * SpoTune Web – Main Application
 * Minimal resource footprint with vanilla TypeScript.
 */
import "./style.css";
import { search, searchSuggestions, getHome, getNext, getBrowseDetails } from "./api/youtube";
import { getLyrics } from "./api/lyrics";
import {
  initYTPlayer,
  loadVideo,
  play as ytPlay,
  pause as ytPause,
  seekTo,
  setVolume,
  getCurrentTime,
  getDuration,
  setOnStateChange,
  setOnError,
  STATE,
} from "./api/player";
import type { SongItem, YTItem, HomeSection, LyricsResult } from "./api/types";

// ─── State ───
let currentSong: SongItem | null = null;
let queue: SongItem[] = [];
let queueIndex = -1;
let isPlaying = false;
let ytPlayerReady = false;
let lyricsData: LyricsResult | null = null;
let lyricsOpen = false;
let searchDebounce: ReturnType<typeof setTimeout> | null = null;
let progressInterval: ReturnType<typeof setInterval> | null = null;

// ─── SVG Icons (inline to avoid external deps) ───
const icons = {
  home: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  search: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  explore: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88"/></svg>`,
  play: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  pause: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
  skipBack: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>`,
  skipFwd: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>`,
  volume: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>`,
  lyrics: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>`,
  close: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  music: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  shuffle: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>`,
  repeat: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>`,
};

// ─── Skeleton Helpers ───
function skeletonCards(count: number): string {
  return Array(count).fill(`<div class="skeleton-card">
    <div class="skeleton skeleton-img"></div>
    <div class="skeleton skeleton-text"></div>
    <div class="skeleton skeleton-text-sm"></div>
  </div>`).join('');
}

function skeletonTracks(count: number): string {
  return Array(count).fill(`<div class="skeleton-track">
    <div class="skeleton skeleton-thumb"></div>
    <div class="skeleton-lines">
      <div class="skeleton skeleton-line"></div>
      <div class="skeleton skeleton-line"></div>
    </div>
  </div>`).join('');
}

// ─── Utils ───
function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function isSong(item: YTItem): item is SongItem {
  return (
    "id" in item &&
    "artists" in item &&
    !("browseId" in item) &&
    !("songCountText" in item)
  );
}

// ─── Render App Shell ───
function renderApp() {
  const app = document.getElementById("app")!;
  app.innerHTML = `
    <div class="backdrop" id="backdrop"></div>
    <nav class="sidebar">
      <div class="sidebar-logo">
        <div class="logo-icon">♫</div>
        <span class="logo-text">SpoTune</span>
      </div>
      <div class="nav-section">
        <div class="nav-section-title">Menu</div>
        <div class="nav-item active" data-page="home">
          <span class="icon">${icons.home}</span> Home
        </div>
        <div class="nav-item" data-page="search">
          <span class="icon">${icons.search}</span> Search
        </div>
        <div class="nav-item" data-page="explore">
          <span class="icon">${icons.explore}</span> Explore
        </div>
      </div>
    </nav>

    <main class="main-content" id="main-content">
      <header class="content-header">
        <button class="hamburger" id="hamburger-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <span class="mobile-logo">♫ SpoTune</span>
        <div class="search-container" id="search-container">
          <span class="search-icon">${icons.search}</span>
          <input class="search-input" id="search-input" type="text"
            placeholder="Search songs, artists, albums…" autocomplete="off" />
          <div class="suggestions-dropdown" id="suggestions"></div>
        </div>
      </header>
      <div id="page-content"></div>
    </main>

    <footer class="player-bar" id="player-bar">
      <div class="player-track" id="player-track">
        <img class="player-track-thumb" id="player-thumb" src="" alt="" />
        <div class="player-track-info">
          <div class="player-track-title" id="player-title">No track playing</div>
          <div class="player-track-artist" id="player-artist"></div>
        </div>
      </div>
      <div class="player-controls">
        <div class="player-buttons">
          <button class="player-btn" id="btn-shuffle" title="Shuffle">${icons.shuffle}</button>
          <button class="player-btn" id="btn-prev" title="Previous">${icons.skipBack}</button>
          <button class="player-btn play-btn" id="btn-play" title="Play">${icons.play}</button>
          <button class="player-btn" id="btn-next" title="Next">${icons.skipFwd}</button>
          <button class="player-btn" id="btn-repeat" title="Repeat">${icons.repeat}</button>
        </div>
        <div class="progress-container">
          <span class="progress-time" id="time-current">0:00</span>
          <div class="progress-bar" id="progress-bar">
            <div class="progress-fill" id="progress-fill"></div>
          </div>
          <span class="progress-time" id="time-total">0:00</span>
        </div>
      </div>
      <div class="player-extra">
        <div class="volume-container">
          <span>${icons.volume}</span>
          <input type="range" class="volume-slider" id="volume-slider" min="0" max="100" value="80" />
        </div>
        <button class="lyrics-toggle" id="btn-lyrics">${icons.lyrics} Lyrics</button>
      </div>
    </footer>

    <div class="lyrics-panel" id="lyrics-panel">
      <div class="lyrics-panel-header">
        <span>Lyrics</span>
        <button class="lyrics-panel-close" id="lyrics-close">${icons.close}</button>
      </div>
      <div class="lyrics-body" id="lyrics-body">
        <div class="empty-state">
          <div class="empty-icon">${icons.lyrics}</div>
          <div class="empty-text">Play a song to see lyrics</div>
        </div>
      </div>
    </div>
  `;

  bindEvents();
  loadHomePage();

  document.getElementById("hamburger-btn")!.addEventListener("click", () => {
    document.querySelector(".sidebar")!.classList.toggle("open");
    document.querySelector(".backdrop")!.classList.toggle("active");
  });

  document.getElementById("backdrop")!.addEventListener("click", () => {
    document.querySelector(".sidebar")!.classList.remove("open");
    document.querySelector(".backdrop")!.classList.remove("active");
  });
}

// ─── Page Rendering ───

async function loadHomePage() {
  const pc = document.getElementById("page-content")!;
  pc.className = "animate-fade-in";
  
  const recArtists = getRecommendedArtists();
  const recSections: HomeSection[] = [];
  
  pc.innerHTML = `
    <div class="hero">
      <h1>Good ${getGreeting()}</h1>
      <p>Discover music, powered by SpoTune</p>
    </div>
    <div class="section">
      <div class="skeleton-text skeleton" style="height:20px;width:120px;margin-bottom:16px;border-radius:4px"></div>
      <div class="carousel">${skeletonCards(8)}</div>
    </div>
    <div class="section">
      <div class="skeleton-text skeleton" style="height:20px;width:160px;margin-bottom:16px;border-radius:4px"></div>
      <div class="carousel">${skeletonCards(8)}</div>
    </div>
  `;

  try {
    // Fetch home sections and recommended artists concurrently
    const [sections, ...recResults] = await Promise.all([
      getHome(),
      ...recArtists.map(artist => search(artist).catch(() => [] as YTItem[]))
    ]);

    recArtists.forEach((artist, i) => {
      const results = recResults[i];
      if (results && results.length > 0) {
        recSections.push({
          title: `More from ${artist}`,
          items: results.slice(0, 8)
        });
      }
    });

    renderHomeSections([...recSections, ...sections]);
  } catch {
    pc.innerHTML = `
      <div class="hero">
        <h1>Good ${getGreeting()}</h1>
        <p>Discover music, powered by SpoTune</p>
      </div>
      <div class="empty-state">
        <div class="empty-icon">📡</div>
        <div class="empty-text">Could not load home feed. Try searching instead!</div>
      </div>
    `;
  }
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Morning";
  if (h < 18) return "Afternoon";
  return "Evening";
}

function renderHomeSections(sections: HomeSection[]) {
  const pc = document.getElementById("page-content")!;
  let html = `
    <div class="hero">
      <h1>Good ${getGreeting()}</h1>
      <p>Discover music, powered by SpoTune</p>
    </div>
  `;
  for (const section of sections) {
    html += `<div class="section">
      <div class="section-title">${section.title}</div>
      <div class="carousel">${section.items.map((item, i) => renderCard(item, i)).join("")}</div>
    </div>`;
  }
  pc.innerHTML = html;
  bindCardClicks();
}

function renderCard(item: YTItem, index: number = 0): string {
  const thumb = ("thumbnail" in item ? item.thumbnail : "") || "";
  const title = ("title" in item ? item.title : "") || "";
  let subtitle = "";
  if ("artists" in item && item.artists) {
    subtitle = item.artists.map((a) => a.name).join(", ");
  } else if ("author" in item && item.author) {
    subtitle = item.author.name;
  }
  const dataId = isSong(item)
    ? item.id
    : "browseId" in item
      ? item.browseId
      : item.id;
  const dataType = isSong(item)
    ? "song"
    : "browseId" in item
      ? "album"
      : "playlist"; // Treat other as playlist

  return `<div class="card animate-slide-up" data-id="${dataId}" data-type="${dataType}" style="position:relative; animation-delay: ${index * 0.05}s">
    <div class="card-img-wrapper">
      <img class="card-img" src="${thumb}" alt="${title}" loading="lazy" onerror="this.style.display='none'" />
      ${dataType === "song" ? `<div class="play-overlay">${icons.play}</div>` : `<div class="play-overlay" style="background:var(--accent-light); color:#000;">${icons.explore}</div>`}
    </div>
    <div class="card-body">
      <div class="card-title" title="${title}">${title}</div>
      <div class="card-subtitle" title="${subtitle}">${subtitle}</div>
    </div>
  </div>`;
}

async function performSearch(query: string) {
  const pc = document.getElementById("page-content")!;
  pc.innerHTML = `
    <div class="search-results">
      <div class="search-results-title">Searching for "${query}"…</div>
      ${skeletonTracks(6)}
    </div>
  `;

  try {
    const results = await search(query);
    if (!results.length) {
      pc.innerHTML = `
        <div class="search-results">
          <div class="search-results-title">No results for "${query}"</div>
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <div class="empty-text">Try a different search term</div>
          </div>
        </div>
      `;
      return;
    }

    const songs = results.filter(isSong) as SongItem[];
    pc.innerHTML = `
      <div class="search-results">
        <div class="search-results-title">Results for "${query}"</div>
        <div class="track-list">
          ${songs.map((s, i) => renderTrackItem(s, i)).join("")}
        </div>
      </div>
    `;

    // Update queue to search results
    queue = songs;
    bindTrackClicks();
  } catch {
    pc.innerHTML = `
      <div class="search-results">
        <div class="search-results-title">Error searching for "${query}"</div>
        <div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <div class="empty-text">Something went wrong. Please try again.</div>
        </div>
      </div>
    `;
  }
}

function renderTrackItem(song: SongItem, index: number): string {
  const artists = song.artists?.map((a) => a.name).join(", ") || "";
  const album = song.album?.name || "";
  const active = currentSong?.id === song.id ? "active" : "";
  return `<div class="track-item ${active}" data-id="${song.id}" data-index="${index}">
    <span class="track-num">${index + 1}</span>
    <span class="play-icon-hover">${icons.play}</span>
    <img class="track-thumb" src="${song.thumbnail}" alt="" loading="lazy" onerror="this.style.display='none'" />
    <div class="track-info">
      <div class="track-title">${song.title}</div>
      <div class="track-artist">${artists}</div>
    </div>
    <span class="track-album">${album}</span>
    <span class="track-duration">${song.durationText || ""}</span>
  </div>`;
}

// ─── Player Logic ───

async function playSong(song: SongItem) {
  currentSong = song;
  updatePlayerUI();

  // Show loading state
  document.getElementById("player-title")!.textContent =
    `Loading: ${song.title}…`;

  try {
    // Initialize YT Player if needed
    if (!ytPlayerReady) {
      await initYTPlayer();
      ytPlayerReady = true;

      // Wire up state change events
      setOnStateChange((state) => {
        if (state === STATE.PLAYING) {
          isPlaying = true;
          updatePlayButton();
          updatePlayerUI();
          startProgressTracking();
        } else if (state === STATE.PAUSED) {
          isPlaying = false;
          updatePlayButton();
        } else if (state === STATE.ENDED) {
          isPlaying = false;
          updatePlayButton();
          playNext();
        } else if (state === STATE.BUFFERING) {
          document.getElementById("player-title")!.textContent =
            `Buffering: ${currentSong?.title || ""}…`;
        }
      });

      setOnError((code) => {
        console.error("YT Player error code:", code);
        document.getElementById("player-title")!.textContent =
          `⚠ Could not play: ${currentSong?.title || ""}`;
        document.getElementById("player-artist")!.textContent =
          `Error code: ${code}`;
        isPlaying = false;
        updatePlayButton();
      });
    }

    // Set volume
    const vol =
      (document.getElementById("volume-slider") as HTMLInputElement)
        ?.valueAsNumber || 80;
    setVolume(vol);

    // Load and play the video
    loadVideo(song.id);
    saveToPreferences(song);

    // Load lyrics in background
    setTimeout(() => loadLyrics(song), 1000);

    // Load queue if needed
    if (queue.length <= 1) {
      getNext(song.id).then((items) => {
        if (items.length) {
          queue = items;
          queueIndex = queue.findIndex((s) => s.id === song.id);
          if (queueIndex === -1) {
            queue.unshift(song);
            queueIndex = 0;
          }
        }
      });
    } else {
      queueIndex = queue.findIndex((s) => s.id === song.id);
    }
  } catch (e) {
    console.error("Playback error:", e);
    document.getElementById("player-title")!.textContent =
      `⚠ Could not play: ${song.title}`;
    document.getElementById("player-artist")!.textContent = String(
      e instanceof Error ? e.message : "Unknown error",
    );
    isPlaying = false;
    updatePlayButton();
  }
}

function togglePlay() {
  if (!ytPlayerReady) return;
  if (isPlaying) {
    ytPause();
  } else {
    ytPlay();
  }
}

function playNext() {
  if (!queue.length) return;
  queueIndex = (queueIndex + 1) % queue.length;
  playSong(queue[queueIndex]);
}

function playPrev() {
  if (!queue.length) return;
  if (getCurrentTime() > 3) {
    seekTo(0);
    return;
  }
  queueIndex = (queueIndex - 1 + queue.length) % queue.length;
  playSong(queue[queueIndex]);
}

function updatePlayerUI() {
  if (!currentSong) return;
  const thumb = document.getElementById("player-thumb") as HTMLImageElement;
  const title = document.getElementById("player-title")!;
  const artist = document.getElementById("player-artist")!;
  thumb.src = currentSong.thumbnail;
  title.textContent = currentSong.title;
  artist.textContent = currentSong.artists?.map((a) => a.name).join(", ") || "";

  // Highlight active track in list
  document.querySelectorAll(".track-item").forEach((el) => {
    el.classList.toggle(
      "active",
      el.getAttribute("data-id") === currentSong?.id,
    );
  });
}

function updatePlayButton() {
  const btn = document.getElementById("btn-play")!;
  btn.innerHTML = isPlaying ? icons.pause : icons.play;
}

function startProgressTracking() {
  if (progressInterval) clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    if (!ytPlayerReady) return;
    const cur = getCurrentTime();
    const dur = getDuration();
    document.getElementById("time-current")!.textContent = formatTime(cur);
    document.getElementById("time-total")!.textContent = formatTime(dur);
    const pct = dur > 0 ? (cur / dur) * 100 : 0;
    (document.getElementById("progress-fill") as HTMLElement).style.width =
      `${pct}%`;

    // Update active lyrics line
    if (lyricsOpen && lyricsData?.synced && lyricsData.sentences) {
      updateActiveLyricLine(cur * 1000);
    }
  }, 250);
}

// ─── Lyrics ───

async function loadLyrics(song: SongItem) {
  const body = document.getElementById("lyrics-body")!;
  body.innerHTML = `<div style="display:flex;justify-content:center;padding:40px"><div class="loading-spinner"></div></div>`;

  const artist = song.artists?.[0]?.name || "";
  const dur = getDuration() ? Math.round(getDuration()) : 0;
  lyricsData = await getLyrics(song.title, artist, dur, song.album?.name);

  if (!lyricsData) {
    body.innerHTML = `<div class="empty-state"><div class="empty-icon">${icons.lyrics}</div><div class="empty-text">No lyrics available</div></div>`;
    return;
  }

  if (lyricsData.synced && lyricsData.sentences) {
    const entries = Array.from(lyricsData.sentences.entries()).sort(
      (a, b) => a[0] - b[0],
    );
    body.innerHTML = entries
      .map(
        ([ts, text]) =>
          `<div class="lyrics-line" data-ts="${ts}">${text || "♫"}</div>`,
      )
      .join("");
  } else {
    body.innerHTML = lyricsData.text
      .split("\n")
      .map((line) => `<div class="lyrics-line">${line || "&nbsp;"}</div>`)
      .join("");
  }
}

function updateActiveLyricLine(currentMs: number) {
  const lines = document.querySelectorAll(".lyrics-line[data-ts]");
  let activeEl: Element | null = null;
  lines.forEach((el) => {
    const ts = Number(el.getAttribute("data-ts"));
    if (ts <= currentMs) activeEl = el;
    el.classList.remove("active");
  });
  if (activeEl) {
    (activeEl as HTMLElement).classList.add("active");
    (activeEl as HTMLElement).scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }
}

function toggleLyrics() {
  lyricsOpen = !lyricsOpen;
  document.getElementById("lyrics-panel")!.classList.toggle("open", lyricsOpen);
  document.getElementById("btn-lyrics")!.classList.toggle("active", lyricsOpen);
}

// ─── Event Binding ───

function bindEvents() {
  // Search
  const searchInput = document.getElementById(
    "search-input",
  ) as HTMLInputElement;
  const suggestionsEl = document.getElementById("suggestions")!;

  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim();
    if (searchDebounce) clearTimeout(searchDebounce);
    if (!q) {
      suggestionsEl.classList.remove("visible");
      return;
    }
    searchDebounce = setTimeout(async () => {
      const suggs = await searchSuggestions(q);
      if (suggs.length) {
        suggestionsEl.innerHTML = suggs
          .map((s) => `<div class="suggestion-item">${s}</div>`)
          .join("");
        suggestionsEl.classList.add("visible");
        suggestionsEl.querySelectorAll(".suggestion-item").forEach((el) => {
          el.addEventListener("click", () => {
            searchInput.value = el.textContent || "";
            suggestionsEl.classList.remove("visible");
            performSearch(el.textContent || "");
          });
        });
      } else {
        suggestionsEl.classList.remove("visible");
      }
    }, 300);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      suggestionsEl.classList.remove("visible");
      const q = searchInput.value.trim();
      if (q) performSearch(q);
    }
  });

  searchInput.addEventListener("blur", () => {
    setTimeout(() => suggestionsEl.classList.remove("visible"), 200);
  });

  // Player controls
  document.getElementById("btn-play")!.addEventListener("click", togglePlay);
  document.getElementById("btn-next")!.addEventListener("click", playNext);
  document.getElementById("btn-prev")!.addEventListener("click", playPrev);

  // Volume
  document.getElementById("volume-slider")!.addEventListener("input", (e) => {
    setVolume((e.target as HTMLInputElement).valueAsNumber);
  });

  // Progress bar seeking
  document.getElementById("progress-bar")!.addEventListener("click", (e) => {
    const dur = getDuration();
    if (!dur) return;
    const bar = e.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    seekTo(pct * dur);
  });

  // Lyrics
  document
    .getElementById("btn-lyrics")!
    .addEventListener("click", toggleLyrics);
  document
    .getElementById("lyrics-close")!
    .addEventListener("click", toggleLyrics);

  // Navigation
  document.querySelectorAll(".nav-item").forEach((el) => {
    el.addEventListener("click", () => {
      document
        .querySelectorAll(".nav-item")
        .forEach((n) => n.classList.remove("active"));
      el.classList.add("active");
      const page = el.getAttribute("data-page");
      if (page === "home") loadHomePage();
      if (page === "search") {
        const searchInput = document.getElementById(
          "search-input",
        ) as HTMLInputElement;
        searchInput.focus();
      }
      if (page === "explore") loadHomePage(); // Explore reuses home feed for now
    });
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.code === "Space") {
      e.preventDefault();
      togglePlay();
    }
    if (e.code === "ArrowRight" && e.ctrlKey) playNext();
    if (e.code === "ArrowLeft" && e.ctrlKey) playPrev();
  });
}

function bindCardClicks() {
  document.querySelectorAll(".card").forEach((el) => {
    el.addEventListener("click", async () => {
      const id = el.getAttribute("data-id") || "";
      const type = el.getAttribute("data-type");

      if (type === "song") {
        const thumb = (el.querySelector(".card-img") as HTMLImageElement)?.src || "";
        const title = el.querySelector(".card-title")?.textContent || "";
        const subtitle = el.querySelector(".card-subtitle")?.textContent || "";
        const song: SongItem = {
          id,
          title,
          artists: [{ name: subtitle }],
          thumbnail: thumb,
        };
        queue = [song];
        queueIndex = 0;
        playSong(song);
      } else {
        loadBrowsePage(id);
      }
    });
  });
}

async function loadBrowsePage(browseId: string) {
  const pc = document.getElementById("page-content")!;
  pc.className = "animate-fade-in";
  pc.innerHTML = `
    <div class="search-results">
      <div class="search-results-title">Loading...</div>
      ${skeletonTracks(8)}
    </div>
  `;

  try {
    const { title, items } = await getBrowseDetails(browseId);
    pc.innerHTML = `
      <div class="search-results">
        <div style="display:flex; align-items:center; gap:16px; margin-bottom: 24px;">
           <button class="player-btn" id="btn-back" style="background:var(--bg-card); padding: 8px;">${icons.skipBack}</button>
           <div class="search-results-title" style="margin-bottom:0">${title}</div>
        </div>
        <div class="track-list">
          ${items.map((s, i) => renderTrackItem(s, i)).join("")}
        </div>
      </div>
    `;

    document.getElementById("btn-back")?.addEventListener("click", () => loadHomePage());

    queue = items;
    bindTrackClicks();
  } catch (e) {
    pc.innerHTML = `<div class="empty-state"><div class="empty-text">Failed to load content.</div></div>`;
  }
}

// ─── Preference Caching ───
const PREF_KEY = "spotune_prefs";

function saveToPreferences(song: SongItem) {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREF_KEY) || "[]");
    const artist = song.artists?.[0]?.name;
    if (!artist) return;

    const newPref = { artist, timestamp: Date.now() };
    const filtered = prefs.filter((p: any) => p.artist !== artist);
    filtered.unshift(newPref);
    
    // Keep last 20 unique artists for better profile building
    localStorage.setItem(PREF_KEY, JSON.stringify(filtered.slice(0, 20)));
  } catch (e) {
    console.error("Error saving preferences:", e);
  }
}

function getRecommendedArtists(): string[] {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREF_KEY) || "[]");
    return prefs.map((p: any) => p.artist).slice(0, 3); // Get up to 3 artists
  } catch {
    return [];
  }
}

function bindTrackClicks() {
  document.querySelectorAll(".track-item").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = Number(el.getAttribute("data-index"));
      if (queue[idx]) {
        queueIndex = idx;
        playSong(queue[idx]);
      }
    });
  });
}

// ─── Boot ───
renderApp();
