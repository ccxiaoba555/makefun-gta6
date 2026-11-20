// Vice Bay — tuning and world constants.
// One place holds every number the rest of the game balances against, so a
// tweak here (a faster car, a longer parcel timer) never means hunting
// through the update code.

export const WORLD_W = 3200;
export const WORLD_H = 2400;

export const VIEW_W = 1280;
export const VIEW_H = 800;

export const ROAD_GAP = 400; // distance between neighbouring road centrelines
export const ROAD_W = 96; // asphalt width of one road
export const FIRST_ROAD = 200; // centreline of the first road, x and y alike

export const OCEAN_EDGE = 90; // x < this is open water
export const SAND_EDGE = 170; // x < this is beach sand

export const PLAYER_WALK_SPEED = 195;
export const PLAYER_HP = 100;
export const PLAYER_RADIUS = 13;

export const CAR_ACCEL = 430;
export const CAR_MAX_SPEED = 540;
export const CAR_REVERSE_SPEED = 190;
export const CAR_TURN = 2.5; // radians per second at full lock, scaled by speed
export const CAR_BRAKE = 620;
export const CAR_DRAG = 0.55;

export const MAX_WANTED = 5;
export const WANTED_DECAY_SECONDS = 26; // quiet seconds before one star drops
export const COPS_PER_STAR = 1; // extra patrol car per wanted star, capped below

export const BULLET_SPEED = 760;
export const BULLET_RANGE = 520;
export const SHOOT_COOLDOWN = 0.28;
export const PUNCH_COOLDOWN = 0.32;
export const PUNCH_REACH = 46;

export const PARCEL_TIME_LIMIT = 75;

// The three story jobs, in order. After the third the city hands out
// repeat taxi fares so the game keeps paying.
export const MISSIONS = [
  {
    id: 'taxi',
    name: 'Cabbie for a Day',
    reward: 150,
    briefing: 'Pick up the fare waving at Coral Ave, then drop them at the Marina.',
  },
  {
    id: 'parcel',
    name: 'Hot Parcel',
    reward: 220,
    briefing: 'A sealed parcel is waiting at the depot. Deliver it across town before the timer runs out.',
  },
  {
    id: 'escape',
    name: 'Three Stars to Home',
    reward: 500,
    briefing: 'The whole precinct is on you. Lose the heat by reaching the safehouse on Gull Lane.',
  },
];

export const PALETTE = {
  grass: '#7fae5a',
  grassDark: '#74a24f',
  sand: '#e8d39a',
  ocean: '#2f7fb8',
  oceanDeep: '#256b9e',
  road: '#3c3f46',
  roadEdge: '#2c2e33',
  sidewalk: '#b9b3a4',
  laneDash: '#e8d44f',
  buildingRoof: ['#c96f4a', '#4a7fb8', '#8a6fb8', '#b84a6e', '#4ab89a', '#d8a24a'],
  buildingWall: '#5d5348',
  park: '#5da24a',
  tree: '#2f7a33',
  treeLight: '#4da34a',
  plaza: '#c9c2b2',
  hudBg: 'rgba(10, 14, 24, 0.72)',
  hudText: '#f5f2e8',
  gold: '#ffd94a',
  red: '#ff4a4a',
  blue: '#4a9dff',
};

export const CAR_COLORS = ['#d84a4a', '#4a7fd8', '#e8c33a', '#7ad84a', '#c9c9c9', '#8a5ad8', '#e87a2a', '#3ad8c9'];

export const SAVE_KEY = 'vicebay-best-v1';
