import "./style.css";
import {
  search,
  searchSuggestions,
  getHome,
  getNext,
  getBrowseDetails,
  getDownloadUrl,
} from "./api/youtube";
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
let isDownloading = false;

const MAX_QUEUE = 100; // cap queue to limit memory

// ─── Utils ───
function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function isSong(item: YTItem): item is SongItem {
  return "id" in item && "artists" in item && !("browseId" in item) && !("songCountText" in item);
}

const icons = {
    play: `<span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">play_arrow</span>`,
    pause: `<span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">pause</span>`,
};

// ─── Cookie-based Search History ───
const SEARCH_HISTORY_COOKIE = "st_search_history";
const MAX_HISTORY = 20;

function getSearchHistory(): string[] {
  const match = document.cookie.split("; ").find(c => c.startsWith(SEARCH_HISTORY_COOKIE + "="));
  if (!match) return [];
  try {
    return JSON.parse(decodeURIComponent(match.split("=")[1]));
  } catch {
    return [];
  }
}

function saveSearchQuery(query: string) {
  const history = getSearchHistory().filter(q => q.toLowerCase() !== query.toLowerCase());
  history.unshift(query);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  const encoded = encodeURIComponent(JSON.stringify(history));
  // Cookie persists for 1 year
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${SEARCH_HISTORY_COOKIE}=${encoded}; expires=${expires}; path=/; SameSite=Lax`;
}

/** Pick N random unique items from an array */
function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

async function getRecommendedSections(): Promise<HomeSection[]> {
  const history = getSearchHistory();
  if (!history.length) {
    // New user fallback — generic suggestions
    const items = await search("top hits 2026").catch(() => []);
    const songs = items.filter(isSong).slice(0, 10);
    return songs.length ? [{ title: "Popular right now", items: songs }] : [];
  }

  // Pick up to 3 random past searches
  const picks = pickRandom(history, Math.min(3, history.length));
  const sections: HomeSection[] = [];

  const results = await Promise.allSettled(
    picks.map(q => search(q).then(items => ({ query: q, items })))
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      const songs = result.value.items.filter(isSong).slice(0, 10);
      if (songs.length) {
        sections.push({
          title: `Because you searched "${result.value.query}"`,
          items: songs,
        });
      }
    }
  }

  // If all searches failed, fall back to generic
  if (!sections.length) {
    const items = await search("trending music").catch(() => []);
    const songs = items.filter(isSong).slice(0, 10);
    if (songs.length) sections.push({ title: "Trending now", items: songs });
  }

  return sections;
}

// ─── Render App Shell ───
function renderApp() {
  const app = document.getElementById("app")!;
  app.innerHTML = `
<header class="sp-header">
    <a class="sp-logo" id="sp-home-btn">SpoTune</a>
    <div class="sp-search-wrap">
        <span class="material-symbols-outlined sp-search-icon">search</span>
        <input id="st-search-input" class="sp-search-input" placeholder="What do you want to listen to?" type="text" />
        <div class="suggestions-dropdown" id="suggestions"></div>
    </div>
</header>

<main class="sp-main" id="page-content"></main>

<div class="lyrics-panel" id="lyrics-panel">
    <div class="lyrics-panel-header">
        <span>Lyrics</span>
        <button class="lyrics-panel-close" id="lyrics-close"><span class="material-symbols-outlined">close</span></button>
    </div>
    <div class="lyrics-body" id="lyrics-body">
        <div class="empty-state"><div class="empty-text">Play a song to see lyrics</div></div>
    </div>
</div>

<footer class="sp-player">
    <div class="sp-progress-wrap">
        <span id="st-time-current" class="sp-time">0:00</span>
        <div id="st-progress-bar" class="sp-progress-track">
            <div id="st-progress-fill" class="sp-progress-fill"></div>
        </div>
        <span id="st-time-total" class="sp-time">0:00</span>
    </div>
    <div class="sp-player-row">
        <div class="sp-player-track">
            <img id="st-player-thumb" class="sp-player-thumb" src="" alt="" />
            <div class="sp-player-text">
                <div id="st-player-title" class="sp-player-title">Not playing</div>
                <div id="st-player-artist" class="sp-player-artist"></div>
            </div>
        </div>
        <div class="sp-player-controls">
            <button id="st-btn-prev" class="sp-ctrl-btn" aria-label="Previous"><span class="material-symbols-outlined">skip_previous</span></button>
            <button id="st-btn-play" class="sp-ctrl-btn sp-play-btn" aria-label="Play"><span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">play_arrow</span></button>
            <button id="st-btn-next" class="sp-ctrl-btn" aria-label="Next"><span class="material-symbols-outlined">skip_next</span></button>
        </div>
        <div class="sp-player-extra">
            <button id="btn-download" class="sp-ctrl-btn" aria-label="Download" title="Download (128kbps)"><span class="material-symbols-outlined">download</span></button>
            <button id="btn-lyrics" class="sp-ctrl-btn" aria-label="Lyrics"><span class="material-symbols-outlined">lyrics</span></button>
            <div class="sp-volume-wrap">
                <span class="material-symbols-outlined sp-vol-icon">volume_up</span>
                <input type="range" id="st-volume-slider" class="sp-volume-slider" min="0" max="100" value="80" />
            </div>
        </div>
    </div>
</footer>

  `;

  bindEvents();
  loadHomePage();
}

async function loadHomePage() {
  const pc = document.getElementById("page-content")!;
  pc.innerHTML = `<div class="sp-loading"><div class="loading-spinner"></div><p>Loading...</p></div>`;

  try {
    // Fetch YT Music home sections + personalized recommendations in parallel
    const [sections, recommendedSections] = await Promise.all([
      getHome(),
      getRecommendedSections(),
    ]);

    // Append personalized sections after the YT Music sections
    sections.push(...recommendedSections);

    if (!sections.length) throw new Error("No sections");

    // Limit total sections to keep DOM lean
    if (sections.length > 6) sections.length = 6;

    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    let html = `<div class="sp-home"><h1 class="sp-greeting">${greeting}</h1>`;

    for (const section of sections) {
      html += `<section class="sp-section">
        <h2 class="sp-section-title">${section.title}</h2>
        <div class="sp-grid">${section.items.slice(0, 8).map(item => renderCard(item)).join("")}</div>
      </section>`;
    }

    html += `</div>`;
    pc.innerHTML = html;
    bindCardClicks();

  } catch (e: any) {
    console.error("LOAD HOME PAGE ERROR:", e);
    pc.innerHTML = `<div class="sp-error"><h3>Failed to load content</h3><p>${e.message}</p></div>`;
  }
}

// ─── Component Renderers ───

function getThumb(item: YTItem) { return "thumbnail" in item ? item.thumbnail : ""; }
function getTitle(item: YTItem) { return "title" in item ? item.title : ""; }
function getSubtitle(item: YTItem) { 
    if ("artists" in item && item.artists) return item.artists.map(a => a.name).join(", ");
    if ("author" in item && item.author) return item.author.name;
    return "";
}

function renderCard(item: YTItem) {
    const dataId = isSong(item) ? item.id : ("browseId" in item ? item.browseId : item.id);
    const dataType = isSong(item) ? "song" : "playlist";
    const subtitle = getSubtitle(item);
    return `
    <div class="sp-card st-card" data-id="${dataId}" data-type="${dataType}">
        <div class="sp-card-img">
            <img src="${getThumb(item)}" alt="${getTitle(item)}" loading="lazy" />
            <div class="sp-card-play"><span class="material-symbols-outlined" style="font-variation-settings:'FILL' 1;">play_arrow</span></div>
        </div>
        <h4 class="sp-card-title">${getTitle(item)}</h4>
        ${subtitle ? `<p class="sp-card-sub">${subtitle}</p>` : ''}
    </div>`;
}

function renderListRow(item: YTItem, index: number) {
    const dataId = isSong(item) ? item.id : ("browseId" in item ? item.browseId : item.id);
    const dataType = isSong(item) ? "song" : "playlist";
    return `
    <div class="sp-row st-card" data-id="${dataId}" data-type="${dataType}">
        <span class="sp-row-num">${String(index + 1).padStart(2, '0')}</span>
        <img class="sp-row-img" src="${getThumb(item)}" alt="" loading="lazy" />
        <div class="sp-row-text">
            <h5 class="sp-row-title">${getTitle(item)}</h5>
            <p class="sp-row-sub">${getSubtitle(item)}</p>
        </div>
        <button class="sp-row-play"><span class="material-symbols-outlined" style="font-variation-settings:'FILL' 1; font-size: 18px;">play_arrow</span></button>
    </div>`;
}


// ─── Search ───
async function performSearch(query: string) {
  // Save this search to cookie history
  saveSearchQuery(query);

  const pc = document.getElementById("page-content")!;
  pc.innerHTML = `<div class="sp-loading"><div class="loading-spinner"></div><p>Searching "${query}"...</p></div>`;

  try {
    const results = await search(query);
    if (!results.length) {
      pc.innerHTML = `<div class="sp-empty">No results for "${query}"</div>`;
      return;
    }
    const songs = results.filter(isSong) as SongItem[];
    queue = songs;
    pc.innerHTML = `
      <div class="sp-page">
        <h2 class="sp-page-title">Results for "${query}"</h2>
        <div class="sp-list">${songs.map((s, i) => renderListRow(s, i)).join("")}</div>
      </div>
    `;
    bindCardClicks();
  } catch {
    pc.innerHTML = `<div class="sp-error">Error searching.</div>`;
  }
}


// ─── Browse Playlists ───
async function loadBrowsePage(browseId: string) {
  const pc = document.getElementById("page-content")!;
  pc.innerHTML = `<div class="sp-loading"><div class="loading-spinner"></div></div>`;

  try {
    const { title, items } = await getBrowseDetails(browseId);
    queue = items;
    pc.innerHTML = `
      <div class="sp-page">
        <div class="sp-page-header">
            <button id="btn-back" class="sp-ctrl-btn sp-back-btn" aria-label="Back"><span class="material-symbols-outlined">arrow_back</span></button>
            <h2 class="sp-page-title">${title}</h2>
        </div>
        <div class="sp-list">${items.map((s, i) => renderListRow(s, i)).join("")}</div>
      </div>
    `;
    document.getElementById("btn-back")?.addEventListener("click", () => loadHomePage());
    bindCardClicks();
  } catch (e) {
    pc.innerHTML = `<div class="sp-error">Failed to load content.</div>`;
  }
}

// ─── Events ───
function bindEvents() {
  const searchInput = document.getElementById("st-search-input") as HTMLInputElement;
  const suggestionsEl = document.getElementById("suggestions")!;

  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim();
    if (searchDebounce) clearTimeout(searchDebounce);
    if (!q) { suggestionsEl.classList.remove("visible"); return; }
    searchDebounce = setTimeout(async () => {}, 300);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      suggestionsEl.classList.remove("visible");
      const q = searchInput.value.trim();
      if (q) performSearch(q);
    }
  });

  // Home via logo
  document.getElementById("sp-home-btn")?.addEventListener("click", () => loadHomePage());

  // Player controls
  document.getElementById("st-btn-play")!.addEventListener("click", togglePlay);
  document.getElementById("st-btn-next")!.addEventListener("click", playNext);
  document.getElementById("st-btn-prev")!.addEventListener("click", playPrev);
  
  const volSlider = document.getElementById("st-volume-slider") as HTMLInputElement;
  if (volSlider) {
    volSlider.addEventListener("input", (e) => setVolume((e.target as HTMLInputElement).valueAsNumber));
  }

  document.getElementById("st-progress-bar")!.addEventListener("click", (e) => {
    const dur = getDuration();
    if (!dur) return;
    const bar = e.currentTarget as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    seekTo(pct * dur);
  });

  document.getElementById("btn-lyrics")!.addEventListener("click", toggleLyrics);
  document.getElementById("lyrics-close")!.addEventListener("click", toggleLyrics);
  document.getElementById("btn-download")!.addEventListener("click", downloadCurrentSong);
}

function bindCardClicks() {
  document.querySelectorAll(".st-card").forEach((el) => {
    el.addEventListener("click", async () => {
      const id = el.getAttribute("data-id") || "";
      const type = el.getAttribute("data-type");

      if (type === "song") {
        const thumb = (el.querySelector("img") as HTMLImageElement)?.src || "";
        const titleText = el.querySelector("h4, h5")?.textContent || "";
        const subtitle = el.querySelector(".sp-card-sub, .sp-row-sub")?.textContent || "";
        const song: SongItem = { id, title: titleText, artists: [{ name: subtitle }], thumbnail: thumb };
        
        const idx = queue.findIndex(q => q.id === song.id);
        if (idx !== -1) {
            queueIndex = idx;
        } else {
            queue = [song];
            queueIndex = 0;
        }
        playSong(song);
      } else {
        loadBrowsePage(id);
      }
    });
  });
}

// ─── Player Methods ───
async function playSong(song: SongItem) {
  currentSong = song;
  updatePlayerUI();
  document.getElementById("st-player-title")!.textContent = `Loading...`;

  try {
    if (!ytPlayerReady) {
      await initYTPlayer();
      ytPlayerReady = true;

      setOnStateChange((state) => {
        if (state === STATE.PLAYING) {
          isPlaying = true;
          updatePlayButton();
          updatePlayerUI();
          startProgressTracking();
        } else if (state === STATE.PAUSED) {
          isPlaying = false;
          updatePlayButton();
          stopProgressTracking();
        } else if (state === STATE.ENDED) {
          isPlaying = false;
          updatePlayButton();
          stopProgressTracking();
          playNext();
        }
      });
    }

    const vol = (document.getElementById("st-volume-slider") as HTMLInputElement)?.valueAsNumber || 80;
    setVolume(vol);
    loadVideo(song.id);
    setTimeout(() => loadLyrics(song), 1000);

    if (queue.length <= 1) {
      getNext(song.id).then((items) => {
        if (items.length) {
          queue = items.slice(0, MAX_QUEUE);
          queueIndex = queue.findIndex((s) => s.id === song.id);
          if (queueIndex === -1) { queue.unshift(song); queueIndex = 0; }
          if (queue.length > MAX_QUEUE) queue.length = MAX_QUEUE;
        }
      });
    } else {
      queueIndex = queue.findIndex((s) => s.id === song.id);
    }
  } catch (e) {
    console.error("Playback error:", e);
    document.getElementById("st-player-title")!.textContent = `⚠ Error`;
    isPlaying = false;
    updatePlayButton();
  }
}

function togglePlay() {
  if (!ytPlayerReady) return;
  if (isPlaying) ytPause(); else ytPlay();
}

function playNext() {
  if (!queue.length) return;
  queueIndex = (queueIndex + 1) % queue.length;
  playSong(queue[queueIndex]);
}

function playPrev() {
  if (!queue.length) return;
  if (getCurrentTime() > 3) { seekTo(0); return; }
  queueIndex = (queueIndex - 1 + queue.length) % queue.length;
  playSong(queue[queueIndex]);
}

function updatePlayerUI() {
  if (!currentSong) return;
  const thumb = document.getElementById("st-player-thumb") as HTMLImageElement;
  const title = document.getElementById("st-player-title")!;
  const artist = document.getElementById("st-player-artist")!;
  thumb.src = currentSong.thumbnail;
  title.textContent = currentSong.title;
  artist.textContent = currentSong.artists?.map((a) => a.name).join(", ") || "";
}

function updatePlayButton() {
  const btn = document.getElementById("st-btn-play")!;
  btn.innerHTML = isPlaying ? icons.pause : icons.play;
}

function stopProgressTracking() {
  if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
}

// Cached DOM refs for progress tracker (avoid 4 lookups per 250ms)
let _progCurEl: HTMLElement | null = null;
let _progTotEl: HTMLElement | null = null;
let _progFillEl: HTMLElement | null = null;

function startProgressTracking() {
  stopProgressTracking();
  // Cache DOM elements once
  _progCurEl = document.getElementById("st-time-current");
  _progTotEl = document.getElementById("st-time-total");
  _progFillEl = document.getElementById("st-progress-fill");

  progressInterval = setInterval(() => {
    if (!ytPlayerReady) return;
    const cur = getCurrentTime();
    const dur = getDuration();
    if (_progCurEl) _progCurEl.textContent = formatTime(cur);
    if (_progTotEl) _progTotEl.textContent = formatTime(dur);
    
    const pct = dur > 0 ? (cur / dur) * 100 : 0;
    if (_progFillEl) _progFillEl.style.width = `${pct}%`;

    if (lyricsOpen && lyricsData?.synced && lyricsData.sentences) {
        updateActiveLyricLine(cur * 1000);
    }
  }, 250);
}

// ─── Download ───
async function downloadCurrentSong() {
  if (!currentSong || isDownloading) return;
  isDownloading = true;

  const btn = document.getElementById("btn-download")!;
  const originalHTML = btn.innerHTML;
  btn.innerHTML = `<div class="dl-spinner"></div>`;
  btn.classList.add("downloading");

  try {
    const fileName = `${currentSong.title} - ${currentSong.artists?.map(a => a.name).join(", ") || "Unknown"}`;
    const dlUrl = await getDownloadUrl(currentSong.id);
    // Append filename to the proxy URL
    const fullUrl = dlUrl + `&name=${encodeURIComponent(fileName)}`;

    const response = await fetch(fullUrl);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = blobUrl;
    // Determine extension from content-type
    const ct = response.headers.get("content-type") || "audio/mp4";
    const ext = ct.includes("webm") ? "webm" : ct.includes("ogg") ? "ogg" : "m4a";
    a.download = `${fileName}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

    // Brief success flash
    btn.innerHTML = `<span class="material-symbols-outlined" style="color: #22c55e;">check_circle</span>`;
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.classList.remove("downloading");
    }, 1800);
  } catch (e) {
    console.error("Download error:", e);
    btn.innerHTML = `<span class="material-symbols-outlined" style="color: #ef4444;">error</span>`;
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.classList.remove("downloading");
    }, 2000);
  } finally {
    isDownloading = false;
  }
}

