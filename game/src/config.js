// Vice Bay — tuning numbers and colours in one place.
// Top-down open world, 3200x2400, drawn through a 1280x720 logical viewport
// with a camera that follows the player. Fixed 1/60 s simulation step.

export const WORLD = { width: 3200, height: 2400 };
export const VIEW = { width: 1280, height: 720 };
export const STEP = 1 / 60;

// Road grid: vertical roads at these x, horizontal at these y; road width 110.
export const ROADS_X = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000];
export const ROADS_Y = [200, 600, 1000, 1400, 1800, 2200];
export const ROAD_W = 110;

export const PLAYER = {
  radius: 13,
  walkSpeed: 230,
  hp: 100,
  punchDamage: 34,
  punchRange: 46,
  punchCooldown: 0.38,
  shootCooldown: 0.22,
  bulletSpeed: 760,
  bulletRange: 620,
  startAmmo: 12,
};

export const CAR = {
  width: 34,
  length: 62,
  maxSpeed: 540,
  accel: 420,
  brake: 620,
  reverseMax: 180,
  turnRate: 2.6, // rad/s at full steer, scaled down at very low speed
  drag: 0.55,
};

export const TRAFFIC = { count: 14, speedMin: 120, speedMax: 185 };
export const PEDS = { count: 22, speedMin: 32, speedMax: 62 };
export const POLICE = { maxSpeed: 500, ramDamage: 6 };

export const WANTED = {
  maxStars: 3,
  decayDelay: 9, // seconds with no police in range before a star drops
  decayInterval: 7,
};

export const MISSIONS = [
  {
    name: 'Taxi Fare',
    intro: 'Pick up the fare at the yellow marker, then drive them to the hotel.',
    reward: 80,
    timeLimit: 0, // no limit for the intro job
  },
  {
    name: 'Hot Parcel',
    intro: 'Grab the parcel and deliver it before the timer runs out!',
    reward: 120,
    timeLimit: 50,
  },
  {
    name: 'Heat Escape',
    intro: '3 stars! Lose the cops and reach the safehouse. Do not get busted.',
    reward: 200,
    timeLimit: 0,
  },
];

// Fixed mission landmarks (road intersections, so a car can always reach them).
export const SPOTS = {
  playerStart: { x: 600, y: 1000 },
  taxiPickup: { x: 1000, y: 600 },
  taxiDrop: { x: 2200, y: 1400 },
  parcelPickup: { x: 1800, y: 600 },
  parcelDrop: { x: 600, y: 1800 },
  safehouse: { x: 3000, y: 2200 },
};

export const PALETTE = {
  backdrop: '#0b0e14',
  grass: '#2e6b34',
  grassAlt: '#2a6130',
  sidewalk: '#8d8f96',
  road: '#23262e',
  roadLine: '#e8c93a',
  water: '#1d6f9e',
  sand: '#d9c48a',
  building: ['#7a4a3a', '#4a6a8a', '#8a6a3a', '#5a4a7a', '#3a7a6a', '#8a3a4a'],
  buildingRoof: '#00000033',
  player: '#ffd23f',
  playerCar: '#ffcf3d',
  taxi: '#ffd23f',
  traffic: ['#e5534b', '#4fc3f7', '#f2f2f2', '#9b59b6', '#2ecc71', '#e67e22'],
  police: '#2f6fd0',
  ped: ['#f2c94c', '#e88ca0', '#7ad0a0', '#c0c8d8', '#f0924f'],
  bullet: '#ffe066',
  pickupAmmo: '#4fc3f7',
  pickupHealth: '#ff5a5a',
  pickupCash: '#7CFC00',
  marker: '#ffe14d',
  text: '#eef1f5',
  muted: '#aab2c0',
  panel: '#141821ee',
  hudBg: '#00000088',
  star: '#ffd23f',
  danger: '#ff5a5a',
  good: '#7CFC00',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** localStorage keys: best money, missions completed, muted flag. */
export const SAVE_KEY = 'vice-bay.save.v1';
