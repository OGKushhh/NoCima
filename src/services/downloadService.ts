/**
 * downloadService.ts
 *
 * @kesha-antonov/react-native-background-downloader v3 — REAL API:
 *
 *   import RNBackgroundDownloader from '@kesha-antonov/react-native-background-downloader'
 *   RNBackgroundDownloader.download({ id, url, destination, headers?, metadata? })
 *     .begin(({ bytesTotal }) => {})
 *     .progress(({ bytesDownloaded, bytesTotal }) => {})
 *     .done(({ bytesDownloaded, bytesTotal }) => {})
 *     .error(({ error, errorCode }) => {})
 *
 *   RNBackgroundDownloader.directories.documents  — documents path
 *   RNBackgroundDownloader.checkForExistingDownloads() — restore after kill
 *   RNBackgroundDownloader.completeHandler(id)    — required on iOS after done
 *
 *   task.pause() / task.resume() / task.stop() — all synchronous, no await
 */

import RNBackgroundDownloader from '@kesha-antonov/react-native-background-downloader';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {DownloadItem, ContentItem} from '../types';
import {storage, storageKeys} from '../storage';

// ─── Task type (v3 DownloadTask instance) ─────────────────────────────────
type AnyTask = ReturnType<typeof RNBackgroundDownloader.download>;

// ─── In-memory task registry ──────────────────────────────────────────────
const activeTasks = new Map<string, AnyTask>();

// ─── Change listeners ─────────────────────────────────────────────────────
type Listener = () => void;
const listeners = new Set<Listener>();

export const subscribeDownloads = (fn: Listener) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const notify = () => listeners.forEach(fn => fn());

// ─── Persistence ──────────────────────────────────────────────────────────
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

// ─── Destination path ─────────────────────────────────────────────────────
const getDestPath = (id: string) =>
  `${RNBackgroundDownloader.directories.documents}/downloads/${id}.mp4`;

// ─── Attach handlers to a task ────────────────────────────────────────────
const attachHandlers = (task: AnyTask, id: string) => {
  task
    .begin(({bytesTotal}: {bytesTotal: number}) => {
      updateItem(id, {totalBytes: bytesTotal, status: 'downloading'});
    })
    .progress(({bytesDownloaded, bytesTotal}: {bytesDownloaded: number; bytesTotal: number}) => {
      const progress = bytesTotal > 0 ? bytesDownloaded / bytesTotal : 0;
      updateItem(id, {
        progress,
        downloadedBytes: bytesDownloaded,
        totalBytes: bytesTotal,
        status: 'downloading',
      });
    })
    .done(({bytesDownloaded, bytesTotal}: {bytesDownloaded: number; bytesTotal: number}) => {
      const destPath = getDestPath(id);
      updateItem(id, {
        status: 'completed',
        progress: 1,
        downloadedBytes: bytesDownloaded,
        totalBytes: bytesTotal,
        localPath: `file://${destPath}`,
        destinationPath: destPath,
      });
      activeTasks.delete(id);
      RNBackgroundDownloader.completeHandler(id); // required on iOS
    })
    .error(({error, errorCode}: {error: string; errorCode: number}) => {
      console.warn('[Download] task error:', error, errorCode);
      updateItem(id, {status: 'failed', errorMessage: String(error)});
      activeTasks.delete(id);
    });
};

// ─── Restore interrupted downloads on app start ───────────────────────────
export const restoreDownloads = async () => {
  try {
    const lostTasks = await RNBackgroundDownloader.checkForExistingDownloads();
    const items = getDownloadState();
    for (const task of lostTasks) {
      const item = items.find(d => d.id === task.id);
      if (!item || item.status === 'completed') {
        task.stop();
        continue;
      }
      attachHandlers(task, item.id);
      activeTasks.set(item.id, task);
      updateItem(item.id, {status: 'downloading'});
    }
  } catch (e) {
    console.warn('[Download] restoreDownloads error:', e);
  }
};

// ─── Start a new download ─────────────────────────────────────────────────
export const startDownload = async (
  item: ContentItem,
  mp4Url: string,
  quality = 'auto',
): Promise<DownloadItem> => {
  const dir = `${RNBackgroundDownloader.directories.documents}/downloads`;
  const dirExists = await ReactNativeBlobUtil.fs.isDir(dir);
  if (!dirExists) await ReactNativeBlobUtil.fs.mkdir(dir);

  const id = `dl_${item.id}_${Date.now()}`;
  const destPath = getDestPath(id);

  const downloadItem: DownloadItem = {
    id,
    contentId: item.id,
    title: item.Title,
    imageUrl: item['Image Source'] || (item as any).Image || (item as any).poster || '',
    videoUrl: mp4Url,
    format: item.Format || '',
    quality,
    progress: 0,
    status: 'pending',
    timestamp: Date.now(),
    destinationPath: destPath,
  };

  const current = getDownloadState();
  saveDownloadState([downloadItem, ...current]);
  notify();

  try {
    const task = RNBackgroundDownloader.download({
      id,
      url: mp4Url,
      destination: destPath,
      metadata: {contentId: item.id, title: item.Title},
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

// ─── Pause ────────────────────────────────────────────────────────────────
export const pauseDownload = (id: string) => {
  const task = activeTasks.get(id);
  if (task) {
    task.pause();
    updateItem(id, {status: 'paused'});
  }
};

// ─── Resume ───────────────────────────────────────────────────────────────
export const resumeDownload = (id: string) => {
  const task = activeTasks.get(id);
  if (task) {
    task.resume();
    updateItem(id, {status: 'downloading'});
  }
};

// ─── Cancel + delete ──────────────────────────────────────────────────────
export const deleteDownload = async (id: string) => {
  const task = activeTasks.get(id);
  if (task) {
    task.stop();
    activeTasks.delete(id);
  }
  const destPath = getDestPath(id);
  try {
    const exists = await ReactNativeBlobUtil.fs.exists(destPath);
    if (exists) await ReactNativeBlobUtil.fs.unlink(destPath);
  } catch (e) {
    console.warn('[Download] delete file error:', e);
  }
  const items = getDownloadState().filter(d => d.id !== id);
  saveDownloadState(items);
  notify();
};

// ─── Retry a failed download ──────────────────────────────────────────────
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
      metadata: {contentId: item.contentId, title: item.title},
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
