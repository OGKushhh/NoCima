import {Platform} from 'react-native';

/**
 * Platform-specific utilities for AbdoBest.
 *
 * Both Android and iOS are fully supported:
 *  - File operations via react-native-blob-util
 *  - Metadata & cache via react-native-mmkv
 *
 * Download feature is currently disabled. When re-enabled,
 * HLS downloads will require a compatible media library.
 */

export const isAndroid = Platform.OS === 'android';
export const isIOS = Platform.OS === 'ios';

/**
 * Get the platform-appropriate download directory.
 */
export const getDownloadDirectory = (): string => {
  if (isAndroid) {
    return '/storage/emulated/0/Download/AbdoBest/';
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ReactNativeBlobUtil = require('react-native-blob-util').default;
    return `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/AbdoBest/`;
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
