// index.ts — Main entry: IWSDK world, game loop, state machine, UI binding
import { World, PanelUI, Follower, FollowBehavior, ScreenSpace, PanelDocument } from '@iwsdk/core';
import type { UIKitDocument } from '@iwsdk/core';
import * as THREE from 'three';
import {
  GameStateManager, GameState, LEVELS, TILE, THEMES, ACHIEVEMENTS,
  BOARD_CELL, MARBLE_RADIUS, MAX_TILT, TILT_SPEED, GRAVITY,
  FRICTION, ICE_FRICTION, BOUNCE_DAMP, BOOST_IMPULSE, MARBLE_MAX_SPEED,
  addLeaderboard, getLeaderboard, getDailySeed, seededRandom,
  calcStars, MARBLE_SKINS, getLevelZone, ZONE_NAMES,
} from './types.js';
import { buildBoard, gridToLocal, getTileAt, checkWallCollision, animateBoard, BoardObjects } from './board.js';
import { AudioManager } from './audio.js';
import { ParticleSystem, TrailSystem, AmbientParticles, createHolodeckDecorations, animateDecorations, ScreenShake, fireworkBurst } from './effects.js';
import { GhostSystem } from './ghost.js';
import { MiniMap } from './minimap.js';

// ============================================================
// IWSDK World Init
// ============================================================
const container = document.getElementById('app') as HTMLDivElement;
const world = await World.create(container, {
  xr: { offer: 'once' },
  features: { spatialUI: true },
});

const scene = world.scene;

// ============================================================
// Game State
// ============================================================
const gsm = new GameStateManager();
const audio = new AudioManager();

let board: BoardObjects | null = null;
let boardEntity: THREE.Group | null = null;
let marbleMesh: THREE.Mesh | null = null;
let marbleGlow: THREE.Mesh | null = null;
let marbleVel = new THREE.Vector2(0, 0);
let marblePos = new THREE.Vector3(0, 0, 0);
let boardTilt = new THREE.Vector2(0, 0);   // current tilt x, z
let targetTilt = new THREE.Vector2(0, 0);  // target from input
let particles: ParticleSystem | null = null;
let trail: TrailSystem | null = null;
let ambientParticles: AmbientParticles | null = null;
let decos: THREE.Object3D[] = [];
let countdownTimer = 0;
let countdownPhase = 0;
let onIce = false;
let rollSoundTimer = 0;
let teleCooldown = 0;
let lastTime = performance.now();
let magnetPullTimer = 0;
let shieldMesh: THREE.Mesh | null = null;
let magnetGems = 0; // gems collected while magnet active
const COMBO_WINDOW = 2.0; // seconds to chain gems

// Ghost, minimap, screen shake
let ghost: GhostSystem | null = null;
const minimap = new MiniMap();
const screenShake = new ScreenShake();
let minimapUsedThisLevel = false;
const boardBasePos = new THREE.Vector3(0, 1.0, -1.2); // base position for board

// Input state
const keys: Record<string, boolean> = {};
window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// ============================================================
// Lighting & Environment
// ============================================================
scene.fog = new THREE.FogExp2(0x000811, 0.25);
const ambLight = new THREE.AmbientLight(0x222244, 0.5);
scene.add(ambLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(2, 4, 1);
scene.add(dirLight);
const ptLight1 = new THREE.PointLight(0x00ffff, 0.8, 5);
ptLight1.position.set(-1, 2, -1);
scene.add(ptLight1);
const ptLight2 = new THREE.PointLight(0xff3366, 0.4, 5);
ptLight2.position.set(1, 2, 1);
scene.add(ptLight2);

// Holodeck grid floor
const gridFloorGeo = new THREE.PlaneGeometry(8, 8);
const gridFloorMat = new THREE.MeshStandardMaterial({
  color: 0x040410,
  roughness: 0.8,
  metalness: 0.2,
});
const gridFloor = new THREE.Mesh(gridFloorGeo, gridFloorMat);
gridFloor.rotation.x = -Math.PI / 2;
gridFloor.position.y = -0.01;
scene.add(gridFloor);

// Neon grid on floor
const neonGridMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.08 });
for (let i = -4; i <= 4; i++) {
  const pts1 = [new THREE.Vector3(i, 0.001, -4), new THREE.Vector3(i, 0.001, 4)];
  const pts2 = [new THREE.Vector3(-4, 0.001, i), new THREE.Vector3(4, 0.001, i)];
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts1), neonGridMat));
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2), neonGridMat));
}

// Ceiling grid
const ceilGridMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.04 });
for (let i = -4; i <= 4; i++) {
  const pts1 = [new THREE.Vector3(i, 3, -4), new THREE.Vector3(i, 3, 4)];
  const pts2 = [new THREE.Vector3(-4, 3, i), new THREE.Vector3(4, 3, i)];
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts1), ceilGridMat));
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2), ceilGridMat));
}

ambientParticles = new AmbientParticles(scene, 40, 4);
decos = createHolodeckDecorations(scene, 14);

// ============================================================
// UI Panel Entities
// ============================================================
type PanelName = 'title' | 'modeselect' | 'levelselect' | 'hud' | 'pause' | 'levelcomplete'
  | 'gameover' | 'leaderboard' | 'achievements' | 'settings' | 'help' | 'toast' | 'countdown'
  | 'stats' | 'skins' | 'speedrun';

const panels: Map<PanelName, { entity: any; doc: UIKitDocument | null }> = new Map();

function createPanel(name: PanelName, config: string, opts: {
  maxWidth?: number; maxHeight?: number;
  follower?: boolean; screenSpace?: boolean;
  offsetPos?: [number, number, number];
  worldPos?: [number, number, number];
}) {
  const entity = world.createTransformEntity(undefined, { persistent: true });
  entity.addComponent(PanelUI, {
    config,
    maxWidth: opts.maxWidth || 0.8,
    maxHeight: opts.maxHeight || 1.0,
  });
  if (opts.follower) {
    entity.addComponent(Follower, {
      target: world.player.head,
      offsetPosition: opts.offsetPos || [0, 0, -0.6],
      behavior: FollowBehavior.PivotY,
      speed: 5,
      tolerance: 0.3,
    });
  } else if (opts.worldPos) {
    entity.object3D!.position.set(...opts.worldPos);
  }
  if (opts.screenSpace) {
    entity.addComponent(ScreenSpace, {
      width: '50vw', height: 'auto', bottom: '10vh', left: '25vw', zOffset: 0.2,
    });
  }
  panels.set(name, { entity, doc: null });
}

// Create all panels
createPanel('title', '/ui/title.json', { maxWidth: 0.9, maxHeight: 0.7, worldPos: [0, 1.5, -2] });
createPanel('modeselect', '/ui/modeselect.json', { maxWidth: 0.8, maxHeight: 0.7, worldPos: [0, 1.5, -2] });
createPanel('levelselect', '/ui/levelselect.json', { maxWidth: 0.9, maxHeight: 0.8, worldPos: [0, 1.5, -2] });
createPanel('hud', '/ui/hud.json', { maxWidth: 0.35, maxHeight: 0.12, follower: true, offsetPos: [0.25, 0.15, -0.5] });
createPanel('pause', '/ui/pause.json', { maxWidth: 0.6, maxHeight: 0.5, worldPos: [0, 1.5, -1.8] });
createPanel('levelcomplete', '/ui/levelcomplete.json', { maxWidth: 0.7, maxHeight: 0.6, worldPos: [0, 1.5, -1.8] });
createPanel('gameover', '/ui/gameover.json', { maxWidth: 0.7, maxHeight: 0.5, worldPos: [0, 1.5, -1.8] });
createPanel('leaderboard', '/ui/leaderboard.json', { maxWidth: 0.8, maxHeight: 0.8, worldPos: [0, 1.5, -2] });
createPanel('achievements', '/ui/achievements.json', { maxWidth: 0.8, maxHeight: 0.8, worldPos: [0, 1.5, -2] });
createPanel('settings', '/ui/settings.json', { maxWidth: 0.7, maxHeight: 0.7, worldPos: [0, 1.5, -2] });
createPanel('help', '/ui/help.json', { maxWidth: 0.8, maxHeight: 0.7, worldPos: [0, 1.5, -2] });
createPanel('toast', '/ui/toast.json', { maxWidth: 0.3, maxHeight: 0.08, follower: true, offsetPos: [0, -0.2, -0.5] });
createPanel('countdown', '/ui/countdown.json', { maxWidth: 0.3, maxHeight: 0.15, follower: true, offsetPos: [0, 0, -0.5] });
createPanel('stats', '/ui/stats.json', { maxWidth: 0.8, maxHeight: 0.8, worldPos: [0, 1.5, -2] });
createPanel('skins', '/ui/skins.json', { maxWidth: 0.7, maxHeight: 0.6, worldPos: [0, 1.5, -2] });
createPanel('speedrun', '/ui/speedrun.json', { maxWidth: 0.8, maxHeight: 0.8, worldPos: [0, 1.5, -2] });

