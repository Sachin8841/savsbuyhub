import { describe, expect, it } from 'vitest';
import { matchInventoryBySku } from '@/lib/importMeesho';

const products = [
  { id: 'parent', sku: 'TEE-BLUE', product_name: 'Blue Cotton Tee', aliases: ['Azure shirt'] },
  { id: 'batch', sku: 'TEE-BLUE-B2', product_name: 'Blue Cotton Tee (Batch 2)', aliases: [] },
];

describe('Meesho inventory matching', () => {
  it('matches an exact SKU before related batch SKUs', () => {
    expect(matchInventoryBySku(products, 'TEE-BLUE-B2', '')?.id).toBe('batch');
  });

  it('matches a product alias when the report has no SKU', () => {
    expect(matchInventoryBySku(products, '', 'Azure shirt')?.id).toBe('parent');
  });

  it('returns no match for an unrelated product', () => {
    expect(matchInventoryBySku(products, 'UNRELATED-1', 'Red wool scarf')).toBeNull();
  });
});