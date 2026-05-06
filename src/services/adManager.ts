/**
 * adManager.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Central ad controller for InMobi integration.
 *
 * Ad plan:
 *   • Rewarded video  – disables ALL ads for 3 hours; available in Settings
 *                       and via a popup that appears every 3rd app launch.
 *   • Interstitial    – fires every 15 user interactions (taps across the app).
 *   • Play interstitial – fires every 3rd press of any Play button.
 *   • Closable banner  – non-sticky top banner shown on Home/Browse/Details.
 *
 * Replace the placeholder account / placement IDs below with your real InMobi
 * dashboard values before going to production.
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { storage } from '../storage/Storage';

// ─── InMobi placement IDs ────────────────────────────────────────────────────
// 🔴 Replace these with your actual InMobi placement IDs
export const AD_IDS = {
  ACCOUNT_ID:            'YOUR_INMOBI_ACCOUNT_ID',          // InMobi publisher account ID
  REWARDED_PLACEMENT:    1234567890,                         // rewarded video placement
  INTERSTITIAL_PLACEMENT:1234567891,                         // general interstitial placement
  PLAY_INTERSTITIAL_PLACEMENT: 1234567892,                   // play-button interstitial placement
  BANNER_PLACEMENT:      1234567893,                         // closable top banner placement
} as const;

// ─── Storage keys ─────────────────────────────────────────────────────────────
const KEY_AD_FREE_UNTIL  = 'ad_free_until';   // timestamp (ms) – 0 means not active
const KEY_LAUNCH_COUNT   = 'app_launch_count';
const KEY_PLAY_COUNT     = 'ad_play_count';
const KEY_INTERACTION_COUNT = 'ad_interaction_count';

// ─── Thresholds ───────────────────────────────────────────────────────────────
const AD_FREE_DURATION_MS      = 3 * 60 * 60 * 1000; // 3 hours
const INTERSTITIAL_EVERY_N     = 15;  // interactions
const PLAY_INTERSTITIAL_EVERY_N = 3;  // play button presses
const REWARDED_POPUP_EVERY_N   = 3;   // app launches

// ─── Native module bridge ─────────────────────────────────────────────────────
// The InMobi React-Native bridge exposes a NativeModule called "InMobiAds".
// If you use a third-party wrapper (e.g. react-native-inmobi-sdk) adjust the
// module name and method names accordingly.
const InMobiNative = NativeModules.InMobiAds as {
  initialize:           (accountId: string, gdprConsent: boolean) => void;
  loadInterstitial:     (placementId: number) => void;
  showInterstitial:     (placementId: number) => void;
  isInterstitialReady:  (placementId: number) => Promise<boolean>;
  loadRewarded:         (placementId: number) => void;
  showRewarded:         (placementId: number) => void;
  isRewardedReady:      (placementId: number) => Promise<boolean>;
} | undefined;

// ─── Event emitter (for rewarded-completion callbacks) ───────────────────────
let _emitter: NativeEventEmitter | null = null;
if (InMobiNative) {
  _emitter = new NativeEventEmitter(NativeModules.InMobiAds);
}

// ─── Reward listeners ────────────────────────────────────────────────────────
type RewardCallback = () => void;
const _rewardListeners: Set<RewardCallback> = new Set();

if (_emitter) {
  _emitter.addListener('InMobiRewardedAdRewarded', () => {
    _rewardListeners.forEach(cb => cb());
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function getNumber(key: string, fallback = 0): number {
  return storage.getNumber(key) ?? fallback;
}

function setNumber(key: string, value: number): void {
  storage.set(key, value);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Call once at app startup (after storage.init()).
 * Initialises the InMobi SDK and pre-loads the first ads.
 */
export function initAds(gdprConsent = true): void {
  if (!InMobiNative) {
    console.warn('[AdManager] InMobi native module not found – running in stub mode.');
    return;
  }
  InMobiNative.initialize(AD_IDS.ACCOUNT_ID, gdprConsent);

  // Pre-load interstitials so they are ready when needed
  InMobiNative.loadInterstitial(AD_IDS.INTERSTITIAL_PLACEMENT);
  InMobiNative.loadInterstitial(AD_IDS.PLAY_INTERSTITIAL_PLACEMENT);
  InMobiNative.loadRewarded(AD_IDS.REWARDED_PLACEMENT);

  // Track launch count for the rewarded popup
  const launches = getNumber(KEY_LAUNCH_COUNT) + 1;
  setNumber(KEY_LAUNCH_COUNT, launches);
}

// ─── Ad-free window ───────────────────────────────────────────────────────────

