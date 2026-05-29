// board.ts — Board geometry, maze rendering, tile objects
import * as THREE from 'three';
import {
  LevelDef, TILE, TileType, BoardTheme, THEMES,
  BOARD_CELL, WALL_HEIGHT, BOARD_THICKNESS, MARBLE_RADIUS
} from './types.js';

export interface BoardObjects {
  group: THREE.Group;
  floor: THREE.Mesh;
  walls: THREE.Mesh[];
  holes: THREE.Mesh[];
  gems: THREE.Mesh[];
  goalMesh: THREE.Mesh | null;
  startPos: THREE.Vector2;
  goalPos: THREE.Vector2;
  teleA: THREE.Vector2 | null;
  teleB: THREE.Vector2 | null;
  teleMeshA: THREE.Mesh | null;
  teleMeshB: THREE.Mesh | null;
  iceTiles: THREE.Mesh[];
  boostTiles: { mesh: THREE.Mesh; dir: THREE.Vector2 }[];
  powerups: { mesh: THREE.Mesh; glowMesh: THREE.Mesh; type: number; col: number; row: number; collected: boolean }[];
  movingWalls: { mesh: THREE.Mesh; edgeMesh: THREE.LineSegments; col: number; row: number; axis: 'x' | 'z'; speed: number; range: number; basePos: THREE.Vector3 }[];
  gravitySwitches: { mesh: THREE.Mesh; glowMesh: THREE.Mesh; col: number; row: number; cooldown: number }[];
  bumpers: { mesh: THREE.Mesh; glowMesh: THREE.Mesh; col: number; row: number }[];
  gridW: number;
  gridH: number;
  grid: number[][];
}

const _v2 = new THREE.Vector2();

