/**
 * Video Download Manager – Updated for latest nitro‑fs
 * Manages download queue, progress, and persistence
 */

import { storage, storageKeys } from '@/storage';
import NitroFS, { 
  downloadLargeVideo, 
  type DownloadProgress, 
  getAvailableSpace,
  formatBytes,
  formatSpeed,
} from './nitroFS';

export enum DownloadStatus {
  PENDING = 'pending',
  DOWNLOADING = 'downloading',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface VideoDownload {
  id: string;
  title: string;
  url: string;
  thumbnailUrl?: string;
  quality: string;
  destinationPath: string;
  status: DownloadStatus;
  progress: number; // 0-100
  bytesDownloaded: number;
  totalBytes: number;
  speed: number; // bytes per second
  startTime?: number;
  endTime?: number;
  error?: string;
}

class VideoDownloadManager {
  private downloads: Map<string, VideoDownload> = new Map();
  private activeDownloads: Set<string> = new Set();
  private maxConcurrentDownloads = 2;
  private listeners: Set<(downloads: VideoDownload[]) => void> = new Set();

  constructor() {
    this.loadDownloads();
  }

  private loadDownloads(): void {
    try {
      const data = storage.getString(storageKeys.DOWNLOADS_LIST);
      if (data) {
        const downloads: VideoDownload[] = JSON.parse(data);
        downloads.forEach(download => {
          this.downloads.set(download.id, download);
        });
      }
    } catch (error) {
      console.error('Failed to load downloads:', error);
    }
  }

  private saveDownloads(): void {
    try {
      const downloads = Array.from(this.downloads.values());
      storage.set(storageKeys.DOWNLOADS_LIST, JSON.stringify(downloads));
      this.notifyListeners();
    } catch (error) {
      console.error('Failed to save downloads:', error);
    }
  }

  addListener(callback: (downloads: VideoDownload[]) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    const downloads = this.getAllDownloads();
    this.listeners.forEach(listener => listener(downloads));
  }

