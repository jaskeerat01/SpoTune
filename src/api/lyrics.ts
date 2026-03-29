/**
 * Lyrics API – matches the Android app's LrcLib + KuGou lyric sources.
 * Routed through Vite dev proxy (/lrclib → lrclib.net).
 */

import type { LyricsResult } from './types';

// lrclib.net natively supports CORS, so in production we call it directly.
// In development the Vite dev-server proxy (/lrclib → lrclib.net) is used.
const LRCLIB_BASE = import.meta.env.PROD ? 'https://lrclib.net' : '/lrclib';

// ─── LrcLib ───

interface LrcLibTrack {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  syncedLyrics: string | null;
  plainLyrics: string | null;
}

export async function getLyrics(
  title: string,
  artist: string,
  duration: number,
  album?: string,
): Promise<LyricsResult | null> {
  try {
    const params = new URLSearchParams({
      track_name: title,
      artist_name: artist,
    });
    if (album) params.set('album_name', album);

    const res = await fetch(`${LRCLIB_BASE}/api/search?${params}`);
    if (!res.ok) return null;
    const tracks: LrcLibTrack[] = await res.json();

    // Best matching: closest duration with synced lyrics
    const withSync = tracks.filter(t => t.syncedLyrics);
    const best = withSync.length
      ? withSync.reduce((a, b) =>
          Math.abs(a.duration - duration) <= Math.abs(b.duration - duration) ? a : b
        )
      : tracks.find(t => t.plainLyrics) || null;

    if (!best) return null;

    if (best.syncedLyrics) {
      return {
        text: best.syncedLyrics,
        synced: true,
        sentences: parseLrc(best.syncedLyrics),
      };
    }
    if (best.plainLyrics) {
      return { text: best.plainLyrics, synced: false };
    }
    return null;
  } catch {
    return null;
  }
}

/** Parse LRC format "[mm:ss.xx] text" into timestamp→text map */
function parseLrc(lrc: string): Map<number, string> {
  const map = new Map<number, string>();
  map.set(0, '');
  for (const line of lrc.trim().split('\n')) {
    if (line.length < 10) continue;
    try {
      const ms =
        Number(line[8]) * 10 +
        Number(line[7]) * 100 +
        Number(line[5]) * 1000 +
        Number(line[4]) * 10000 +
        Number(line[2]) * 60000 +
        Number(line[1]) * 600000;
      const text = line.substring(10);
      map.set(ms, text);
    } catch { /* skip malformed lines */ }
  }
  return map;
}
