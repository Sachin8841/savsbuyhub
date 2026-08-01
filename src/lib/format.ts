const safe = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Central money formatter — every page must use this so values never differ by rounding. */
export const formatMoney = (value: unknown, fractionDigits = 2) =>
  '₹' + safe(value).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: fractionDigits });

/** Compact money for chart axes: ₹12.4k / ₹1.2L / ₹3.4Cr */
export const formatMoneyCompact = (value: unknown) => {
  const n = safe(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)}L`;
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)}k`;
  return `${sign}₹${abs.toFixed(0)}`;
};

export const formatNumber = (value: unknown) => safe(value).toLocaleString('en-IN');

export const formatPercent = (value: unknown, fractionDigits = 1) => `${safe(value).toFixed(fractionDigits)}%`;
