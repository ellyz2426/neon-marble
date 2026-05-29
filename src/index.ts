// index.ts — Main entry: IWSDK world, game loop, state machine, UI binding
import { World, PanelUI, Follower, FollowBehavior, ScreenSpace, PanelDocument } from '@iwsdk/core';
import type { UIKitDocument } from '@iwsdk/core';
import * as THREE from 'three';
import {
  GameStateManager, GameState, LEVELS, TILE, THEMES, ACHIEVEMENTS,
  BOARD_CELL, MARBLE_RADIUS, MAX_TILT, TILT_SPEED, GRAVITY,
  FRICTION, ICE_FRICTION, BOUNCE_DAMP, BOOST_IMPULSE, MARBLE_MAX_SPEED,
  addLeaderboard, getLeaderboard, getDailySeed, seededRandom,
} from './types.js';
import { buildBoard, gridToLocal, getTileAt, checkWallCollision, animateBoard, BoardObjects } from './board.js';
import { AudioManager } from './audio.js';
import { ParticleSystem, TrailSystem, AmbientParticles, createHolodeckDecorations, animateDecorations } from './effects.js';

// ============================================================
// IWSDK World Init
// ============================================================
const container = document.getElementById('app') as HTMLDivElement;
const world = await World.create(container, {
  xr: { offer: 'once' },
  features: { spatialUI: true },
});

const scene = world.scene;
const camera = (world as any).render?.camera || (scene.children.find((c: any) => c.isCamera) as THREE.PerspectiveCamera);

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
  | 'gameover' | 'leaderboard' | 'achievements' | 'settings' | 'help' | 'toast' | 'countdown';

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
    entity.object3D.position.set(...opts.worldPos);
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

