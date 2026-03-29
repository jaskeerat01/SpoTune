// ─── YouTube Music InnerTube API Types ───

export interface YTContext {
  client: {
    clientName: string;
    clientVersion: string;
    gl: string;
    hl: string;
    visitorData?: string;
  };
}

export interface SongItem {
  id: string;
  title: string;
  artists: { name: string; id?: string }[];
  album?: { name: string; id?: string };
  thumbnail: string;
  duration?: number;        // seconds
  durationText?: string;
}

export interface AlbumItem {
  browseId: string;
  playlistId: string;
  title: string;
  artists: { name: string; id?: string }[];
  year?: number;
  thumbnail: string;
}

export interface ArtistItem {
  id: string;
  title: string;
  thumbnail: string;
}

export interface PlaylistItem {
  id: string;
  title: string;
  author?: { name: string; id?: string };
  thumbnail: string;
  songCountText?: string;
}

export type YTItem = SongItem | AlbumItem | ArtistItem | PlaylistItem;

export interface HomeSection {
  title: string;
  items: YTItem[];
}

export interface SearchResult {
  items: YTItem[];
}

export interface StreamingData {
  url: string;
}

export interface LyricsResult {
  text: string;
  synced: boolean;
  sentences?: Map<number, string>;
}
