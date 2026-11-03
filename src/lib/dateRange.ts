export function getFilterDate(period: string, dateRange?: { from?: Date; to?: Date }): { from: Date | null; to: Date | null } {
  if (period === 'custom' && dateRange?.from) {
    return { from: dateRange.from, to: dateRange.to || new Date() };
  }
  const d = new Date();
  if (period === 'day') d.setDate(d.getDate() - 1);
  else if (period === 'week') d.setDate(d.getDate() - 7);
  else if (period === 'month') d.setMonth(d.getMonth() - 1);
  else if (period === 'year') d.setFullYear(d.getFullYear() - 1);
  else return { from: null, to: null };
  return { from: d, to: new Date() };
}