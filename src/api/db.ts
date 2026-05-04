const DB_NAME = 'SpoTuneDB';
const DB_VERSION = 1;
const STORE_NAME = 'listenHistory';

export interface HistoryEntry {
  id?: number;
  videoId: string;
  title: string;
  thumbnail?: string;
  artist?: string;
  durationSeconds?: number;
  listenedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('listenedAt', 'listenedAt', { unique: false });
        store.createIndex('videoId', 'videoId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function addToHistory(entry: Omit<HistoryEntry, 'id'>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const videoIndex = store.index('videoId');
    const request = videoIndex.openCursor(IDBKeyRange.only(entry.videoId));

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        store.add({ ...entry, listenedAt: Date.now() });
      }
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getHistory(limit = 100): Promise<HistoryEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('listenedAt');
    const request = index.openCursor(null, 'prev');
    const results: HistoryEntry[] = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor && results.length < limit) {
        results.push(cursor.value as HistoryEntry);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function clearHistory(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeFromHistory(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
