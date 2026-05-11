/**
 * Date formatting utilities for Cambodia (UTC+07:00, Asia/Phnom_Penh).
 */

const CAMBODIA_TZ = 'Asia/Phnom_Penh';

/**
 * Format a date-of-birth string for display on ID cards.
 *
 * @param dateStr  ISO date string (e.g. "2000-02-01T00:00:00.000Z") or null/undefined.
 * @param lang     Current app language: 'en' → dd/mm/yyyy, 'kh' → Khmer numerals & month name.
 * @returns        Formatted string, e.g. "01/02/2000" or "១ កុម្ភៈ ២០០០".
 */
export function formatDOB(
  dateStr: string | null | undefined,
  lang: 'en' | 'kh' | string = 'en',
): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';

  if (lang === 'kh') {
    // Khmer format: ១ កុម្ភៈ ២០០០  (day MonthName year, Khmer numerals)
    return date.toLocaleDateString('km-KH-u-nu-khmr', {
      timeZone: CAMBODIA_TZ,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  // English format: dd/mm/yyyy
  return date.toLocaleDateString('en-GB', {
    timeZone: CAMBODIA_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