export function buildBoard(level: LevelDef, themeIdx: number): BoardObjects {
  const theme = THEMES[themeIdx] || THEMES[0];
  const grid = level.grid;
  const gridH = grid.length;
  const gridW = grid[0].length;
  const bw = gridW * BOARD_CELL;
  const bh = gridH * BOARD_CELL;

  const group = new THREE.Group();

  // Board floor
  const floorGeo = new THREE.BoxGeometry(bw, BOARD_THICKNESS, bh);
  const floorMat = new THREE.MeshStandardMaterial({
    color: theme.floor,
    roughness: 0.6,
    metalness: 0.3,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.set(0, -BOARD_THICKNESS / 2, 0);
  group.add(floor);

  // Neon grid lines on the floor
  const gridLineMat = new THREE.LineBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.15 });
  for (let r = 0; r <= gridH; r++) {
    const z = r * BOARD_CELL - bh / 2;
    const pts = [new THREE.Vector3(-bw / 2, 0.001, z), new THREE.Vector3(bw / 2, 0.001, z)];
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridLineMat));
  }
  for (let c = 0; c <= gridW; c++) {
    const x = c * BOARD_CELL - bw / 2;
    const pts = [new THREE.Vector3(x, 0.001, -bh / 2), new THREE.Vector3(x, 0.001, bh / 2)];
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridLineMat));
  }

  // Edge glow
  const edgeGeo = new THREE.EdgesGeometry(floorGeo);
  const edgeMat = new THREE.LineBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.5 });
  const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
  edgeLines.position.copy(floor.position);
  group.add(edgeLines);

  const walls: THREE.Mesh[] = [];
  const holes: THREE.Mesh[] = [];
  const gems: THREE.Mesh[] = [];
  const iceTiles: THREE.Mesh[] = [];
  const boostTiles: { mesh: THREE.Mesh; dir: THREE.Vector2 }[] = [];
  let goalMesh: THREE.Mesh | null = null;
  let startPos = new THREE.Vector2(1, 1);
  let goalPos = new THREE.Vector2(6, 6);
  let teleA: THREE.Vector2 | null = null;
  let teleB: THREE.Vector2 | null = null;
  let teleMeshA: THREE.Mesh | null = null;
  let teleMeshB: THREE.Mesh | null = null;

  const wallGeo = new THREE.BoxGeometry(BOARD_CELL * 0.95, WALL_HEIGHT, BOARD_CELL * 0.95);
  const wallMat = new THREE.MeshStandardMaterial({
    color: theme.wall,
    emissive: new THREE.Color(theme.wall),
    emissiveIntensity: 0.3,
    roughness: 0.4,
    metalness: 0.5,
  });

  const holeGeo = new THREE.CylinderGeometry(BOARD_CELL * 0.35, BOARD_CELL * 0.35, BOARD_THICKNESS + 0.01, 16);
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff0000, emissiveIntensity: 0.2 });

  const gemGeo = new THREE.OctahedronGeometry(BOARD_CELL * 0.15);
  const gemMat = new THREE.MeshStandardMaterial({
    color: theme.gem,
    emissive: new THREE.Color(theme.gem),
    emissiveIntensity: 0.6,
    roughness: 0.2,
    metalness: 0.8,
  });

  const goalGeo = new THREE.TorusGeometry(BOARD_CELL * 0.3, BOARD_CELL * 0.06, 8, 16);
  const goalMat = new THREE.MeshStandardMaterial({
    color: theme.goal,
    emissive: new THREE.Color(theme.goal),
    emissiveIntensity: 0.8,
    roughness: 0.3,
  });

  const teleGeo = new THREE.TorusGeometry(BOARD_CELL * 0.28, BOARD_CELL * 0.05, 8, 16);
  const teleMatA = new THREE.MeshStandardMaterial({ color: 0xff00ff, emissive: 0xff00ff, emissiveIntensity: 0.6 });
  const teleMatB = new THREE.MeshStandardMaterial({ color: 0x8800ff, emissive: 0x8800ff, emissiveIntensity: 0.6 });

  const iceGeo = new THREE.PlaneGeometry(BOARD_CELL * 0.9, BOARD_CELL * 0.9);
  const iceMat = new THREE.MeshStandardMaterial({
    color: 0x88ccff,
    emissive: 0x4488cc,
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.5,
    roughness: 0.1,
    metalness: 0.9,
  });

  const boostGeo = new THREE.PlaneGeometry(BOARD_CELL * 0.8, BOARD_CELL * 0.8);
  const boostMat = new THREE.MeshStandardMaterial({
    color: 0x00ff88,
    emissive: 0x00ff88,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.6,
  });

  // Power-up geometries
  const puShieldGeo = new THREE.SphereGeometry(BOARD_CELL * 0.22, 12, 12);
  const puShieldMat = new THREE.MeshStandardMaterial({
    color: 0x4488ff, emissive: 0x2266ff, emissiveIntensity: 0.7,
    transparent: true, opacity: 0.7, roughness: 0.1, metalness: 0.9,
  });
  const puMagnetGeo = new THREE.CylinderGeometry(BOARD_CELL * 0.15, BOARD_CELL * 0.2, BOARD_CELL * 0.2, 6);
  const puMagnetMat = new THREE.MeshStandardMaterial({
    color: 0xffcc00, emissive: 0xffaa00, emissiveIntensity: 0.7,
    roughness: 0.3, metalness: 0.8,
  });
  const puSlowmoGeo = new THREE.TorusKnotGeometry(BOARD_CELL * 0.12, BOARD_CELL * 0.04, 32, 8, 2, 3);
  const puSlowmoMat = new THREE.MeshStandardMaterial({
    color: 0xcc44ff, emissive: 0xaa22ff, emissiveIntensity: 0.7,
    roughness: 0.2, metalness: 0.7,
  });
  const puGlowGeo = new THREE.SphereGeometry(BOARD_CELL * 0.3, 8, 8);

  // Moving wall and gravity switch materials
  const movWallMat = new THREE.MeshStandardMaterial({
    color: 0xff8800, emissive: 0xff4400, emissiveIntensity: 0.5,
    roughness: 0.3, metalness: 0.6,
  });
  const gravSwitchGeo = new THREE.CylinderGeometry(BOARD_CELL * 0.25, BOARD_CELL * 0.25, 0.01, 8);
  const gravSwitchMat = new THREE.MeshStandardMaterial({
    color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0.6,
    roughness: 0.2, metalness: 0.8,
  });
  const gravGlowGeo = new THREE.SphereGeometry(BOARD_CELL * 0.35, 8, 8);

  // Bumper geometry
  const bumperGeo = new THREE.SphereGeometry(BOARD_CELL * 0.3, 12, 12);
  const bumperMat = new THREE.MeshStandardMaterial({
    color: 0xff66ff, emissive: 0xff22cc, emissiveIntensity: 0.7,
    roughness: 0.2, metalness: 0.6,
  });
  const bumperGlowGeo = new THREE.SphereGeometry(BOARD_CELL * 0.45, 8, 8);

  const powerups: { mesh: THREE.Mesh; glowMesh: THREE.Mesh; type: number; col: number; row: number; collected: boolean }[] = [];
  const movingWalls: { mesh: THREE.Mesh; edgeMesh: THREE.LineSegments; col: number; row: number; axis: 'x' | 'z'; speed: number; range: number; basePos: THREE.Vector3 }[] = [];
  const gravitySwitches: { mesh: THREE.Mesh; glowMesh: THREE.Mesh; col: number; row: number; cooldown: number }[] = [];
  const bumpers: { mesh: THREE.Mesh; glowMesh: THREE.Mesh; col: number; row: number }[] = [];

  for (let r = 0; r < gridH; r++) {
    for (let c = 0; c < gridW; c++) {
      const tile = grid[r][c] as TileType;
      const x = c * BOARD_CELL - bw / 2 + BOARD_CELL / 2;
      const z = r * BOARD_CELL - bh / 2 + BOARD_CELL / 2;

      switch (tile) {
        case TILE.WALL: {
          const w = new THREE.Mesh(wallGeo, wallMat);
          w.position.set(x, WALL_HEIGHT / 2, z);
          group.add(w);
          // Wireframe edge
          const we = new THREE.LineSegments(
            new THREE.EdgesGeometry(wallGeo),
            new THREE.LineBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.6 })
          );
          we.position.copy(w.position);
          group.add(we);
          walls.push(w);
          break;
        }
        case TILE.HOLE: {
          const h = new THREE.Mesh(holeGeo, holeMat);
          h.position.set(x, -BOARD_THICKNESS / 2, z);
          h.rotation.x = 0;
          group.add(h);
          // Glow ring around hole
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(BOARD_CELL * 0.36, 0.003, 8, 24),
            new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.7 })
          );
          ring.position.set(x, 0.002, z);
          ring.rotation.x = -Math.PI / 2;
          group.add(ring);
          holes.push(h);
          break;
        }
        case TILE.GEM: {
          const g = new THREE.Mesh(gemGeo, gemMat.clone());
          g.position.set(x, BOARD_CELL * 0.2, z);
          group.add(g);
          // Glow sphere
          const glow = new THREE.Mesh(
            new THREE.SphereGeometry(BOARD_CELL * 0.2, 8, 8),
            new THREE.MeshBasicMaterial({ color: theme.gem, transparent: true, opacity: 0.15 })
          );
          glow.position.copy(g.position);
          group.add(glow);
          gems.push(g);
          break;
        }
        case TILE.GOAL: {
          goalMesh = new THREE.Mesh(goalGeo, goalMat);
          goalMesh.position.set(x, BOARD_CELL * 0.15, z);
          goalMesh.rotation.x = -Math.PI / 2;
          group.add(goalMesh);
          goalPos.set(c, r);
          // Beacon
          const beacon = new THREE.Mesh(
            new THREE.CylinderGeometry(0.003, 0.003, WALL_HEIGHT * 2, 8),
            new THREE.MeshBasicMaterial({ color: theme.goal, transparent: true, opacity: 0.4 })
          );
          beacon.position.set(x, WALL_HEIGHT, z);
          group.add(beacon);
          break;
        }
        case TILE.START: {
          startPos.set(c, r);
          // Start marker ring
          const sRing = new THREE.Mesh(
            new THREE.TorusGeometry(BOARD_CELL * 0.25, 0.003, 8, 24),
            new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.5 })
          );
          sRing.position.set(x, 0.002, z);
          sRing.rotation.x = -Math.PI / 2;
          group.add(sRing);
          break;
        }
        case TILE.TELE_A: {
          teleA = new THREE.Vector2(c, r);
          teleMeshA = new THREE.Mesh(teleGeo, teleMatA);
          teleMeshA.position.set(x, BOARD_CELL * 0.12, z);
          teleMeshA.rotation.x = -Math.PI / 2;
          group.add(teleMeshA);
          break;
        }
        case TILE.TELE_B: {
          teleB = new THREE.Vector2(c, r);
          teleMeshB = new THREE.Mesh(teleGeo, teleMatB);
          teleMeshB.position.set(x, BOARD_CELL * 0.12, z);
          teleMeshB.rotation.x = -Math.PI / 2;
          group.add(teleMeshB);
          break;
        }
        case TILE.ICE: {
          const ice = new THREE.Mesh(iceGeo, iceMat.clone());
          ice.position.set(x, 0.002, z);
          ice.rotation.x = -Math.PI / 2;
          group.add(ice);
          iceTiles.push(ice);
          break;
        }
        case TILE.BOOST: {
          const bm = new THREE.Mesh(boostGeo, boostMat.clone());
          bm.position.set(x, 0.003, z);
          bm.rotation.x = -Math.PI / 2;
          group.add(bm);
          // Chevron arrows on boost pad
          const arrow = new THREE.Mesh(
            new THREE.ConeGeometry(BOARD_CELL * 0.12, BOARD_CELL * 0.2, 4),
            new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.6 })
          );
          arrow.position.set(x, 0.01, z);
          arrow.rotation.x = -Math.PI / 2;
          group.add(arrow);
          boostTiles.push({ mesh: bm, dir: new THREE.Vector2(0, 1) }); // default forward boost
          break;
        }
        case TILE.POWERUP_SHIELD: {
          const pm = new THREE.Mesh(puShieldGeo, puShieldMat.clone());
          pm.position.set(x, BOARD_CELL * 0.25, z);
          group.add(pm);
          const pg = new THREE.Mesh(puGlowGeo, new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.15 }));
          pg.position.copy(pm.position);
          group.add(pg);
          powerups.push({ mesh: pm, glowMesh: pg, type: TILE.POWERUP_SHIELD, col: c, row: r, collected: false });
          break;
        }
        case TILE.POWERUP_MAGNET: {
          const pm = new THREE.Mesh(puMagnetGeo, puMagnetMat.clone());
          pm.position.set(x, BOARD_CELL * 0.2, z);
          group.add(pm);
          const pg = new THREE.Mesh(puGlowGeo, new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.15 }));
          pg.position.copy(pm.position);
          group.add(pg);
          powerups.push({ mesh: pm, glowMesh: pg, type: TILE.POWERUP_MAGNET, col: c, row: r, collected: false });
          break;
        }
        case TILE.POWERUP_SLOWMO: {
          const pm = new THREE.Mesh(puSlowmoGeo, puSlowmoMat.clone());
          pm.position.set(x, BOARD_CELL * 0.2, z);
          group.add(pm);
          const pg = new THREE.Mesh(puGlowGeo, new THREE.MeshBasicMaterial({ color: 0xcc44ff, transparent: true, opacity: 0.15 }));
          pg.position.copy(pm.position);
          group.add(pg);
          powerups.push({ mesh: pm, glowMesh: pg, type: TILE.POWERUP_SLOWMO, col: c, row: r, collected: false });
          break;
        }
        case TILE.MOVING_WALL: {
          const mw = new THREE.Mesh(wallGeo, movWallMat.clone());
          mw.position.set(x, WALL_HEIGHT / 2, z);
          group.add(mw);
          const mwe = new THREE.LineSegments(
            new THREE.EdgesGeometry(wallGeo),
            new THREE.LineBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.7 })
          );
          mwe.position.copy(mw.position);
          group.add(mwe);
          // Alternate axis based on position for variety
          const axis = (c + r) % 2 === 0 ? 'x' : 'z';
          movingWalls.push({
            mesh: mw, edgeMesh: mwe, col: c, row: r,
            axis, speed: 0.8 + (c % 3) * 0.3, range: BOARD_CELL * 0.9,
            basePos: new THREE.Vector3(x, WALL_HEIGHT / 2, z),
          });
          break;
        }
        case TILE.GRAVITY_SWITCH: {
          const gs = new THREE.Mesh(gravSwitchGeo, gravSwitchMat.clone());
          gs.position.set(x, 0.005, z);
          group.add(gs);
          const gg = new THREE.Mesh(gravGlowGeo, new THREE.MeshBasicMaterial({
            color: 0x00ff00, transparent: true, opacity: 0.2,
          }));
          gg.position.set(x, 0.02, z);
          group.add(gg);
          // Arrow indicator
          const arrow = new THREE.Mesh(
            new THREE.ConeGeometry(BOARD_CELL * 0.1, BOARD_CELL * 0.15, 4),
            new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5 })
          );
          arrow.position.set(x, 0.03, z);
          arrow.rotation.x = Math.PI; // pointing down (gravity)
          group.add(arrow);
          gravitySwitches.push({ mesh: gs, glowMesh: gg, col: c, row: r, cooldown: 0 });
          break;
        }
        case TILE.BUMPER: {
          const bm = new THREE.Mesh(bumperGeo, bumperMat.clone());
          bm.position.set(x, BOARD_CELL * 0.3, z);
          group.add(bm);
          const bg = new THREE.Mesh(bumperGlowGeo, new THREE.MeshBasicMaterial({
            color: 0xff66ff, transparent: true, opacity: 0.2,
          }));
          bg.position.copy(bm.position);
          group.add(bg);
          // Ring at base
          const bRing = new THREE.Mesh(
            new THREE.TorusGeometry(BOARD_CELL * 0.32, 0.003, 8, 24),
            new THREE.MeshBasicMaterial({ color: 0xff66ff, transparent: true, opacity: 0.6 })
          );
          bRing.position.set(x, 0.002, z);
          bRing.rotation.x = -Math.PI / 2;
          group.add(bRing);
          bumpers.push({ mesh: bm, glowMesh: bg, col: c, row: r });
          break;
        }
      }
    }
  }

  return {
    group, floor, walls, holes, gems, goalMesh,
    startPos, goalPos, teleA, teleB, teleMeshA, teleMeshB,
    iceTiles, boostTiles, powerups, movingWalls, gravitySwitches, bumpers, gridW, gridH, grid
  };
}

