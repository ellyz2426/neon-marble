// effects.ts — Particle effects, trails, visual feedback
import * as THREE from 'three';

// Particle system with object pool
interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private pool: Particle[] = [];
  private group: THREE.Group;
  private geo: THREE.SphereGeometry;
  private maxParticles = 80;

  constructor(parent: THREE.Object3D) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.geo = new THREE.SphereGeometry(0.006, 4, 4);

    for (let i = 0; i < this.maxParticles; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: 1 });
    }
  }

  burst(pos: THREE.Vector3, color: number, count: number, speed: number = 0.5, life: number = 0.8) {
    for (let i = 0; i < count; i++) {
      const p = this.pool.pop();
      if (!p) break;
      p.mesh.position.copy(pos);
      p.vel.set(
        (Math.random() - 0.5) * speed,
        Math.random() * speed * 0.8 + speed * 0.2,
        (Math.random() - 0.5) * speed
      );
      p.life = life;
      p.maxLife = life;
      p.mesh.visible = true;
      (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
      this.particles.push(p);
    }
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        this.pool.push(p);
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y -= 1.5 * dt; // gravity
      p.mesh.position.addScaledVector(p.vel, dt);
      const t = p.life / p.maxLife;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = t;
      const s = 0.5 + t * 0.5;
      p.mesh.scale.set(s, s, s);
    }
  }
}

// Marble trail
export class TrailSystem {
  private points: THREE.Vector3[] = [];
  private line: THREE.Line;
  private maxPoints = 30;
  private geo: THREE.BufferGeometry;

  constructor(parent: THREE.Object3D, color: number) {
    this.geo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.maxPoints * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geo.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 });
    this.line = new THREE.Line(this.geo, mat);
    parent.add(this.line);
  }

  addPoint(pos: THREE.Vector3) {
    this.points.push(pos.clone());
    if (this.points.length > this.maxPoints) this.points.shift();
    const attr = this.geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < this.points.length; i++) {
      attr.setXYZ(i, this.points[i].x, this.points[i].y, this.points[i].z);
    }
    attr.needsUpdate = true;
    this.geo.setDrawRange(0, this.points.length);
  }

  clear() {
    this.points = [];
    this.geo.setDrawRange(0, 0);
  }

  setColor(color: number) {
    (this.line.material as THREE.LineBasicMaterial).color.setHex(color);
  }
}

// Ambient floating particles for the holodeck environment
export class AmbientParticles {
  private meshes: THREE.Mesh[] = [];
  private velocities: THREE.Vector3[] = [];
  private group: THREE.Group;

  constructor(parent: THREE.Object3D, count: number = 40, range: number = 3) {
    this.group = new THREE.Group();
    parent.add(this.group);
    const geo = new THREE.SphereGeometry(0.008, 4, 4);

    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.2 + Math.random() * 0.3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * range,
        Math.random() * range * 0.5 + 0.5,
        (Math.random() - 0.5) * range
      );
      this.group.add(mesh);
      this.meshes.push(mesh);
      this.velocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * 0.02,
        (Math.random() - 0.5) * 0.01,
        (Math.random() - 0.5) * 0.02
      ));
    }
  }

  update(time: number) {
    for (let i = 0; i < this.meshes.length; i++) {
      const m = this.meshes[i];
      m.position.addScaledVector(this.velocities[i], 1);
      m.position.y += Math.sin(time * 0.5 + i) * 0.0003;
      (m.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.sin(time + i * 0.7) * 0.15;
    }
  }
}

// Holodeck wireframe decorations
export function createHolodeckDecorations(parent: THREE.Object3D, count: number = 12): THREE.Object3D[] {
  const decos: THREE.Object3D[] = [];
  const geos = [
    new THREE.TorusGeometry(0.1, 0.02, 6, 12),
    new THREE.BoxGeometry(0.12, 0.12, 0.12),
    new THREE.SphereGeometry(0.08, 6, 6),
    new THREE.ConeGeometry(0.07, 0.14, 6),
  ];

  for (let i = 0; i < count; i++) {
    const geo = geos[i % geos.length];
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      wireframe: true,
      transparent: true,
      opacity: 0.15 + Math.random() * 0.1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const angle = (i / count) * Math.PI * 2;
    const radius = 1.5 + Math.random();
    mesh.position.set(
      Math.cos(angle) * radius,
      0.5 + Math.random() * 1.5,
      Math.sin(angle) * radius
    );
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    parent.add(mesh);
    decos.push(mesh);
  }
  return decos;
}

export function animateDecorations(decos: THREE.Object3D[], time: number) {
  for (let i = 0; i < decos.length; i++) {
    decos[i].rotation.y = time * 0.3 + i;
    decos[i].rotation.x = Math.sin(time * 0.2 + i) * 0.5;
    decos[i].position.y += Math.sin(time * 0.4 + i * 0.5) * 0.0002;
  }
}
