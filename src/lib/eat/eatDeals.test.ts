import { describe, expect, it } from 'vitest';

import { buildEatGroups, type EatDealRow } from './eatDeals';

const NOW = Date.parse('2026-11-27T04:00:00Z');
let id = 1;
function row(chain: string, title: string, extra: Partial<EatDealRow> = {}): EatDealRow {
  return {
    node_id: id++,
    title,
    deal_url: `https://www.ozbargain.com.au/node/${id}`,
    chain,
    votes_pos: 10,
    votes_neg: 0,
    posted_at: '2026-11-25T01:00:00Z',
    expires_at: null,
    image_url: null,
    category: 'Dining & Takeaway',
    ...extra
  };
}

describe('buildEatGroups', () => {
  it('groups for everyone, WA only and in the app, without other states, ended or duplicate deals', () => {
    const groups = buildEatGroups(
      [
        row('kfc', 'Giant Snack Pack $6.95 @ KFC', { votes_pos: 74 }),
        row('kfc', 'Giant Snack Pack $6.95 @ KFC (Participating Stores)', { votes_pos: 3 }),
        row('chickentreat', '[WA] 9 Pieces Chicken $9.99 @ Chicken Treat'),
        row('redrooster', '$10 Whole Chicken (Free Membership Required) @ Red Rooster'),
        row('mcdonalds', "[VIC] 2x Cheeseburgers $4 @ McDonald's Ringwood"),
        row('dominos', "33% off Pizza @ Domino's (Excludes WA/NT)"),
        row('kfc', '$1 Wicked Wings @ KFC', { expires_at: '2026-11-25T11:00:00Z' }),
        row('mcdonalds', "Binge for 8,000 Rewards Points @ McDonald's via App"),
        row('unknownchain', 'Free Taco @ Somewhere')
      ],
      NOW
    );
    expect(groups.everyone.map((d) => d.title)).toEqual(['Giant Snack Pack $6.95 @ KFC']);
    expect(groups.everyone[0].votes).toBe(74);
    expect(groups.everyone[0].price).toBe('$6.95');
    expect(groups.wa.map((d) => d.chain)).toEqual(['chickentreat']);
    expect(groups.app.map((d) => d.chain)).toEqual(['redrooster']);
    expect(groups.appChains.map((c) => c.key)).toEqual(['mcdonalds', 'kfc', 'hungryjacks', 'subway']);
  });
});