function showPanel(name: PanelName) {
  panels.forEach((p, n) => {
    p.entity.object3D.visible = n === name || (name === 'playing' && n === 'hud');
  });
  // HUD is always visible during play
  if (name === 'playing' as any) {
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
}

function updateLevelSelect() {
  for (let i = 0; i < 12; i++) {
    const cleared = gsm.campaignProgress[i] || false;
    const best = gsm.bestTimes[i];
    const label = i < LEVELS.length ? LEVELS[i].name : `Level ${i + 1}`;
    setText('levelselect', `lvl-name-${i}`, label);
    setText('levelselect', `lvl-status-${i}`, cleared ? (best ? `Best: ${best.toFixed(1)}s` : 'Cleared') : '---');
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

  // Create marble
  const theme = THEMES[gsm.currentTheme];
  const marbleGeo = new THREE.SphereGeometry(MARBLE_RADIUS, 16, 16);
  const marbleMat = new THREE.MeshStandardMaterial({
    color: theme.marble,
    emissive: new THREE.Color(theme.marble),
    emissiveIntensity: 0.4,
    roughness: 0.2,
    metalness: 0.7,
  });
  marbleMesh = new THREE.Mesh(marbleGeo, marbleMat);
  boardEntity.add(marbleMesh);

  // Marble glow
  marbleGlow = new THREE.Mesh(
    new THREE.SphereGeometry(MARBLE_RADIUS * 1.8, 8, 8),
    new THREE.MeshBasicMaterial({ color: theme.glow, transparent: true, opacity: 0.15 })
  );
  boardEntity.add(marbleGlow);

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
  trail = new TrailSystem(boardEntity, theme.glow);
}

function resetMarble() {
  if (!board || !marbleMesh || !marbleGlow) return;
  const startLocal = gridToLocal(board.startPos.x, board.startPos.y, board.gridW, board.gridH);
  marblePos.copy(startLocal);
  marbleMesh.position.copy(marblePos);
  marbleGlow.position.copy(marblePos);
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
      gsm.noDeathStreak++;
      if (isPerfect) gsm.perfectLevels++;
      if (gsm.mode === 'campaign') {
        gsm.campaignProgress[gsm.level] = true;
        const bt = gsm.bestTimes[gsm.level];
        if (!bt || gsm.elapsedTime < bt) gsm.bestTimes[gsm.level] = gsm.elapsedTime;
      }
      if (gsm.mode === 'timeattack') gsm.timeAttackClears++;
      if (gsm.mode === 'daily') gsm.dailyCompleted++;

      // Score calculation
      const baseScore = 1000;
      const timeBonus = Math.max(0, Math.floor((level.par - gsm.elapsedTime) * 50));
      const gemBonus = gsm.gemsCollected * 200;
      const perfectBonus = isPerfect ? 500 : 0;
      gsm.score += baseScore + timeBonus + gemBonus + perfectBonus;

      addLeaderboard({
        level: level.name,
        mode: gsm.mode,
        time: gsm.elapsedTime,
        gems: gsm.gemsCollected,
        score: gsm.score,
        date: new Date().toISOString().split('T')[0],
      });

      setText('levelcomplete', 'lc-title', 'Level Complete!');
      setText('levelcomplete', 'lc-level', level.name);
      setText('levelcomplete', 'lc-time', `Time: ${gsm.elapsedTime.toFixed(1)}s`);
      setText('levelcomplete', 'lc-gems', `Gems: ${gsm.gemsCollected}/${gsm.gemsTotal}`);
      setText('levelcomplete', 'lc-par', underPar ? 'Under par!' : `Par: ${level.par}s`);
      setText('levelcomplete', 'lc-score', `Score: ${gsm.score}`);

      audio.playGoal();
      if (particles) particles.burst(marblePos, THEMES[gsm.currentTheme].goal, 25, 0.8, 1.2);
      checkAchievements();
      gsm.save();
      break;
    }
    case 'gameover':
      setText('gameover', 'go-score', `Final Score: ${gsm.score}`);
      setText('gameover', 'go-levels', `Levels Cleared: ${gsm.totalClears}`);
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
  modeDoc?.getElementById('btn-mode-back')?.addEventListener('click', () => { audio.playButton(); changeState('title'); });

  // Level select
  const lvlDoc = getDoc('levelselect');
  for (let i = 0; i < 12; i++) {
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
    const next = gsm.level + 1;
    if (next < LEVELS.length) { startLevel(next); }
    else { changeState('title'); showToast('All levels complete!'); }
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
}

// ============================================================
// Main Game Loop
// ============================================================
const _tmpV3 = new THREE.Vector3();

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

    // ---- Physics: marble on tilted board ----
    // Gravity component on tilted surface
    const gx = Math.sin(boardTilt.x) * GRAVITY;
    const gz = Math.sin(boardTilt.y) * GRAVITY;

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
    const speed = Math.sqrt(marbleVel.x * marbleVel.x + marbleVel.y * marbleVel.y);
    if (speed > MARBLE_MAX_SPEED) {
      marbleVel.x *= MARBLE_MAX_SPEED / speed;
      marbleVel.y *= MARBLE_MAX_SPEED / speed;
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

    // Marble rotation based on velocity
    marbleMesh.rotation.z -= marbleVel.x * dt * 15;
    marbleMesh.rotation.x += marbleVel.y * dt * 15;

    // Trail
    if (trail && speed > 0.1) trail.addPoint(marblePos.clone());

    // Teleporter cooldown
    if (teleCooldown > 0) teleCooldown -= dt;

    // ---- Tile interactions ----
    const currentTile = getTileAt(marblePos.x, marblePos.z, board.gridW, board.gridH, board.grid);

    // Hole: fall!
    if (currentTile === TILE.HOLE) {
      gsm.lives--;
      gsm.totalDeaths++;
      gsm.noDeathStreak = 0;
      audio.playFall();
      if (particles) particles.burst(marblePos.clone(), 0xff3333, 15, 0.6, 0.8);
      if (gsm.lives <= 0) {
        changeState('gameover');
      } else {
        showToast(`Fell! Lives: ${gsm.lives}`, 1.5);
        resetMarble();
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
          gsm.score += 200;
          audio.playGemCollect();
          if (particles) particles.burst(gem.position.clone(), THEMES[gsm.currentTheme].gem, 12, 0.5, 0.6);
          showToast(`Gem! +200`, 1);
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