// Minimap entity — 3D bird's-eye view with Follower
const minimapEntity = world.createTransformEntity(undefined, { persistent: true });
minimapEntity.object3D!.add(minimap.group);
minimapEntity.addComponent(Follower, {
  target: world.player.head,
  offsetPosition: [-0.25, -0.12, -0.45],
  behavior: FollowBehavior.PivotY,
  speed: 5,
  tolerance: 0.3,
});
minimapEntity.object3D!.visible = false;

// ============================================================
// UI Helpers
// ============================================================
function getDoc(name: PanelName): UIKitDocument | null {
  const p = panels.get(name);
  if (!p) return null;
  if (!p.doc) {
    p.doc = p.entity.getValue(PanelDocument, 'document') as UIKitDocument | null;
  }
  return p.doc;
}

function setText(name: PanelName, id: string, text: string) {
  const doc = getDoc(name);
  if (!doc) return;
  const el = doc.getElementById(id);
  if (el) (el as any).text.value = text;
}

function showPanel(name: PanelName | 'playing') {
  panels.forEach((p, n) => {
    p.entity.object3D.visible = n === name || (name === 'playing' && n === 'hud');
  });
  // HUD is always visible during play
  if (name === 'playing') {
    const hudP = panels.get('hud');
    if (hudP) hudP.entity.object3D.visible = true;
  }
}

function showUI(state: GameState) {
  // Hide all panels first
  panels.forEach(p => { p.entity.object3D.visible = false; });

  switch (state) {
    case 'title':
      panels.get('title')!.entity.object3D.visible = true;
      break;
    case 'modeselect':
      panels.get('modeselect')!.entity.object3D.visible = true;
      break;
    case 'levelselect':
      updateLevelSelect();
      panels.get('levelselect')!.entity.object3D.visible = true;
      break;
    case 'playing':
      panels.get('hud')!.entity.object3D.visible = true;
      break;
    case 'paused':
      panels.get('hud')!.entity.object3D.visible = true;
      panels.get('pause')!.entity.object3D.visible = true;
      break;
    case 'levelcomplete':
      panels.get('levelcomplete')!.entity.object3D.visible = true;
      break;
    case 'gameover':
      panels.get('gameover')!.entity.object3D.visible = true;
      break;
    case 'leaderboard':
      updateLeaderboardPanel();
      panels.get('leaderboard')!.entity.object3D.visible = true;
      break;
    case 'achievements':
      updateAchievementsPanel();
      panels.get('achievements')!.entity.object3D.visible = true;
      break;
    case 'settings':
      panels.get('settings')!.entity.object3D.visible = true;
      break;
    case 'help':
      panels.get('help')!.entity.object3D.visible = true;
      break;
    case 'stats':
      updateStatsPanel();
      panels.get('stats')!.entity.object3D.visible = true;
      break;
    case 'skins':
      updateSkinsPanel();
      panels.get('skins')!.entity.object3D.visible = true;
      break;
    case 'speedrun':
      updateSpeedrunPanel();
      panels.get('speedrun')!.entity.object3D.visible = true;
      break;
  }
}

let toastTimer = 0;
function showToast(msg: string, dur: number = 2) {
  setText('toast', 'toast-msg', msg);
  const tp = panels.get('toast');
  if (tp) tp.entity.object3D.visible = true;
  toastTimer = dur;
}

function updateHUD() {
  const elapsed = gsm.mode === 'zen' ? 0 : gsm.elapsedTime;
  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);
  setText('hud', 'hud-time', `${mins}:${secs.toString().padStart(2, '0')}`);
  setText('hud', 'hud-gems', `${gsm.gemsCollected}/${gsm.gemsTotal}`);
  setText('hud', 'hud-lives', `${gsm.lives}`);
  setText('hud', 'hud-score', `${gsm.score}`);
  const level = LEVELS[gsm.level] || LEVELS[0];
  setText('hud', 'hud-level', level.name);
  // Power-up indicators
  const puParts: string[] = [];
  if (gsm.shieldActive) puParts.push(`🛡${Math.ceil(gsm.shieldTimer)}s`);
  if (gsm.magnetActive) puParts.push(`🧲${Math.ceil(gsm.magnetTimer)}s`);
  if (gsm.slowmoActive) puParts.push(`⏳${Math.ceil(gsm.slowmoTimer)}s`);
  setText('hud', 'hud-powerups', puParts.join(' '));
  if (gsm.gravityFlipped) {
    setText('hud', 'hud-gravity', '⬆ REVERSED');
  } else {
    setText('hud', 'hud-gravity', '');
  }
  // Combo display
  if (gsm.comboCount >= 2) {
    setText('hud', 'hud-combo', `${gsm.comboCount}x COMBO`);
  } else {
    setText('hud', 'hud-combo', '');
  }
  // Speed run split delta display
  if (gsm.speedrunActive && gsm.mode === 'campaign') {
    const pbSplit = gsm.bestCampaignSplits[gsm.level];
    if (pbSplit !== null) {
      const delta = gsm.elapsedTime - pbSplit;
      const sign = delta >= 0 ? '+' : '';
      const color = delta < 0 ? '🟢' : '🔴';
      setText('hud', 'hud-split', `${color} ${sign}${delta.toFixed(1)}s`);
    } else {
      setText('hud', 'hud-split', '');
    }
    // Total run time
    const totalRun = gsm.campaignTotalTime + gsm.elapsedTime;
    const tMins = Math.floor(totalRun / 60);
    const tSecs = Math.floor(totalRun % 60);
    setText('hud', 'hud-runtimer', `RUN ${tMins}:${tSecs.toString().padStart(2, '0')}`);
  } else {
    setText('hud', 'hud-split', '');
    setText('hud', 'hud-runtimer', '');
  }
  // Zone indicator
  const zone = getLevelZone(gsm.level);
  setText('hud', 'hud-zone', ZONE_NAMES[zone] || '');
}

function updateLevelSelect() {
  for (let i = 0; i < 36; i++) {
    const cleared = gsm.campaignProgress[i] || false;
    const best = gsm.bestTimes[i];
    const stars = gsm.starRatings[i] || 0;
    const label = i < LEVELS.length ? LEVELS[i].name : `Level ${i + 1}`;
    const starStr = stars > 0 ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';
    setText('levelselect', `lvl-name-${i}`, label);
    setText('levelselect', `lvl-status-${i}`, cleared ? (best ? `${best.toFixed(1)}s ${starStr}` : `Cleared ${starStr}`) : '---');
  }
}

function updateLeaderboardPanel() {
  const lb = getLeaderboard();
  for (let i = 0; i < 10; i++) {
    const e = lb[i];
    setText('leaderboard', `lb-rank-${i}`, e ? `${i + 1}` : '');
    setText('leaderboard', `lb-name-${i}`, e ? e.level : '');
    setText('leaderboard', `lb-score-${i}`, e ? `${e.score}` : '');
    setText('leaderboard', `lb-time-${i}`, e ? `${e.time.toFixed(1)}s` : '');
  }
}

function updateAchievementsPanel() {
  for (let i = 0; i < ACHIEVEMENTS.length; i++) {
    const a = ACHIEVEMENTS[i];
    const unlocked = gsm.unlockedAchievements.has(a.id);
    setText('achievements', `ach-name-${i}`, unlocked ? a.name : '???');
    setText('achievements', `ach-desc-${i}`, unlocked ? a.desc : 'Locked');
  }
}

