import {Platform} from 'react-native';

/**
 * Platform-specific utilities for AbdoBest.
 *
 * Both Android and iOS are fully supported:
 *  - File operations via react-native-fs-turbo (pure C++ TurboModule)
 *  - Metadata & cache via react-native-mmkv (Nitro Module)
 *
 * Download feature is currently disabled. When re-enabled,
 * HLS downloads will require a compatible media library.
 *
 * The ONLY platform-specific logic is the download destination path:
 *  - Android: /storage/emulated/0/Download/AbdoBest/
 *  - iOS:     DocumentDirectoryPath/AbdoBest/
 */

export const isAndroid = Platform.OS === 'android';
export const isIOS = Platform.OS === 'ios';

/**
 * Get the platform-appropriate download directory.
 *
 * On Android, downloads go to the public Downloads folder so users
 * can access them from any file manager. On iOS, the app sandbox
 * restricts access to the document directory.
 */
export const getDownloadDirectory = (): string => {
  if (isAndroid) {
    return '/storage/emulated/0/Download/AbdoBest/';
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RNFSTurbo = require('react-native-fs-turbo').default;
    return `${RNFSTurbo.DocumentDirectoryPath}/AbdoBest/`;
  } catch {
    return 'AbdoBest/';
  }
};

/**
 * Sanitize a filename by removing invalid characters.
 */
export const sanitizeFileName = (name: string): string => {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 200);
};

/**
 * Build a full file path for a downloaded video.
 */
export const getDownloadFilePath = (title: string, quality: string): string => {
  const dir = getDownloadDirectory();
  const fileName = sanitizeFileName(`${title}_${quality}.mp4`);
  return `${dir}${fileName}`;
};

/**
 * Platform-specific info for logging / debugging.
 */
export const getPlatformInfo = () => ({
  os: Platform.OS,
  version: Platform.Version,
  downloadDir: getDownloadDirectory(),
});