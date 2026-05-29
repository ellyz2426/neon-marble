// types.ts — Game types, constants, level data, state manager
import * as THREE from 'three';

// Tile types for maze grid
export const TILE = {
  EMPTY: 0,   // open path
  WALL: 1,    // solid wall block
  HOLE: 2,    // pit trap — lose a life
  GEM: 3,     // collectible gem
  GOAL: 4,    // level exit
  START: 5,   // spawn position
  TELE_A: 6,  // teleporter pair A
  TELE_B: 7,  // teleporter pair B
  ICE: 8,     // reduced friction zone
  BOOST: 9,         // speed boost pad
  POWERUP_SHIELD: 10, // shield — survive one fall
  POWERUP_MAGNET: 11, // magnet — attract nearby gems
  POWERUP_SLOWMO: 12, // slow-motion — reduce speed for precision
  MOVING_WALL: 13,    // wall that oscillates between positions
  GRAVITY_SWITCH: 14, // reverses tilt gravity for marble
  BUMPER: 15,         // bouncy bumper — launches marble away with extra force
} as const;

export type TileType = typeof TILE[keyof typeof TILE];

export interface LevelDef {
  name: string;
  grid: number[][];
  par: number;       // par time in seconds
  gems: number;      // total gems
}

export type GameState = 'title' | 'modeselect' | 'levelselect' | 'playing' | 'paused'
  | 'levelcomplete' | 'gameover' | 'leaderboard' | 'achievements' | 'settings' | 'help'
  | 'stats' | 'skins';
export type GameMode = 'campaign' | 'timeattack' | 'zen' | 'daily';

export const BOARD_CELL = 0.12;           // meters per grid cell
export const MARBLE_RADIUS = 0.035;       // marble sphere radius
export const WALL_HEIGHT = 0.06;          // wall block height
export const BOARD_THICKNESS = 0.015;     // board base thickness
export const MAX_TILT = 0.18;             // max tilt angle in radians (~10 deg)
export const TILT_SPEED = 0.6;            // radians/sec for keyboard input
export const GRAVITY = 9.81;              // m/s^2
export const FRICTION = 0.985;            // rolling friction per frame
export const ICE_FRICTION = 0.998;        // ice zone friction
export const BOUNCE_DAMP = 0.5;           // wall bounce damping
export const BOOST_IMPULSE = 0.8;         // boost pad impulse strength
export const MARBLE_MAX_SPEED = 2.5;      // max marble velocity

// ---- Level definitions ----

