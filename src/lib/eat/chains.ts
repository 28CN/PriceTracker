/** Fast-food chains on /eat. Keys match crawler/eat.py CHAINS and public/eat/stores-perth.json. */
export type EatChain = {
  key: string;
  name: string;
  /** Two or three letters for the badge. */
  mark: string;
  /** Official page for its deals, app or rewards. */
  url: string;
  /** Most of its deals only show in its own app (often per account). */
  appDeals?: boolean;
};

export const EAT_CHAINS: EatChain[] = [
  {
    key: 'mcdonalds',
    name: "McDonald's",
    mark: 'M',
    url: 'https://www.mcdonalds.com/au/en-au/mymaccas-rewards.html',
    appDeals: true
  },
  { key: 'kfc', name: 'KFC', mark: 'KFC', url: 'https://www.kfc.com.au/promos-rewards', appDeals: true },
  {
    key: 'hungryjacks',
    name: "Hungry Jack's",
    mark: 'HJ',
    url: 'https://www.hungryjacks.com.au/vouchers',
    appDeals: true
  },
  { key: 'subway', name: 'Subway', mark: 'SW', url: 'https://www.subway.com/en-au', appDeals: true },
  { key: 'dominos', name: "Domino's", mark: 'D', url: 'https://www.dominos.com.au/offers' },
  { key: 'pizzahut', name: 'Pizza Hut', mark: 'PH', url: 'https://www.pizzahut.com.au/deals' },
  { key: 'redrooster', name: 'Red Rooster', mark: 'RR', url: 'https://www.redrooster.com.au/' },
  { key: 'chickentreat', name: 'Chicken Treat', mark: 'CT', url: 'https://www.chickentreat.com.au/flock-rewards/' },
  { key: 'gyg', name: 'Guzman y Gomez', mark: 'GYG', url: 'https://www.guzmanygomez.com.au/' },
  { key: 'oporto', name: 'Oporto', mark: 'O', url: 'https://www.oporto.com.au/' },
  { key: 'nandos', name: "Nando's", mark: 'N', url: 'https://www.nandos.com.au/peri-perks' },
  { key: 'grilld', name: "Grill'd", mark: 'G', url: 'https://grilld.com.au/relish' },
  { key: 'zambrero', name: 'Zambrero', mark: 'Z', url: 'https://www.zambrero.com.au/zamfam' },
  { key: 'tacobell', name: 'Taco Bell', mark: 'TB', url: 'https://tacobell.com.au/' },
  { key: 'madmex', name: 'Mad Mex', mark: 'MM', url: 'https://www.madmex.com.au/' },
  { key: 'nene', name: 'NeNe Chicken', mark: 'NN', url: 'https://nenechicken.com.au/locations/wa' },
  { key: 'jesters', name: 'Jesters', mark: 'J', url: 'https://jesters.au/stores/' },
  { key: 'schnitz', name: 'Schnitz', mark: 'S', url: 'https://schnitz.com.au/' },
  { key: 'rolld', name: "Roll'd", mark: 'R', url: 'https://rolld.com.au/' },
  { key: 'sushisushi', name: 'Sushi Sushi', mark: 'SS', url: 'https://www.sushisushi.com.au/' }
];

export function eatChain(key: string): EatChain | null {
  return EAT_CHAINS.find((chain) => chain.key === key) ?? null;
}
