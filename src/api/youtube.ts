/**
 * YouTube Music InnerTube API – matching the Android client's WEB_REMIX profile.
 * All requests are routed through the Vite dev proxy (/ytapi → music.youtube.com/youtubei/v1/).
 */

import type { SongItem, AlbumItem, ArtistItem, PlaylistItem, HomeSection, YTItem } from './types';

const API = '/ytapi';

const WEB_REMIX = {
  clientName: 'WEB_REMIX',
  clientVersion: '1.20250310.01.00',
  clientId: '67',
};

function makeContext() {
  return {
    client: {
      clientName: WEB_REMIX.clientName,
      clientVersion: WEB_REMIX.clientVersion,
      gl: navigator.language.split('-')[1] || 'US',
      hl: navigator.language || 'en',
    },
  };
}

function defaultHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Goog-Api-Format-Version': '1',
    'X-YouTube-Client-Name': WEB_REMIX.clientId,
    'X-YouTube-Client-Version': WEB_REMIX.clientVersion,
  };
}

async function ytPost(endpoint: string, body: Record<string, unknown>) {
  const res = await fetch(`${API}/${endpoint}?prettyPrint=false`, {
    method: 'POST',
    headers: defaultHeaders(),
    body: JSON.stringify({ context: makeContext(), ...body }),
  });
  if (!res.ok) throw new Error(`YT API ${endpoint} failed: ${res.status}`);
  return res.json();
}

// ───── Thumbnail helpers ─────

function bestThumb(thumbnails?: { url: string; width?: number }[]): string {
  if (!thumbnails?.length) return '';
  return thumbnails[thumbnails.length - 1].url;
}

function fixThumbUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('//')) url = 'https:' + url;
  // img tags can load cross-origin images directly without CORS issues,
  // so no proxy is needed. Just ensure the URL uses https.
  if (url.startsWith('http://')) url = url.replace('http://', 'https://');
  return url;
}

function pickLeanAudioFormat<T extends { bitrate?: number; url?: string }>(formats: T[]): T | undefined {
  const TARGET_BITRATE = 128000;
  return formats
    .filter(format => format.url)
    .sort((a, b) =>
      Math.abs((a.bitrate || TARGET_BITRATE) - TARGET_BITRATE) -
      Math.abs((b.bitrate || TARGET_BITRATE) - TARGET_BITRATE)
    )[0];
}

// ───── Parsers ─────

function parseSong(renderer: any): SongItem | null {
  try {
    const cols = renderer.flexColumns || [];
    // Titles can be in col 0 or 1 depending on whether it's a playlist or search
    const col0Text = cols?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
    let title = col0Text;
    let artistRuns = cols?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
    let albumRuns = cols?.[2]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];

    // If col 0 is empty (e.g. some track number formats), shift by 1
    if (!title && cols[1]) {
      title = cols?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
      artistRuns = cols?.[2]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
      albumRuns = cols?.[3]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
    }

    const id = renderer.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer
      ?.playNavigationEndpoint?.watchEndpoint?.videoId
      || renderer.playlistItemData?.videoId
      || renderer.navigationEndpoint?.watchEndpoint?.videoId;

    if (!id || !title) return null;

    const thumb = fixThumbUrl(bestThumb(renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails));
    // Pluck the last item of whatever is artists column text, if it looks like a duration
    const potDur = artistRuns.slice(-1)?.[0]?.text || '';
    const durationText = potDur.includes(':') ? potDur : '';

    return {
      id,
      title,
      artists: artistRuns.filter((_: any, i: number) => i % 2 === 0).map((r: any) => ({
        name: r.text,
        id: r.navigationEndpoint?.browseEndpoint?.browseId,
      })),
      album: albumRuns[0] ? {
        name: albumRuns[0].text,
        id: albumRuns[0].navigationEndpoint?.browseEndpoint?.browseId,
      } : undefined,
      thumbnail: thumb,
      durationText,
    };
  } catch {
    return null;
  }
}

