// Display currency. Amounts are stored as plain numbers; this only controls how
// they are shown and how typed amounts are parsed and rounded. Changing currency
// does not convert existing amounts (there are no exchange rates).

export interface CurrencyInfo {
  code: string;
  name: string;
  /** Locale used for formatting, so each currency looks native (Rp 15.000, £1,250.00, ¥1,500). */
  locale: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'IDR', name: 'Indonesian Rupiah', locale: 'id-ID' },
  { code: 'USD', name: 'US Dollar', locale: 'en-US' },
  { code: 'GBP', name: 'British Pound', locale: 'en-GB' },
  { code: 'JPY', name: 'Japanese Yen', locale: 'ja-JP' },
  { code: 'EUR', name: 'Euro', locale: 'de-DE' },
  { code: 'SGD', name: 'Singapore Dollar', locale: 'en-SG' },
  { code: 'MYR', name: 'Malaysian Ringgit', locale: 'ms-MY' },
  { code: 'AUD', name: 'Australian Dollar', locale: 'en-AU' },
  { code: 'KRW', name: 'South Korean Won', locale: 'ko-KR' },
  { code: 'CNY', name: 'Chinese Yuan', locale: 'zh-CN' },
  { code: 'INR', name: 'Indian Rupee', locale: 'en-IN' },
  { code: 'THB', name: 'Thai Baht', locale: 'th-TH' },
];

const KEY = 'grove:currency';
const DEFAULT = 'USD';

interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function storage(): KV | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function isKnown(code: string | null | undefined): code is string {
  return !!code && CURRENCIES.some((c) => c.code === code);
}

let current: string = (() => {
  const saved = storage()?.getItem(KEY);
  return isKnown(saved) ? saved : DEFAULT;
})();

const listeners = new Set<() => void>();

export function getCurrency(): string {
  return current;
}

export function setCurrency(code: string): void {
  if (!isKnown(code) || code === current) return;
  current = code;
  storage()?.setItem(KEY, code);
  listeners.forEach((l) => l());
}

/** For useSyncExternalStore. */
export function subscribeCurrency(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currencyInfo(code: string = current): CurrencyInfo {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[1];
}

const formatters = new Map<string, Intl.NumberFormat>();
function formatter(code: string, compact: boolean): Intl.NumberFormat {
  const key = code + (compact ? ':c' : '');
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(currencyInfo(code).locale, {
      style: 'currency',
      currency: code,
      ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}),
    });
    formatters.set(key, f);
  }
  return f;
}

/** Minor-unit digits for a currency: 2 for USD/GBP/EUR, 0 for IDR/JPY/KRW. */
export function currencyDecimals(code: string = current): number {
  return formatter(code, false).resolvedOptions().maximumFractionDigits ?? 2;
}

export function formatCurrency(n: number, code: string = current): string {
  return formatter(code, false).format(n);
}

/** Short form for axes and tight spots: Rp 15 jt, £1.2K, ¥15万. */
export function formatCurrencyCompact(n: number, code: string = current): string {
  return formatter(code, true).format(n);
}

/** Currency symbol as it appears in formatted amounts, e.g. "Rp", "£", "¥". */
export function currencySymbol(code: string = current): string {
  const part = formatter(code, false)
    .formatToParts(0)
    .find((p) => p.type === 'currency');
  return part?.value ?? code;
}

/** Round to the currency's minor unit (whole rupiah/yen, cents for dollars). */
export function roundMoney(n: number, code: string = current): number {
  const f = Math.pow(10, currencyDecimals(code));
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** Input placeholder that matches the currency, e.g. "0" or "0.00". */
export function amountPlaceholder(code: string = current): string {
  const d = currencyDecimals(code);
  return d === 0 ? '0' : '0.' + '0'.repeat(d);
}

/**
 * Parse a typed amount. Accepts currency symbols, spaces and thousands separators:
 *   IDR "15.000" -> 15000, "Rp 1.250.000" -> 1250000
 *   USD "1,250.50" -> 1250.5, "12.5" -> 12.5
 *   EUR "1.250,50" -> 1250.5
 * Returns NaN when the text is not a number.
 */
export function parseAmount(text: string, code: string = current): number {
  let s = text.trim().replace(/[\s\u00a0]/g, '');
  if (!s) return NaN;
  s = s.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return NaN;
  const decimals = currencyDecimals(code);
  if (decimals === 0) {
    // Whole-unit currencies: any "." or "," is a thousands separator.
    return Number(s.replace(/[.,]/g, ''));
  }
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    // Both present: whichever comes last is the decimal separator.
    const dec = lastDot > lastComma ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    s = s.split(thou).join('').replace(dec, '.');
  } else if (lastComma !== -1) {
    // Only commas: "12,50" is a decimal, "1,250" / "1,250,000" are thousands.
    const tail = s.length - lastComma - 1;
    s = (s.match(/,/g)!.length === 1 && tail !== 3) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot !== -1 && (s.match(/\./g)!.length > 1)) {
    // "1.250.000" style thousands.
    s = s.replace(/\./g, '');
  }
  return Number(s);
}