function updateStatsPanel() {
  setText('stats', 'stat-clears', `${gsm.totalClears}`);
  setText('stats', 'stat-gems', `${gsm.totalGems}`);
  setText('stats', 'stat-deaths', `${gsm.totalDeaths}`);
  setText('stats', 'stat-perfect', `${gsm.perfectLevels}`);
  setText('stats', 'stat-fastest', gsm.fastestClear < Infinity ? `${gsm.fastestClear.toFixed(1)}s` : '---');
  setText('stats', 'stat-streak', `${gsm.longestStreak}`);
  setText('stats', 'stat-playtime', formatPlayTime(gsm.totalPlayTime));
  setText('stats', 'stat-powerups', `${gsm.powerupsCollected}`);
  setText('stats', 'stat-shields', `${gsm.shieldsUsed}`);
  const totalStars = gsm.starRatings.reduce((a, b) => a + b, 0);
  setText('stats', 'stat-stars', `${totalStars}/${LEVELS.length * 3}`);
  const progress = gsm.campaignProgress.filter(Boolean).length;
  setText('stats', 'stat-progress', `${progress}/${LEVELS.length}`);
  setText('stats', 'stat-achievements', `${gsm.unlockedAchievements.size}/${ACHIEVEMENTS.length}`);
  setText('stats', 'stat-bumpers', `${gsm.bumpersHit}`);
  setText('stats', 'stat-combo', `${gsm.maxCombo}x`);
  setText('stats', 'stat-survival', `${gsm.survivalBestRun} levels`);
}

function formatPlayTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

function updateSkinsPanel() {
  for (let i = 0; i < MARBLE_SKINS.length; i++) {
    const skin = MARBLE_SKINS[i];
    const selected = i === gsm.currentSkin;
    setText('skins', `skin-name-${i}`, skin.name);
    setText('skins', `skin-status-${i}`, selected ? '● EQUIPPED' : '○ Select');
  }
  // Clear extra slots if panel has more
  for (let i = MARBLE_SKINS.length; i < 10; i++) {
    setText('skins', `skin-name-${i}`, '');
    setText('skins', `skin-status-${i}`, '');
  }
}

function updateSpeedrunPanel() {
  // Total time
  if (gsm.campaignSplits.length > 0) {
    const total = gsm.campaignSplits.reduce((a, b) => a + b, 0);
    setText('speedrun', 'sr-total-time', formatSplitTime(total));
  } else {
    setText('speedrun', 'sr-total-time', '--:--');
  }

  // PB total
  if (gsm.bestCampaignTotal !== null) {
    setText('speedrun', 'sr-pb-total', formatSplitTime(gsm.bestCampaignTotal));
  } else {
    setText('speedrun', 'sr-pb-total', '---');
  }

  // Individual splits (show up to 12)
  for (let i = 0; i < 12; i++) {
    if (i < gsm.campaignSplits.length) {
      const levelName = i < LEVELS.length ? LEVELS[i].name : `Level ${i + 1}`;
      const splitTime = gsm.campaignSplits[i];
      const pbSplit = gsm.bestCampaignSplits[i];

      setText('speedrun', `sr-name-${i}`, levelName);
      setText('speedrun', `sr-time-${i}`, formatSplitTime(splitTime));

      // Delta vs PB
      if (pbSplit !== null) {
        const delta = splitTime - pbSplit;
        const sign = delta >= 0 ? '+' : '';
        setText('speedrun', `sr-delta-${i}`, `${sign}${delta.toFixed(1)}s`);
      } else {
        setText('speedrun', `sr-delta-${i}`, 'NEW');
      }
    } else if (i < LEVELS.length && gsm.bestCampaignSplits[i] !== null) {
      // Show PB splits for levels not yet completed in this run
      setText('speedrun', `sr-name-${i}`, LEVELS[i].name);
      setText('speedrun', `sr-time-${i}`, '---');
      setText('speedrun', `sr-delta-${i}`, `PB: ${formatSplitTime(gsm.bestCampaignSplits[i]!)}`);
    } else {
      setText('speedrun', `sr-name-${i}`, '---');
      setText('speedrun', `sr-time-${i}`, '---');
      setText('speedrun', `sr-delta-${i}`, '');
    }
  }
}

function formatSplitTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  if (mins > 0) return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  return `${secs}.${ms}s`;
}

// ============================================================
// Achievement checking
// ============================================================
function checkAchievements() {
  const newlyUnlocked: string[] = [];

  const check = (id: string, cond: boolean) => {
    if (cond && !gsm.unlockedAchievements.has(id)) {
      gsm.unlockedAchievements.add(id);
      newlyUnlocked.push(id);
    }
  };

  check('first_clear', gsm.totalClears >= 1);
  check('gem_collector', gsm.totalGems >= 10);
  check('gems_25', gsm.totalGems >= 25);
  check('gems_50', gsm.totalGems >= 50);
  check('speed_demon', gsm.elapsedTime < (LEVELS[gsm.level]?.par || 999));
  check('perfect_run', gsm.gemsCollected >= gsm.gemsTotal && gsm.gemsTotal > 0);
  check('no_deaths', gsm.noDeathStreak >= 3);
  check('campaign_half', gsm.campaignProgress.filter(Boolean).length >= 6);
  check('campaign_done', gsm.campaignProgress.filter(Boolean).length >= LEVELS.length);
  check('zen_master', gsm.mode === 'zen' && gsm.state === 'levelcomplete');
  check('time_attack_3', gsm.timeAttackClears >= 3);
  check('daily_3', gsm.dailyCompleted >= 3);
  check('warp_5', gsm.warpsUsed >= 5);
  check('under_10', gsm.elapsedTime < 10);
  check('all_perfect', gsm.perfectLevels >= 6);
  check('falls_0', gsm.totalClears >= LEVELS.length && gsm.totalDeaths === 0);
  check('boost_10', gsm.boostsHit >= 10);
  check('theme_all', gsm.themesUsed.size >= THEMES.length);
  check('streak_3', gsm.streak >= 3);
  check('total_20', gsm.totalClears >= 20);
  check('powerup_first', gsm.powerupsCollected >= 1);
  check('shield_save', gsm.shieldsUsed >= 1);
  check('three_stars', gsm.starRatings.some(s => s >= 3));
  check('all_stars', gsm.starRatings.slice(0, LEVELS.length).every(s => s >= 3));
  check('gems_100', gsm.totalGems >= 100);
  check('magnet_gems', magnetGems >= 5);
  check('slowmo_clear', gsm.slowmoActive && gsm.state === 'levelcomplete');
  check('speed_5', gsm.bestTimes.filter((t, i) => t !== null && t < (LEVELS[i]?.par || 999)).length >= 5);
  check('total_50', gsm.totalClears >= 50);
  check('gravity_master', gsm.level >= 19 && gsm.level <= 23 && gsm.state === 'levelcomplete');
  check('wall_dodger', gsm.level >= 18 && gsm.state === 'levelcomplete' && gsm.lives === 3);
  check('endgame', gsm.campaignProgress[23] === true);
  check('all_24', gsm.campaignProgress.filter(Boolean).length >= 24);
  check('skins_all', gsm.skinsUsed.size >= MARBLE_SKINS.length);
  check('bumper_10', gsm.bumpersHit >= 10);
  check('combo_3', gsm.maxCombo >= 3);
  check('combo_5', gsm.maxCombo >= 5);
  check('total_100', gsm.totalClears >= 100);
  check('all_30', gsm.campaignProgress.filter(Boolean).length >= 30);
  check('master_1', gsm.level >= 30 && gsm.level <= 35 && gsm.state === 'levelcomplete');
  check('master_all', gsm.campaignProgress.slice(30, 36).every(Boolean));
  check('all_36', gsm.campaignProgress.filter(Boolean).length >= 36);
  check('survival_10', gsm.survivalLevelsCleared >= 10 || gsm.survivalBestRun >= 10);
  check('survival_25', gsm.survivalLevelsCleared >= 25 || gsm.survivalBestRun >= 25);
  // Round 7 achievements
  check('ghost_chaser', gsm.ghostRaced);
  check('cartographer', gsm.minimapLevelsUsed >= 5);
  check('shake_it_off', gsm.wallBounces >= 25);
  check('fireworks_fan', gsm.victoryCelebrations >= 10);
  check('half_century', gsm.unlockedAchievements.size >= 25);

  for (const id of newlyUnlocked) {
    const ach = ACHIEVEMENTS.find(a => a.id === id);
    if (ach) {
      showToast(`Achievement: ${ach.name}!`, 3);
      audio.playAchievement();
    }
  }

  if (newlyUnlocked.length > 0) gsm.save();
}