function parseTwoRowItem(renderer: any): YTItem | null {
  try {
    const title = renderer.title?.runs?.[0]?.text;
    const thumb = fixThumbUrl(bestThumb(renderer.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails));
    const browseId = renderer.navigationEndpoint?.browseEndpoint?.browseId as string | undefined;
    const pageType = renderer.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
      ?.browseEndpointContextMusicConfig?.pageType;
    const videoId = renderer.navigationEndpoint?.watchEndpoint?.videoId;

    if (videoId) {
      // Song
      const subtitle = renderer.subtitle?.runs?.map((r: any) => r.text).join('') || '';
      return {
        id: videoId,
        title: title || 'Unknown',
        artists: [{ name: subtitle }],
        thumbnail: thumb,
      } as SongItem;
    }

    if (pageType === 'MUSIC_PAGE_TYPE_ALBUM' && browseId) {
      const playlistId = renderer.navigationEndpoint?.browseEndpoint?.browseId || '';
      const artistRuns = renderer.subtitle?.runs?.filter((_: any, i: number) => i % 2 === 0) || [];
      return {
        browseId,
        playlistId,
        title: title || 'Unknown',
        artists: artistRuns.map((r: any) => ({ name: r.text, id: r.navigationEndpoint?.browseEndpoint?.browseId })),
        thumbnail: thumb,
      } as AlbumItem;
    }

    if (pageType === 'MUSIC_PAGE_TYPE_ARTIST' && browseId) {
      return { id: browseId, title: title || 'Unknown', thumbnail: thumb } as ArtistItem;
    }

    if (pageType === 'MUSIC_PAGE_TYPE_PLAYLIST' && browseId) {
      const sub = renderer.subtitle?.runs?.map((r: any) => r.text).join('') || '';
      return { id: browseId, title: title || 'Unknown', author: { name: sub }, thumbnail: thumb } as PlaylistItem;
    }

    return null;
  } catch {
    return null;
  }
}

// ───── Public API ─────

export async function searchSuggestions(query: string): Promise<string[]> {
  try {
    const data = await ytPost('music/get_search_suggestions', { input: query });
    const contents = data?.contents || [];
    return contents[0]?.searchSuggestionsSectionRenderer?.contents
      ?.map((c: any) => c.searchSuggestionRenderer?.suggestion?.runs?.map((r: any) => r.text).join(''))
      .filter(Boolean) || [];
  } catch {
    return [];
  }
}

export async function search(query: string): Promise<YTItem[]> {
  const data = await ytPost('search', { query, params: 'EgWKAQIIAWoOEAMQBBAJEAoQBRAREBU%3D' });
  const tabs = data?.contents?.tabbedSearchResultsRenderer?.tabs || [];
  const contents = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
  const items: YTItem[] = [];
  for (const section of contents) {
    const shelf = section.musicShelfRenderer;
    if (shelf?.contents) {
      for (const c of shelf.contents) {
        const song = parseSong(c.musicResponsiveListItemRenderer);
        if (song) items.push(song);
      }
    }
    const carousel = section.musicCardShelfRenderer;
    if (carousel) {
      // Top result card
      const topSong = parseSong(carousel);
      if (topSong) items.push(topSong);
    }
  }
  return items;
}

export async function getHome(): Promise<HomeSection[]> {
  const data = await ytPost('browse', { browseId: 'FEmusic_home' });
  const contents = data?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]
    ?.tabRenderer?.content?.sectionListRenderer?.contents || [];

  const sections: HomeSection[] = [];
  for (const content of contents) {
    const shelf = content.musicCarouselShelfRenderer;
    if (!shelf) continue;
    const title = shelf.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.[0]?.text || 'Picks';
    const shelfItems: YTItem[] = [];
    for (const c of shelf.contents || []) {
      if (c.musicTwoRowItemRenderer) {
        const item = parseTwoRowItem(c.musicTwoRowItemRenderer);
        if (item) shelfItems.push(item);
      }
      if (c.musicResponsiveListItemRenderer) {
        const song = parseSong(c.musicResponsiveListItemRenderer);
        if (song) shelfItems.push(song);
      }
    }
    if (shelfItems.length) sections.push({ title, items: shelfItems });
  }
  return sections;
}

/**
 * Stream URL fetching via multi-instance proxy.
 * The /yt-proxy/ endpoint tries 5 Invidious/Piped instances server-side.
 * Stream URLs are wrapped through /audiostream proxy to bypass CORS on <audio> elements.
 */

function proxyStreamUrl(url: string): string {
  return `/audiostream?url=${encodeURIComponent(url)}`;
}