// Convert grid coords to local board position
export function gridToLocal(col: number, row: number, gridW: number, gridH: number): THREE.Vector3 {
  const bw = gridW * BOARD_CELL;
  const bh = gridH * BOARD_CELL;
  return new THREE.Vector3(
    col * BOARD_CELL - bw / 2 + BOARD_CELL / 2,
    MARBLE_RADIUS + 0.002,
    row * BOARD_CELL - bh / 2 + BOARD_CELL / 2
  );
}

// Get tile at world-local position on the board
export function getTileAt(x: number, z: number, gridW: number, gridH: number, grid: number[][]): TileType {
  const bw = gridW * BOARD_CELL;
  const bh = gridH * BOARD_CELL;
  const col = Math.floor((x + bw / 2) / BOARD_CELL);
  const row = Math.floor((z + bh / 2) / BOARD_CELL);
  if (row < 0 || row >= gridH || col < 0 || col >= gridW) return TILE.WALL;
  return grid[row][col] as TileType;
}

// Check if marble collides with walls, return push-out vector
export function checkWallCollision(
  mx: number, mz: number, grid: number[][], gridW: number, gridH: number
): THREE.Vector2 | null {
  const bw = gridW * BOARD_CELL;
  const bh = gridH * BOARD_CELL;
  const col = Math.floor((mx + bw / 2) / BOARD_CELL);
  const row = Math.floor((mz + bh / 2) / BOARD_CELL);

  const pushOut = new THREE.Vector2(0, 0);
  let collided = false;

  // Check neighbors and self
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || r >= gridH || c < 0 || c >= gridW) continue;
      if (grid[r][c] !== TILE.WALL) continue;

      // Wall cell center
      const wx = c * BOARD_CELL - bw / 2 + BOARD_CELL / 2;
      const wz = r * BOARD_CELL - bh / 2 + BOARD_CELL / 2;
      const hw = BOARD_CELL * 0.475;  // half wall size

      // Closest point on wall box to marble center
      const cx = Math.max(wx - hw, Math.min(mx, wx + hw));
      const cz = Math.max(wz - hw, Math.min(mz, wz + hw));
      const dx = mx - cx;
      const dz = mz - cz;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < MARBLE_RADIUS && dist > 0.0001) {
        const overlap = MARBLE_RADIUS - dist;
        pushOut.x += (dx / dist) * overlap;
        pushOut.y += (dz / dist) * overlap;
        collided = true;
      }
    }
  }

  return collided ? pushOut : null;
}

