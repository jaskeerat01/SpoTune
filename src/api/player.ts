/**
 * Lightweight audio-first player.
 *
 * Direct audio streams use far less memory than a hidden YouTube video iframe.
 * The iframe player is kept as a fallback for tracks whose stream URL cannot be
 * resolved by the proxy chain.
 */

import { getStreamUrl } from './youtube';

declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: () => void;
  }
}

declare namespace YT {
  class Player {
    constructor(elementId: string, options: PlayerOptions);
    loadVideoById(videoId: string): void;
    playVideo(): void;
    pauseVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    setVolume(volume: number): void;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): number;
    destroy(): void;
  }
  interface PlayerOptions {
    height?: string | number;
    width?: string | number;
    videoId?: string;
    host?: string;
    playerVars?: Record<string, unknown>;
    events?: {
      onReady?: (event: { target: Player }) => void;
      onStateChange?: (event: { data: number; target: Player }) => void;
      onError?: (event: { data: number }) => void;
    };
  }
}

const STATE = {
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
};

type Mode = 'audio' | 'iframe';

let mode: Mode = 'audio';
let audio: HTMLAudioElement | null = null;
let player: YT.Player | null = null;
let apiReady = false;
let iframeReadyPromise: Promise<void> | null = null;
let onStateChangeCallback: ((state: number) => void) | null = null;
let onErrorCallback: ((code: number) => void) | null = null;
let currentVideoId = '';
let fallingBack = false;

export function initYTPlayer(): Promise<void> {
  ensureAudio();
  return Promise.resolve();
}

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;

  audio = new Audio();
  audio.preload = 'none';
  audio.crossOrigin = 'anonymous';

  audio.addEventListener('playing', () => onStateChangeCallback?.(STATE.PLAYING));
  audio.addEventListener('pause', () => {
    if (!audio?.ended) onStateChangeCallback?.(STATE.PAUSED);
  });
  audio.addEventListener('ended', () => onStateChangeCallback?.(STATE.ENDED));
  audio.addEventListener('waiting', () => onStateChangeCallback?.(STATE.BUFFERING));
  audio.addEventListener('error', () => {
    const code = audio?.error?.code || 0;
    onErrorCallback?.(code);
    if (mode === 'audio' && currentVideoId && !fallingBack) void fallbackToIframe(currentVideoId);
  });

  return audio;
}

async function ensureIframePlayer(): Promise<void> {
  if (player) return;
  if (iframeReadyPromise) return iframeReadyPromise;

  iframeReadyPromise = new Promise((resolve) => {
    let container = document.getElementById('yt-player-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'yt-player-container';
      container.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;';
      document.body.appendChild(container);

      const playerDiv = document.createElement('div');
      playerDiv.id = 'yt-hidden-player';
      container.appendChild(playerDiv);
    }

    const createPlayer = () => {
      // NOTE: YouTube's iframe internals may log a benign data: URI CORS warning
      // and Firefox unreachable-code warnings from minified YouTube bundles.
      player = new window.YT.Player('yt-hidden-player', {
        height: '1',
        width: '1',
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          enablejsapi: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          origin: window.location.origin,
          playsinline: 1,
          rel: 0,
          widget_referrer: window.location.href,
        },
        events: {
          onReady: () => resolve(),
          onStateChange: (event) => onStateChangeCallback?.(event.data),
          onError: (event) => onErrorCallback?.(event.data),
        },
      });
    };

    if (apiReady && window.YT) {
      createPlayer();
      return;
    }

    window.onYouTubeIframeAPIReady = () => {
      apiReady = true;
      createPlayer();
    };

    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  });

  return iframeReadyPromise;
}

export function setOnStateChange(cb: (state: number) => void) {
  onStateChangeCallback = cb;
}

export function setOnError(cb: (code: number) => void) {
  onErrorCallback = cb;
}

export async function loadVideo(videoId: string) {
  const audioEl = ensureAudio();
  currentVideoId = videoId;
  fallingBack = false;

  try {
    const streamUrl = await getStreamUrl(videoId);
    mode = 'audio';
    player?.pauseVideo();
    audioEl.src = streamUrl;
    audioEl.load();
    await audioEl.play();
  } catch {
    await fallbackToIframe(videoId);
  }
}

async function fallbackToIframe(videoId: string) {
  fallingBack = true;
  if (audio) {
    audio.removeAttribute('src');
    audio.load();
  }
  mode = 'iframe';
  await ensureIframePlayer();
  player?.loadVideoById(videoId);
  fallingBack = false;
}

export function play() {
  if (mode === 'iframe') player?.playVideo();
  else void audio?.play();
}

export function pause() {
  if (mode === 'iframe') player?.pauseVideo();
  else audio?.pause();
}

export function seekTo(seconds: number) {
  if (mode === 'iframe') {
    player?.seekTo(seconds, true);
    return;
  }
  if (audio && Number.isFinite(seconds)) audio.currentTime = seconds;
}

export function setVolume(vol: number) {
  const clamped = Math.min(100, Math.max(0, vol));
  if (audio) audio.volume = clamped / 100;
  player?.setVolume(clamped);
}

export function getCurrentTime(): number {
  return mode === 'iframe' ? player?.getCurrentTime() || 0 : audio?.currentTime || 0;
}

export function getDuration(): number {
  return mode === 'iframe' ? player?.getDuration() || 0 : audio?.duration || 0;
}

export function getPlayerState(): number {
  if (mode === 'iframe') return player?.getPlayerState() ?? -1;
  if (!audio) return -1;
  if (audio.ended) return STATE.ENDED;
  if (!audio.paused) return STATE.PLAYING;
  return STATE.PAUSED;
}

export function isPlaying(): boolean {
  return getPlayerState() === STATE.PLAYING;
}

export { STATE };
