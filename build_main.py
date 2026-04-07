import os

main_ts_path = r"c:\Users\mailt\Desktop\OpenTune\SpoTune\src\main.ts"

new_main_content = """import "./style.css";
import {
  search,
  searchSuggestions,
  getHome,
  getNext,
  getBrowseDetails,
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
    play: `<span class="material-symbols-outlined text-3xl" data-icon="play_arrow" style="font-variation-settings: 'FILL' 1;">play_arrow</span>`,
    pause: `<span class="material-symbols-outlined text-3xl" data-icon="pause" style="font-variation-settings: 'FILL' 1;">pause</span>`,
};

// ─── Render App Shell ───
function renderApp() {
  const app = document.getElementById("app")!;
  app.innerHTML = `
<!-- SideNavBar -->
<aside class="hidden md:flex flex-col h-screen w-64 fixed left-0 top-0 bg-[#091328] border-none py-8 px-4 z-50">
    <div class="mb-10 px-4">
        <h1 class="text-2xl font-black text-[#ba9eff] tracking-tighter font-headline">SpoTune Web</h1>
        <p class="text-on-surface-variant text-xs font-medium uppercase tracking-widest mt-1">The Digital Conductor</p>
    </div>
    <nav class="flex-1 space-y-2">
        <a class="nav-btn active flex items-center gap-4 py-3 text-[#ba9eff] font-bold border-r-4 border-[#ba9eff] pl-4 transition-colors duration-300 hover:bg-[#192540] cursor-pointer" data-page="home">
            <span class="material-symbols-outlined" data-icon="home">home</span>
            <span class="font-manrope text-lg tracking-tight">Home</span>
        </a>
        <a class="nav-btn flex items-center gap-4 py-3 text-[#a3aac4] hover:text-[#dee5ff] pl-4 transition-colors duration-300 hover:bg-[#192540] cursor-pointer" data-page="search">
            <span class="material-symbols-outlined" data-icon="search">search</span>
            <span class="font-manrope text-lg tracking-tight">Search</span>
        </a>
    </nav>
</aside>

<!-- Main Content Area -->
<main class="md:ml-64 h-screen overflow-y-auto custom-scrollbar pb-32 relative">
    <!-- TopNavBar -->
    <header class="fixed top-0 right-0 w-full md:w-[calc(100%-16rem)] h-16 z-40 bg-[#060e20]/60 backdrop-blur-xl flex items-center justify-between px-8">
        <div class="flex items-center gap-4 w-1/2">
            <div class="relative w-full max-w-md">
                <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm" data-icon="search">search</span>
                <input id="st-search-input" class="w-full bg-surface-container-lowest border-none rounded-full py-2 pl-10 pr-4 text-sm focus:ring-1 focus:ring-secondary/40 placeholder:text-on-surface-variant/50 outline-none text-white" placeholder="Search for tracks, artists..." type="text"/>
                <div class="suggestions-dropdown" id="suggestions"></div>
            </div>
        </div>
        <div class="flex items-center gap-8">
            <div class="flex items-center gap-4 text-on-surface-variant">
                <button class="hover:text-primary transition-colors"><span class="material-symbols-outlined" data-icon="account_circle">account_circle</span></button>
            </div>
        </div>
    </header>

    <div id="page-content" class="mt-16 w-full"></div>
    
    <div class="lyrics-panel" id="lyrics-panel">
      <div class="lyrics-panel-header">
        <span>Lyrics</span>
        <button class="lyrics-panel-close" id="lyrics-close"><span class="material-symbols-outlined">close</span></button>
      </div>
      <div class="lyrics-body" id="lyrics-body">
        <div class="empty-state">
          <div class="empty-text">Play a song to see lyrics</div>
        </div>
      </div>
    </div>
</main>

<!-- Immersive Media Player Bar -->
<footer class="fixed bottom-0 left-0 w-full md:pl-64 h-24 z-50 glass-player shadow-[0_-10px_40px_rgba(186,158,255,0.08)] flex items-center justify-between px-4 md:px-10">
    <!-- Currently Playing -->
    <div class="flex items-center gap-4 w-1/3 md:w-1/4">
        <div class="w-12 md:w-14 h-12 md:h-14 rounded-lg overflow-hidden shadow-2xl relative shrink-0">
            <img id="st-player-thumb" class="w-full h-full object-cover" src="/images/image_13.jpg"/>
        </div>
        <div class="min-w-0">
            <h6 id="st-player-title" class="font-bold text-sm text-on-surface leading-tight truncate">No track playing</h6>
            <p id="st-player-artist" class="text-[10px] uppercase tracking-widest text-[#ba9eff] font-inter truncate">...</p>
        </div>
    </div>
    
    <!-- Controls -->
    <div class="flex flex-col items-center gap-2 w-1/3 md:w-1/2">
        <div class="flex items-center gap-4 md:gap-8">
            <button class="text-on-surface-variant hover:text-on-surface transition-colors hidden md:block"><span class="material-symbols-outlined" data-icon="shuffle">shuffle</span></button>
            <button id="st-btn-prev" class="text-on-surface-variant hover:text-on-surface transition-colors"><span class="material-symbols-outlined" data-icon="skip_previous">skip_previous</span></button>
            <button id="st-btn-play" class="w-10 h-10 md:w-12 md:h-12 bg-[#dee5ff] text-[#060e20] flex items-center justify-center rounded-full hover:scale-110 active:scale-90 transition-transform shadow-lg">
                <span class="material-symbols-outlined text-2xl md:text-3xl" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
            </button>
            <button id="st-btn-next" class="text-on-surface-variant hover:text-on-surface transition-colors"><span class="material-symbols-outlined" data-icon="skip_next">skip_next</span></button>
            <button class="text-on-surface-variant hover:text-on-surface transition-colors hidden md:block"><span class="material-symbols-outlined" data-icon="repeat">repeat</span></button>
        </div>
        <div class="w-full max-w-xl flex items-center gap-3">
            <span id="st-time-current" class="text-[10px] text-on-surface-variant font-inter hidden md:block">0:00</span>
            <div id="st-progress-bar" class="h-1 flex-1 bg-surface-container-highest rounded-full overflow-hidden cursor-pointer relative">
                <div id="st-progress-fill" class="absolute inset-y-0 left-0 w-[0%] bg-[#53ddfc] rounded-full point-events-none"></div>
            </div>
            <span id="st-time-total" class="text-[10px] text-on-surface-variant font-inter hidden md:block">0:00</span>
        </div>
    </div>
    
    <!-- Volume & Actions -->
    <div class="flex items-center justify-end gap-4 md:gap-6 w-1/3 md:w-1/4">
        <button id="btn-lyrics" class="text-on-surface-variant hover:text-secondary transition-colors"><span class="material-symbols-outlined" data-icon="lyrics">lyrics</span></button>
        <div class="hidden md:flex items-center gap-2 w-24">
            <span class="material-symbols-outlined text-on-surface-variant text-xl">volume_up</span>
            <input type="range" class="w-full h-1 bg-surface-container-highest appearance-none rounded-full cursor-pointer outline-none slider-thumb" id="st-volume-slider" min="0" max="100" value="80" />
        </div>
    </div>
</footer>

<!-- Mobile Navigation -->
<nav class="md:hidden fixed bottom-24 left-0 w-full h-14 bg-[#192540]/90 backdrop-blur-xl flex items-center justify-around z-[60] px-4 border-t border-white/5">
    <a class="nav-btn flex flex-col items-center gap-1 text-[#53ddfc] cursor-pointer" data-page="home">
        <span class="material-symbols-outlined">home</span>
    </a>
    <a class="nav-btn flex flex-col items-center gap-1 text-[#a3aac4] cursor-pointer" data-page="search">
        <span class="material-symbols-outlined">search</span>
    </a>
</nav>
  `;

  bindEvents();
  loadHomePage();
}

async function loadHomePage() {
  const pc = document.getElementById("page-content")!;
  pc.innerHTML = `<div class="p-12 text-center mt-20"><div class="loading-spinner inline-block"></div><p class="mt-4 text-on-surface-variant">Loading Discover...</p></div>`;

  try {
    const sections = await getHome();
    if (!sections.length) throw new Error("No sections");

    // Map the first few sections dynamically to the Stitch UI components
    let html = `
    <!-- Featured Hero Section (Reusing original stitch asset for visual impact) -->
    <section class="relative w-full h-[300px] md:h-[400px] mt-0 overflow-hidden group">
        <img class="absolute inset-0 w-full h-full object-cover object-top opacity-60 scale-105 group-hover:scale-100 transition-transform duration-700" src="/images/image_01.jpg"/>
        <div class="absolute inset-0 artist-gradient"></div>
        <div class="absolute inset-0 flex flex-col justify-center px-12 max-w-4xl">
            <h2 class="text-5xl md:text-7xl font-black font-headline text-on-surface tracking-tighter mb-4 leading-none">Sonic <br/><span class="text-primary">Canvas</span></h2>
            <p class="text-on-surface-variant text-sm md:text-lg max-w-xl leading-relaxed">Your digital conductor through the best of YouTube Music.</p>
        </div>
    </section>
    
    <div class="px-4 md:px-12 -mt-12 md:-mt-16 relative z-10 space-y-12">
    `;

    // 1. Asymmetric Grid for Section 0 (e.g. Mixed for you)
    if (sections[0]) {
        html += `
        <section>
            <div class="flex items-center justify-between mb-6">
                <h3 class="text-xl md:text-2xl font-bold font-headline">${sections[0].title}</h3>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
               ${sections[0].items.slice(0, 5).map((item, i) => renderGridCard(item, i)).join("")}
            </div>
        </section>`;
    }

    // 2. Bento Grid for Section 1 (e.g. Listen again)
    if (sections[1]) {
        html += `
        <section>
            <div class="flex items-center justify-between mb-6">
                <h3 class="text-xl md:text-2xl font-bold font-headline">${sections[1].title}</h3>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 grid-rows-2 gap-4 h-auto md:h-[350px]">
        `;
        const items = sections[1].items;
        if(items[0]) html += renderBentoLarge(items[0]);
        if(items[1]) html += renderBentoSmall(items[1]);
        if(items[2]) html += renderBentoSmall(items[2]);
        html += `</div></section>`;
    }

    // 3. List Style for Section 2 (e.g. New Releases)
    if (sections[2]) {
        html += `
        <section class="pb-12">
            <div class="flex items-center justify-between mb-6">
                <h3 class="text-xl md:text-2xl font-bold font-headline">${sections[2].title}</h3>
            </div>
            <div class="space-y-1">
               ${sections[2].items.slice(0, 5).map((item, i) => renderListRow(item, i)).join("")}
            </div>
        </section>`;
    }

    html += `</div>`;
    pc.innerHTML = html;
    bindCardClicks();

  } catch (e) {
    pc.innerHTML = `<div class="p-12 text-center mt-20 text-error">Failed to load content.</div>`;
  }
}

// ─── Component Renderers ───

function getThumb(item: YTItem) { return "thumbnail" in item ? item.thumbnail : ""; }
function getTitle(item: YTItem) { return "title" in item ? item.title : ""; }
function getSubtitle(item: YTItem) { 
    if ("artists" in item && item.artists) return item.artists.map(a => a.name).join(", ");
    if ("author" in item && item.author) return item.author.name;
    return "Various Artists";
}

function renderGridCard(item: YTItem, i: number) {
    const dataId = isSong(item) ? item.id : ("browseId" in item ? item.browseId : item.id);
    const dataType = isSong(item) ? "song" : "playlist";
    const delay = i * 100;
    
    return `
    <div class="st-card group relative aspect-square rounded-xl overflow-hidden bg-surface-container-high transition-all duration-300 hover:-translate-y-2 cursor-pointer animate-slide-up" data-id="${dataId}" data-type="${dataType}" style="animation-delay: ${delay}ms">
        <img class="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" src="${getThumb(item)}"/>
        <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex items-end p-4">
            <button class="w-10 h-10 md:w-12 md:h-12 rounded-full bg-primary flex items-center justify-center text-on-primary-fixed shadow-lg translate-y-2 md:translate-y-4 md:group-hover:translate-y-0 transition-transform">
                <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
            </button>
        </div>
        <div class="absolute bottom-3 left-3 right-3 md:group-hover:opacity-0 transition-opacity">
            <p class="font-bold text-on-surface text-xs md:text-sm truncate drop-shadow-md">${getTitle(item)}</p>
            <p class="text-[10px] text-on-surface-variant truncate drop-shadow-md">${getSubtitle(item)}</p>
        </div>
    </div>`;
}

function renderBentoLarge(item: YTItem) {
    const dataId = isSong(item) ? item.id : ("browseId" in item ? item.browseId : item.id);
    const dataType = isSong(item) ? "song" : "playlist";
    return `
    <div class="st-card md:col-span-2 md:row-span-2 relative rounded-2xl overflow-hidden group cursor-pointer aspect-video md:aspect-auto" data-id="${dataId}" data-type="${dataType}">
        <img class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 md:group-hover:scale-105" src="${getThumb(item)}"/>
        <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-6 md:p-8 flex flex-col justify-end">
            <h4 class="text-2xl md:text-4xl font-black font-headline mb-1 drop-shadow-lg">${getTitle(item)}</h4>
            <p class="text-on-surface-variant text-xs md:text-sm max-w-md drop-shadow-lg line-clamp-2">${getSubtitle(item)}</p>
            <div class="mt-4 flex opacity-0 group-hover:opacity-100 transition-opacity">
                <button class="bg-primary text-on-primary-fixed rounded-full px-4 py-2 font-bold text-sm flex items-center gap-1 shadow-lg">
                    <span class="material-symbols-outlined text-sm" style="font-variation-settings: 'FILL' 1;">play_arrow</span> Play
                </button>
            </div>
        </div>
    </div>`;
}

function renderBentoSmall(item: YTItem) {
    const dataId = isSong(item) ? item.id : ("browseId" in item ? item.browseId : item.id);
    const dataType = isSong(item) ? "song" : "playlist";
    return `
    <div class="st-card relative rounded-2xl overflow-hidden group cursor-pointer aspect-video md:aspect-auto" data-id="${dataId}" data-type="${dataType}">
        <img class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 md:group-hover:scale-105" src="${getThumb(item)}"/>
        <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4 md:p-6 flex flex-col justify-end">
            <h4 class="text-lg md:text-xl font-bold font-headline shadow-black drop-shadow-lg line-clamp-1">${getTitle(item)}</h4>
            <p class="text-xs text-on-surface-variant drop-shadow-lg line-clamp-1">${getSubtitle(item)}</p>
        </div>
    </div>`;
}

function renderListRow(item: YTItem, index: number) {
    const dataId = isSong(item) ? item.id : ("browseId" in item ? item.browseId : item.id);
    const dataType = isSong(item) ? "song" : "playlist";
    return `
    <div class="st-card group flex items-center justify-between p-3 md:p-4 hover:bg-surface-container-high rounded-xl transition-colors cursor-pointer" data-id="${dataId}" data-type="${dataType}">
        <div class="flex items-center gap-4 md:gap-6 w-full">
            <span class="text-on-surface-variant font-medium w-6 text-center group-hover:hidden">${String(index + 1).padStart(2,'0')}</span>
            <span class="material-symbols-outlined text-primary hidden group-hover:block w-6 text-center" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
            <div class="w-10 h-10 md:w-12 md:h-12 rounded bg-surface-container-highest overflow-hidden shrink-0">
                <img class="w-full h-full object-cover" src="${getThumb(item)}"/>
            </div>
            <div class="min-w-0 flex-1">
                <h5 class="font-bold text-on-surface text-sm md:text-base truncate">${getTitle(item)}</h5>
                <p class="text-[10px] md:text-xs text-on-surface-variant truncate">${getSubtitle(item)}</p>
            </div>
        </div>
    </div>`;
}


// ─── Search ───
async function performSearch(query: string) {
  const pc = document.getElementById("page-content")!;
  pc.innerHTML = `<div class="p-12 mt-12"><h3 class="text-2xl font-bold mb-4 font-headline">Searching for "${query}"…</h3><div class="loading-spinner"></div></div>`;

  try {
    const results = await search(query);
    if (!results.length) {
      pc.innerHTML = `<div class="p-12 mt-12 text-center text-on-surface-variant">No results for "${query}"</div>`;
      return;
    }
    const songs = results.filter(isSong) as SongItem[];
    queue = songs;
    
    // We render results using the new ListRow component style
    pc.innerHTML = `
      <div class="p-6 md:p-12 mb-32 mt-12 bg-surface">
        <h3 class="text-2xl font-bold font-headline mb-6 text-on-surface">Results for "${query}"</h3>
        <div class="space-y-1">
          ${songs.map((s, i) => renderListRow(s, i)).join("")}
        </div>
      </div>
    `;
    bindCardClicks();
  } catch {
    pc.innerHTML = `<div class="p-12 text-center text-error">Error searching.</div>`;
  }
}


// ─── Browse Playlists ───
async function loadBrowsePage(browseId: string) {
  const pc = document.getElementById("page-content")!;
  pc.innerHTML = `<div class="p-12 mt-12"><div class="loading-spinner"></div></div>`;

  try {
    const { title, items } = await getBrowseDetails(browseId);
    queue = items;
    
    pc.innerHTML = `
      <div class="p-6 md:p-12 mb-32 mt-12 bg-surface">
        <div class="flex items-center gap-4 mb-6">
            <button id="btn-back" class="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center hover:bg-surface-variant text-on-surface">
                <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <h3 class="text-2xl font-bold font-headline text-on-surface">${title}</h3>
        </div>
        <div class="space-y-1">
          ${items.map((s, i) => renderListRow(s, i)).join("")}
        </div>
      </div>
    `;
    document.getElementById("btn-back")?.addEventListener("click", () => loadHomePage());
    bindCardClicks();
  } catch (e) {
    pc.innerHTML = `<div class="p-12 text-center text-error">Failed to load content.</div>`;
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
    searchDebounce = setTimeout(async () => {
        // ... (Keep existing suggestion logic, just styling adjustments in CSS)
    }, 300);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      suggestionsEl.classList.remove("visible");
      const q = searchInput.value.trim();
      if (q) {
          // Highlight search tab
          document.querySelectorAll(".nav-btn").forEach(n => {
              n.classList.remove("text-[#ba9eff]", "border-r-4");
              n.classList.add("text-[#a3aac4]");
          });
          performSearch(q);
      }
    }
  });

  // Nav routing
  document.querySelectorAll(".nav-btn").forEach(n => {
      n.addEventListener("click", () => {
          document.querySelectorAll(".nav-btn").forEach(el => {
              el.classList.remove("text-[#ba9eff]", "border-r-4", "border-[#ba9eff]", "font-bold");
              el.classList.add("text-[#a3aac4]");
          });
          n.classList.add("text-[#ba9eff]", "border-r-4", "border-[#ba9eff]", "font-bold");
          n.classList.remove("text-[#a3aac4]");
          
          const page = n.getAttribute("data-page");
          if(page === "home") loadHomePage();
          if(page === "search") searchInput.focus();
      });
  });

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
}

function bindCardClicks() {
  document.querySelectorAll(".st-card").forEach((el) => {
    el.addEventListener("click", async () => {
      const id = el.getAttribute("data-id") || "";
      const type = el.getAttribute("data-type");

      if (type === "song") {
        const thumb = (el.querySelector("img") as HTMLImageElement)?.src || "";
        const titleText = el.querySelector("h4, h5, p.font-bold")?.textContent || "";
        const subtitle = el.querySelector("p.text-on-surface-variant")?.textContent || "";
        const song: SongItem = { id, title: titleText, artists: [{ name: subtitle }], thumbnail: thumb };
        
        // Find if this is part of the queue from search/browse
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
        } else if (state === STATE.ENDED) {
          isPlaying = false;
          updatePlayButton();
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
          queue = items;
          queueIndex = queue.findIndex((s) => s.id === song.id);
          if (queueIndex === -1) { queue.unshift(song); queueIndex = 0; }
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

function startProgressTracking() {
  if (progressInterval) clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    if (!ytPlayerReady) return;
    const cur = getCurrentTime();
    const dur = getDuration();
    const curEl = document.getElementById("st-time-current");
    const totEl = document.getElementById("st-time-total");
    if (curEl) curEl.textContent = formatTime(cur);
    if (totEl) totEl.textContent = formatTime(dur);
    
    const pct = dur > 0 ? (cur / dur) * 100 : 0;
    const fill = document.getElementById("st-progress-fill");
    if (fill) fill.style.width = `${pct}%`;

    if (lyricsOpen && lyricsData?.synced && lyricsData.sentences) {
        updateActiveLyricLine(cur * 1000);
    }
  }, 250);
}

// ─── Lyrics ───
async function loadLyrics(song: SongItem) {
  const body = document.getElementById("lyrics-body")!;
  body.innerHTML = `<div class="p-12 text-center"><div class="loading-spinner inline-block"></div></div>`;

  const artist = song.artists?.[0]?.name || "";
  const dur = getDuration() ? Math.round(getDuration()) : 0;
  lyricsData = await getLyrics(song.title, artist, dur, song.album?.name);

  if (!lyricsData) {
    body.innerHTML = `<div class="empty-state"><div class="empty-text">No lyrics available</div></div>`;
    return;
  }

  if (lyricsData.synced && lyricsData.sentences) {
    const entries = Array.from(lyricsData.sentences.entries()).sort((a, b) => a[0] - b[0]);
    body.innerHTML = entries.map(([ts, text]) => `<div class="lyrics-line text-lg font-bold text-on-surface-variant hover:text-white transition-colors cursor-pointer py-1" data-ts="${ts}">${text || "♫"}</div>`).join("");
  } else {
    body.innerHTML = lyricsData.text.split("\\n").map((line) => `<div class="lyrics-line text-lg font-bold text-on-surface-variant py-1">${line || "&nbsp;"}</div>`).join("");
  }
}

function updateActiveLyricLine(currentMs: number) {
  const lines = document.querySelectorAll(".lyrics-line[data-ts]");
  let activeEl: Element | null = null;
  lines.forEach((el) => {
    const ts = Number(el.getAttribute("data-ts"));
    if (ts <= currentMs) activeEl = el;
    el.classList.remove("text-primary", "text-xl", "opacity-100");
    el.classList.add("text-on-surface-variant", "opacity-50");
  });
  if (activeEl) {
    (activeEl as HTMLElement).classList.remove("text-on-surface-variant", "opacity-50");
    (activeEl as HTMLElement).classList.add("text-primary", "text-xl", "opacity-100");
    (activeEl as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function toggleLyrics() {
  lyricsOpen = !lyricsOpen;
  document.getElementById("lyrics-panel")!.classList.toggle("open", lyricsOpen);
  document.getElementById("btn-lyrics")!.classList.toggle("text-primary", lyricsOpen);
}

// Kickoff
renderApp();
"""

with open(main_ts_path, "w", encoding="utf-8") as f:
    f.write(new_main_content)

print(f"Successfully overwrote {main_ts_path}")
