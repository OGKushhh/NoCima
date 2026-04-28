# AbdoBest

A cross-platform streaming and download app for movies, series, and anime. Built with React Native and backed by a Hugging Face Spaces API.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     AbdoBest App                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │   Screens    │  │  Components  │  │    Navigation     │  │
│  │  HomeScreen  │  │  MovieCard   │  │  AppNavigator     │  │
│  │  Details     │  │  SearchBar   │  │  Tab + Stack      │  │
│  │  Category    │  │  QualityBadge│  │                   │  │
│  │  Search      │  │  ErrorView   │  │                   │  │
│  │  Downloads   │  │  SectionHd   │  │                   │  │
│  │  Settings    │  │  UpdateModal │  │                   │  │
│  └──────┬──────┘  └──────────────┘  └───────────────────┘  │
│         │                                                    │
│  ┌──────▼──────────────────────────────────────────────┐     │
│  │                   Services Layer                     │     │
│  ├────────────────┬──────────────┬────────────────────┤     │
│  │ metadataServ.  │ videoServ.   │ videoDownloadMgr.  │     │
│  │ (catalog mgmt) │ (stream URL) │ (HLS downloads)    │     │
│  └───────┬────────┴──────┬───────┴────────┬───────────┘     │
│          │               │                │                  │
│  ┌───────▼───────────────▼────────────────▼───────────┐     │
│  │                  Storage Layer                      │     │
│  ├────────────┬──────────────┬────────────────────────┤     │
│  │   MMKV     │  Nitro FS    │  @rajeev02/media      │     │
│  │ Small data │  Large file  │  Video download        │     │
│  │ & metadata │  I/O         │  (HLS → .mp4)          │     │
│  └────────────┴──────────────┴────────────────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Storage Architecture

### MMKV (Small Metadata & Cache)
- **User settings** (language, quality preferences)
- **Download queue** (status, progress, file paths)
- **Video URL cache** (6-hour TTL for extracted URLs)
- **Metadata cache** (per-category catalogs, 24-hour refresh TTL)

### @rajeev02/media (Video Downloads)
- **HLS/m3u8 → .mp4** conversion and download
- Handles segment-by-segment downloading natively
- Reports progress based on segments (no pre-download size needed)
- Cross-platform: Android (native HLS) + iOS (AVAssetDownload)

### react-native-nitro-fs (Large File I/O)
- **Reading/writing large JSON files** (e.g., movies.json exceeding 10MB)
- **File moves and batch operations** for completed downloads
- High-performance alternative to RNFS for file operations

### Data Persistence Policy

| Data Type | Storage | TTL | Persists |
|-----------|---------|-----|----------|
| User settings | MMKV | Indefinite | Until user clears data / uninstalls |
| Download queue | MMKV | Indefinite | Until user clears data / uninstalls |
| Cached catalogs | MMKV | 24h refresh | Data stays, re-fetched after 24h |
| Completed downloads | File system | Indefinite | Until user deletes / uninstalls |
| Extracted video URLs | MMKV | 6 hours | Auto-removed after TTL expires |

**Important**: Metadata is stored **forever** in MMKV/file system — not just during the session. The 6-hour TTL only applies to re-using a cached video URL for a new download. Completed downloads, user preferences, and cached catalogs persist indefinitely (until user clears data or uninstalls).

---

## Video Download System

### How Downloads Work

1. **URL Resolution** — The download manager first checks MMKV for a cached video URL (6h TTL). If found, it reuses it immediately. If expired or missing, it calls the `/extract` backend endpoint.

2. **HLS Download** — `@rajeev02/media` handles the actual download. It natively supports m3u8/HLS streams — it downloads all segments and muxes them into a single .mp4 file. The URL is treated as a stream source, not a direct file download.

3. **Progress Reporting** — `@rajeev02/media` reports progress based on HLS segments. No pre-download byte-size estimation is needed. The `onProgress` callback receives percentage-complete updates.

4. **File Saving** — Downloaded files are saved to a platform-specific directory:
   - **Android**: `/storage/emulated/0/Download/AbdoBest/`
   - **iOS**: `DocumentDirectoryPath/AbdoBest/`

### URL Caching Behavior (6h TTL)

```
First download  →  extract from backend  →  cache URL + timestamp in MMKV
Retry within 6h  →  use cached URL immediately  →  NO extra extraction calls
Retry after 6h   →  cache expired  →  re-extract once  →  cache again
```

This is **not session-based**. The MMKV cache persists across app restarts, device reboots, and process kills.

