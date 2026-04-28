import axios from 'axios';
import {GITHUB_RELEASES_URL, APP_VERSION} from '../constants/endpoints';
import {MMKV} from 'react-native-mmkv';

const storage = new MMKV({id: 'abdobest-update'});

export interface ReleaseInfo {
  version: string;
  downloadUrl: string;
  changelog: string;
  publishedAt: string;
  assetName: string;
}

/**
 * Compare two semver version strings.
 * Returns: positive if v1 > v2, negative if v1 < v2, 0 if equal
 */
const compareVersions = (v1: string, v2: string): number => {
  const parts1 = v1.replace('v', '').split('.').map(Number);
  const parts2 = v2.replace('v', '').split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 !== p2) return p1 - p2;
  }
  return 0;
};

/**
 * Check GitHub Releases for the latest version.
 * Returns release info if an update is available, null otherwise.
 */
export const checkForUpdate = async (): Promise<ReleaseInfo | null> => {
  try {
    const response = await axios.get(GITHUB_RELEASES_URL, {
      timeout: 10000,
      headers: {'Accept': 'application/vnd.github.v3+json'},
    });

    const release = response.data;

    if (!release || !release.tag_name) {
      return null;
    }

    const latestVersion = release.tag_name.replace('v', '');

    // Check if user has skipped this version
    const skippedVersion = storage.getString('skipped_update_version');
    if (skippedVersion === latestVersion) {
      return null;
    }

    // Compare versions
    if (compareVersions(latestVersion, APP_VERSION) <= 0) {
      return null;
    }

    // Find APK asset
    const apkAsset = release.assets?.find(
      (asset: any) =>
        asset.name.endsWith('.apk') ||
        asset.content_type === 'application/vnd.android.package-archive'
    );

    const downloadUrl = apkAsset?.browser_download_url || release.html_url;

    return {
      version: latestVersion,
      downloadUrl,
      changelog: release.body || '',
      publishedAt: release.published_at,
      assetName: apkAsset?.name || 'AbdoBest.apk',
    };
  } catch (error: any) {
    // Silently fail — update check shouldn't break the app
    console.log('[OTA] Update check failed:', error?.message);
    return null;
  }
};

/**
 * Mark a version as skipped so user won't be prompted again for this version
 */
export const skipVersion = (version: string) => {
  storage.set('skipped_update_version', version);
};

/**
 * Open the update download URL in the device browser
 */
export const openUpdateUrl = (url: string) => {
  // Try opening directly — will open in browser
  const {Linking} = require('react-native');
  Linking.openURL(url).catch(() => {
    // Fallback: just open in browser
    Linking.openURL(url);
  });
};