import { describe, expect, it } from 'vitest';

import { dedupeKey, isFoodDeal, needsApp, regionOf } from './classify';

describe('regionOf', () => {
  it('keeps WA and national deals, drops other states', () => {
    expect(regionOf('[WA] 9 Pieces Crunchified Chicken $9.99 @ Chicken Treat (Online & Pickup Only)')).toBe('wa');
    expect(regionOf('Giant Snack Pack $6.95 @ KFC')).toBe('national');
    expect(regionOf("50% off Premium Pizzas, 40% off Traditional Pizzas @ Domino's (Selected Stores)")).toBe(
      'national'
    );
    expect(regionOf("[VIC] 2x Cheeseburgers, Small Drink & Chips for $4 @ McDonald's Ringwood")).toBe('other');
    expect(regionOf('[NSW] $5 Burritos and Bowls (10/12) @ Guzman y Gomez Caringbah (In-Store Only)')).toBe('other');
    expect(regionOf('[SA] Chicken & Pepperoni Footlong Sub, $9.95 at Subways within OTR stores')).toBe('other');
    expect(regionOf("33% off Large Premium & Traditional Pizza (Pickup / Delivery) @ Domino's (Excludes WA/NT)")).toBe(
      'other'
    );
    expect(regionOf("Upgradable Value Pizzas $8 Each Pickup (Tuesday Only) (WA Only) @ Domino's")).toBe('wa');
    expect(regionOf('[WA, SA] Free Chips @ Red Rooster')).toBe('national');
    expect(regionOf('Free Burger @ Oporto Sydney CBD')).toBe('other');
    expect(regionOf('Free Tempta Burger @ Chicken Treat, Kwinana Perth')).toBe('wa');
  });
});

describe('needsApp', () => {
  it('spots app, account and membership deals', () => {
    expect(needsApp('Zinger Combo & Chicken $9.95 Pickup @ KFC (Online/App Order Required)')).toBe(true);
    expect(needsApp('$10 Whole Chicken (Free Membership Required), Was $17.95 @ Red Rooster')).toBe(true);
    expect(needsApp("2-for-1 Veggie Burgers Dine-in on Mondays for Relish Members @ Grill'd")).toBe(true);
    expect(needsApp('Free Burrito for New GOMEX Rewards Members @ Guzman Y Gomez via App')).toBe(true);
    expect(needsApp('Giant Snack Pack $6.95 @ KFC')).toBe(false);
    expect(needsApp("2 Large Value Pizzas + 2 Sides for $24 Pick Up / $32 Delivered @ Domino's")).toBe(false);
  });
});

describe('isFoodDeal', () => {
  it('leaves out points, travel and subscriptions', () => {
    expect(isFoodDeal("6 Months of Binge Basic for 8,000 Rewards Points @ McDonald's via MyMacca's App", null)).toBe(
      false
    );
    expect(isFoodDeal('$200 off a 5+ Night Package at TravelOnline, 1 Game at Strike Bowling @ KFC Perks', null)).toBe(
      false
    );
    expect(isFoodDeal('Giant Snack Pack $6.95 @ KFC', 'Dining & Takeaway')).toBe(true);
    expect(isFoodDeal('Pizza Hut: 25% Cashback on Online Orders @ TopCashback', 'Dining & Takeaway')).toBe(false);
    expect(isFoodDeal("Up to 10% Cash Back at Domino's @ ShopBack", null)).toBe(false);
    expect(isFoodDeal('5% Cashrewards on Oporto Orders', null)).toBe(false);
    expect(isFoodDeal("Free Glass with Any Large Meal @ Hungry Jack's", null)).toBe(true);
    expect(isFoodDeal('Some offer @ KFC', 'Entertainment')).toBe(false);
  });
});

describe('dedupeKey', () => {
  it('matches the same deal posted twice', () => {
    expect(dedupeKey('kfc', '$1 Wicked Wings (Max 10) @ KFC')).toBe(dedupeKey('kfc', '$1 Wicked Wings @ KFC (App)'));
    expect(dedupeKey('kfc', '$1 Wicked Wings @ KFC')).not.toBe(dedupeKey('kfc', '$1 Nuggets @ KFC'));
  });
});