  private generateId(): string {
    return `dl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getDownloadPath(title: string, quality: string): string {
    const sanitizedTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const timestamp = Date.now();
    return `/storage/emulated/0/Download/AbdoBest/${sanitizedTitle}_${quality}_${timestamp}.mp4`;
  }

  async addDownload(
    title: string,
    url: string,
    quality: string,
    thumbnailUrl?: string
  ): Promise<string> {
    const availableSpace = await getAvailableSpace();
    const requiredSpace = 500 * 1024 * 1024; // 500 MB
    
    if (availableSpace < requiredSpace) {
      throw new Error(
        `Insufficient storage space. Available: ${formatBytes(availableSpace)}, Required: ${formatBytes(requiredSpace)}`
      );
    }

    const id = this.generateId();
    const destinationPath = this.getDownloadPath(title, quality);

    const download: VideoDownload = {
      id,
      title,
      url,
      thumbnailUrl,
      quality,
      destinationPath,
      status: DownloadStatus.PENDING,
      progress: 0,
      bytesDownloaded: 0,
      totalBytes: 0,
      speed: 0,
    };

    this.downloads.set(id, download);
    this.saveDownloads();
    this.processQueue();

    return id;
  }

  private async processQueue(): Promise<void> {
    const pendingDownloads = Array.from(this.downloads.values())
      .filter(d => d.status === DownloadStatus.PENDING);

    for (const download of pendingDownloads) {
      if (this.activeDownloads.size >= this.maxConcurrentDownloads) {
        break;
      }
      await this.startDownload(download.id);
    }
  }

  private async startDownload(id: string): Promise<void> {
    const download = this.downloads.get(id);
    if (!download) return;
    if (this.activeDownloads.has(id)) return;

    this.activeDownloads.add(id);
    download.status = DownloadStatus.DOWNLOADING;
    download.startTime = Date.now();
    this.saveDownloads();

    try {
      await downloadLargeVideo({
        url: download.url,
        destinationPath: download.destinationPath,
        onProgress: (progress: DownloadProgress) => {
          download.bytesDownloaded = progress.bytesWritten;
          download.totalBytes = progress.totalBytes;
          download.progress = progress.percentage;
          download.speed = progress.speed;
          this.saveDownloads();
        },
        onComplete: () => {
          download.status = DownloadStatus.COMPLETED;
          download.endTime = Date.now();
          download.progress = 100;
          this.activeDownloads.delete(id);
          this.saveDownloads();
          this.processQueue();
        },
        onError: (error: Error) => {
          download.status = DownloadStatus.FAILED;
          download.error = error.message;
          this.activeDownloads.delete(id);
          this.saveDownloads();
          this.processQueue();
        },
      });
    } catch (error) {
      download.status = DownloadStatus.FAILED;
      download.error = (error as Error).message;
      this.activeDownloads.delete(id);
      this.saveDownloads();
      this.processQueue();
    }
  }

  pauseDownload(id: string): void {
    const download = this.downloads.get(id);
    if (download && download.status === DownloadStatus.DOWNLOADING) {
      download.status = DownloadStatus.PAUSED;
      this.activeDownloads.delete(id);
      this.saveDownloads();
      this.processQueue();
    }
  }

  resumeDownload(id: string): void {
    const download = this.downloads.get(id);
    if (download && download.status === DownloadStatus.PAUSED) {
      download.status = DownloadStatus.PENDING;
      this.saveDownloads();
      this.processQueue();
    }
  }

  async cancelDownload(id: string): Promise<void> {
    const download = this.downloads.get(id);
    if (!download) return;

    download.status = DownloadStatus.CANCELLED;
    this.activeDownloads.delete(id);

    try {
      await NitroFS.deleteFile(download.destinationPath);
    } catch (error) {
      console.error('Failed to delete partial file:', error);
    }

    this.saveDownloads();
    this.processQueue();
  }

  async deleteDownload(id: string): Promise<void> {
    const download = this.downloads.get(id);
    if (!download) return;

    if (download.status === DownloadStatus.DOWNLOADING) {
      this.activeDownloads.delete(id);
    }

    try {
      await NitroFS.deleteFile(download.destinationPath);
    } catch (error) {
      console.error('Failed to delete file:', error);
    }

    this.downloads.delete(id);
    this.saveDownloads();
    this.processQueue();
  }

  retryDownload(id: string): void {
    const download = this.downloads.get(id);
    if (download && download.status === DownloadStatus.FAILED) {
      download.status = DownloadStatus.PENDING;
      download.error = undefined;
      download.progress = 0;
      download.bytesDownloaded = 0;
      download.speed = 0;
      this.saveDownloads();
      this.processQueue();
    }
  }

  getDownload(id: string): VideoDownload | undefined {
    return this.downloads.get(id);
  }

  getAllDownloads(): VideoDownload[] {
    return Array.from(this.downloads.values()).sort(
      (a, b) => (b.startTime || 0) - (a.startTime || 0)
    );
  }

  getDownloadsByStatus(status: DownloadStatus): VideoDownload[] {
    return Array.from(this.downloads.values())
      .filter(d => d.status === status)
      .sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
  }

  clearCompleted(): void {
    const completed = Array.from(this.downloads.values())
      .filter(d => d.status === DownloadStatus.COMPLETED);
    
    completed.forEach(d => this.downloads.delete(d.id));
    this.saveDownloads();
  }

  getStats(): {
    total: number;
    downloading: number;
    completed: number;
    failed: number;
    pending: number;
    totalBytesDownloaded: number;
  } {
    const downloads = Array.from(this.downloads.values());
    return {
      total: downloads.length,
      downloading: downloads.filter(d => d.status === DownloadStatus.DOWNLOADING).length,
      completed: downloads.filter(d => d.status === DownloadStatus.COMPLETED).length,
      failed: downloads.filter(d => d.status === DownloadStatus.FAILED).length,
      pending: downloads.filter(d => d.status === DownloadStatus.PENDING).length,
      totalBytesDownloaded: downloads.reduce((sum, d) => sum + d.bytesDownloaded, 0),
    };
  }

  setMaxConcurrentDownloads(max: number): void {
    this.maxConcurrentDownloads = Math.max(1, Math.min(5, max));
    this.processQueue();
  }
}

export const videoDownloadManager = new VideoDownloadManager();
export default videoDownloadManager;