// ─── Lyrics ───
async function loadLyrics(song: SongItem) {
  const body = document.getElementById("lyrics-body")!;
  // Free old lyrics data before loading new
  if (lyricsData) {
    if (lyricsData.sentences) lyricsData.sentences.clear();
    lyricsData = null;
  }
  _cachedLyricLines = null; // clear cached NodeList
  body.innerHTML = `<div class="sp-loading"><div class="loading-spinner"></div></div>`;

  const artist = song.artists?.[0]?.name || "";
  const dur = getDuration() ? Math.round(getDuration()) : 0;
  lyricsData = await getLyrics(song.title, artist, dur, song.album?.name);

  if (!lyricsData) {
    body.innerHTML = `<div class="empty-state"><div class="empty-text">No lyrics available</div></div>`;
    return;
  }

  if (lyricsData.synced && lyricsData.sentences) {
    const entries = Array.from(lyricsData.sentences.entries()).sort((a, b) => a[0] - b[0]);
    body.innerHTML = entries.map(([ts, text]) => `<div class="lyrics-line" data-ts="${ts}">${text || "♫"}</div>`).join("");
  } else {
    body.innerHTML = lyricsData.text.split("\n").map((line) => `<div class="lyrics-line">${line || "&nbsp;"}</div>`).join("");
  }
  _cachedLyricLines = null; // force re-cache on next sync
}