// ============================================================
// Board / Level Management
// ============================================================
function loadLevel(levelIdx: number) {
  // Clear old board
  if (boardEntity) {
    scene.remove(boardEntity);
    boardEntity = null;
  }
  if (marbleMesh) { scene.remove(marbleMesh); marbleMesh = null; }
  if (marbleGlow) { scene.remove(marbleGlow); marbleGlow = null; }

  const level = LEVELS[levelIdx];
  if (!level) return;

  gsm.level = levelIdx;
  gsm.gemsTotal = level.gems;
  gsm.resetLevel();

  board = buildBoard(level, gsm.currentTheme);
  boardEntity = board.group;
  boardEntity.position.set(0, 1.0, -1.2);  // floating in front of player at table height
  scene.add(boardEntity);

  // Create marble with selected skin
  const theme = THEMES[gsm.currentTheme];
  const skin = MARBLE_SKINS[gsm.currentSkin] || MARBLE_SKINS[0];
  const marbleGeo = new THREE.SphereGeometry(MARBLE_RADIUS, 16, 16);
  const marbleMat = new THREE.MeshStandardMaterial({
    color: skin.color,
    emissive: new THREE.Color(skin.emissive),
    emissiveIntensity: 0.4,
    roughness: 0.2,
    metalness: 0.7,
  });
  marbleMesh = new THREE.Mesh(marbleGeo, marbleMat);
  boardEntity.add(marbleMesh);

  // Marble glow
  marbleGlow = new THREE.Mesh(
    new THREE.SphereGeometry(MARBLE_RADIUS * 1.8, 8, 8),
    new THREE.MeshBasicMaterial({ color: skin.glow, transparent: true, opacity: 0.15 })
  );
  boardEntity.add(marbleGlow);

  // Shield mesh (hidden until active)
  shieldMesh = new THREE.Mesh(
    new THREE.SphereGeometry(MARBLE_RADIUS * 2.5, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0, wireframe: true })
  );
  boardEntity.add(shieldMesh);

  // Place marble at start
  const startLocal = gridToLocal(board.startPos.x, board.startPos.y, board.gridW, board.gridH);
  marblePos.copy(startLocal);
  marbleMesh.position.copy(marblePos);
  marbleGlow.position.copy(marblePos);
  marbleVel.set(0, 0);
  boardTilt.set(0, 0);
  targetTilt.set(0, 0);
  teleCooldown = 0;

  // Reset particles/trail
  if (particles) particles = null;
  particles = new ParticleSystem(boardEntity);
  if (trail) trail = null;
  trail = new TrailSystem(boardEntity, skin.trailColor, skin.trailStyle, skin.trailParticleColor, skin.trailParticleRate, skin.trailWidth);

  // Set music zone based on level
  const zone = getLevelZone(levelIdx);
  audio.setZone(zone);

  // Ghost system
  if (ghost) ghost.cleanup();
  ghost = new GhostSystem(boardEntity);
  ghost.startRecording();
  ghost.startPlayback(levelIdx);
  if (ghost.playing) gsm.ghostRaced = true;

  // Minimap
  minimap.build(level.grid, board.gridW, board.gridH);
  minimapEntity.object3D!.visible = true;
  minimapUsedThisLevel = true;
  gsm.minimapLevelsUsed++;
}

function resetMarble() {
  if (!board || !marbleMesh || !marbleGlow) return;
  const startLocal = gridToLocal(board.startPos.x, board.startPos.y, board.gridW, board.gridH);
  marblePos.copy(startLocal);
  marbleMesh.position.copy(marblePos);
  marbleGlow.position.copy(marblePos);
  if (shieldMesh) shieldMesh.position.copy(marblePos);
  marbleVel.set(0, 0);
  boardTilt.set(0, 0);
  targetTilt.set(0, 0);
  trail?.clear();
}

// ============================================================
// State Transitions
// ============================================================
function changeState(newState: GameState) {
  gsm.state = newState;
  showUI(newState);

  switch (newState) {
    case 'title':
      audio.startMusic();
      if (boardEntity) { scene.remove(boardEntity); boardEntity = null; }
      minimapEntity.object3D!.visible = false;
      if (ghost) ghost.cleanup();
      break;
    case 'playing':
      break;
    case 'paused':
      break;
    case 'levelcomplete': {
      gsm.elapsedTime = (performance.now() - gsm.startTime) / 1000;
      const level = LEVELS[gsm.level];
      const isPerfect = gsm.gemsCollected >= gsm.gemsTotal;
      const underPar = gsm.elapsedTime < level.par;
      gsm.totalClears++;
      gsm.streak++;
      if (gsm.streak > gsm.longestStreak) gsm.longestStreak = gsm.streak;
      gsm.noDeathStreak++;
      if (isPerfect) gsm.perfectLevels++;
      if (gsm.elapsedTime < gsm.fastestClear) gsm.fastestClear = gsm.elapsedTime;
      gsm.totalPlayTime += gsm.elapsedTime;
      if (gsm.mode === 'campaign') {
        gsm.campaignProgress[gsm.level] = true;
        const bt = gsm.bestTimes[gsm.level];
        if (!bt || gsm.elapsedTime < bt) gsm.bestTimes[gsm.level] = gsm.elapsedTime;

        // Speed run split tracking
        gsm.speedrunActive = true;
        gsm.campaignSplits[gsm.level] = gsm.elapsedTime;
        gsm.campaignTotalTime += gsm.elapsedTime;

        // Update PB splits
        const pbSplit = gsm.bestCampaignSplits[gsm.level];
        if (pbSplit === null || gsm.elapsedTime < pbSplit) {
          gsm.bestCampaignSplits[gsm.level] = gsm.elapsedTime;
          audio.playSplitGood();
        }

        // Check if we have a complete campaign run for PB total
        const completedLevels = gsm.campaignSplits.filter((_, i) => gsm.campaignSplits[i] !== undefined).length;
        if (completedLevels === LEVELS.length) {
          const totalRunTime = gsm.campaignSplits.reduce((a, b) => a + (b || 0), 0);
          if (gsm.bestCampaignTotal === null || totalRunTime < gsm.bestCampaignTotal) {
            gsm.bestCampaignTotal = totalRunTime;
            showToast('NEW CAMPAIGN PB! 🏆', 3);
          }
        }
      }
      if (gsm.mode === 'timeattack') gsm.timeAttackClears++;
      if (gsm.mode === 'daily') gsm.dailyCompleted++;
      if (gsm.mode === 'survival') {
        gsm.survivalLevelsCleared++;
        if (gsm.survivalLevelsCleared > gsm.survivalBestRun) {
          gsm.survivalBestRun = gsm.survivalLevelsCleared;
        }
      }

      // Star rating
      const stars = calcStars(gsm.elapsedTime, level.par, gsm.gemsCollected, gsm.gemsTotal);
      if (stars > (gsm.starRatings[gsm.level] || 0)) {
        gsm.starRatings[gsm.level] = stars;
      }

      // Score calculation
      const baseScore = 1000;
      const timeBonus = Math.max(0, Math.floor((level.par - gsm.elapsedTime) * 50));
      const gemBonus = gsm.gemsCollected * 200;
      const perfectBonus = isPerfect ? 500 : 0;
      const comboBonus = gsm.maxCombo >= 3 ? gsm.maxCombo * 100 : 0;
      gsm.score += baseScore + timeBonus + gemBonus + perfectBonus + comboBonus;

      addLeaderboard({
        level: level.name,
        mode: gsm.mode,
        time: gsm.elapsedTime,
        gems: gsm.gemsCollected,
        score: gsm.score,
        date: new Date().toISOString().split('T')[0],
      });

      const starDisplay = '★'.repeat(stars) + '☆'.repeat(3 - stars);
      setText('levelcomplete', 'lc-title', 'Level Complete!');
      setText('levelcomplete', 'lc-level', level.name);
      setText('levelcomplete', 'lc-time', `Time: ${gsm.elapsedTime.toFixed(1)}s`);
      setText('levelcomplete', 'lc-gems', `Gems: ${gsm.gemsCollected}/${gsm.gemsTotal}`);
      setText('levelcomplete', 'lc-par', underPar ? 'Under par!' : `Par: ${level.par}s`);
      setText('levelcomplete', 'lc-score', `Score: ${gsm.score}`);
      setText('levelcomplete', 'lc-stars', starDisplay);
      setText('levelcomplete', 'lc-combo', gsm.maxCombo >= 2 ? `Best Combo: ${gsm.maxCombo}x (+${comboBonus})` : '');

      // Speed run split display
      if (gsm.speedrunActive && gsm.mode === 'campaign') {
        const pbSplit = gsm.bestCampaignSplits[gsm.level];
        let splitText = `Split: ${gsm.elapsedTime.toFixed(1)}s`;
        if (pbSplit !== null && pbSplit < gsm.elapsedTime) {
          const delta = gsm.elapsedTime - pbSplit;
          splitText += ` (+${delta.toFixed(1)}s)`;
        } else if (pbSplit !== null) {
          splitText += ` (PB!)`;
        }
        setText('levelcomplete', 'lc-combo', gsm.maxCombo >= 2 ? `${gsm.maxCombo}x Combo (+${comboBonus}) | ${splitText}` : splitText);
      }
      if (gsm.mode === 'survival') {
        setText('levelcomplete', 'lc-par', `Survival: ${gsm.survivalLevelsCleared} levels cleared`);
      }

      audio.playGoal();
      audio.playVictoryFanfare();
      // Firework victory celebration
      if (particles) fireworkBurst(particles, marblePos.clone());
      gsm.victoryCelebrations++;
      // Save ghost recording
      if (ghost) {
        const frames = ghost.stopRecording();
        GhostSystem.saveGhost(gsm.level, frames, gsm.elapsedTime);
      }
      // Hide minimap during results
      minimapEntity.object3D!.visible = false;
      if (particles) particles.burst(marblePos, THEMES[gsm.currentTheme].goal, 25, 0.8, 1.2);
      checkAchievements();
      gsm.save();
      break;
    }
    case 'gameover':
      setText('gameover', 'go-score', `Final Score: ${gsm.score}`);
      if (gsm.mode === 'survival') {
        setText('gameover', 'go-levels', `Survival Run: ${gsm.survivalLevelsCleared} levels | Best: ${gsm.survivalBestRun}`);
      } else {
        setText('gameover', 'go-levels', `Levels Cleared: ${gsm.totalClears}`);
      }
      audio.playGameOver();
      gsm.save();
      break;
  }
}

