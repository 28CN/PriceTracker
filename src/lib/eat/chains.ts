/** App-opening metadata for chains whose deals mostly live in their own app. */
export type EatChainApp = {
  android: string;
  iosId: number;
  iosLink?: string;
};

/** Fast-food chains on /eat. Keys match crawler/eat.py CHAINS and public/eat/stores-perth.json. */
export type EatChain = {
  key: string;
  name: string;
  /** Two or three letters for the badge. */
  mark: string;
  /** Self-hosted logo under public/eat/logos/. */
  logo?: string;
  /** Official page for its deals, app or rewards. */
  url: string;
  /** Most of its deals only show in its own app (often per account). */
  appDeals?: boolean;
  /** Mobile app package / App Store metadata for opening the installed app. */
  app?: EatChainApp;
};

export const EAT_CHAINS: EatChain[] = [
  {
    key: 'mcdonalds',
    name: "McDonald's",
    mark: 'M',
    logo: '/eat/logos/mcdonalds.webp',
    url: 'https://www.mcdonalds.com/au/en-au/mymaccas-rewards.html',
    appDeals: true,
    app: { android: 'com.mcdonalds.au.gma', iosId: 1105300599 }
  },
  {
    key: 'kfc',
    name: 'KFC',
    mark: 'KFC',
    logo: '/eat/logos/kfc.webp',
    url: 'https://www.kfc.com.au/promos-rewards',
    appDeals: true,
    app: { android: 'com.kfcaus.ordering', iosId: 725748250 }
  },
  {
    key: 'hungryjacks',
    name: "Hungry Jack's",
    mark: 'HJ',
    logo: '/eat/logos/hungryjacks.webp',
    url: 'https://www.hungryjacks.com.au/vouchers',
    appDeals: true,
    app: { android: 'com.webling.hungryjacks', iosId: 518981155 }
  },
  {
    key: 'subway',
    name: 'Subway',
    mark: 'SW',
    logo: '/eat/logos/subway.webp',
    url: 'https://www.subway.com/en-au/promotions',
    appDeals: true,
    app: {
      android: 'au.com.subcard.app',
      iosId: 1570190122,
      iosLink: 'https://app.subcard.com.au/ul/page/order'
    }
  },
  {
    key: 'dominos',
    name: "Domino's",
    mark: 'D',
    logo: '/eat/logos/dominos.webp',
    url: 'https://www.dominos.com.au/offers'
  },
  {
    key: 'pizzahut',
    name: 'Pizza Hut',
    mark: 'PH',
    logo: '/eat/logos/pizzahut.webp',
    url: 'https://www.pizzahut.com.au/deals'
  },
  {
    key: 'redrooster',
    name: 'Red Rooster',
    mark: 'RR',
    logo: '/eat/logos/redrooster.webp',
    url: 'https://www.redrooster.com.au/'
  },
  {
    key: 'chickentreat',
    name: 'Chicken Treat',
    mark: 'CT',
    logo: '/eat/logos/chickentreat.webp',
    url: 'https://www.chickentreat.com.au/flock-rewards/'
  },
  {
    key: 'gyg',
    name: 'Guzman y Gomez',
    mark: 'GYG',
    logo: '/eat/logos/gyg.webp',
    url: 'https://www.guzmanygomez.com.au/'
  },
  {
    key: 'oporto',
    name: 'Oporto',
    mark: 'O',
    logo: '/eat/logos/oporto.webp',
    url: 'https://www.oporto.com.au/'
  },
  {
    key: 'nandos',
    name: "Nando's",
    mark: 'N',
    logo: '/eat/logos/nandos.webp',
    url: 'https://www.nandos.com.au/peri-perks'
  },
  {
    key: 'grilld',
    name: "Grill'd",
    mark: 'G',
    logo: '/eat/logos/grilld.webp',
    url: 'https://grilld.com.au/relish'
  },
  {
    key: 'zambrero',
    name: 'Zambrero',
    mark: 'Z',
    logo: '/eat/logos/zambrero.webp',
    url: 'https://www.zambrero.com.au/zamfam'
  },
  {
    key: 'tacobell',
    name: 'Taco Bell',
    mark: 'TB',
    logo: '/eat/logos/tacobell.webp',
    url: 'https://tacobell.com.au/'
  },
  {
    key: 'madmex',
    name: 'Mad Mex',
    mark: 'MM',
    logo: '/eat/logos/madmex.webp',
    url: 'https://www.madmex.com.au/'
  },
  {
    key: 'nene',
    name: 'NeNe Chicken',
    mark: 'NN',
    logo: '/eat/logos/nene.webp',
    url: 'https://nenechicken.com.au/locations/wa'
  },
  {
    key: 'jesters',
    name: 'Jesters',
    mark: 'J',
    logo: '/eat/logos/jesters.webp',
    url: 'https://jesters.au/stores/'
  },
  {
    key: 'schnitz',
    name: 'Schnitz',
    mark: 'S',
    logo: '/eat/logos/schnitz.webp',
    url: 'https://schnitz.com.au/'
  },
  {
    key: 'rolld',
    name: "Roll'd",
    mark: 'R',
    logo: '/eat/logos/rolld.webp',
    url: 'https://rolld.com.au/'
  },
  {
    key: 'sushisushi',
    name: 'Sushi Sushi',
    mark: 'SS',
    logo: '/eat/logos/sushisushi.webp',
    url: 'https://www.sushisushi.com.au/'
  }
];

export function eatChain(key: string): EatChain | null {
  return EAT_CHAINS.find((chain) => chain.key === key) ?? null;
}