// Cache lyric line elements to avoid querySelectorAll every 250ms
let _cachedLyricLines: NodeListOf<Element> | null = null;
let _lastActiveLyricIdx = -1;

function updateActiveLyricLine(currentMs: number) {
  if (!_cachedLyricLines) {
    _cachedLyricLines = document.querySelectorAll(".lyrics-line[data-ts]");
    _lastActiveLyricIdx = -1;
  }
  const lines = _cachedLyricLines;
  if (!lines.length) return;

  // Binary-style scan: find the last line with ts <= currentMs
  let newActive = -1;
  for (let i = 0; i < lines.length; i++) {
    if (Number(lines[i].getAttribute("data-ts")) <= currentMs) newActive = i;
    else break; // timestamps are sorted, stop early
  }

  // Only update DOM if the active line changed
  if (newActive === _lastActiveLyricIdx) return;

  // Remove highlight from old active
  if (_lastActiveLyricIdx >= 0 && _lastActiveLyricIdx < lines.length) {
    const old = lines[_lastActiveLyricIdx] as HTMLElement;
    old.classList.remove("text-primary", "text-xl", "opacity-100");
    old.classList.add("text-on-surface-variant", "opacity-50");
  }
  // Add highlight to new active
  if (newActive >= 0) {
    const el = lines[newActive] as HTMLElement;
    el.classList.remove("text-on-surface-variant", "opacity-50");
    el.classList.add("text-primary", "text-xl", "opacity-100");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  _lastActiveLyricIdx = newActive;
}

function toggleLyrics() {
  lyricsOpen = !lyricsOpen;
  document.getElementById("lyrics-panel")!.classList.toggle("open", lyricsOpen);
  document.getElementById("btn-lyrics")!.classList.toggle("text-primary", lyricsOpen);
}

// Kickoff
renderApp();