/** Returns true if the user is currently in an ad-free window. */
export function isAdFree(): boolean {
  const until = getNumber(KEY_AD_FREE_UNTIL, 0);
  return until > 0 && Date.now() < until;
}

/** Activates the 3-hour ad-free window (call after a successful reward). */
export function activateAdFree(): void {
  const until = Date.now() + AD_FREE_DURATION_MS;
  setNumber(KEY_AD_FREE_UNTIL, until);
}

/**
 * How many milliseconds remain in the ad-free window.
 * Returns 0 if not active.
 */
export function adFreeRemainingMs(): number {
  const until = getNumber(KEY_AD_FREE_UNTIL, 0);
  const remaining = until - Date.now();
  return remaining > 0 ? remaining : 0;
}

// ─── Rewarded video ───────────────────────────────────────────────────────────

/**
 * Returns true if this launch should trigger the "Watch to remove ads" popup.
 * (Every 3rd launch and the user is not already ad-free.)
 */
export function shouldShowRewardedPopup(): boolean {
  if (isAdFree()) return false;
  const launches = getNumber(KEY_LAUNCH_COUNT, 0);
  return launches > 0 && launches % REWARDED_POPUP_EVERY_N === 0;
}

/** Load a fresh rewarded ad (call proactively before showing). */
export function preloadRewarded(): void {
  InMobiNative?.loadRewarded(AD_IDS.REWARDED_PLACEMENT);
}

/** Register a one-time callback that fires when the reward is granted. */
export function onRewardGranted(cb: RewardCallback): () => void {
  _rewardListeners.add(cb);
  return () => _rewardListeners.delete(cb);
}

/** Show the rewarded video. Resolves to true if it was displayed. */
export async function showRewardedAd(): Promise<boolean> {
  if (!InMobiNative) return false;
  try {
    const ready = await InMobiNative.isRewardedReady(AD_IDS.REWARDED_PLACEMENT);
    if (!ready) {
      InMobiNative.loadRewarded(AD_IDS.REWARDED_PLACEMENT);
      return false;
    }
    InMobiNative.showRewarded(AD_IDS.REWARDED_PLACEMENT);
    return true;
  } catch {
    return false;
  }
}

// ─── General interstitial (every 15 interactions) ────────────────────────────

/**
 * Call this on every meaningful user interaction (card tap, category select, etc.).
 * Returns true if an interstitial was shown.
 */
export async function trackInteraction(): Promise<boolean> {
  if (isAdFree() || !InMobiNative) return false;

  const count = getNumber(KEY_INTERACTION_COUNT, 0) + 1;
  setNumber(KEY_INTERACTION_COUNT, count);

  if (count % INTERSTITIAL_EVERY_N !== 0) return false;

  try {
    const ready = await InMobiNative.isInterstitialReady(AD_IDS.INTERSTITIAL_PLACEMENT);
    if (ready) {
      InMobiNative.showInterstitial(AD_IDS.INTERSTITIAL_PLACEMENT);
      // Pre-load the next one immediately after showing
      InMobiNative.loadInterstitial(AD_IDS.INTERSTITIAL_PLACEMENT);
      return true;
    } else {
      InMobiNative.loadInterstitial(AD_IDS.INTERSTITIAL_PLACEMENT);
    }
  } catch {}
  return false;
}

// ─── Play-button interstitial (every 3rd play press) ─────────────────────────

/**
 * Call this every time any Play button is pressed (movie, episode, hero banner).
 * Returns true if an interstitial was shown.
 */
export async function trackPlayPress(): Promise<boolean> {
  if (isAdFree() || !InMobiNative) return false;

  const count = getNumber(KEY_PLAY_COUNT, 0) + 1;
  setNumber(KEY_PLAY_COUNT, count);

  if (count % PLAY_INTERSTITIAL_EVERY_N !== 0) return false;

  try {
    const ready = await InMobiNative.isInterstitialReady(AD_IDS.PLAY_INTERSTITIAL_PLACEMENT);
    if (ready) {
      InMobiNative.showInterstitial(AD_IDS.PLAY_INTERSTITIAL_PLACEMENT);
      InMobiNative.loadInterstitial(AD_IDS.PLAY_INTERSTITIAL_PLACEMENT);
      return true;
    } else {
      InMobiNative.loadInterstitial(AD_IDS.PLAY_INTERSTITIAL_PLACEMENT);
    }
  } catch {}
  return false;
}

// ─── Banner helpers (used by the BannerAd component) ─────────────────────────

/** True if a top banner should currently be visible. */
export function shouldShowBanner(): boolean {
  return !isAdFree();
}