async function tryProxyInstances(videoId: string): Promise<string | null> {
  // Try Piped API format first
  try {
    const res = await fetch(`/yt-proxy/streams/${videoId}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const data = await res.json();
      // Piped format: audioStreams
      const audioStreams = data?.audioStreams || [];
      if (audioStreams.length) {
        const pick = pickLeanAudioFormat(audioStreams);
        if (pick?.url) return proxyStreamUrl(pick.url);
      }
      if (data?.hls) return proxyStreamUrl(data.hls);
    }
  } catch { /* try next */ }

  // Try Invidious API format
  try {
    const res = await fetch(`/yt-proxy/api/v1/videos/${videoId}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const data = await res.json();
      // Invidious format: adaptiveFormats
      const formats = data?.adaptiveFormats || [];
      const audioFormats = formats.filter((f: any) => f.type?.startsWith('audio/'));
      if (audioFormats.length) {
        const best = pickLeanAudioFormat(audioFormats);
        if (best?.url) return proxyStreamUrl(best.url);
      }
      // Fallback to any format with url
      const withUrl = formats.find((f: any) => f.url);
      if (withUrl?.url) return proxyStreamUrl(withUrl.url);
    }
  } catch { /* unavailable */ }

  return null;
}

/** Try YouTube player API with a specific client config */
async function tryYTPlayer(videoId: string, clientConfig: {
  clientName: string;
  clientVersion: string;
  clientId: string;
  userAgent?: string;
}): Promise<string | null> {
  try {
    const context = {
      client: {
        clientName: clientConfig.clientName,
        clientVersion: clientConfig.clientVersion,
        gl: navigator.language.split('-')[1] || 'US',
        hl: navigator.language || 'en',
      },
    };
    const res = await fetch(`${API}/player?prettyPrint=false`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-YouTube-Client-Name': clientConfig.clientId,
        'X-YouTube-Client-Version': clientConfig.clientVersion,
      },
      body: JSON.stringify({
        context,
        videoId,
        playbackContext: {
          contentPlaybackContext: { signatureTimestamp: 0 },
        },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const formats = [
      ...(data?.streamingData?.adaptiveFormats || []),
      ...(data?.streamingData?.formats || []),
    ];
    // Prefer audio-only format with direct URL (no signatureCipher)
    const audio = pickLeanAudioFormat(formats.filter((f: any) => f.mimeType?.startsWith('audio/')));
    if (audio?.url) return proxyStreamUrl(audio.url);
    // Any format with direct URL
    const anyDirect = formats.find((f: any) => f.url);
    if (anyDirect?.url) return proxyStreamUrl(anyDirect.url);
    return null;
  } catch {
    return null;
  }
}

export async function getStreamUrl(videoId: string): Promise<string> {
  // Strategy 1: Multi-instance proxy (Invidious + Piped — most reliable for web)
  const proxyUrl = await tryProxyInstances(videoId);
  if (proxyUrl) return proxyUrl;

  // Strategy 2: YouTube IOS client (often returns unencrypted URLs)
  const iosUrl = await tryYTPlayer(videoId, {
    clientName: 'IOS',
    clientVersion: '20.10.4',
    clientId: '5',
  });
  if (iosUrl) return iosUrl;

  // Strategy 3: ANDROID_VR client (no auth required)
  const vrUrl = await tryYTPlayer(videoId, {
    clientName: 'ANDROID_VR',
    clientVersion: '1.61.48',
    clientId: '28',
  });
  if (vrUrl) return vrUrl;

  // Strategy 4: WEB_REMIX (least likely to work without signature decryption)
  const webUrl = await tryYTPlayer(videoId, WEB_REMIX);
  if (webUrl) return webUrl;

  throw new Error('No stream URL available — all strategies exhausted');
}

/**
 * Get a download-ready audio URL targeting ~128kbps.
 * Returns a /dl-proxy URL that streams through our server to avoid CORS.
 */
export async function getDownloadUrl(videoId: string): Promise<string> {
  const TARGET_BITRATE = 128000; // 128kbps

  // Try Piped API
  try {
    const res = await fetch(`/yt-proxy/streams/${videoId}`, { signal: AbortSignal.timeout(12000) });
    if (res.ok) {
      const data = await res.json();
      const audioStreams = data?.audioStreams || [];
      if (audioStreams.length) {
        // Find the stream closest to 128kbps
        const sorted = [...audioStreams]
          .filter((s: any) => s.url && s.mimeType?.includes('audio'))
          .sort((a: any, b: any) =>
            Math.abs((a.bitrate || 0) - TARGET_BITRATE) - Math.abs((b.bitrate || 0) - TARGET_BITRATE)
          );
        const pick = sorted[0];
        if (pick?.url) return `/dl-proxy?url=${encodeURIComponent(pick.url)}`;
      }
    }
  } catch { /* try next */ }

  // Try Invidious API
  try {
    const res = await fetch(`/yt-proxy/api/v1/videos/${videoId}`, { signal: AbortSignal.timeout(12000) });
    if (res.ok) {
      const data = await res.json();
      const formats = data?.adaptiveFormats || [];
      const audioFormats = formats.filter((f: any) => f.type?.startsWith('audio/') && f.url);
      if (audioFormats.length) {
        const sorted = [...audioFormats].sort((a: any, b: any) =>
          Math.abs((a.bitrate || 0) - TARGET_BITRATE) - Math.abs((b.bitrate || 0) - TARGET_BITRATE)
        );
        if (sorted[0]?.url) return `/dl-proxy?url=${encodeURIComponent(sorted[0].url)}`;
      }
    }
  } catch { /* unavailable */ }

  throw new Error('No download URL available');
}

export async function getNext(videoId: string, playlistId?: string): Promise<SongItem[]> {
  const body: Record<string, unknown> = { videoId };
  if (playlistId) body.playlistId = playlistId;
  const data = await ytPost('next', body);
  const panel = data?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer
    ?.watchNextTabbedResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.musicQueueRenderer
    ?.content?.playlistPanelRenderer;
  if (!panel?.contents) return [];
  return panel.contents
    .map((c: any) => {
      const r = c.playlistPanelVideoRenderer;
      if (!r) return null;
      const id = r.navigationEndpoint?.watchEndpoint?.videoId;
      const title = r.title?.runs?.[0]?.text;
      const artistText = r.shortBylineText?.runs?.map((x: any) => x.text).join('') || '';
      const thumb = fixThumbUrl(bestThumb(r.thumbnail?.thumbnails));
      const durText = r.lengthText?.runs?.[0]?.text;
      if (!id || !title) return null;
      return { id, title, artists: [{ name: artistText }], thumbnail: thumb, durationText: durText } as SongItem;
    })
    .filter(Boolean) as SongItem[];
}

export async function getBrowseDetails(browseId: string): Promise<{ title: string; items: SongItem[] }> {
  try {
    const data = await ytPost('browse', { browseId });
    
    // Extract title from various header types
    const title = 
      data?.header?.musicDetailHeaderRenderer?.title?.runs?.[0]?.text
      || data?.header?.musicEditablePlaylistDetailHeaderRenderer?.header?.musicPlaylistEditHeaderRenderer?.title?.runs?.[0]?.text
      || data?.header?.musicImmersiveHeaderRenderer?.title?.runs?.[0]?.text
      || data?.header?.musicVisualHeaderRenderer?.title?.runs?.[0]?.text
      || 'Playlist';
    
    const items: SongItem[] = [];
    
    // Strategy 1: singleColumnBrowseResultsRenderer (albums, some playlists)
    const singleTabs = data?.contents?.singleColumnBrowseResultsRenderer?.tabs;
    if (singleTabs) {
      const sectionContents = singleTabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
      for (const section of sectionContents) {
        extractSongsFromSection(section, items);
      }
    }
    
    // Strategy 2: twoColumnBrowseResultsRenderer (community playlists)
    const twoCol = data?.contents?.twoColumnBrowseResultsRenderer;
    if (twoCol) {
      // Check tabs
      const tabContents = twoCol.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
      for (const section of tabContents) {
        extractSongsFromSection(section, items);
      }
      // Check secondaryContents (common for playlists)
      const secContents = twoCol.secondaryContents?.sectionListRenderer?.contents || [];
      for (const section of secContents) {
        extractSongsFromSection(section, items);
      }
      // Direct musicPlaylistShelfRenderer under secondaryContents
      const directShelf = twoCol.secondaryContents?.musicPlaylistShelfRenderer?.contents || [];
      for (const c of directShelf) {
        if (c.musicResponsiveListItemRenderer) {
          const song = parseSong(c.musicResponsiveListItemRenderer);
          if (song) items.push(song);
        }
      }
    }
    
    return { title, items };
  } catch (e) {
    console.error('Failed to get browse details:', e);
    return { title: 'Error', items: [] };
  }
}

/** Recursively extract songs from a section renderer */
function extractSongsFromSection(section: any, items: SongItem[]) {
  const shelfContents = 
    section.musicShelfRenderer?.contents 
    || section.musicPlaylistShelfRenderer?.contents 
    || [];
  
  for (const c of shelfContents) {
    if (c.musicResponsiveListItemRenderer) {
      const song = parseSong(c.musicResponsiveListItemRenderer);
      if (song) items.push(song);
    }
  }
}