### Why @rajeev02/media + Nitro FS (not raw fetch/download)

The video URLs are **m3u8 (HLS) format**, not direct .mp4 file links. A naive `fetch()` or `axios` download would only fetch the small playlist file (~1KB) — completely useless for playback.

`@rajeev02/media` correctly handles HLS streams by:
- Parsing the m3u8 playlist
- Downloading all segment (.ts) files
- Muxing them into a single .mp4 output

**Role separation**:
- `@rajeev02/media` → video download (HLS → .mp4)
- `Nitro FS` → large file I/O only (reading/writing 10MB+ JSON, file moves)
- `MMKV` → small metadata (queue, settings, URL cache)

---

## Platform Support

### Both Android and iOS are Fully Supported

All core libraries are cross-platform:

| Feature | Library | Android | iOS |
|---------|---------|---------|-----|
| Video downloads (HLS) | @rajeev02/media | Native HLS | AVAssetDownload |
| Large file I/O | react-native-nitro-fs | Yes | Yes (sandboxed) |
| Metadata/cache | react-native-mmkv | Yes | Yes |
| Image caching | react-native-fast-image | Yes | Yes |
| Video playback | react-native-video | Yes | Yes |

### Platform-Specific Notes

**Android**:
- Download path: `/storage/emulated/0/Download/AbdoBest/`
- Requires `WRITE_EXTERNAL_STORAGE` permission (handled by @rajeev02/media)

**iOS**:
- Download path: `DocumentDirectoryPath/AbdoBest/`
- Background downloads require `UIBackgroundModes` in `Info.plist` (handled by @rajeev02/media)
- File access is sandboxed to the app's document directory

The only platform-specific code in the app is the destination path logic, handled by a simple conditional in `src/services/platform.ts`.

---

## Genre Localization

The API contains **13,500+ movies**, **24+ series**, and **24+ anime** titles. Many older titles have identical `Genres` and `GenresAr` fields (both in English). The app includes a comprehensive genre translation table (`src/i18n/genres.ts`) that maps all genre names to their proper Arabic translations.

### Supported Genres (36+)

| English | العربية |
|---------|---------|
| Action | أكشن |
| Adventure | مغامرة |
| Animation | أنيميشن |
| Biography | سيرة ذاتية |
| Comedy | كوميدي |
| Crime | جريمة |
| Documentary | وثائقي |
| Drama | دراما |
| Family | عائلي |
| Fantasy | فانتازيا |
| Film-noir | فيلم نوار |
| Game-show | برنامج ألعاب |
| History | تاريخ |
| Horror | رعب |
| Music | موسيقى |
| Musical | موسيقي |
| Mystery | غموض |
| News | إخباري |
| Reality-tv | تلفزيون الواقع |
| Romance | رومانسي |
| Sci-fi | خيال علمي |
| Short | قصير |
| Sport | رياضة |
| Talk-show | حواري |
| Thriller | إثارة |
| War | حرب |
| Western | غربي |
| Supernatural | خارق الطبيعة |

The `localizeGenres()` function in `src/i18n/genres.ts` handles automatic localization:
- If `lang === 'ar'`: English genre names → Arabic translations
- If `lang === 'en'`: Arabic genre names → English translations
- Deduplicates and preserves order

---

## Performance Optimization (13,000+ Titles)

The catalog contains 13,500+ movies plus series and anime. The UI is optimized to avoid jank:

### FlatList Virtualization
- `initialNumToRender={10}` — Only render 10 items on first paint
- `maxToRenderPerBatch={6}` — Render 6 more items per scroll batch
- `windowSize={5}` — Keep 5 screens worth of items in memory
- `removeClippedSubviews={true}` — Unmount off-screen views
- `getItemLayout` — Fixed-height items for instant scroll calculations

### React Memoization
- `React.memo()` on MovieCard wrapper components
- `useMemo()` for derived data (filtered lists, localized genres)
- `useCallback()` for event handlers passed to FlatList
- `useDebounce()` on search input (400ms delay) to prevent excessive API calls

### Horizontal Sections
- Each home screen section is wrapped in a `HorizontalSection` memo component
- Props comparison prevents unnecessary re-renders when data hasn't changed

### Search Optimization
- Debounced search (400ms) prevents API calls on every keystroke
- Cancellation tokens prevent stale search results from overwriting current ones
- Search runs across all categories in parallel using `Promise.all`

---

## API Endpoints

Base URL: `https://ogkushhh-abdobest.hf.space`