export const LEVELS: LevelDef[] = [
  {
    name: 'First Steps',
    par: 15,
    gems: 2,
    grid: [
      [1,1,1,1,1,1,1,1],
      [1,5,0,0,1,0,3,1],
      [1,0,1,0,1,0,0,1],
      [1,0,1,0,0,0,1,1],
      [1,0,0,0,1,0,0,1],
      [1,1,1,0,1,0,0,1],
      [1,3,0,0,0,0,4,1],
      [1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'Pit Stop',
    par: 20,
    gems: 3,
    grid: [
      [1,1,1,1,1,1,1,1,1],
      [1,5,0,0,2,0,0,3,1],
      [1,0,1,1,1,1,0,0,1],
      [1,0,0,3,0,0,0,1,1],
      [1,1,0,1,1,2,0,0,1],
      [1,0,0,0,1,0,0,0,1],
      [1,3,1,0,0,0,1,0,1],
      [1,0,0,0,1,0,0,4,1],
      [1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'Icy Crossing',
    par: 25,
    gems: 3,
    grid: [
      [1,1,1,1,1,1,1,1,1],
      [1,5,0,0,1,0,0,0,1],
      [1,0,1,0,1,8,8,0,1],
      [1,3,0,0,0,8,8,0,1],
      [1,1,1,0,1,1,0,1,1],
      [1,0,0,0,2,0,0,0,1],
      [1,0,1,1,1,0,1,3,1],
      [1,3,0,0,0,0,0,4,1],
      [1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'Warp Zone',
    par: 25,
    gems: 4,
    grid: [
      [1,1,1,1,1,1,1,1,1,1],
      [1,5,0,3,1,0,0,0,0,1],
      [1,0,1,0,1,0,1,1,0,1],
      [1,0,1,6,0,0,1,3,0,1],
      [1,0,0,0,1,1,1,0,0,1],
      [1,1,1,0,0,2,0,0,1,1],
      [1,0,0,0,1,0,7,0,0,1],
      [1,3,1,0,1,0,1,1,0,1],
      [1,0,0,3,0,0,0,0,4,1],
      [1,1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'Boost Run',
    par: 20,
    gems: 3,
    grid: [
      [1,1,1,1,1,1,1,1,1],
      [1,5,0,9,0,0,0,0,1],
      [1,1,1,1,1,1,0,1,1],
      [1,3,0,0,9,0,0,0,1],
      [1,0,1,1,1,1,1,0,1],
      [1,0,0,0,0,3,1,0,1],
      [1,1,0,1,1,0,1,0,1],
      [1,3,0,9,0,0,0,4,1],
      [1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'The Gauntlet',
    par: 35,
    gems: 5,
    grid: [
      [1,1,1,1,1,1,1,1,1,1],
      [1,5,0,0,2,0,3,0,0,1],
      [1,0,1,0,1,0,1,0,1,1],
      [1,0,1,3,0,0,1,0,0,1],
      [1,0,0,0,1,2,0,0,1,1],
      [1,1,0,1,0,0,1,3,0,1],
      [1,0,0,2,0,0,0,0,0,1],
      [1,3,1,1,1,0,1,1,0,1],
      [1,0,0,0,0,0,2,0,4,1],
      [1,1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'Teleport Maze',
    par: 40,
    gems: 4,
    grid: [
      [1,1,1,1,1,1,1,1,1,1,1],
      [1,5,0,0,1,0,0,0,1,0,1],
      [1,0,1,0,1,6,1,0,1,0,1],
      [1,0,1,3,0,0,1,0,0,3,1],
      [1,0,0,0,1,1,1,0,1,0,1],
      [1,1,1,0,0,0,2,0,7,0,1],
      [1,3,0,0,1,0,1,1,1,0,1],
      [1,0,1,0,1,0,0,0,0,0,1],
      [1,0,1,7,0,0,1,3,1,6,1],
      [1,0,0,0,1,0,0,0,0,4,1],
      [1,1,1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'Ice Palace',
    par: 30,
    gems: 4,
    grid: [
      [1,1,1,1,1,1,1,1,1,1],
      [1,5,8,8,8,8,0,0,0,1],
      [1,0,1,1,1,8,1,1,3,1],
      [1,0,0,3,1,8,0,0,0,1],
      [1,1,0,0,0,8,8,0,1,1],
      [1,0,0,1,2,0,8,0,0,1],
      [1,3,1,1,0,0,1,1,0,1],
      [1,0,0,0,0,1,0,3,0,1],
      [1,0,1,0,0,0,0,0,4,1],
      [1,1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'Danger Zone',
    par: 45,
    gems: 5,
    grid: [
      [1,1,1,1,1,1,1,1,1,1,1],
      [1,5,0,0,2,0,0,2,0,3,1],
      [1,0,1,0,1,0,1,0,1,0,1],
      [1,3,0,0,0,0,2,0,0,0,1],
      [1,1,1,0,1,1,1,0,1,1,1],
      [1,0,2,0,0,3,0,0,2,0,1],
      [1,0,1,1,0,1,0,1,1,0,1],
      [1,0,0,0,0,1,3,0,0,0,1],
      [1,1,0,1,2,0,0,1,0,1,1],
      [1,3,0,0,0,0,0,0,0,4,1],
      [1,1,1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'Warp Madness',
    par: 50,
    gems: 6,
    grid: [
      [1,1,1,1,1,1,1,1,1,1,1,1],
      [1,5,0,0,1,3,0,0,1,0,0,1],
      [1,0,1,6,1,0,1,0,1,0,3,1],
      [1,0,0,0,0,0,1,2,0,0,0,1],
      [1,1,0,1,1,0,1,1,1,0,1,1],
      [1,3,0,0,7,0,0,0,6,0,0,1],
      [1,0,1,1,1,0,1,0,1,1,0,1],
      [1,0,0,2,0,0,3,0,0,0,0,1],
      [1,1,0,0,1,1,1,0,1,0,1,1],
      [1,0,7,0,0,0,0,0,1,3,0,1],
      [1,3,0,0,1,0,0,0,0,0,4,1],
      [1,1,1,1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'The Labyrinth',
    par: 60,
    gems: 7,
    grid: [
      [1,1,1,1,1,1,1,1,1,1,1,1],
      [1,5,0,0,1,0,3,0,1,0,0,1],
      [1,1,1,0,1,0,1,0,0,0,3,1],
      [1,0,0,0,0,0,1,1,1,0,1,1],
      [1,0,1,1,1,0,0,0,1,0,0,1],
      [1,0,2,0,1,0,1,3,0,0,1,1],
      [1,0,1,0,0,0,1,1,1,0,0,1],
      [1,3,1,0,1,0,0,0,0,0,1,1],
      [1,0,0,0,1,1,1,0,1,0,0,1],
      [1,0,1,3,0,0,0,0,1,0,3,1],
      [1,0,0,0,1,0,3,0,0,0,4,1],
      [1,1,1,1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'Grand Finale',
    par: 75,
    gems: 8,
    grid: [
      [1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,5,0,0,1,3,0,2,0,0,0,0,1],
      [1,0,1,0,1,0,1,1,0,1,1,3,1],
      [1,0,1,6,0,0,0,0,0,0,1,0,1],
      [1,3,0,0,1,1,1,0,1,0,0,0,1],
      [1,1,1,0,0,2,0,0,1,0,1,0,1],
      [1,0,0,0,1,0,1,3,0,0,1,0,1],
      [1,0,1,0,1,7,1,1,1,0,0,3,1],
      [1,3,1,0,0,0,0,2,0,0,1,0,1],
      [1,0,0,0,1,1,0,0,1,0,1,0,1],
      [1,0,1,3,0,0,0,0,1,6,0,0,1],
      [1,0,0,0,1,0,3,0,0,0,0,4,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1],
    ],
  },
  // --- New levels (13-18) with power-ups ---
  {
    name: 'Power Up',
    par: 30,
    gems: 4,
    grid: [
      [1,1,1,1,1,1,1,1,1],
      [1,5,0,0,1,0,10,0,1],
      [1,0,1,3,0,0,1,0,1],
      [1,0,0,0,1,0,0,3,1],
      [1,1,0,1,2,1,0,1,1],
      [1,11,0,0,0,0,3,0,1],
      [1,0,1,0,1,0,1,0,1],
      [1,3,0,0,12,0,0,4,1],
      [1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'Frozen Fortress',
    par: 35,
    gems: 5,
    grid: [
      [1,1,1,1,1,1,1,1,1,1],
      [1,5,8,8,1,0,0,10,0,1],
      [1,0,1,8,1,0,1,1,3,1],
      [1,3,0,8,0,0,8,8,0,1],
      [1,1,0,1,1,8,8,0,1,1],
      [1,0,0,2,0,8,1,0,0,1],
      [1,11,1,1,0,0,0,3,0,1],
      [1,0,0,3,0,1,0,1,0,1],
      [1,3,0,0,12,0,0,0,4,1],
      [1,1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'Speed Trap',
    par: 30,
    gems: 5,
    grid: [
      [1,1,1,1,1,1,1,1,1,1],
      [1,5,9,0,0,2,0,3,0,1],
      [1,0,1,1,0,1,9,1,0,1],
      [1,3,0,0,0,0,0,0,10,1],
      [1,1,9,1,1,0,1,0,1,1],
      [1,0,0,2,0,0,9,0,0,1],
      [1,0,1,0,1,3,1,1,0,1],
      [1,12,0,3,0,0,0,3,0,1],
      [1,0,1,0,1,0,9,0,4,1],
      [1,1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'Warp Matrix',
    par: 50,
    gems: 6,
    grid: [
      [1,1,1,1,1,1,1,1,1,1,1],
      [1,5,0,0,1,6,0,0,1,3,1],
      [1,0,1,0,1,0,1,3,0,0,1],
      [1,0,7,0,0,0,1,0,1,0,1],
      [1,3,1,1,1,0,0,0,6,0,1],
      [1,0,0,10,0,0,1,1,1,0,1],
      [1,0,1,1,1,0,7,0,0,3,1],
      [1,0,0,0,0,0,1,0,1,0,1],
      [1,1,0,1,3,11,0,0,1,0,1],
      [1,3,0,0,1,0,0,0,0,4,1],
      [1,1,1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'The Crucible',
    par: 60,
    gems: 7,
    grid: [
      [1,1,1,1,1,1,1,1,1,1,1,1],
      [1,5,0,0,2,0,3,8,8,0,0,1],
      [1,0,1,0,1,0,1,8,1,0,3,1],
      [1,10,0,0,0,0,0,0,0,0,1,1],
      [1,1,1,0,1,6,1,0,1,0,0,1],
      [1,0,2,0,3,0,0,0,9,0,1,1],
      [1,3,1,0,1,0,1,1,1,0,0,1],
      [1,0,0,0,0,0,7,0,0,0,3,1],
      [1,0,1,1,1,2,1,0,1,11,0,1],
      [1,0,12,0,3,0,0,0,1,0,0,1],
      [1,3,0,0,1,0,0,0,0,0,4,1],
      [1,1,1,1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'Infinity Run',
    par: 90,
    gems: 10,
    grid: [
      [1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,5,0,3,1,0,2,0,10,0,0,3,1],
      [1,0,1,0,1,0,1,1,0,1,0,0,1],
      [1,0,0,0,6,0,0,3,0,1,0,1,1],
      [1,1,0,1,1,8,8,1,0,0,0,0,1],
      [1,3,0,2,0,8,8,0,0,1,3,0,1],
      [1,0,1,0,1,1,1,0,1,0,1,0,1],
      [1,0,0,0,0,3,0,0,7,0,0,0,1],
      [1,1,11,1,0,1,0,1,1,0,1,0,1],
      [1,0,0,2,0,0,0,3,0,0,12,0,1],
      [1,3,1,0,1,0,1,0,1,0,1,0,1],
      [1,0,0,0,0,0,3,0,0,0,0,4,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1],
    ],
  },
  // --- Levels 19-24: Endgame gauntlet with moving walls and gravity switches ---
  {
    name: 'Shifting Walls',
    par: 45,
    gems: 5,
    grid: [
      [1,1,1,1,1,1,1,1,1,1],
      [1,5,0,0,13,0,0,3,0,1],
      [1,0,1,0,1,0,1,0,0,1],
      [1,3,0,0,0,13,0,0,1,1],
      [1,1,0,1,1,0,1,3,0,1],
      [1,0,0,13,0,0,0,0,0,1],
      [1,0,1,0,1,0,1,0,1,1],
      [1,3,0,0,0,0,13,0,0,1],
      [1,0,1,3,0,10,0,0,4,1],
      [1,1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'Gravity Flip',
    par: 40,
    gems: 5,
    grid: [
      [1,1,1,1,1,1,1,1,1,1],
      [1,5,0,0,14,0,0,3,0,1],
      [1,0,1,3,1,0,1,0,0,1],
      [1,0,0,0,0,0,14,0,1,1],
      [1,1,0,1,2,1,0,0,0,1],
      [1,3,0,0,0,0,1,0,0,1],
      [1,0,1,14,1,0,0,3,0,1],
      [1,0,0,0,0,0,1,0,0,1],
      [1,3,0,11,0,0,0,0,4,1],
      [1,1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'Chaos Engine',
    par: 55,
    gems: 7,
    grid: [
      [1,1,1,1,1,1,1,1,1,1,1],
      [1,5,0,13,0,0,3,0,14,0,1],
      [1,0,1,0,1,0,1,0,1,0,1],
      [1,3,0,0,14,0,13,0,0,3,1],
      [1,1,0,1,0,2,0,1,0,1,1],
      [1,0,0,0,0,10,0,0,0,0,1],
      [1,0,1,3,1,0,1,14,0,0,1],
      [1,0,13,0,0,0,0,0,1,3,1],
      [1,3,0,0,1,0,13,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,4,1],
      [1,1,1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'Frozen Gauntlet',
    par: 65,
    gems: 8,
    grid: [
      [1,1,1,1,1,1,1,1,1,1,1,1],
      [1,5,8,8,13,0,3,0,14,0,0,1],
      [1,0,1,8,1,0,1,0,1,0,3,1],
      [1,3,0,8,0,0,0,0,0,0,1,1],
      [1,1,0,1,1,2,13,1,0,0,0,1],
      [1,0,8,0,0,0,8,8,0,3,0,1],
      [1,0,1,3,1,14,1,0,1,0,1,1],
      [1,10,0,0,0,0,0,0,13,0,0,1],
      [1,1,0,1,3,0,1,0,1,0,0,1],
      [1,0,0,0,1,2,0,0,0,0,3,1],
      [1,3,12,0,0,0,14,0,0,0,4,1],
      [1,1,1,1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'Warp Nightmare',
    par: 75,
    gems: 9,
    grid: [
      [1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,5,0,0,13,0,6,3,0,14,0,0,1],
      [1,0,1,3,1,0,1,0,1,0,1,0,1],
      [1,0,0,0,0,14,0,0,13,0,0,3,1],
      [1,1,0,1,1,0,1,2,1,0,1,0,1],
      [1,3,0,0,7,0,0,0,0,0,0,0,1],
      [1,0,1,0,1,13,1,0,1,14,1,0,1],
      [1,0,13,0,0,0,3,0,0,0,0,3,1],
      [1,3,1,0,1,0,1,6,1,0,1,0,1],
      [1,0,0,0,0,14,0,0,0,0,13,0,1],
      [1,0,1,3,1,0,1,0,1,3,0,0,1],
      [1,11,0,0,7,0,0,0,0,0,0,4,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'The Singularity',
    par: 100,
    gems: 12,
    grid: [
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,5,0,3,13,0,0,2,0,14,0,3,0,1],
      [1,0,1,0,1,0,1,1,0,1,0,0,0,1],
      [1,0,14,0,0,0,3,0,0,13,0,1,3,1],
      [1,3,1,1,1,0,1,0,1,0,1,0,0,1],
      [1,0,0,0,6,0,0,0,13,0,0,0,1,1],
      [1,0,1,0,1,2,1,14,1,0,1,3,0,1],
      [1,10,0,0,0,0,3,0,0,0,0,0,0,1],
      [1,1,13,1,0,1,1,0,1,0,1,0,1,1],
      [1,3,0,0,0,0,7,0,14,0,13,0,0,1],
      [1,0,1,0,1,3,1,0,1,0,1,3,0,1],
      [1,0,14,0,0,0,0,0,0,0,0,0,0,1],
      [1,3,0,12,1,0,3,0,1,0,3,0,4,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ],
  },
  // ---- Bumper levels (25-30) ----
  {
    name: 'Bumper Alley',
    par: 25,
    gems: 4,
    grid: [
      [1,1,1,1,1,1,1,1,1,1],
      [1,5,0,0,15,0,0,3,0,1],
      [1,0,1,0,0,0,1,0,0,1],
      [1,3,0,15,0,0,15,0,3,1],
      [1,0,1,0,0,0,0,1,0,1],
      [1,0,0,0,15,0,0,0,0,1],
      [1,1,0,0,0,0,1,0,1,1],
      [1,0,0,15,0,15,0,0,0,1],
      [1,3,0,0,0,0,0,0,4,1],
      [1,1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'Bumper Cascade',
    par: 35,
    gems: 5,
    grid: [
      [1,1,1,1,1,1,1,1,1,1,1],
      [1,5,0,3,0,15,0,0,0,0,1],
      [1,0,15,0,0,0,0,1,3,0,1],
      [1,0,0,0,15,0,0,0,0,0,1],
      [1,3,0,0,0,0,15,0,0,1,1],
      [1,1,0,15,0,0,0,0,15,0,1],
      [1,0,0,0,0,15,0,0,0,0,1],
      [1,0,15,0,0,0,0,15,0,3,1],
      [1,3,0,0,15,0,0,0,0,0,1],
      [1,0,0,0,0,0,15,0,0,4,1],
      [1,1,1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'Pinball Maze',
    par: 40,
    gems: 6,
    grid: [
      [1,1,1,1,1,1,1,1,1,1,1,1],
      [1,5,0,0,15,0,3,0,15,0,0,1],
      [1,0,1,0,0,0,0,0,0,0,3,1],
      [1,3,0,15,0,2,0,15,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,1,0,1],
      [1,0,15,0,1,15,1,0,15,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,3,1],
      [1,1,0,15,0,2,0,15,0,0,0,1],
      [1,3,0,0,0,0,0,0,0,1,0,1],
      [1,0,0,15,0,0,0,15,0,0,3,1],
      [1,0,0,0,0,0,0,0,0,0,4,1],
      [1,1,1,1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'Bumper Ice Rink',
    par: 45,
    gems: 5,
    grid: [
      [1,1,1,1,1,1,1,1,1,1,1],
      [1,5,8,8,15,8,8,0,0,0,1],
      [1,8,1,8,8,8,1,0,1,3,1],
      [1,3,8,15,8,8,15,8,0,0,1],
      [1,8,8,8,1,8,8,8,8,0,1],
      [1,0,15,8,8,8,1,15,8,3,1],
      [1,0,0,8,15,8,8,8,0,0,1],
      [1,3,0,0,8,8,15,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,3,1],
      [1,0,0,0,0,0,0,0,0,4,1],
      [1,1,1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'Gravity Bumpers',
    par: 55,
    gems: 6,
    grid: [
      [1,1,1,1,1,1,1,1,1,1,1,1],
      [1,5,0,0,14,0,15,0,0,3,0,1],
      [1,0,1,15,0,0,0,0,1,0,0,1],
      [1,3,0,0,0,15,0,0,0,15,3,1],
      [1,0,0,1,0,0,14,0,0,0,0,1],
      [1,0,15,0,0,2,0,0,15,0,0,1],
      [1,3,0,0,0,0,0,0,0,0,1,1],
      [1,1,0,15,14,0,15,0,0,3,0,1],
      [1,0,0,0,0,0,0,0,15,0,0,1],
      [1,0,15,0,0,0,0,0,0,0,3,1],
      [1,0,0,0,0,0,0,0,0,0,4,1],
      [1,1,1,1,1,1,1,1,1,1,1,1],
    ],
  },
  {
    name: 'The Gauntlet II',
    par: 70,
    gems: 8,
    grid: [
      [1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,5,0,3,15,0,0,2,0,15,0,3,1],
      [1,0,1,0,0,0,1,0,0,0,1,0,1],
      [1,15,0,0,14,0,15,0,14,0,0,15,1],
      [1,0,0,1,0,2,0,0,1,0,0,0,1],
      [1,3,15,0,0,0,13,0,0,15,3,0,1],
      [1,1,0,0,15,0,0,0,15,0,0,1,1],
      [1,0,0,0,0,0,15,0,0,0,0,0,1],
      [1,0,15,0,1,0,0,0,1,0,15,0,1],
      [1,3,0,0,13,0,15,0,14,0,0,3,1],
      [1,0,0,15,0,2,0,0,0,15,0,0,1],
      [1,3,0,0,0,0,0,0,0,0,0,4,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1],
    ],
  },
];

// ---- Star rating ----
export function calcStars(elapsedTime: number, par: number, gemsCollected: number, gemsTotal: number): number {
  if (gemsCollected >= gemsTotal && elapsedTime < par) return 3;  // all gems + under par
  if (elapsedTime < par) return 2;                                // under par
  return 1;                                                       // completed
}

// ---- Marble skins ----
export interface MarbleSkin {
  id: string;
  name: string;
  color: number;
  emissive: number;
  glow: number;
}

export const MARBLE_SKINS: MarbleSkin[] = [
  { id: 'default', name: 'Neon Cyan', color: 0x00ddff, emissive: 0x00ddff, glow: 0x00ffff },
  { id: 'fire', name: 'Solar Flare', color: 0xff6633, emissive: 0xff4400, glow: 0xff8800 },
  { id: 'ice', name: 'Frost Core', color: 0xaaddff, emissive: 0x88bbff, glow: 0xccddff },
  { id: 'toxic', name: 'Toxic Pulse', color: 0x44ff66, emissive: 0x22ff44, glow: 0x66ff88 },
  { id: 'royal', name: 'Royal Ember', color: 0xcc66ff, emissive: 0xaa44ff, glow: 0xdd88ff },
  { id: 'gold', name: 'Molten Gold', color: 0xffd700, emissive: 0xffaa00, glow: 0xffdd44 },
  { id: 'void', name: 'Void Walker', color: 0x331155, emissive: 0x6622aa, glow: 0x8844cc },
  { id: 'chrome', name: 'Chrome Pulse', color: 0xcccccc, emissive: 0xffffff, glow: 0xeeeeff },
  { id: 'diamond', name: 'Diamond Core', color: 0xbbddff, emissive: 0x99ccff, glow: 0xddeeff },
  { id: 'nebula', name: 'Nebula Drift', color: 0xff44aa, emissive: 0xdd2288, glow: 0xff66cc },
  { id: 'emerald', name: 'Emerald Vein', color: 0x22cc66, emissive: 0x11aa44, glow: 0x44ee88 },
  { id: 'obsidian', name: 'Obsidian Shard', color: 0x222222, emissive: 0x880044, glow: 0xaa0055 },
];

// ---- Themes ----
export interface BoardTheme {
  name: string;
  wall: number;
  floor: number;
  accent: number;
  gem: number;
  goal: number;
  marble: number;
  glow: number;
}

export const THEMES: BoardTheme[] = [
  { name: 'Neon Holodeck', wall: 0x00ffff, floor: 0x0a0a1a, accent: 0x00ffff, gem: 0xffff00, goal: 0x00ff88, marble: 0x00ddff, glow: 0x00ffff },
  { name: 'Crimson Grid', wall: 0xff3366, floor: 0x1a0a0a, accent: 0xff3366, gem: 0xffaa00, goal: 0x00ff66, marble: 0xff5588, glow: 0xff3366 },
  { name: 'Toxic Neon', wall: 0x33ff66, floor: 0x0a1a0a, accent: 0x33ff66, gem: 0xff00ff, goal: 0xffff33, marble: 0x66ff88, glow: 0x33ff66 },
  { name: 'Ultra Violet', wall: 0xaa44ff, floor: 0x0a0a1a, accent: 0xaa44ff, gem: 0x00ffff, goal: 0xff88ff, marble: 0xcc66ff, glow: 0xaa44ff },
  { name: 'Solar Blaze', wall: 0xff8800, floor: 0x1a0f0a, accent: 0xff8800, gem: 0x00ffff, goal: 0xffdd33, marble: 0xffaa44, glow: 0xff8800 },
];

// ---- Achievements ----
export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_clear', name: 'First Clear', desc: 'Complete your first level' },
  { id: 'gem_collector', name: 'Gem Collector', desc: 'Collect 10 gems total' },
  { id: 'speed_demon', name: 'Speed Demon', desc: 'Beat a level under par time' },
  { id: 'perfect_run', name: 'Perfect Run', desc: 'Collect all gems in a level' },
  { id: 'no_deaths', name: 'Survivor', desc: 'Complete 3 levels without falling' },
  { id: 'campaign_half', name: 'Halfway There', desc: 'Complete 6 campaign levels' },
  { id: 'campaign_done', name: 'Champion', desc: 'Complete all campaign levels' },
  { id: 'zen_master', name: 'Zen Master', desc: 'Complete a level in Zen mode' },
  { id: 'time_attack_3', name: 'Speedrunner', desc: 'Complete 3 Time Attack levels' },
  { id: 'gems_25', name: 'Gem Hoarder', desc: 'Collect 25 gems total' },
  { id: 'gems_50', name: 'Gem Addict', desc: 'Collect 50 gems total' },
  { id: 'daily_3', name: 'Daily Player', desc: 'Complete 3 daily challenges' },
  { id: 'warp_5', name: 'Warp Traveler', desc: 'Use teleporters 5 times' },
  { id: 'under_10', name: 'Lightning Fast', desc: 'Beat any level in under 10s' },
  { id: 'all_perfect', name: 'Perfectionist', desc: 'Get all gems on 6 levels' },
  { id: 'falls_0', name: 'Iron Marble', desc: 'Beat campaign without any falls' },
  { id: 'boost_10', name: 'Turbo Roller', desc: 'Hit 10 boost pads total' },
  { id: 'theme_all', name: 'Decorator', desc: 'Try all board themes' },
  { id: 'streak_3', name: 'On a Roll', desc: 'Complete 3 levels in a row' },
  { id: 'total_20', name: 'Veteran', desc: 'Complete 20 levels total' },
  { id: 'powerup_first', name: 'Powered Up', desc: 'Collect your first power-up' },
  { id: 'shield_save', name: 'Guardian Angel', desc: 'Survive a fall with shield' },
  { id: 'three_stars', name: 'Triple Star', desc: 'Get 3 stars on any level' },
  { id: 'all_stars', name: 'Constellation', desc: 'Get 3 stars on all levels' },
  { id: 'skin_all', name: 'Fashionista', desc: 'Try all marble skins' },
  { id: 'gems_100', name: 'Gem Lord', desc: 'Collect 100 gems total' },
  { id: 'magnet_gems', name: 'Attraction', desc: 'Collect 5 gems with magnet active' },
  { id: 'slowmo_clear', name: 'Time Bender', desc: 'Clear a level with slow-mo active' },
  { id: 'speed_5', name: 'Speed Freak', desc: 'Beat 5 levels under par' },
  { id: 'total_50', name: 'Legend', desc: 'Complete 50 levels total' },
  { id: 'gravity_master', name: 'Gravity Master', desc: 'Clear a gravity switch level' },
  { id: 'wall_dodger', name: 'Wall Dodger', desc: 'Clear a moving wall level without dying' },
  { id: 'endgame', name: 'Endgame', desc: 'Complete The Singularity' },
  { id: 'all_24', name: 'Completionist', desc: 'Clear all 24 campaign levels' },
  { id: 'skins_all', name: 'Collector', desc: 'Try all 12 marble skins' },
  { id: 'bumper_10', name: 'Pinball Wizard', desc: 'Hit 10 bumpers total' },
  { id: 'combo_3', name: 'Combo Starter', desc: 'Get a 3x gem combo' },
  { id: 'combo_5', name: 'Combo King', desc: 'Get a 5x gem combo' },
  { id: 'total_100', name: 'Marathon Runner', desc: 'Complete 100 levels total' },
  { id: 'all_30', name: 'True Completionist', desc: 'Clear all 30 campaign levels' },
];

// ---- State manager ----
export class GameStateManager {
  state: GameState = 'title';
  mode: GameMode = 'campaign';
  level = 0;
  lives = 3;
  score = 0;
  gemsCollected = 0;
  gemsTotal = 0;
  startTime = 0;
  elapsedTime = 0;
  totalFalls = 0;
  streak = 0;
  warpsUsed = 0;
  boostsHit = 0;
  themesUsed = new Set<number>();
  currentTheme = 0;

  // Power-up state
  shieldActive = false;
  magnetActive = false;
  slowmoActive = false;
  shieldTimer = 0;
  magnetTimer = 0;
  slowmoTimer = 0;
  powerupsCollected = 0;
  shieldsUsed = 0;

  // Marble skin
  currentSkin = 0;
  skinsUsed = new Set<number>();

  // Gravity state (toggled by gravity switch tiles)
  gravityFlipped = false;

  // Combo state
  comboCount = 0;
  comboTimer = 0;
  maxCombo = 0;
  bumpersHit = 0;

  // Star ratings per level
  starRatings: number[] = new Array(LEVELS.length).fill(0);

  // persistent stats
  totalGems = 0;
  totalClears = 0;
  totalDeaths = 0;
  dailyCompleted = 0;
  perfectLevels = 0;
  timeAttackClears = 0;
  noDeathStreak = 0;
  totalPlayTime = 0;     // total seconds played
  fastestClear = Infinity; // fastest level clear time
  longestStreak = 0;      // longest win streak
  campaignProgress: boolean[] = new Array(LEVELS.length).fill(false);
  bestTimes: (number | null)[] = new Array(LEVELS.length).fill(null);
  unlockedAchievements: Set<string> = new Set();

  constructor() {
    this.load();
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem('neon_marble_stats') || '{}');
      if (d.totalGems) this.totalGems = d.totalGems;
      if (d.totalClears) this.totalClears = d.totalClears;
      if (d.totalDeaths) this.totalDeaths = d.totalDeaths;
      if (d.dailyCompleted) this.dailyCompleted = d.dailyCompleted;
      if (d.perfectLevels) this.perfectLevels = d.perfectLevels;
      if (d.timeAttackClears) this.timeAttackClears = d.timeAttackClears;
      if (d.campaignProgress) this.campaignProgress = d.campaignProgress;
      if (d.bestTimes) this.bestTimes = d.bestTimes;
      if (d.achievements) this.unlockedAchievements = new Set(d.achievements);
      if (d.currentTheme !== undefined) this.currentTheme = d.currentTheme;
      if (d.currentSkin !== undefined) this.currentSkin = d.currentSkin;
      if (d.starRatings) this.starRatings = d.starRatings;
      if (d.totalPlayTime) this.totalPlayTime = d.totalPlayTime;
      if (d.fastestClear && d.fastestClear !== Infinity) this.fastestClear = d.fastestClear;
      if (d.longestStreak) this.longestStreak = d.longestStreak;
      if (d.powerupsCollected) this.powerupsCollected = d.powerupsCollected;
      if (d.shieldsUsed) this.shieldsUsed = d.shieldsUsed;
      if (d.skinsUsed) this.skinsUsed = new Set(d.skinsUsed);
      if (d.maxCombo) this.maxCombo = d.maxCombo;
      if (d.bumpersHit) this.bumpersHit = d.bumpersHit;
      // Extend arrays if new levels added
      while (this.campaignProgress.length < LEVELS.length) this.campaignProgress.push(false);
      while (this.bestTimes.length < LEVELS.length) this.bestTimes.push(null);
      while (this.starRatings.length < LEVELS.length) this.starRatings.push(0);
    } catch {}
  }

  save() {
    try {
      localStorage.setItem('neon_marble_stats', JSON.stringify({
        totalGems: this.totalGems,
        totalClears: this.totalClears,
        totalDeaths: this.totalDeaths,
        dailyCompleted: this.dailyCompleted,
        perfectLevels: this.perfectLevels,
        timeAttackClears: this.timeAttackClears,
        campaignProgress: this.campaignProgress,
        bestTimes: this.bestTimes,
        achievements: Array.from(this.unlockedAchievements),
        currentTheme: this.currentTheme,
        currentSkin: this.currentSkin,
        starRatings: this.starRatings,
        totalPlayTime: this.totalPlayTime,
        fastestClear: this.fastestClear === Infinity ? null : this.fastestClear,
        longestStreak: this.longestStreak,
        powerupsCollected: this.powerupsCollected,
        shieldsUsed: this.shieldsUsed,
        skinsUsed: Array.from(this.skinsUsed),
        maxCombo: this.maxCombo,
        bumpersHit: this.bumpersHit,
      }));
    } catch {}
  }

  resetLevel() {
    this.gemsCollected = 0;
    this.startTime = performance.now();
    this.elapsedTime = 0;
    this.shieldActive = false;
    this.magnetActive = false;
    this.slowmoActive = false;
    this.shieldTimer = 0;
    this.magnetTimer = 0;
    this.slowmoTimer = 0;
    this.gravityFlipped = false;
    this.comboCount = 0;
    this.comboTimer = 0;
  }

  resetGame() {
    this.level = 0;
    this.lives = 3;
    this.score = 0;
    this.totalFalls = 0;
    this.streak = 0;
    this.gemsCollected = 0;
    this.gemsTotal = 0;
    this.shieldActive = false;
    this.magnetActive = false;
    this.slowmoActive = false;
    this.shieldTimer = 0;
    this.magnetTimer = 0;
    this.slowmoTimer = 0;
  }
}

// ---- Leaderboard ----
export interface LeaderboardEntry {
  level: string;
  mode: string;
  time: number;
  gems: number;
  score: number;
  date: string;
}

export function getLeaderboard(): LeaderboardEntry[] {
  try {
    return JSON.parse(localStorage.getItem('neon_marble_lb') || '[]');
  } catch { return []; }
}

export function addLeaderboard(entry: LeaderboardEntry) {
  const lb = getLeaderboard();
  lb.push(entry);
  lb.sort((a, b) => b.score - a.score);
  localStorage.setItem('neon_marble_lb', JSON.stringify(lb.slice(0, 20)));
}

// Daily challenge seed
export function getDailySeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
