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

// Respect ranks: earned by finishing jobs and turf work. Higher respect
// slows the police response (one fewer patrol car at rank 3+) and unlocks
// the better garage tiers.
export const RESPECT_RANKS = [
  { min: 0, name: 'Rookie' },
  { min: 30, name: 'Hustler' },
  { min: 70, name: 'Runner' },
  { min: 120, name: 'Vice Bay Legend' },
];

// The crew's turf. Taking a district raises standing there.
export const DISTRICTS = [
  { name: 'Coral Row', x: 600, y: 600 },
  { name: 'Marina', x: 600, y: 2200 },
  { name: 'Gull Lane', x: 2600, y: 1800 },
  { name: 'Depot District', x: 2600, y: 600 },
];

// Radio stations: WebAudio-synthesised loops, no audio files.
export const RADIO_STATIONS = [
  { name: 'BAY FM 88', style: 'Sunset pop' },
  { name: 'NEON 101', style: 'Synthwave' },
  { name: 'GULL 94', style: 'Bass & bounce' },
];

// Weapon slots. Pistol is the quick single shot; the shotgun fires a
// five-pellet spread up close. Press Q to swap.
export const WEAPONS = [
  { id: 'pistol', name: 'Pistol', cooldown: 0.28, damage: 34, pellets: 1, spread: 0, range: 520 },
  { id: 'shotgun', name: 'Shotgun', cooldown: 0.85, damage: 16, pellets: 5, spread: 0.36, range: 340 },
];

// Garage upgrades: three tiers each, bought with job money at the garage
// on Gull Lane (press G next to it while driving).
export const GARAGE_UPGRADES = {
  engine: { name: 'Engine', prices: [200, 350, 500], desc: '+12% top speed per tier' },
  armor: { name: 'Armor', prices: [150, 250, 400], desc: 'Cop rams hurt less per tier' },
  paint: { name: 'Paint', prices: [50, 50, 50], desc: 'Fresh coat, new colour' },
};

// The eight story jobs, in order. After the eighth the city hands out
// repeat taxi fares so the game keeps paying.
// A job is a chain of stages; each stage points at a landmark, a fixed
// point, or a district. `wantedOnEnter` raises the heat when a stage
// starts, `timer` is a per-stage countdown, `timeLimit` a whole-job clock.
export const MISSIONS = [
  {
    id: 'taxi',
    name: 'Cabbie for a Day',
    reward: 150,
    respect: 10,
    briefing: 'Mara needs a driver: pick up the fare waving on Coral Ave, drop them at the Marina.',
    stages: [
      { at: 'taxiStand', label: 'PICK UP FARE' },
      { at: 'marina', label: 'DROP OFF' },
    ],
  },
  {
    id: 'parcel',
    name: 'Hot Parcel',
    reward: 220,
    respect: 10,
    briefing: 'A sealed parcel is waiting at the depot. Deliver it across town before the timer runs out.',
    stages: [
      { at: 'depot', label: 'COLLECT PARCEL' },
      { at: 'marina', label: 'DELIVER PARCEL', timer: PARCEL_TIME_LIMIT },
    ],
  },
  {
    id: 'race',
    name: 'Sunset Grand Prix',
    reward: 350,
    respect: 15,
    briefing: 'Street race! Hit all three checkpoints before the clock runs out — the whole bay is watching.',
    timeLimit: 120,
    stages: [
      { x: 2200, y: 200, label: 'CHECKPOINT 1/3' },
      { x: 2600, y: 1800, label: 'CHECKPOINT 2/3' },
      { x: 1000, y: 2200, label: 'FINISH LINE' },
    ],
  },
  {
    id: 'escort',
    name: 'Harbor Run',
    reward: 300,
    respect: 15,
    briefing: 'Smuggled crates at the Marina need a quiet ride to the depot. The harbour patrol will notice.',
    stages: [
      { at: 'marina', label: 'LOAD THE CRATES' },
      { at: 'depot', label: 'DELIVER QUIETLY', wantedOnEnter: 1 },
    ],
  },
  {
    id: 'turf',
    name: 'Turf War: Coral Row',
    reward: 400,
    respect: 20,
    briefing: 'The Coral Row crew is moving in. Plant the flag on three corners and the street is ours.',
    stages: [
      { district: 'Coral Row', label: 'CLAIM CORAL ROW' },
      { x: 1800, y: 1400, label: 'CLAIM MIDTOWN' },
      { x: 1000, y: 1800, label: 'CLAIM GULL LANE' },
    ],
  },
  {
    id: 'rescue',
    name: 'Get Rico Out',
    reward: 450,
    respect: 20,
    briefing: 'Rico got pinched near the depot. Break him out and get him to the safehouse — fast, before the precinct locks down.',
    timeLimit: 110,
    stages: [
      { at: 'depot', label: 'FIND RICO', wantedOnEnter: 2 },
      { at: 'safehouse', label: 'SAFEHOUSE' },
    ],
  },
  {
    id: 'getaway',
    name: 'Midnight Run',
    reward: 550,
    respect: 25,
    briefing: 'Four stars, one car, no backup. Outrun the roadblocks and the chopper and vanish at the safehouse.',
    timeLimit: 90,
    stages: [
      { at: 'safehouse', label: 'SAFEHOUSE', wantedOnEnter: 4 },
    ],
  },
  {
    id: 'escape',
    name: 'Three Stars to Home',
    reward: 500,
    respect: 25,
    briefing: 'The whole precinct is on you. Lose the heat by reaching the safehouse on Gull Lane.',
    stages: [
      { at: 'safehouse', label: 'SAFEHOUSE', wantedOnEnter: 3 },
    ],
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