| Endpoint | Description | Response |
|----------|-------------|----------|
| `GET /api/movies` | Movie catalog (13,500+) | `Record<string, ContentItem>` |
| `GET /api/anime` | Anime catalog (24+) | `Record<string, ContentItem>` |
| `GET /api/series` | Series catalog (24+) | `Record<string, ContentItem>` |
| `GET /api/tvshows` | TV shows catalog | `Record<string, ContentItem>` |
| `GET /api/asian-series` | Asian series catalog | `Record<string, ContentItem>` |
| `GET /api/trending` | Trending content | `TrendingContent` |
| `GET /api/featured` | Featured content | `TrendingContent` |
| `POST /extract` | Extract video URL | `{stream_url, quality_options}` |
| `GET /health` | API health check | `{status: 'healthy'}` |

---

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── ErrorView.tsx
│   ├── LoadingSpinner.tsx
│   ├── MovieCard.tsx
│   ├── QualityBadge.tsx
│   ├── SearchBar.tsx
│   ├── SectionHeader.tsx
│   └── UpdateModal.tsx
├── constants/           # App constants
│   ├── categories.ts    # Category configs & genre filters
│   └── endpoints.ts     # API URLs, cache TTLs, app version
├── hooks/               # Custom React hooks
│   ├── useAppState.ts
│   └── useTheme.ts
├── i18n/                # Internationalization
│   ├── ar.ts           # Arabic translations
│   ├── en.ts           # English translations
│   ├── genres.ts       # Genre translation table (36+ genres)
│   └── index.ts        # i18next configuration
├── navigation/          # React Navigation setup
│   └── AppNavigator.tsx
├── screens/             # App screens
│   ├── CategoryScreen.tsx
│   ├── DetailsScreen.tsx
│   ├── DownloadsScreen.tsx
│   ├── HomeScreen.tsx
│   ├── PlayerScreen.tsx
│   ├── SearchScreen.tsx
│   └── SettingsScreen.tsx
├── services/            # Business logic
│   ├── api.ts          # Backend API (extract, health)
│   ├── metadataService.ts  # Catalog loading, search, filtering
│   ├── platform.ts     # Platform-specific paths (Android/iOS)
│   ├── updateService.ts    # OTA update checking
│   ├── videoDownloadManager.ts  # HLS download orchestration
│   └── videoService.ts  # Stream URL resolution
├── storage/             # Data persistence
│   ├── cache.ts        # MMKV cache (video URLs, metadata TTL)
│   ├── index.ts        # MMKV instance & storage keys
│   └── main.ts         # Storage exports
├── theme/               # Styling
│   ├── colors.ts       # Color palette (dark/light)
│   └── typography.ts   # Font sizes & weights
└── types/               # TypeScript types
    └── index.ts        # ContentItem, DownloadItem, etc.
```

---

## ContentItem Schema

```typescript
interface ContentItem {
  id: string;
  Title: string;              // Display title (may be Arabic or English)
  Category: string;           // 'movies' | 'anime' | 'series' | 'tvshows'
  'Image Source': string;     // Poster URL
  Source: string;             // Source page URL (for video extraction)
  Genres: string[];           // Genre names (may be English or Arabic)
  GenresAr: string[];         // Arabic genre names
  Format: string;             // Quality format (e.g., '1080p WEB-DL')
  Runtime: number | null;     // Duration in minutes
  Country: string | null;     // Country of origin
  'TMDb ID'?: number | null;  // TMDb reference ID
  Description?: string;       // English description (new)
  DescriptionAr?: string;     // Arabic description (new)
  Seasons?: Record<string, any>;      // Series seasons data
  Episodes?: Record<string, any>;     // Anime/series episodes
  'Number Of Episodes'?: number;      // Total episode count
}
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- React Native development environment (Android Studio / Xcode)

### Installation
```bash
npm install
```

### Run on Android
```bash
npx react-native run-android
```

### Run on iOS
```bash
cd ios && pod install && cd ..
npx react-native run-ios
```

---

## Dependencies

### Core
- `react` + `react-native` — UI framework
- `@react-navigation/*` — Navigation (tabs + stack)
- `react-native-video` — HLS video playback
- `react-native-mmkv` — Fast key-value storage
- `@rajeev02/media` — HLS video download (Android + iOS)
- `react-native-nitro-fs` — High-performance file I/O
- `react-native-fast-image` — Image caching & rendering
- `axios` — HTTP client
- `i18next` + `react-i18next` — Internationalization (Arabic + English)

### UI
- `react-native-vector-icons` — Icon library (Ionicons)
- `react-native-safe-area-context` — Safe area handling
- `react-native-screens` — Native screen components
