/**
 * Genre translation table for AbdoBest.
 *
 * Many older titles have Genres and GenresAr containing the SAME English values.
 * This table provides proper Arabic translations for ALL genre names found in the
 * catalog, so the frontend can always display the correct localized genre name
 * regardless of what the source JSON contains.
 *
 * Usage:
 *   import { localizeGenre } from '../i18n/genres';
 *   const displayGenre = localizeGenre('Action', 'ar'); // → 'أكشن'
 *   const displayGenre = localizeGenre('Action', 'en'); // → 'Action'
 */

/**
 * English → Arabic genre mapping.
 * Covers all 36+ genres found in the AbdoBest catalog (movies, series, anime).
 */
export const GENRE_EN_TO_AR: Record<string, string> = {
  'Action':       'أكشن',
  'Adventure':    'مغامرة',
  'Animation':    'أنيميشن',
  'Biography':    'سيرة ذاتية',
  'Comedy':       'كوميدي',
  'Comdey':       'كوميدي',        // typo in source data, normalized
  'Crime':        'جريمة',
  'Documentary':  'وثائقي',
  'Drama':        'دراما',
  'Family':       'عائلي',
  'Fantasy':      'فانتازيا',
  'Film-noir':    'فيلم نوار',
  'Game-show':    'برنامج ألعاب',
  'History':      'تاريخ',
  'Horror':       'رعب',
  'Music':        'موسيقى',
  'Musical':      'موسيقي',
  'Mystery':      'غموض',
  'N-a':          'غير محدد',
  'News':         'إخباري',
  'Reality-tv':   'تلفزيون الواقع',
  'Romance':      'رومانسي',
  'Sci-fi':       'خيال علمي',
  'Short':        'قصير',
  'Sport':        'رياضة',
  'Talk-show':    'حواري',
  'Thriller':     'إثارة',
  'War':          'حرب',
  'Western':      'غربي',
  'Supernatural': 'خارق الطبيعة',

  // Arabic-only entries found in GenresAr field of older titles
  'إخباري':      'إخباري',
  'العائلي':     'عائلي',
  'تلفزيون-الواقع': 'تلفزيون الواقع',
  'حفل':         'حفل',
  'خيال-علمي':   'خيال علمي',
  'سيرة-ذاتية':  'سيرة ذاتية',
  'وثاائقي':     'وثائقي',        // typo in source data, normalized

  // Arabic genre names that appear in GenresAr for newer titles
  'اثارة':       'إثارة',
  'اكشن':        'أكشن',
  'انيميشن':     'أنيميشن',
  'جريمة':       'جريمة',
  'دراما':       'دراما',
  'رعب':         'رعب',
  'رومانسي':     'رومانسي',
  'غموض':        'غموض',
  'كوميدي':      'كوميدي',
  'موسيقي':      'موسيقي',
  'قوى-خارقة':   'خارق الطبيعة',
};

/**
 * Arabic → English genre mapping (reverse lookup).
 */
export const GENRE_AR_TO_EN: Record<string, string> = Object.fromEntries(
  Object.entries(GENRE_EN_TO_AR).filter(([en, ar]) => {
    // Only map entries where the key is English and value is Arabic
    return !/[\\u0600-\\u06FF]/.test(en) && /[\\u0600-\\u06FF]/.test(ar);
  }).map(([en, ar]) => [ar, en])
);

// Manually add the Arabic → English entries that are direct keys
Object.assign(GENRE_AR_TO_EN, {
  'إخباري':        'News',
  'العائلي':       'Family',
  'تلفزيون-الواقع': 'Reality-tv',
  'حفل':           'Ceremony',
  'خيال-علمي':     'Sci-fi',
  'سيرة-ذاتية':    'Biography',
  'وثاائقي':       'Documentary',
  'اثارة':         'Thriller',
  'اكشن':          'Action',
  'انيميشن':       'Animation',
  'جريمة':         'Crime',
  'دراما':         'Drama',
  'رعب':           'Horror',
  'رومانسي':       'Romance',
  'غموض':          'Mystery',
  'كوميدي':        'Comedy',
  'موسيقي':        'Musical',
  'قوى-خارقة':     'Supernatural',
});

/**
 * Localize a genre name to the user's language.
 *
 * For English (en): Returns the English genre name, looking up Arabic-only entries.
 * For Arabic (ar):  Returns the Arabic genre name, looking up English-only entries.
 *
 * @param genre - Raw genre string from the API (could be English or Arabic)
 * @param lang  - Target language ('ar' or 'en')
 * @returns Localized genre string
 */
export const localizeGenre = (genre: string, lang: 'ar' | 'en'): string => {
  if (!genre) return genre;

  const trimmed = genre.trim();

  if (lang === 'ar') {
    // If already Arabic → return it (look up for normalization)
    if (GENRE_EN_TO_AR[trimmed]) {
      return GENRE_EN_TO_AR[trimmed]; // English → Arabic
    }
    // Already Arabic, check if we have a normalized version
    if (GENRE_AR_TO_EN[trimmed]) {
      // It's Arabic — return the original Arabic
      return trimmed;
    }
    return trimmed; // Return as-is
  }

  // lang === 'en'
  if (GENRE_AR_TO_EN[trimmed]) {
    return GENRE_AR_TO_EN[trimmed]; // Arabic → English
  }
  // Already English
  return trimmed;
};

/**
 * Localize an array of genres.
 * Preserves order and deduplicates.
 */
export const localizeGenres = (genres: string[], lang: 'ar' | 'en'): string[] => {
  if (!genres || genres.length === 0) return [];
  const seen = new Set<string>();
  return genres
    .map(g => localizeGenre(g, lang))
    .filter(g => {
      if (seen.has(g)) return false;
      seen.add(g);
      return true;
    });
};
