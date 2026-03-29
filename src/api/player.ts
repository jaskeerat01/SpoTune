/**
 * YouTube IFrame Player API wrapper.
 * This is the most reliable way to play YouTube audio in a web browser.
 * Uses a hidden YouTube video player for audio-only playback.
 */

// YouTube IFrame API types
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
    getVolume(): number;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): number;
    destroy(): void;
  }
  interface PlayerOptions {
    height?: string | number;
    width?: string | number;
    videoId?: string;
    playerVars?: Record<string, unknown>;
    events?: {
      onReady?: (event: { target: Player }) => void;
      onStateChange?: (event: { data: number; target: Player }) => void;
      onError?: (event: { data: number }) => void;
    };
  }
  enum PlayerState {
    UNSTARTED = -1,
    ENDED = 0,
    PLAYING = 1,
    PAUSED = 2,
    BUFFERING = 3,
    CUED = 5,
  }
}

let player: YT.Player | null = null;
let apiReady = false;
let readyCallback: (() => void) | null = null;

const STATE = {
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
};

/** Load the YouTube IFrame API script */
export function initYTPlayer(): Promise<void> {
  return new Promise((resolve) => {
    if (apiReady && player) {
      resolve();
      return;
    }

    // Create hidden container for the player
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

    if (apiReady) {
      createPlayer(resolve);
      return;
    }

    readyCallback = () => createPlayer(resolve);

    // Load the IFrame API
    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }

    window.onYouTubeIframeAPIReady = () => {
      apiReady = true;
      if (readyCallback) readyCallback();
    };
  });
}

function createPlayer(onReady: () => void) {
  if (player) {
    onReady();
    return;
  }
  player = new window.YT.Player('yt-hidden-player', {
    height: '1',
    width: '1',
    playerVars: {
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      fs: 0,
      iv_load_policy: 3,
      modestbranding: 1,
      playsinline: 1,
      rel: 0,
    },
    events: {
      onReady: () => onReady(),
      onStateChange: (event) => {
        if (onStateChangeCallback) onStateChangeCallback(event.data);
      },
      onError: (event) => {
        console.warn('YT Player error:', event.data);
        if (onErrorCallback) onErrorCallback(event.data);
      },
    },
  });
}

// Callbacks for player events
let onStateChangeCallback: ((state: number) => void) | null = null;
let onErrorCallback: ((code: number) => void) | null = null;

export function setOnStateChange(cb: (state: number) => void) {
  onStateChangeCallback = cb;
}

export function setOnError(cb: (code: number) => void) {
  onErrorCallback = cb;
}

export function loadVideo(videoId: string) {
  player?.loadVideoById(videoId);
}

export function play() {
  player?.playVideo();
}

export function pause() {
  player?.pauseVideo();
}

export function seekTo(seconds: number) {
  player?.seekTo(seconds, true);
}

export function setVolume(vol: number) {
  // YT uses 0-100
  player?.setVolume(vol);
}

export function getCurrentTime(): number {
  return player?.getCurrentTime() || 0;
}

export function getDuration(): number {
  return player?.getDuration() || 0;
}

export function getPlayerState(): number {
  return player?.getPlayerState() ?? -1;
}

export function isPlaying(): boolean {
  return getPlayerState() === STATE.PLAYING;
}

export { STATE };
