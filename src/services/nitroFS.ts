/**
 * Nitro FileSystem Service – Updated for v0.8.2+
 * Uses official react-native-nitro-fs API
 */

import { NitroFS, formatBytes as nitroFormatBytes } from 'react-native-nitro-fs';

export interface DownloadProgress {
  bytesWritten: number;
  totalBytes: number;
  percentage: number;
  speed: number; // bytes per second
}

export interface DownloadOptions {
  url: string;
  destinationPath: string;
  headers?: Record<string, string>;
  onProgress?: (progress: DownloadProgress) => void;
  onComplete?: (path: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Download large video file with progress tracking using NitroFS.downloadFile
 */
export async function downloadLargeVideo(options: DownloadOptions): Promise<string> {
  const { url, destinationPath, headers = {}, onProgress, onComplete, onError } = options;

  try {
    // Ensure destination directory exists
    const dirPath = destinationPath.substring(0, destinationPath.lastIndexOf('/'));
    if (dirPath) {
      const dirExists = await NitroFS.exists(dirPath);
      if (!dirExists) {
        await NitroFS.makeDirectory(dirPath, true);
      }
    }

    let lastBytesWritten = 0;
    let lastTimestamp = Date.now();

    const file = await NitroFS.downloadFile(
      url,
      destinationPath,
      (bytesWritten: number, totalBytes: number) => {
        if (onProgress) {
          const now = Date.now();
          const timeDiff = (now - lastTimestamp) / 1000;
          const bytesDiff = bytesWritten - lastBytesWritten;
          const speed = timeDiff > 0 ? bytesDiff / timeDiff : 0;

          onProgress({
            bytesWritten,
            totalBytes,
            percentage: totalBytes > 0 ? (bytesWritten / totalBytes) * 100 : 0,
            speed,
          });

          lastTimestamp = now;
          lastBytesWritten = bytesWritten;
        }
      },
      headers
    );

    if (onComplete) onComplete(destinationPath);
    return destinationPath;
  } catch (error) {
    if (onError) onError(error as Error);
    throw error;
  }
}

/**
 * Ensure directory exists (create if not)
 */
export async function ensureDirectoryExists(path: string): Promise<void> {
  const exists = await NitroFS.exists(path);
  if (!exists) {
    await NitroFS.makeDirectory(path, true);
  }
}

/**
 * Get file size in bytes
 */
export async function getFileSize(path: string): Promise<number> {
  const stat = await NitroFS.stat(path);
  return stat.size;
}

/**
 * Delete file
 */
export async function deleteFile(path: string): Promise<void> {
  const exists = await NitroFS.exists(path);
  if (exists) {
    await NitroFS.unlink(path);
  }
}

/**
 * Move/rename file
 */
export async function moveFile(sourcePath: string, destinationPath: string): Promise<void> {
  await NitroFS.rename(sourcePath, destinationPath);
}

/**
 * Get available storage space in bytes
 */
export async function getAvailableSpace(): Promise<number> {
  return await NitroFS.getAvailableSpace();
}

/**
 * Read file content as string
 */
export async function readFile(path: string, encoding: 'utf8' | 'base64' = 'utf8'): Promise<string> {
  return await NitroFS.readFile(path, encoding);
}

/**
 * Write string content to file
 */
export async function writeFile(path: string, content: string, encoding: 'utf8' | 'base64' = 'utf8'): Promise<void> {
  await NitroFS.writeFile(path, content, encoding);
}

/**
 * List directory contents
 */
export async function listDirectory(path: string): Promise<string[]> {
  return await NitroFS.readdir(path);
}

/**
 * Check if path exists
 */
export async function exists(path: string): Promise<boolean> {
  return await NitroFS.exists(path);
}

/**
 * Get file/directory stats
 */
export async function getStats(path: string): Promise<{
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  mtime: number;
  ctime: number;
}> {
  return await NitroFS.stat(path);
}

/**
 * Format bytes to human‑readable size (re‑export from nitro-fs)
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  return nitroFormatBytes(bytes, decimals);
}

/**
 * Format download speed
 */
export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

export default {
  downloadLargeVideo,
  ensureDirectoryExists,
  getFileSize,
  deleteFile,
  moveFile,
  getAvailableSpace,
  readFile,
  writeFile,
  listDirectory,
  exists,
  getStats,
  formatBytes,
  formatSpeed,
};