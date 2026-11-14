import type { AppState, User } from '../types.ts';
import { getSeedState as getClientSeedState } from '../utils/helpers.ts';

/**
 * Server-only initial user credentials.
 * Kept strictly out of client-side Vite bundles so salts and hashes are never exposed to unauthenticated browsers.
 */
export const SERVER_SEED_USERS: User[] = [
  {
    id: 1,
    name: 'Ervin Nalo',
    all: true,
    locs: [],
    acc: ['All'],
    res: [],
    user: 'enalo',
    email: 'em.nalo92@gmail.com',
    isOwner: true,
    role: 'Owner',
    salt: '4a5954c9de285fd9',
    hash: '3bb5f126e581d804065e179f997c3389776ffe5833087d0766a24a8812e7c5bd'
  },
  {
    id: 2,
    name: 'Railyn Perin',
    all: false,
    locs: ['Foodhub - Snacks, Peter Panlaman, Palamig Painit'],
    acc: ['All'],
    res: ['Restrict Profit and Loss', 'Restrict User Access', 'Restrict Google Drive'],
    user: 'rperin',
    salt: 'inv-rperin-c91d40e8',
    hash: 'f6c732ca58c6bfff91f4f56609587599b85be02f11a8e481c1f078eb57eff6a0'
  },
  {
    id: 3,
    name: 'Jennalyn Martinez',
    all: true,
    locs: [],
    acc: ['View Only'],
    res: ['Restrict User Access', 'Restrict Google Drive'],
    user: 'jmartinez',
    salt: 'inv-jmartinez-5be2a7d1',
    hash: 'b0c47e49a5b96df506d905eacba8ace97ea4c7bbe69e1f812d38ebf333f062e9'
  },
  {
    id: 4,
    name: 'Mikay Bruzula',
    all: false,
    locs: ['Zentrum - Takehome & Candy Store'],
    acc: ['All'],
    res: ['Restrict User Access', 'Restrict Google Drive'],
    user: 'mbruzula',
    salt: 'e76c1cacf9d77466',
    hash: 'a6d2f348ae7e96721d251fe587a3351c116d928f68f06a8a80a43f7f6c68e4ff'
  },
  {
    id: 5,
    name: 'Melanie Guanzon',
    all: false,
    locs: ['Cabrini - Takehome & Candy Store', 'Zentrum - Takehome & Candy Store'],
    acc: ['All'],
    res: ['Restrict Profit and Loss', 'Restrict User Access', 'Restrict Google Drive'],
    user: 'mguanzon',
    salt: '24460e4abfc18609',
    hash: '1b0159078fd328de40057d6a1312bc3c0c5db1663580a4b13f1912ffa75e255f'
  },
  {
    id: 6,
    name: 'Arlene Peligones',
    all: false,
    locs: [
      'Torres Tech Candy Store', 'YTPLC Candy Store', 'Malvar Candy Store',
      'Logistics Candy Store', 'Commissary Candy Store', 'Malvar Takehome',
      'Logistics Takehome', 'Commissary Takehome', 'Torres Tech Takehome', 'YTPLC Takehome'
    ],
    acc: ['All'],
    res: ['Restrict Profit and Loss', 'Restrict User Access', 'Restrict Google Drive'],
    user: 'apeligones',
    salt: 'c3593e45132c35b6',
    hash: 'fd00bef3244211df41365550cebc632eb03fe25a11f9fd2123293e266fe226db'
  },
  {
    id: 7,
    name: 'Markjoey Juaton',
    all: false,
    locs: ['Rest Area Candy Store'],
    acc: ['All'],
    res: ['Restrict Profit and Loss', 'Restrict User Access', 'Restrict Google Drive'],
    user: 'mjuaton',
    salt: '7f5e1be8b9026fb7',
    hash: '0e8c73e1391d61e68b98d78383d0c59a2dfc5ee8bf76c3780007fc007c345dc7'
  },
  {
    id: 8,
    name: 'Jhona Bermudez',
    all: false,
    locs: ['YTMI Takehome', 'YTP Takehome', 'YTMI Candy Store', 'YTP Candy Store'],
    acc: ['All'],
    res: ['Restrict Profit and Loss', 'Restrict User Access', 'Restrict Google Drive'],
    user: 'jbermudez',
    salt: '47737daca0b7e653',
    hash: '8b89dd29467e768037f1f97c218020df9d1b97e358d15589c485bd026759832e'
  },
  {
    id: 9,
    name: 'Apol Dimaano',
    all: true,
    locs: [],
    acc: ['View Only', 'Inventory Location', 'Cut Off Date', 'Start Date'],
    res: ['Restrict User Access', 'Restrict Google Drive', 'Restrict Profit and Loss'],
    user: 'adimaano',
    salt: '68570489216d67b1',
    hash: '773ce1109418fa74f4bf25ac6297d9d0fe8ee6f4d6fdb1cde333760df7f6b82f'
  },
  {
    id: 10,
    name: 'Roselle Gunnacao',
    all: true,
    locs: [],
    acc: ['All'],
    res: ['Restrict Profit and Loss', 'Restrict Google Drive', 'Restrict User Access'],
    user: 'rgunnacao',
    salt: 'f0488528baee1868',
    hash: 'b19d72f99c3603609915d768233eb40faaa0e28aabcf2d415c5412b4ef0c81c3'
  }
];

export function ensureServerTenUsers(existingUsers: User[] = []): User[] {
  if (Array.isArray(existingUsers) && existingUsers.length > 0) {
    const updated = existingUsers.map(u => {
      if (
        u.id === 1 ||
        u.user === 'enalo' ||
        u.user === 'admin' ||
        (u.email && u.email.toLowerCase() === 'em.nalo92@gmail.com') ||
        u.isOwner
      ) {
        return {
          ...u,
          name: u.name || 'Ervin Nalo',
          all: true,
          locs: [],
          acc: ['All'],
          res: [],
          user: u.user || 'enalo',
          email: 'em.nalo92@gmail.com',
          isOwner: true,
          role: 'Owner'
        };
      }
      return u;
    });
    const hasAdmin = updated.some(u => u.id === 1 || u.user === 'enalo' || u.user === 'admin' || u.isOwner);
    if (!hasAdmin) {
      return [SERVER_SEED_USERS[0], ...updated];
    }
    return updated;
  }
  return [...SERVER_SEED_USERS];
}

export function getServerSeedState(): AppState {
  const base = getClientSeedState();
  return {
    ...base,
    users: [...SERVER_SEED_USERS],
  };
}
