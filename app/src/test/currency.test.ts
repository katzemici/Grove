import { afterEach, describe, expect, it } from 'vitest';
import {
  amountPlaceholder,
  currencyDecimals,
  currencySymbol,
  formatCurrency,
  getCurrency,
  parseAmount,
  roundMoney,
  setCurrency,
  subscribeCurrency,
} from '../lib/currency';
import { formatMoney } from '../lib/finance';

// Intl output uses non-breaking spaces in some locales; normalise for readable assertions.
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

afterEach(() => setCurrency('USD'));

describe('formatting', () => {
  it('formats each currency in its native style', () => {
    expect(plain(formatCurrency(1250000, 'IDR'))).toBe('Rp 1.250.000');
    expect(formatCurrency(1250.5, 'GBP')).toBe('£1,250.50');
    expect(formatCurrency(1500, 'JPY')).toMatch(/^[¥￥]1,500$/);
    expect(formatCurrency(1250.5, 'USD')).toBe('$1,250.50');
  });

  it('knows each currency precision and symbol', () => {
    expect(currencyDecimals('IDR')).toBe(0);
    expect(currencyDecimals('JPY')).toBe(0);
    expect(currencyDecimals('GBP')).toBe(2);
    expect(currencySymbol('IDR')).toBe('Rp');
    expect(currencySymbol('GBP')).toBe('£');
    expect(amountPlaceholder('IDR')).toBe('0');
    expect(amountPlaceholder('USD')).toBe('0.00');
  });

  it('rounds to the currency minor unit', () => {
    expect(roundMoney(12.345, 'USD')).toBe(12.35);
    expect(roundMoney(15000.6, 'IDR')).toBe(15001);
  });
});

describe('parseAmount', () => {
  it('treats separators as thousands for whole-unit currencies', () => {
    expect(parseAmount('15.000', 'IDR')).toBe(15000);
    expect(parseAmount('Rp 1.250.000', 'IDR')).toBe(1250000);
    expect(parseAmount('1,500', 'JPY')).toBe(1500);
  });

  it('handles common decimal styles', () => {
    expect(parseAmount('1,250.50', 'USD')).toBe(1250.5);
    expect(parseAmount('12.5', 'USD')).toBe(12.5);
    expect(parseAmount('1.250,50', 'EUR')).toBe(1250.5);
    expect(parseAmount('12,50', 'EUR')).toBe(12.5);
    expect(parseAmount('1,250', 'USD')).toBe(1250);
    expect(parseAmount('£ 9.99', 'GBP')).toBe(9.99);
  });

  it('returns NaN for non-numbers and keeps the sign', () => {
    expect(parseAmount('', 'USD')).toBeNaN();
    expect(parseAmount('abc', 'USD')).toBeNaN();
    expect(parseAmount('-50', 'USD')).toBe(-50);
  });
});

describe('selected currency', () => {
  it('changes formatMoney everywhere and notifies subscribers', () => {
    let calls = 0;
    const off = subscribeCurrency(() => calls++);
    setCurrency('IDR');
    expect(getCurrency()).toBe('IDR');
    expect(plain(formatMoney(25000))).toBe('Rp 25.000');
    expect(localStorage.getItem('grove:currency')).toBe('IDR');
    setCurrency('IDR'); // same value: no extra notification
    expect(calls).toBe(1);
    off();
  });

  it('ignores unknown currency codes', () => {
    setCurrency('XXX');
    expect(getCurrency()).toBe('USD');
  });
});
