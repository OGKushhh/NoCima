export interface ContentItem {
  id: string;
  Title: string;
  Category: string;
  'Image Source': string;
  Source: string;
  // Pre-scraped server page URLs (video_player?player_token=...).
  // If present, VideoExtractor loads these directly instead of the main page.
  // Index 0 = default server, 1+ = fallback servers.
  Sources?: string[];
  Genres: string[];
  GenresAr: string[];
  Format: string;
  Runtime: number | null;
  Country: string | null;
  'TMDb ID'?: number | null;
  Description?: string;
  DescriptionAr?: string;
  // Series / Anime specific
  Seasons?: Record<string, any>;
  Episodes?: Record<string, any>;
  'Number Of Episodes'?: number;
  // Rating & views (for cards)
  Rating?: string;
  Views?: string;
  Year?: string;
}

export interface TrendingItem {
  title: string;
  link: string;
  image: string;
  quality?: string;
  imdb_rating?: string;
  views?: string;
  content_type: string;
}

export interface TrendingContent {
  movies: TrendingItem[];
  episodes: TrendingItem[];
  most_viewed: TrendingItem[];
}

export interface VideoStreamInfo {
  video_url: string;
  quality_options: string[];
}

export interface DownloadItem {
  id: string;
  contentId: string;
  title: string;
  imageUrl: string;
  videoUrl: string;
  format: string;
  quality: string;
  progress: number;
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'failed';
  localPath?: string;
  totalBytes?: number;
  downloadedBytes?: number;
  timestamp: number;
  /** Platform-specific file path where the downloaded file is saved */
  destinationPath?: string;
  /** Error message if download failed */
  errorMessage?: string;
}

export interface UserSettings {
  language: 'ar' | 'en';
  defaultQuality: string;
  mobileDataWarning: boolean;
  autoPlay: boolean;
  showArabicTitles: boolean;
  darkMode: boolean;
  qualityPreference: 'high' | 'medium' | 'low' | 'auto';
  playerQuality: 'auto' | '1080' | '720' | '480' | '360';
  subtitleEnabled: boolean;
}

export type ContentCategory = 'movies' | 'anime' | 'series' | 'tvshows' | 'asian-series';
