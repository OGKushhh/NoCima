/**
 * AsyncStorage wrapper with MMKV-compatible synchronous API.
 *
 * Why this exists:
 *   MMKV provides sync getters (getString, getNumber, etc.) which the codebase
 *   relies on heavily (e.g. SettingsScreen reads settings synchronously in
 *   useState initializer, DownloadsScreen reads download state synchronously).
 *   AsyncStorage is purely async, so we need a thin wrapper that:
 *     1. Loads everything from AsyncStorage into an in-memory Map at init
 *     2. Provides sync getters from that Map (O(1))
 *     3. Writes through to AsyncStorage on every set (fire-and-forget)
 *
 * Usage:
 *   import {storage} from './Storage';
 *   await storage.init();   // call once at app startup
 *   storage.getString('key');  // synchronous, from memory cache
 *   storage.set('key', 'val'); // sync cache update + async persist
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export class Storage {
  private cache: Map<string, string> = new Map();
  private initialized = false;

  /**
   * Load all keys from AsyncStorage into memory.
   * MUST be called once at app startup before any reads.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      const keys = await AsyncStorage.getAllKeys();
      if (keys.length > 0) {
        const pairs = await AsyncStorage.multiGet(keys);
        for (const [key, value] of pairs) {
          if (value !== null) {
            this.cache.set(key, value);
          }
        }
      }
    } catch (e) {
      console.warn('[Storage] Failed to initialize:', e);
    }
    this.initialized = true;
  }

  /** Whether init() has been called. */
  isReady(): boolean {
    return this.initialized;
  }

  // ─── MMKV-compatible sync getters ─────────────────────────────────

  getString(key: string): string | undefined {
    return this.cache.get(key);
  }

  getNumber(key: string): number | undefined {
    const raw = this.cache.get(key);
    if (raw === undefined) return undefined;
    const num = Number(raw);
    return isNaN(num) ? undefined : num;
  }

  getBoolean(key: string): boolean | undefined {
    const raw = this.cache.get(key);
    if (raw === undefined) return undefined;
    return raw === 'true';
  }

  contains(key: string): boolean {
    return this.cache.has(key);
  }

  // ─── MMKV-compatible sync setters ─────────────────────────────────

  set(key: string, value: string | number | boolean): void {
    const strValue = String(value);
    this.cache.set(key, strValue);
    // Fire-and-forget persist
    AsyncStorage.setItem(key, strValue).catch((e) => {
      console.warn('[Storage] Failed to persist:', key, e);
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
    AsyncStorage.removeItem(key).catch((e) => {
      console.warn('[Storage] Failed to delete:', key, e);
    });
  }

  getAllKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  clear(): void {
    this.cache.clear();
    AsyncStorage.clear().catch((e) => {
      console.warn('[Storage] Failed to clear:', e);
    });
  }
}

/** Default storage instance (same as MMKV default). */
export const storage = new Storage();