function startLevel(levelIdx: number) {
  loadLevel(levelIdx);
  countdownPhase = 3;
  countdownTimer = 0;
  changeState('playing');
  panels.get('countdown')!.entity.object3D.visible = true;
  setText('countdown', 'cd-text', '3');
  audio.playCountdownTick();
}

// ============================================================
// UI Event Binding (one-time setup)
// ============================================================
let uiSetup = false;
function setupUIEvents() {
  if (uiSetup) return;
  uiSetup = true;

  // Title
  const titleDoc = getDoc('title');
  titleDoc?.getElementById('btn-play')?.addEventListener('click', () => { audio.playButton(); changeState('modeselect'); });
  titleDoc?.getElementById('btn-leaderboard')?.addEventListener('click', () => { audio.playButton(); changeState('leaderboard'); });
  titleDoc?.getElementById('btn-achievements')?.addEventListener('click', () => { audio.playButton(); changeState('achievements'); });
  titleDoc?.getElementById('btn-settings')?.addEventListener('click', () => { audio.playButton(); changeState('settings'); });
  titleDoc?.getElementById('btn-help')?.addEventListener('click', () => { audio.playButton(); changeState('help'); });
  titleDoc?.getElementById('btn-stats')?.addEventListener('click', () => { audio.playButton(); changeState('stats'); });
  titleDoc?.getElementById('btn-skins')?.addEventListener('click', () => { audio.playButton(); changeState('skins'); });
  titleDoc?.getElementById('btn-speedrun')?.addEventListener('click', () => { audio.playButton(); changeState('speedrun'); });

  // Mode select
  const modeDoc = getDoc('modeselect');
  modeDoc?.getElementById('btn-campaign')?.addEventListener('click', () => { audio.playButton(); gsm.mode = 'campaign'; gsm.resetGame(); changeState('levelselect'); });
  modeDoc?.getElementById('btn-timeattack')?.addEventListener('click', () => { audio.playButton(); gsm.mode = 'timeattack'; gsm.resetGame(); changeState('levelselect'); });
  modeDoc?.getElementById('btn-zen')?.addEventListener('click', () => { audio.playButton(); gsm.mode = 'zen'; gsm.resetGame(); changeState('levelselect'); });
  modeDoc?.getElementById('btn-daily')?.addEventListener('click', () => {
    audio.playButton();
    gsm.mode = 'daily';
    gsm.resetGame();
    const seed = getDailySeed();
    const rng = seededRandom(seed);
    const dailyLevel = Math.floor(rng() * LEVELS.length);
    startLevel(dailyLevel);
  });
  modeDoc?.getElementById('btn-survival')?.addEventListener('click', () => {
    audio.playButton();
    gsm.mode = 'survival';
    gsm.resetGame();
    gsm.lives = 1; // Survival: only 1 life, no extras
    gsm.survivalLevelsCleared = 0;
    gsm.survivalIndex = 0;
    // Shuffle level order for survival
    gsm.survivalOrder = Array.from({ length: LEVELS.length }, (_, i) => i);
    for (let i = gsm.survivalOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [gsm.survivalOrder[i], gsm.survivalOrder[j]] = [gsm.survivalOrder[j], gsm.survivalOrder[i]];
    }
    startLevel(gsm.survivalOrder[0]);
  });
  modeDoc?.getElementById('btn-mode-back')?.addEventListener('click', () => { audio.playButton(); changeState('title'); });

  // Level select
  const lvlDoc = getDoc('levelselect');
  for (let i = 0; i < 36; i++) {
    const idx = i;
    lvlDoc?.getElementById(`btn-lvl-${i}`)?.addEventListener('click', () => {
      audio.playButton();
      if (idx < LEVELS.length) startLevel(idx);
    });
  }
  lvlDoc?.getElementById('btn-lvl-back')?.addEventListener('click', () => { audio.playButton(); changeState('modeselect'); });

  // Pause
  const pauseDoc = getDoc('pause');
  pauseDoc?.getElementById('btn-resume')?.addEventListener('click', () => { audio.playButton(); changeState('playing'); });
  pauseDoc?.getElementById('btn-quit')?.addEventListener('click', () => { audio.playButton(); changeState('title'); });

  // Level complete
  const lcDoc = getDoc('levelcomplete');
  lcDoc?.getElementById('btn-next')?.addEventListener('click', () => {
    audio.playButton();
    if (gsm.mode === 'survival') {
      // Survival: advance to next shuffled level
      gsm.survivalIndex++;
      if (gsm.survivalIndex < gsm.survivalOrder.length) {
        startLevel(gsm.survivalOrder[gsm.survivalIndex]);
      } else {
        // Ran through all levels! Reshuffle and continue
        for (let i = gsm.survivalOrder.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [gsm.survivalOrder[i], gsm.survivalOrder[j]] = [gsm.survivalOrder[j], gsm.survivalOrder[i]];
        }
        gsm.survivalIndex = 0;
        startLevel(gsm.survivalOrder[0]);
      }
    } else {
      const next = gsm.level + 1;
      if (next < LEVELS.length) { startLevel(next); }
      else { changeState('title'); showToast('All levels complete!'); }
    }
  });
  lcDoc?.getElementById('btn-retry')?.addEventListener('click', () => { audio.playButton(); startLevel(gsm.level); });
  lcDoc?.getElementById('btn-lc-menu')?.addEventListener('click', () => { audio.playButton(); changeState('title'); });

  // Game over
  const goDoc = getDoc('gameover');
  goDoc?.getElementById('btn-go-retry')?.addEventListener('click', () => { audio.playButton(); gsm.resetGame(); startLevel(0); });
  goDoc?.getElementById('btn-go-menu')?.addEventListener('click', () => { audio.playButton(); changeState('title'); });

  // Leaderboard/Achievements back
  const lbDoc = getDoc('leaderboard');
  lbDoc?.getElementById('btn-lb-back')?.addEventListener('click', () => { audio.playButton(); changeState('title'); });
  const achDoc = getDoc('achievements');
  achDoc?.getElementById('btn-ach-back')?.addEventListener('click', () => { audio.playButton(); changeState('title'); });

  // Settings
  const setDoc = getDoc('settings');
  setDoc?.getElementById('btn-set-back')?.addEventListener('click', () => { audio.playButton(); changeState('title'); });
  setDoc?.getElementById('btn-vol-up')?.addEventListener('click', () => { audio.playButton(); audio.setMasterVolume(Math.min(1, audio.masterVolume + 0.1)); setText('settings', 'set-vol', `${Math.round(audio.masterVolume * 100)}%`); });
  setDoc?.getElementById('btn-vol-down')?.addEventListener('click', () => { audio.playButton(); audio.setMasterVolume(Math.max(0, audio.masterVolume - 0.1)); setText('settings', 'set-vol', `${Math.round(audio.masterVolume * 100)}%`); });
  setDoc?.getElementById('btn-sfx-up')?.addEventListener('click', () => { audio.playButton(); audio.setSfxVolume(Math.min(1, audio.sfxVolume + 0.1)); setText('settings', 'set-sfx', `${Math.round(audio.sfxVolume * 100)}%`); });
  setDoc?.getElementById('btn-sfx-down')?.addEventListener('click', () => { audio.playButton(); audio.setSfxVolume(Math.max(0, audio.sfxVolume - 0.1)); setText('settings', 'set-sfx', `${Math.round(audio.sfxVolume * 100)}%`); });
  setDoc?.getElementById('btn-music-up')?.addEventListener('click', () => { audio.playButton(); audio.setMusicVolume(Math.min(1, audio.musicVolume + 0.1)); setText('settings', 'set-music', `${Math.round(audio.musicVolume * 100)}%`); });
  setDoc?.getElementById('btn-music-down')?.addEventListener('click', () => { audio.playButton(); audio.setMusicVolume(Math.max(0, audio.musicVolume - 0.1)); setText('settings', 'set-music', `${Math.round(audio.musicVolume * 100)}%`); });
  setDoc?.getElementById('btn-theme-next')?.addEventListener('click', () => {
    audio.playButton();
    gsm.currentTheme = (gsm.currentTheme + 1) % THEMES.length;
    gsm.themesUsed.add(gsm.currentTheme);
    setText('settings', 'set-theme', THEMES[gsm.currentTheme].name);
    gsm.save();
  });
  setDoc?.getElementById('btn-theme-prev')?.addEventListener('click', () => {
    audio.playButton();
    gsm.currentTheme = (gsm.currentTheme - 1 + THEMES.length) % THEMES.length;
    gsm.themesUsed.add(gsm.currentTheme);
    setText('settings', 'set-theme', THEMES[gsm.currentTheme].name);
    gsm.save();
  });

  // Help back
  const helpDoc = getDoc('help');
  helpDoc?.getElementById('btn-help-back')?.addEventListener('click', () => { audio.playButton(); changeState('title'); });

  // Stats back
  const statsDoc = getDoc('stats');
  statsDoc?.getElementById('btn-stats-back')?.addEventListener('click', () => { audio.playButton(); changeState('title'); });

  // Skins
  const skinsDoc = getDoc('skins');
  skinsDoc?.getElementById('btn-skins-back')?.addEventListener('click', () => { audio.playButton(); changeState('title'); });
  for (let i = 0; i < MARBLE_SKINS.length; i++) {
    const idx = i;
    skinsDoc?.getElementById(`btn-skin-${i}`)?.addEventListener('click', () => {
      audio.playButton();
      gsm.currentSkin = idx;
      gsm.skinsUsed.add(idx);
      updateSkinsPanel();
      gsm.save();
      showToast(`Equipped: ${MARBLE_SKINS[idx].name}`, 1.5);
      checkAchievements();
    });
  }

  // Speedrun panel back
  const srDoc = getDoc('speedrun');
  srDoc?.getElementById('btn-sr-back')?.addEventListener('click', () => { audio.playButton(); changeState('title'); });
}

