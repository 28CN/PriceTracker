import { describe, expect, it } from 'vitest';

import { retailerKey } from './retailer';

describe('retailerKey', () => {
  it('resolves known Australian shops from both URLs and names', () => {
    expect(retailerKey('https://www.woolworths.com.au/shop/product/123')).toBe('woolworths');
    expect(retailerKey('Woolworths')).toBe('woolworths');
    expect(retailerKey('https://www.chemistwarehouse.com.au/buy/1')).toBe('chemistwarehouse');
    expect(retailerKey('Chemist Warehouse')).toBe('chemistwarehouse');
    expect(retailerKey('The Reject Shop')).toBe('therejectshop');
    expect(retailerKey('https://rejectshop.com.au/p/1')).toBe('therejectshop');
    expect(retailerKey('Best & Less')).toBe('bestandless');
    expect(retailerKey('Auto Barn')).toBe('autobarn');
  });

  it('returns null for unknown or empty shops so CSS falls back to theme accent', () => {
    expect(retailerKey('Corner Hardware')).toBeNull();
    expect(retailerKey('https://corner-hardware.example/item')).toBeNull();
    expect(retailerKey('')).toBeNull();
    expect(retailerKey(null)).toBeNull();
  });
});
