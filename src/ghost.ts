// ghost.ts — Ghost replay system: record marble path, replay best run as transparent ghost
import * as THREE from 'three';
import { MARBLE_RADIUS } from './types.js';

export interface GhostFrame {
  x: number;
  z: number;
  t: number;
}

const RECORD_INTERVAL = 0.05; // 50ms between frames

export class GhostSystem {
  private recording: GhostFrame[] = [];
  private recordTimer = 0;
  private isRecording = false;

  private ghostData: GhostFrame[] | null = null;
  private ghostMesh: THREE.Mesh | null = null;
  private ghostGlow: THREE.Mesh | null = null;
  private playbackTime = 0;
  playing = false;

  constructor(private parent: THREE.Object3D) {}

  startRecording() {
    this.recording = [];
    this.recordTimer = 0;
    this.isRecording = true;
  }

  recordFrame(x: number, z: number, dt: number) {
    if (!this.isRecording) return;
    this.recordTimer += dt;
    if (this.recordTimer >= RECORD_INTERVAL) {
      this.recordTimer -= RECORD_INTERVAL;
      this.recording.push({ x, z, t: this.recording.length * RECORD_INTERVAL });
    }
  }

  stopRecording(): GhostFrame[] {
    this.isRecording = false;
    return this.recording;
  }

  static saveGhost(levelIdx: number, frames: GhostFrame[], time: number) {
    try {
      const key = `neon_marble_ghost_${levelIdx}`;
      const existing = localStorage.getItem(key);
      if (existing) {
        const old = JSON.parse(existing);
        if (old.time <= time) return;
      }
      let data = frames;
      if (data.length > 500) {
        const step = Math.ceil(data.length / 500);
        data = data.filter((_, i) => i % step === 0);
      }
      localStorage.setItem(key, JSON.stringify({ time, frames: data }));
    } catch {}
  }

  static loadGhost(levelIdx: number): GhostFrame[] | null {
    try {
      const key = `neon_marble_ghost_${levelIdx}`;
      const d = localStorage.getItem(key);
      if (!d) return null;
      return JSON.parse(d).frames || null;
    } catch { return null; }
  }

  startPlayback(levelIdx: number) {
    const frames = GhostSystem.loadGhost(levelIdx);
    if (!frames || frames.length < 2) { this.playing = false; return; }
    this.ghostData = frames;
    this.playbackTime = 0;
    this.playing = true;
    if (!this.ghostMesh) {
      this.ghostMesh = new THREE.Mesh(
        new THREE.SphereGeometry(MARBLE_RADIUS, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, wireframe: true })
      );
      this.parent.add(this.ghostMesh);
      this.ghostGlow = new THREE.Mesh(
        new THREE.SphereGeometry(MARBLE_RADIUS * 1.6, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.08 })
      );
      this.parent.add(this.ghostGlow);
    }
    this.ghostMesh.visible = true;
    if (this.ghostGlow) this.ghostGlow.visible = true;
  }

  update(dt: number) {
    if (!this.playing || !this.ghostData || !this.ghostMesh) return;
    this.playbackTime += dt;
    const frames = this.ghostData;
    const lastT = frames[frames.length - 1].t;
    if (this.playbackTime >= lastT) { this.stop(); return; }

    let i = 0;
    for (; i < frames.length - 1; i++) {
      if (frames[i + 1].t > this.playbackTime) break;
    }
    const f0 = frames[i];
    const f1 = frames[Math.min(i + 1, frames.length - 1)];
    const seg = f1.t - f0.t;
    const t = seg > 0 ? Math.min((this.playbackTime - f0.t) / seg, 1) : 0;
    const x = f0.x + (f1.x - f0.x) * t;
    const z = f0.z + (f1.z - f0.z) * t;
    this.ghostMesh.position.set(x, MARBLE_RADIUS + 0.002, z);
    if (this.ghostGlow) this.ghostGlow.position.copy(this.ghostMesh.position);
    this.ghostMesh.rotation.y += dt * 2;
  }

  stop() {
    this.playing = false;
    if (this.ghostMesh) this.ghostMesh.visible = false;
    if (this.ghostGlow) this.ghostGlow.visible = false;
  }

  cleanup() { this.stop(); this.isRecording = false; this.recording = []; }
}
