// minimap.ts — 3D bird's-eye minimap showing level layout + marble dot
import * as THREE from 'three';
import { TILE, BOARD_CELL } from './types.js';

const CS = 0.007; // cell size in world units

export class MiniMap {
  group: THREE.Group;
  private cells: (THREE.Mesh | null)[][] = [];
  private marker: THREE.Mesh;
  private bg: THREE.Mesh;
  private gw = 0;
  private gh = 0;

  constructor() {
    this.group = new THREE.Group();
    this.group.visible = false;

    this.bg = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x000011, transparent: true, opacity: 0.75 })
    );
    this.bg.rotation.x = -Math.PI / 2;
    this.group.add(this.bg);

    this.marker = new THREE.Mesh(
      new THREE.SphereGeometry(CS * 0.7, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff3333 })
    );
    this.marker.position.y = 0.003;
    this.group.add(this.marker);
  }

  build(grid: number[][], gw: number, gh: number) {
    for (const row of this.cells) for (const c of row) { if (c) { this.group.remove(c); } }
    this.cells = [];
    this.gw = gw;
    this.gh = gh;

    const mw = gw * CS + CS * 0.5;
    const mh = gh * CS + CS * 0.5;
    this.bg.geometry.dispose();
    this.bg.geometry = new THREE.PlaneGeometry(mw, mh);

    const cg = new THREE.PlaneGeometry(CS * 0.88, CS * 0.88);

    for (let r = 0; r < gh; r++) {
      const row: (THREE.Mesh | null)[] = [];
      for (let c = 0; c < gw; c++) {
        const col = this.tileColor(grid[r][c]);
        if (col === null) { row.push(null); continue; }
        const m = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 }));
        m.rotation.x = -Math.PI / 2;
        m.position.set(
          c * CS - (gw * CS) / 2 + CS / 2,
          0.001,
          r * CS - (gh * CS) / 2 + CS / 2
        );
        this.group.add(m);
        row.push(m);
      }
      this.cells.push(row);
    }
    this.group.visible = true;
  }

  private tileColor(t: number): number | null {
    switch (t) {
      case TILE.WALL: return 0x008899;
      case TILE.HOLE: return 0x770000;
      case TILE.GEM: return 0xeeee00;
      case TILE.GOAL: return 0x00ff88;
      case TILE.START: return 0x0066ff;
      case TILE.TELE_A: case TILE.TELE_B: return 0xcc00cc;
      case TILE.ICE: return 0x66aadd;
      case TILE.BOOST: return 0x00dd66;
      case TILE.POWERUP_SHIELD: return 0x3377dd;
      case TILE.POWERUP_MAGNET: return 0xddaa00;
      case TILE.POWERUP_SLOWMO: return 0xaa33dd;
      case TILE.MOVING_WALL: return 0xdd6600;
      case TILE.GRAVITY_SWITCH: return 0x00cc00;
      case TILE.BUMPER: return 0xdd44dd;
      case TILE.EMPTY: return 0x181828;
      default: return null;
    }
  }

  updateMarker(mx: number, mz: number, gw: number, gh: number) {
    const bw = gw * BOARD_CELL;
    const bh = gh * BOARD_CELL;
    const nx = (mx + bw / 2) / bw;
    const nz = (mz + bh / 2) / bh;
    this.marker.position.x = nx * gw * CS - (gw * CS) / 2;
    this.marker.position.z = nz * gh * CS - (gh * CS) / 2;
  }

  hide() { this.group.visible = false; }
  show() { this.group.visible = true; }
}
