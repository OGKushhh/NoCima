/**
 * downloadService.ts
 *
 * HLS download management using react-native-background-downloader.
 *
 * Flow:
 *   1. DetailsScreen extracts the M3U8 URL via VideoExtractor (WebView)
 *   2. Calls startDownload(item, m3u8Url)
 *   3. This service creates a DownloadItem, persists it, and starts the task
 *   4. Progress/completion/failure callbacks update state + re-persist
 *   5. DownloadsScreen reads state via getDownloadState() + subscribes to updates
 *
 * react-native-background-downloader handles:
 *   - HLS segment fetching and stitching
 *   - Background execution (survives app minimise)
 *   - Pause / resume via task handles
 */

import RNBackgroundDownloader, {
  DownloadTask,
} from 'react-native-background-downloader';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {DownloadItem, ContentItem} from '../types';
import {storage, storageKeys} from '../storage';

// ─── In-memory task registry ───────────────────────────────────────────────
// Maps downloadId → active DownloadTask so we can pause/resume/cancel
const activeTasks = new Map<string, DownloadTask>();

// ─── Change listeners ──────────────────────────────────────────────────────
type Listener = () => void;
const listeners = new Set<Listener>();

export const subscribeDownloads = (fn: Listener) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const notify = () => listeners.forEach(fn => fn());

// ─── Persistence ───────────────────────────────────────────────────────────
export const getDownloadState = (): DownloadItem[] => {
  try {
    const raw = storage.getString(storageKeys.DOWNLOADS_LIST);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveDownloadState = (items: DownloadItem[]) => {
  storage.set(storageKeys.DOWNLOADS_LIST, JSON.stringify(items));
};

const updateItem = (id: string, patch: Partial<DownloadItem>) => {
  const items = getDownloadState();
  const idx = items.findIndex(d => d.id === id);
  if (idx === -1) return;
  items[idx] = {...items[idx], ...patch};
  saveDownloadState(items);
  notify();
};

// ─── Destination path ──────────────────────────────────────────────────────
// Both HLS (stitched segments) and direct MP4 downloads land as .mp4
const getDestPath = (id: string) =>
  `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/downloads/${id}.mp4`;

// ─── Restore interrupted downloads on app start ────────────────────────────
// Call this once from App.tsx or AppNavigator on mount.
export const restoreDownloads = async () => {
  try {
    const lostTasks = await RNBackgroundDownloader.checkForExistingDownloads();
    const items = getDownloadState();

    for (const task of lostTasks) {
      const item = items.find(d => d.id === task.id);
      if (!item) {
        task.stop();
        continue;
      }
      if (item.status === 'completed') {
        task.stop();
        continue;
      }
      // Re-attach progress/done handlers
      attachHandlers(task, item.id);
      activeTasks.set(item.id, task);
      updateItem(item.id, {status: 'downloading'});
    }
  } catch (e) {
    console.warn('[Download] restoreDownloads error:', e);
  }
};

// ─── Attach task event handlers ────────────────────────────────────────────
const attachHandlers = (task: DownloadTask, id: string) => {
  task
    .begin(({expectedBytes}) => {
      updateItem(id, {totalBytes: expectedBytes, status: 'downloading'});
    })
    .progress(({bytesDownloaded, bytesTotal}) => {
      const progress = bytesTotal > 0 ? bytesDownloaded / bytesTotal : 0;
      updateItem(id, {
        progress,
        downloadedBytes: bytesDownloaded,
        totalBytes: bytesTotal,
        status: 'downloading',
      });
    })
    .done(() => {
      const destPath = getDestPath(id);
      updateItem(id, {
        status: 'completed',
        progress: 1,
        localPath: `file://${destPath}`,
        destinationPath: destPath,
      });
      activeTasks.delete(id);
    })
    .error(({error}) => {
      console.warn('[Download] task error:', error);
      updateItem(id, {
        status: 'failed',
        errorMessage: String(error),
      });
      activeTasks.delete(id);
    });
};

// ─── Start a new download ──────────────────────────────────────────────────
export const startDownload = async (
  item: ContentItem,
  m3u8Url: string,
  quality = 'auto',
): Promise<DownloadItem> => {
  // Ensure downloads directory exists
  const dir = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/downloads`;
  const dirExists = await ReactNativeBlobUtil.fs.isDir(dir);
  if (!dirExists) await ReactNativeBlobUtil.fs.mkdir(dir);

  const id = `dl_${item.id}_${Date.now()}`;
  const destPath = getDestPath(id);

  const downloadItem: DownloadItem = {
    id,
    contentId: item.id,
    title: item.Title,
    imageUrl: item['Image Source'],
    videoUrl: m3u8Url,
    format: item.Format || '',
    quality,
    progress: 0,
    status: 'pending',
    timestamp: Date.now(),
    destinationPath: destPath,
  };

  // Persist immediately so DownloadsScreen shows it straight away
  const current = getDownloadState();
  saveDownloadState([downloadItem, ...current]);
  notify();

  // Start the background task
  try {
    const task = RNBackgroundDownloader.download({
      id,
      url: m3u8Url,
      destination: destPath,
      // react-native-background-downloader handles HLS natively on Android
      // via its built-in segment downloader when the URL ends in .m3u8
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    attachHandlers(task, id);
    activeTasks.set(id, task);
    updateItem(id, {status: 'downloading'});
  } catch (e: any) {
    updateItem(id, {status: 'failed', errorMessage: e.message});
  }

  return downloadItem;
};

// ─── Pause ─────────────────────────────────────────────────────────────────
export const pauseDownload = (id: string) => {
  const task = activeTasks.get(id);
  if (task) {
    task.pause();
    updateItem(id, {status: 'paused'});
  }
};

// ─── Resume ────────────────────────────────────────────────────────────────
export const resumeDownload = (id: string) => {
  const task = activeTasks.get(id);
  if (task) {
    task.resume();
    updateItem(id, {status: 'downloading'});
  }
};

// ─── Cancel + delete ───────────────────────────────────────────────────────
export const deleteDownload = async (id: string) => {
  // Stop the task
  const task = activeTasks.get(id);
  if (task) {
    task.stop();
    activeTasks.delete(id);
  }

  // Delete the file
  const destPath = getDestPath(id);
  try {
    const exists = await ReactNativeBlobUtil.fs.exists(destPath);
    if (exists) await ReactNativeBlobUtil.fs.unlink(destPath);
  } catch (e) {
    console.warn('[Download] delete file error:', e);
  }

  // Remove from state
  const items = getDownloadState().filter(d => d.id !== id);
  saveDownloadState(items);
  notify();
};

// ─── Retry a failed download ───────────────────────────────────────────────
export const retryDownload = async (id: string) => {
  const items = getDownloadState();
  const item = items.find(d => d.id === id);
  if (!item || item.status !== 'failed') return;

  const destPath = getDestPath(id);

  updateItem(id, {status: 'pending', progress: 0, errorMessage: undefined});

  try {
    const task = RNBackgroundDownloader.download({
      id,
      url: item.videoUrl,
      destination: destPath,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    attachHandlers(task, id);
    activeTasks.set(id, task);
    updateItem(id, {status: 'downloading'});
  } catch (e: any) {
    updateItem(id, {status: 'failed', errorMessage: e.message});
  }
};