// Animate board objects (gems rotate, goal pulses, teleporters spin, power-ups float)
export function animateBoard(board: BoardObjects, time: number) {
  for (const gem of board.gems) {
    if (gem.visible) {
      gem.rotation.y = time * 2;
      gem.rotation.x = Math.sin(time * 3) * 0.3;
      gem.position.y = BOARD_CELL * 0.2 + Math.sin(time * 2.5) * 0.005;
    }
  }
  if (board.goalMesh) {
    board.goalMesh.rotation.z = time * 1.5;
    const s = 1 + Math.sin(time * 3) * 0.1;
    board.goalMesh.scale.set(s, s, s);
    // Enhanced glow pulsing
    const goalMat = board.goalMesh.material as THREE.MeshStandardMaterial;
    goalMat.emissiveIntensity = 0.6 + Math.sin(time * 4) * 0.3;
  }
  if (board.teleMeshA) board.teleMeshA.rotation.z = time * 2;
  if (board.teleMeshB) board.teleMeshB.rotation.z = -time * 2;
  for (const ice of board.iceTiles) {
    (ice.material as THREE.MeshStandardMaterial).opacity = 0.4 + Math.sin(time * 1.5) * 0.1;
  }
  for (const bt of board.boostTiles) {
    (bt.mesh.material as THREE.MeshStandardMaterial).opacity = 0.5 + Math.sin(time * 4) * 0.15;
  }
  // Power-ups: float and rotate
  for (const pu of board.powerups) {
    if (!pu.collected) {
      pu.mesh.rotation.y = time * 2.5;
      pu.mesh.position.y = BOARD_CELL * 0.25 + Math.sin(time * 3 + pu.col) * 0.008;
      pu.glowMesh.position.y = pu.mesh.position.y;
      const gs = 1 + Math.sin(time * 4) * 0.15;
      pu.glowMesh.scale.set(gs, gs, gs);
    }
  }
  // Moving walls: oscillate along axis
  for (const mw of board.movingWalls) {
    const offset = Math.sin(time * mw.speed) * mw.range;
    if (mw.axis === 'x') {
      mw.mesh.position.x = mw.basePos.x + offset;
      mw.edgeMesh.position.x = mw.basePos.x + offset;
    } else {
      mw.mesh.position.z = mw.basePos.z + offset;
      mw.edgeMesh.position.z = mw.basePos.z + offset;
    }
  }
  // Gravity switches: pulse glow
  for (const gs of board.gravitySwitches) {
    const pulse = 0.15 + Math.sin(time * 3 + gs.col * 2) * 0.1;
    (gs.glowMesh.material as THREE.MeshBasicMaterial).opacity = pulse;
    gs.glowMesh.scale.setScalar(1 + Math.sin(time * 2) * 0.15);
  }
  // Bumpers: bob and pulse
  for (const b of board.bumpers) {
    b.mesh.position.y = BOARD_CELL * 0.3 + Math.sin(time * 3 + b.col + b.row) * 0.005;
    const s = 1 + Math.sin(time * 4 + b.col * 1.5) * 0.08;
    b.mesh.scale.set(s, s, s);
    (b.glowMesh.material as THREE.MeshBasicMaterial).opacity = 0.15 + Math.sin(time * 5 + b.row) * 0.1;
    b.glowMesh.position.y = b.mesh.position.y;
  }
}
