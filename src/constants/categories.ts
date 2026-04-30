import {ContentCategory} from '../types';

export interface CategoryConfig {
  key: ContentCategory | string;
  labelAr: string;
  labelEn: string;
  icon: string;
  available: boolean;
  apiEndpoint: string;
}

export const CATEGORIES: CategoryConfig[] = [
  { key: 'movies', labelAr: 'أفلام', labelEn: 'Movies', icon: 'film', available: true, apiEndpoint: '/api/movies' },
  { key: 'dubbed-movies', labelAr: 'أفلام مدبلجة', labelEn: 'Dubbed Movies', icon: 'mic', available: true, apiEndpoint: '/api/dubbed-movies' },
  { key: 'hindi', labelAr: 'هندي', labelEn: 'Hindi', icon: 'musical-notes', available: true, apiEndpoint: '/api/hindi' },
  { key: 'asian-movies', labelAr: 'أفلام آسيوية', labelEn: 'Asian Movies', icon: 'globe-outline', available: true, apiEndpoint: '/api/asian-movies' },
  { key: 'anime', labelAr: 'أنمي', labelEn: 'Anime', icon: 'tv', available: true, apiEndpoint: '/api/anime' },
  { key: 'anime-movies', labelAr: 'أفلام أنمي', labelEn: 'Anime Movies', icon: 'film-outline', available: true, apiEndpoint: '/api/anime-movies' },
  { key: 'series', labelAr: 'مسلسلات', labelEn: 'Series', icon: 'play-circle', available: true, apiEndpoint: '/api/series' },
  { key: 'tvshows', labelAr: 'برامج تلفزيونية', labelEn: 'TV Shows', icon: 'monitor', available: true, apiEndpoint: '/api/tvshows' },
  { key: 'asian-series', labelAr: 'مسلسلات آسيوية', labelEn: 'Asian Series', icon: 'globe', available: true, apiEndpoint: '/api/asian-series' },
];

export const GENRE_FILTERS = [
  'Action', 'Comedy', 'Drama', 'Thriller', 'Horror', 'Sci-Fi',
  'Romance', 'Animation', 'Documentary', 'Crime', 'Fantasy', 'Mystery',
  'Adventure', 'Biography', 'War', 'Western', 'Music', 'Sport',
];

/** Map all possible category slugs to API endpoints for the Browse screen */
export const ALL_CATEGORIES: Record<string, string> = {
  movies: '/api/movies',
  'dubbed-movies': '/api/dubbed-movies',
  hindi: '/api/hindi',
  'asian-movies': '/api/asian-movies',
  anime: '/api/anime',
  'anime-movies': '/api/anime-movies',
  series: '/api/series',
  tvshows: '/api/tvshows',
  'asian-series': '/api/asian-series',
};
