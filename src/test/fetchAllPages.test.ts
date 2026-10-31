import { describe, expect, it } from 'vitest';
import { fetchAllPages } from '@/lib/fetchAllPages';

describe('fetchAllPages', () => {
  it('loads every row past the API page boundary', async () => {
    const rows = Array.from({ length: 1201 }, (_, id) => ({ id }));
    const requestedRanges: number[][] = [];

    const result = await fetchAllPages(async (from, to) => {
      requestedRanges.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    });

    expect(result).toHaveLength(1201);
    expect(result[1200]?.id).toBe(1200);
    expect(requestedRanges).toEqual([[0, 499], [500, 999], [1000, 1499]]);
  });

  it('stops after a short final page', async () => {
    let requests = 0;
    const result = await fetchAllPages(async () => {
      requests += 1;
      return { data: [{ id: 1 }, { id: 2 }], error: null };
    });

    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    expect(requests).toBe(1);
  });

  it('propagates backend read errors', async () => {
    await expect(fetchAllPages(async () => ({ data: null, error: new Error('read failed') })))
      .rejects.toThrow('read failed');
  });
});