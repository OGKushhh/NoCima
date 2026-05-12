/**
 * downloadService.ts
 *
 * @kesha-antonov/react-native-background-downloader v3.2.6 — verified API:
 *
 *   import { download, completeHandler, directories, checkForExistingDownloads } from '...'
 *
 *   download({ id, url, destination, headers?, metadata? })
 *     .begin(({ expectedBytes, headers }) => {})   ← note: expectedBytes not bytesTotal
 *     .progress(({ bytesDownloaded, bytesTotal }) => {})
 *     .done(({ bytesDownloaded, bytesTotal }) => {})
 *     .error(({ error, errorCode }) => {})
 *
 *   directories.documents  — documents path
 *   checkForExistingDownloads() — returns Promise<DownloadTask[]>
 *   completeHandler(id)    — required on iOS after done
 *
 *   task.pause() / task.resume() / task.stop() — synchronous, no await
 */

import {
  download,
  completeHandler,
  directories,
  checkForExistingDownloads,
  setConfig,
} from '@kesha-antonov/react-native-background-downloader';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {DownloadItem, ContentItem} from '../types';
import {storage, storageKeys} from '../storage';

// Enable native download logs so we can see exactly what's happening
setConfig({ isLogsEnabled: true, progressInterval: 1000 });

// ─── Task type ────────────────────────────────────────────────────────────
type AnyTask = ReturnType<typeof download>;

// ─── In-memory task registry ──────────────────────────────────────────────
const activeTasks = new Map<string, any>(); // background-downloader tasks (restore only)
const blobTasks   = new Map<string, any>(); // blob-util StatefulPromise tasks

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
  `${directories.documents}/downloads/${id}.mp4`;

// ─── Attach handlers to a task ────────────────────────────────────────────
const attachHandlers = (task: AnyTask, id: string) => {
  task
    .begin(({expectedBytes}: {expectedBytes: number}) => {
      // 'expectedBytes' is the correct param name from the native begin event
      updateItem(id, {totalBytes: expectedBytes, status: 'downloading'});
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
      completeHandler(id); // required on iOS
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
    const lostTasks = await checkForExistingDownloads();
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

// ─── Start a new download (uses ReactNativeBlobUtil — starts immediately,
//     avoiding signed-URL expiry that kills Android DownloadManager) ────────
export const startDownload = async (
  item: ContentItem,
  mp4Url: string,
  quality = 'auto',
): Promise<DownloadItem> => {
  const dir = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/downloads`;
  const dirExists = await ReactNativeBlobUtil.fs.isDir(dir);
  if (!dirExists) await ReactNativeBlobUtil.fs.mkdir(dir);

  const id = `dl_${item.id}_${Date.now()}`;
  const destPath = `${dir}/${id}.mp4`;

  const downloadItem: DownloadItem = {
    id,
    contentId: item.id,
    title: item.Title,
    imageUrl: item['Image Source'] || (item as any).Image || (item as any).poster || '',
    videoUrl: mp4Url,
    format: item.Format || '',
    quality,
    progress: 0,
    status: 'downloading',
    timestamp: Date.now(),
    destinationPath: destPath,
  };

  const current = getDownloadState();
  saveDownloadState([downloadItem, ...current]);
  notify();

  // Store the task so pause/cancel works
  const task = ReactNativeBlobUtil.config({
    path: destPath,
    fileCache: true,
    overwrite: true,
    indicator: true,
  }).fetch('GET', mp4Url, {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Referer': 'https://akwam.com.co/',
    'Origin': 'https://akwam.com.co',
  });

  // Track progress
  task.progress({ interval: 500 }, (received: number, total: number) => {
    const progress = total > 0 ? received / total : 0;
    updateItem(id, {
      progress,
      downloadedBytes: received,
      totalBytes: total,
      status: 'downloading',
    });
  });

  // Store reference for pause/cancel (blob-util uses a StatefulPromise)
  blobTasks.set(id, task);

  // Handle completion / error asynchronously
  task
    .then((res: any) => {
      console.log('[Download] done:', id, res.path());
      updateItem(id, {
        status: 'completed',
        progress: 1,
        localPath: `file://${destPath}`,
        destinationPath: destPath,
      });
      blobTasks.delete(id);
    })
    .catch((e: any) => {
      if (e?.message === 'cancelled') {
        updateItem(id, {status: 'paused'});
      } else {
        console.warn('[Download] error:', e);
        updateItem(id, {status: 'failed', errorMessage: String(e?.message || e)});
      }
      blobTasks.delete(id);
    });

  return downloadItem;
};

// ─── Pause ────────────────────────────────────────────────────────────────
export const pauseDownload = (id: string) => {
  const task = blobTasks.get(id);
  if (task) {
    task.cancel(); // blob-util: cancel fires .catch with 'cancelled'
    updateItem(id, {status: 'paused'});
  }
};

// ─── Resume (re-starts download from scratch — blob-util has no resume) ──
export const resumeDownload = async (id: string) => {
  const items = getDownloadState();
  const item = items.find(d => d.id === id);
  if (!item || item.status !== 'paused') return;
  updateItem(id, {status: 'pending', progress: 0, errorMessage: undefined});
  await retryDownload(id);
};

// ─── Cancel + delete ──────────────────────────────────────────────────────
export const deleteDownload = async (id: string) => {
  const blobTask = blobTasks.get(id);
  if (blobTask) { blobTask.cancel(); blobTasks.delete(id); }
  const bgTask = activeTasks.get(id);
  if (bgTask) { bgTask.stop(); activeTasks.delete(id); }
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
  if (!item || (item.status !== 'failed' && item.status !== 'paused' && item.status !== 'pending')) return;

  const destPath = item.destinationPath;
  updateItem(id, {status: 'downloading', progress: 0, errorMessage: undefined});

  const task = ReactNativeBlobUtil.config({
    path: destPath,
    fileCache: true,
    overwrite: true,
    indicator: true,
  }).fetch('GET', item.videoUrl, {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Referer': 'https://akwam.com.co/',
    'Origin': 'https://akwam.com.co',
  });

  task.progress({ interval: 500 }, (received: number, total: number) => {
    const progress = total > 0 ? received / total : 0;
    updateItem(id, { progress, downloadedBytes: received, totalBytes: total, status: 'downloading' });
  });

  blobTasks.set(id, task);

  task
    .then((res: any) => {
      console.log('[Download] retry done:', id, res.path());
      updateItem(id, { status: 'completed', progress: 1, localPath: `file://${destPath}`, destinationPath: destPath });
      blobTasks.delete(id);
    })
    .catch((e: any) => {
      if (e?.message === 'cancelled') {
        updateItem(id, { status: 'paused' });
      } else {
        console.warn('[Download] retry error:', e);
        updateItem(id, { status: 'failed', errorMessage: String(e?.message || e) });
      }
      blobTasks.delete(id);
    });
};
