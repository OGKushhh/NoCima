import { storage } from '../storage/Storage';

// ─── Storage keys ────────────────────────────────────────────────────────────
const KEY_AD_FREE_UNTIL      = 'ad_free_until';
const KEY_INTERACTION_COUNT  = 'ad_interaction_count';
const KEY_PLAY_COUNT         = 'ad_play_count';

// ─── Thresholds ──────────────────────────────────────────────────────────────
const INTERSTITIAL_EVERY_N       = 10; // every 10 screen interactions
const PLAY_INTERSTITIAL_EVERY_N  = 3;  // every 3 play presses
const AD_FREE_DURATION_MS        = 3 * 60 * 60 * 1000; // 3 hours

// ─── Ad-free window ──────────────────────────────────────────────────────────
export function isAdFree(): boolean {
  const until = storage.getNumber(KEY_AD_FREE_UNTIL) ?? 0;
  return until > Date.now();
}

export function activateAdFree(): void {
  const until = Date.now() + AD_FREE_DURATION_MS;
  storage.set(KEY_AD_FREE_UNTIL, until);
}

export function adFreeRemainingMs(): number {
  const until = storage.getNumber(KEY_AD_FREE_UNTIL) ?? 0;
  const remaining = until - Date.now();
  return remaining > 0 ? remaining : 0;
}

// ─── Interaction counter (general nav interstitials) ─────────────────────────
let interactionCount = 0;

export function initCounters(): void {
  interactionCount = storage.getNumber(KEY_INTERACTION_COUNT) ?? 0;
  playCount        = storage.getNumber(KEY_PLAY_COUNT) ?? 0;
}

export function getInteractionCount(): number {
  return interactionCount;
}

/** Increment interaction counter. Returns true if an interstitial should fire. */
export function shouldShowInteractionAd(): boolean {
  if (isAdFree()) return false;
  interactionCount++;
  storage.set(KEY_INTERACTION_COUNT, interactionCount);
  return interactionCount % INTERSTITIAL_EVERY_N === 0;
}

// ─── Play-press counter ───────────────────────────────────────────────────────
let playCount = 0;

export function getPlayCount(): number {
  return playCount;
}

/** Increment play counter. Returns true if an interstitial should fire. */
export function shouldShowPlayAd(): boolean {
  if (isAdFree()) return false;
  playCount++;
  storage.set(KEY_PLAY_COUNT, playCount);
  return playCount % PLAY_INTERSTITIAL_EVERY_N === 0;
}

// ─── Reset (testing) ─────────────────────────────────────────────────────────
export function resetCounters(): void {
  interactionCount = 0;
  playCount        = 0;
  storage.set(KEY_INTERACTION_COUNT, 0);
  storage.set(KEY_PLAY_COUNT, 0);
}
