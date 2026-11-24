/** Returns +digits only when the number is unambiguously international; otherwise null.
 *  (Country-aware parsing of national numbers needs libphonenumber-js; deliberately not guessed here.) */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  const digits = t.replace(/\D/g, '');
  const intl = t.startsWith('+') ? digits : t.startsWith('00') ? digits.slice(2) : null;
  return intl && intl.length >= 8 && intl.length <= 15 ? `+${intl}` : null;
}