// ============================================================
// Main Game Loop
// ============================================================

let gravitySwitchCooldown = 0;

function update() {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05); // cap at 50ms
  lastTime = now;
  const time = now / 1000;

  // Try to wire UI events (docs may not be ready on first frame)
  setupUIEvents();

  // Toast timer
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) {
      const tp = panels.get('toast');
      if (tp) tp.entity.object3D.visible = false;
    }
  }

  // Countdown
  if (countdownPhase > 0 && gsm.state === 'playing') {
    countdownTimer += dt;
    if (countdownTimer >= 1) {
      countdownTimer = 0;
      countdownPhase--;
      if (countdownPhase > 0) {
        setText('countdown', 'cd-text', `${countdownPhase}`);
        audio.playCountdownTick();
      } else {
        setText('countdown', 'cd-text', 'GO!');
        audio.playGameStart();
        gsm.startTime = performance.now();
        setTimeout(() => {
          const cdP = panels.get('countdown');
          if (cdP) cdP.entity.object3D.visible = false;
        }, 500);
      }
    }
    // Don't run physics during countdown
    requestAnimationFrame(update);
    return;
  }

  // Animate environment
  ambientParticles?.update(time);
  animateDecorations(decos, time);
  particles?.update(dt);

  if (gsm.state === 'playing' && board && marbleMesh && marbleGlow) {
    // Update elapsed time
    gsm.elapsedTime = (performance.now() - gsm.startTime) / 1000;
    updateHUD();

    // ---- Input: board tilt ----
    targetTilt.set(0, 0);

    // Keyboard
    if (keys['a'] || keys['arrowleft']) targetTilt.x = -MAX_TILT;
    if (keys['d'] || keys['arrowright']) targetTilt.x = MAX_TILT;
    if (keys['w'] || keys['arrowup']) targetTilt.y = -MAX_TILT;
    if (keys['s'] || keys['arrowdown']) targetTilt.y = MAX_TILT;

    // XR thumbstick input
    const xrInput = (world.input as any)?.xr;
    if (xrInput) {
      const leftThumb = xrInput.left?.axes;
      if (leftThumb && leftThumb.length >= 4) {
        targetTilt.x = leftThumb[2] * MAX_TILT;
        targetTilt.y = leftThumb[3] * MAX_TILT;
      }
    }

    // Pause input
    if (keys['escape']) { keys['escape'] = false; changeState('paused'); }

    // Smooth tilt
    boardTilt.x += (targetTilt.x - boardTilt.x) * Math.min(TILT_SPEED * dt * 10, 1);
    boardTilt.y += (targetTilt.y - boardTilt.y) * Math.min(TILT_SPEED * dt * 10, 1);

    // Apply tilt to board group
    boardEntity!.rotation.x = boardTilt.y;
    boardEntity!.rotation.z = -boardTilt.x;

    // ---- Gravity ----
    // Gravity component on tilted surface (flipped if gravity switch active)
    const gravMul = gsm.gravityFlipped ? -1 : 1;
    const gx = Math.sin(boardTilt.x) * GRAVITY * gravMul;
    const gz = Math.sin(boardTilt.y) * GRAVITY * gravMul;

    // Check current tile
    const tileType = getTileAt(marblePos.x, marblePos.z, board.gridW, board.gridH, board.grid);
    onIce = tileType === TILE.ICE;
    const friction = onIce ? ICE_FRICTION : FRICTION;

    // Apply gravity acceleration
    marbleVel.x += gx * dt;
    marbleVel.y += gz * dt;

    // Apply friction
    marbleVel.x *= friction;
    marbleVel.y *= friction;

    // Boost pads
    if (tileType === TILE.BOOST) {
      marbleVel.y += BOOST_IMPULSE * dt * 10;
      gsm.boostsHit++;
      if (Math.random() < 0.1) audio.playBoost();
    }

    // Clamp speed
    const speedMult = gsm.slowmoActive ? 0.5 : 1.0;
    const speed = Math.sqrt(marbleVel.x * marbleVel.x + marbleVel.y * marbleVel.y);
    const effectiveMaxSpeed = MARBLE_MAX_SPEED * speedMult;
    if (speed > effectiveMaxSpeed) {
      marbleVel.x *= effectiveMaxSpeed / speed;
      marbleVel.y *= effectiveMaxSpeed / speed;
    }

    // Move marble
    marblePos.x += marbleVel.x * dt;
    marblePos.z += marbleVel.y * dt;

    // Wall collisions
    const push = checkWallCollision(marblePos.x, marblePos.z, board.grid, board.gridW, board.gridH);
    if (push) {
      marblePos.x += push.x;
      marblePos.z += push.y;
      // Reflect velocity
      if (Math.abs(push.x) > Math.abs(push.y)) {
        marbleVel.x = -marbleVel.x * BOUNCE_DAMP;
      } else {
        marbleVel.y = -marbleVel.y * BOUNCE_DAMP;
      }
      audio.playBounce(speed);
      if (particles) particles.burst(
        new THREE.Vector3(marblePos.x, marblePos.y, marblePos.z),
        THEMES[gsm.currentTheme].accent, 5, 0.3, 0.4
      );
      // Screen shake on wall bounce
      screenShake.trigger(0.003 + Math.min(speed * 0.002, 0.005));
      gsm.wallBounces++;
    }

    // Rolling sound
    rollSoundTimer -= dt;
    if (speed > 0.2 && rollSoundTimer <= 0) {
      audio.playRoll(speed);
      rollSoundTimer = 0.08;
    }
    if (onIce && speed > 0.3 && Math.random() < 0.05) audio.playIceSlide();

    // Update marble mesh position
    marbleMesh.position.copy(marblePos);
    marbleGlow.position.copy(marblePos);
    if (shieldMesh) {
      shieldMesh.position.copy(marblePos);
      // Shield visual
      if (gsm.shieldActive) {
        (shieldMesh.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(time * 6) * 0.1;
        shieldMesh.rotation.y = time * 3;
      } else {
        (shieldMesh.material as THREE.MeshBasicMaterial).opacity = 0;
      }
    }

    // Marble rotation based on velocity
    marbleMesh.rotation.z -= marbleVel.x * dt * 15;
    marbleMesh.rotation.x += marbleVel.y * dt * 15;

    // Trail
    if (trail && speed > 0.1) {
      trail.addPoint(marblePos.clone());
    }
    // Update trail particles
    if (trail) trail.updateParticles(dt, marblePos, speed);

    // Ghost recording + playback
    if (ghost) {
      ghost.recordFrame(marblePos.x, marblePos.z, dt);
      ghost.update(dt);
    }

    // Minimap marker update
    if (board && minimap) {
      minimap.updateMarker(marblePos.x, marblePos.z, board.gridW, board.gridH);
    }

    // Screen shake
    if (boardEntity) {
      boardEntity.position.copy(boardBasePos);
      screenShake.update(dt, boardEntity);
    }

    // Teleporter cooldown
    if (teleCooldown > 0) teleCooldown -= dt;

    // Power-up timers
    if (gsm.shieldActive) {
      gsm.shieldTimer -= dt;
      if (gsm.shieldTimer <= 0) { gsm.shieldActive = false; gsm.shieldTimer = 0; }
    }
    if (gsm.magnetActive) {
      gsm.magnetTimer -= dt;
      if (gsm.magnetTimer <= 0) { gsm.magnetActive = false; gsm.magnetTimer = 0; }
    }
    if (gsm.slowmoActive) {
      gsm.slowmoTimer -= dt;
      if (gsm.slowmoTimer <= 0) { gsm.slowmoActive = false; gsm.slowmoTimer = 0; }
    }

    // Combo timer
    if (gsm.comboTimer > 0) {
      gsm.comboTimer -= dt;
      if (gsm.comboTimer <= 0) {
        gsm.comboCount = 0;
        gsm.comboTimer = 0;
      }
    }

    // Magnet effect: attract nearby gems
    if (gsm.magnetActive && board) {
      const bw = board.gridW * BOARD_CELL;
      const bh = board.gridH * BOARD_CELL;
      for (const gem of board.gems) {
        if (!gem.visible) continue;
        const dx = gem.position.x - marblePos.x;
        const dz = gem.position.z - marblePos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < BOARD_CELL * 2.5 && dist > 0.01) {
          // Move gem toward marble
          const pull = Math.min(BOARD_CELL * 3 * dt / dist, 0.8);
          gem.position.x -= dx * pull;
          gem.position.z -= dz * pull;
          // Check if gem is close enough to collect
          if (dist < MARBLE_RADIUS * 2) {
            const col = Math.floor((gem.userData?.origX ?? gem.position.x + bw / 2) / BOARD_CELL);
            const row = Math.floor((gem.userData?.origZ ?? gem.position.z + bh / 2) / BOARD_CELL);
            gem.visible = false;
            gsm.gemsCollected++;
            gsm.totalGems++;
            // Combo system
            gsm.comboCount++;
            gsm.comboTimer = COMBO_WINDOW;
            if (gsm.comboCount > gsm.maxCombo) gsm.maxCombo = gsm.comboCount;
            const comboMult = Math.min(gsm.comboCount, 5);
            const gemScore = 200 * comboMult;
            gsm.score += gemScore;
            magnetGems++;
            audio.playGemCollect();
            if (gsm.comboCount >= 2) audio.playCombo(gsm.comboCount);
            magnetPullTimer -= dt;
            if (magnetPullTimer <= 0) { audio.playMagnetPull(); magnetPullTimer = 0.3; }
            if (particles) particles.burst(gem.position.clone(), THEMES[gsm.currentTheme].gem, 8, 0.4, 0.5);
            showToast(gsm.comboCount >= 2 ? `${gsm.comboCount}x Combo! +${gemScore}` : `Magnet Gem! +200`, 0.8);
          }
        }
      }
    }

    // ---- Tile interactions ----
    const currentTile = getTileAt(marblePos.x, marblePos.z, board.gridW, board.gridH, board.grid);

    // Hole: fall!
    if (currentTile === TILE.HOLE) {
      if (gsm.shieldActive) {
        // Shield absorbs the fall
        gsm.shieldActive = false;
        gsm.shieldTimer = 0;
        gsm.shieldsUsed++;
        audio.playShieldBreak();
        if (particles) particles.burst(marblePos.clone(), 0x4488ff, 20, 0.8, 1.0);
        showToast('Shield absorbed fall!', 2);
        screenShake.trigger(0.008);
        resetMarble();
        checkAchievements();
      } else {
        gsm.lives--;
        gsm.totalDeaths++;
        gsm.noDeathStreak = 0;
        audio.playFall();
        if (particles) particles.burst(marblePos.clone(), 0xff3333, 15, 0.6, 0.8);
        screenShake.trigger(0.012);
        if (gsm.lives <= 0) {
          changeState('gameover');
        } else {
          showToast(`Fell! Lives: ${gsm.lives}`, 1.5);
          resetMarble();
        }
      }
    }

    // Gem: collect
    if (currentTile === TILE.GEM) {
      // Find and hide the gem mesh at this position
      const bw = board.gridW * BOARD_CELL;
      const bh = board.gridH * BOARD_CELL;
      const col = Math.floor((marblePos.x + bw / 2) / BOARD_CELL);
      const row = Math.floor((marblePos.z + bh / 2) / BOARD_CELL);
      // Mark tile as empty
      board.grid[row][col] = TILE.EMPTY;
      // Hide gem mesh
      for (const gem of board.gems) {
        const gx = gem.position.x;
        const gz = gem.position.z;
        const gcol = Math.floor((gx + bw / 2) / BOARD_CELL);
        const grow = Math.floor((gz + bh / 2) / BOARD_CELL);
        if (gcol === col && grow === row && gem.visible) {
          gem.visible = false;
          gsm.gemsCollected++;
          gsm.totalGems++;
          // Combo system
          gsm.comboCount++;
          gsm.comboTimer = COMBO_WINDOW;
          if (gsm.comboCount > gsm.maxCombo) gsm.maxCombo = gsm.comboCount;
          const comboMult = Math.min(gsm.comboCount, 5);
          const gemScore = 200 * comboMult;
          gsm.score += gemScore;
          if (gsm.magnetActive) magnetGems++;
          audio.playGemCollect();
          if (gsm.comboCount >= 2) audio.playCombo(gsm.comboCount);
          if (particles) particles.burst(gem.position.clone(), THEMES[gsm.currentTheme].gem, 12, 0.5, 0.6);
          showToast(gsm.comboCount >= 2 ? `${gsm.comboCount}x Combo! +${gemScore}` : `Gem! +200`, 1);
          break;
        }
      }
    }

    // Goal: level complete!
    if (currentTile === TILE.GOAL) {
      changeState('levelcomplete');
    }

    // Teleporter
    if ((currentTile === TILE.TELE_A || currentTile === TILE.TELE_B) && teleCooldown <= 0) {
      const target = currentTile === TILE.TELE_A ? board.teleB : board.teleA;
      if (target) {
        const destLocal = gridToLocal(target.x, target.y, board.gridW, board.gridH);
        marblePos.copy(destLocal);
        teleCooldown = 0.5;
        gsm.warpsUsed++;
        audio.playTeleport();
        if (particles) particles.burst(marblePos.clone(), 0xff00ff, 15, 0.6, 0.8);
        showToast('Warped!', 1);
      }
    }

    // Power-up pickup
    if (board.powerups) {
      const bw = board.gridW * BOARD_CELL;
      const bh = board.gridH * BOARD_CELL;
      for (const pu of board.powerups) {
        if (pu.collected) continue;
        const dx = pu.mesh.position.x - marblePos.x;
        const dz = pu.mesh.position.z - marblePos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < BOARD_CELL * 0.5) {
          pu.collected = true;
          pu.mesh.visible = false;
          pu.glowMesh.visible = false;
          board.grid[pu.row][pu.col] = TILE.EMPTY;
          gsm.powerupsCollected++;
          if (pu.type === TILE.POWERUP_SHIELD) {
            gsm.shieldActive = true;
            gsm.shieldTimer = 15;
            audio.playPowerup('shield');
            showToast('Shield Active! (15s)', 2);
            if (particles) particles.burst(marblePos.clone(), 0x4488ff, 15, 0.6, 0.8);
          } else if (pu.type === TILE.POWERUP_MAGNET) {
            gsm.magnetActive = true;
            gsm.magnetTimer = 10;
            magnetGems = 0;
            audio.playPowerup('magnet');
            showToast('Magnet Active! (10s)', 2);
            if (particles) particles.burst(marblePos.clone(), 0xffcc00, 15, 0.6, 0.8);
          } else if (pu.type === TILE.POWERUP_SLOWMO) {
            gsm.slowmoActive = true;
            gsm.slowmoTimer = 8;
            audio.playPowerup('slowmo');
            showToast('Slow-Mo Active! (8s)', 2);
            if (particles) particles.burst(marblePos.clone(), 0xcc44ff, 15, 0.6, 0.8);
          }
          checkAchievements();
        }
      }
    }

    // Gravity switch detection
    if (gravitySwitchCooldown > 0) gravitySwitchCooldown -= dt;
    if (board.gravitySwitches && gravitySwitchCooldown <= 0) {
      for (const gs of board.gravitySwitches) {
        const bw = board.gridW * BOARD_CELL;
        const bh = board.gridH * BOARD_CELL;
        const gx = gs.col * BOARD_CELL - bw / 2 + BOARD_CELL / 2;
        const gz = gs.row * BOARD_CELL - bh / 2 + BOARD_CELL / 2;
        const dx = gx - marblePos.x;
        const dz = gz - marblePos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < BOARD_CELL * 0.4) {
          gsm.gravityFlipped = !gsm.gravityFlipped;
          gravitySwitchCooldown = 0.8;
          audio.playTeleport(); // reuse teleport sound
          showToast(gsm.gravityFlipped ? 'Gravity Reversed!' : 'Gravity Normal!', 1.5);
          if (particles) {
            particles.burst(
              new THREE.Vector3(marblePos.x, marblePos.y, marblePos.z),
              0x00ff00, 12, 0.5, 0.6
            );
          }
        }
      }
    }

    // Moving wall collision check
    if (board.movingWalls) {
      for (const mw of board.movingWalls) {
        const wPos = mw.mesh.position;
        const hw = BOARD_CELL * 0.475;
        // Closest point on moving wall box to marble center
        const cx = Math.max(wPos.x - hw, Math.min(marblePos.x, wPos.x + hw));
        const cz = Math.max(wPos.z - hw, Math.min(marblePos.z, wPos.z + hw));
        const dx = marblePos.x - cx;
        const dz = marblePos.z - cz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < MARBLE_RADIUS && dist > 0.0001) {
          const overlap = MARBLE_RADIUS - dist;
          marblePos.x += (dx / dist) * overlap;
          marblePos.z += (dz / dist) * overlap;
          if (Math.abs(dx) > Math.abs(dz)) {
            marbleVel.x = -marbleVel.x * BOUNCE_DAMP;
          } else {
            marbleVel.y = -marbleVel.y * BOUNCE_DAMP;
          }
          const spd = Math.sqrt(marbleVel.x * marbleVel.x + marbleVel.y * marbleVel.y);
          audio.playBounce(spd);
          if (particles) {
            particles.burst(
              new THREE.Vector3(marblePos.x, marblePos.y, marblePos.z),
              0xff8800, 5, 0.3, 0.4
            );
          }
        }
      }
    }

    // Bumper collision check
    if (board.bumpers) {
      for (const b of board.bumpers) {
        const bx = b.mesh.position.x;
        const bz = b.mesh.position.z;
        const dx = marblePos.x - bx;
        const dz = marblePos.z - bz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const bumperRadius = BOARD_CELL * 0.3;
        if (dist < bumperRadius + MARBLE_RADIUS && dist > 0.0001) {
          // Push marble out and launch with boosted velocity
          const overlap = (bumperRadius + MARBLE_RADIUS) - dist;
          const nx = dx / dist;
          const nz = dz / dist;
          marblePos.x += nx * overlap;
          marblePos.z += nz * overlap;
          // Launch velocity — 1.5x current speed in bounce direction, minimum impulse
          const spd = Math.sqrt(marbleVel.x * marbleVel.x + marbleVel.y * marbleVel.y);
          const launchSpeed = Math.max(spd * 1.5, 1.2);
          marbleVel.x = nx * launchSpeed;
          marbleVel.y = nz * launchSpeed;
          gsm.bumpersHit++;
          audio.playBumper();
          if (particles) {
            particles.burst(
              new THREE.Vector3(marblePos.x, marblePos.y, marblePos.z),
              0xff66ff, 15, 0.7, 0.6
            );
          }
          showToast('Bumper!', 0.6);
          // Visual feedback — scale bump
          b.mesh.scale.set(1.4, 1.4, 1.4);
          setTimeout(() => { b.mesh.scale.set(1, 1, 1); }, 150);
          checkAchievements();
        }
      }
    }

    // Animate board elements
    animateBoard(board, time);
  }

  // Pause: listen for escape
  if (gsm.state === 'paused') {
    if (keys['escape']) { keys['escape'] = false; changeState('playing'); }
  }

  requestAnimationFrame(update);
}

// ============================================================
// Start
// ============================================================
gsm.themesUsed.add(gsm.currentTheme);
changeState('title');
requestAnimationFrame(update);
