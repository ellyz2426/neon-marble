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

  // Skin trail particles
  private trailParticles: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; maxLife: number }[] = [];
  private trailParticlePool: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; maxLife: number }[] = [];
  private trailGroup: THREE.Group;
  private trailGeo: THREE.SphereGeometry;
  private emitTimer = 0;

  // Skin trail config
  private trailStyle = 'default';
  private particleColor = 0x00ffff;
  private particleRate = 8;     // particles per second
  private trailOpacity = 0.5;
  private maxTrailParticles = 40;

  constructor(parent: THREE.Object3D, color: number, trailStyle: string = 'default', particleColor: number = 0x00ffff, particleRate: number = 8, trailWidth: number = 1.0) {
    this.geo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.maxPoints * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geo.setDrawRange(0, 0);
    this.trailOpacity = 0.5 * trailWidth;
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: this.trailOpacity });
    this.line = new THREE.Line(this.geo, mat);
    parent.add(this.line);

    // Trail particle system
    this.trailStyle = trailStyle;
    this.particleColor = particleColor;
    this.particleRate = particleRate;
    this.trailGroup = new THREE.Group();
    parent.add(this.trailGroup);

    // Particle geometry varies by style
    this.trailGeo = new THREE.SphereGeometry(this.getParticleSize(), 4, 4);

    // Pre-allocate trail particles
    for (let i = 0; i < this.maxTrailParticles; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: particleColor,
        transparent: true,
        opacity: 0.8,
      });
      const mesh = new THREE.Mesh(this.trailGeo, mat);
      mesh.visible = false;
      this.trailGroup.add(mesh);
      this.trailParticlePool.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: 1 });
    }
  }

  private getParticleSize(): number {
    switch (this.trailStyle) {
      case 'fire': return 0.005;
      case 'frost': return 0.004;
      case 'toxic': return 0.006;
      case 'void': return 0.007;
      case 'obsidian': return 0.004;
      case 'diamond': return 0.003;
      case 'nebula': return 0.006;
      case 'gold': return 0.005;
      case 'chrome': return 0.003;
      case 'emerald': return 0.004;
      case 'royal': return 0.005;
      default: return 0.004;
    }
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

  // Emit trail particles based on skin style
  emitTrailParticle(pos: THREE.Vector3, speed: number) {
    if (this.trailStyle === 'default' && this.particleRate <= 8) return; // default skin: minimal particles
    if (speed < 0.3) return; // Don't emit when barely moving

    const p = this.trailParticlePool.pop();
    if (!p) return;

    p.mesh.position.copy(pos);
    const mat = p.mesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(this.particleColor);

    switch (this.trailStyle) {
      case 'fire': {
        // Embers that rise and fade
        p.vel.set(
          (Math.random() - 0.5) * 0.15,
          Math.random() * 0.25 + 0.1,
          (Math.random() - 0.5) * 0.15
        );
        p.life = 0.5 + Math.random() * 0.4;
        // Randomize between orange/red
        mat.color.setHex(Math.random() > 0.5 ? 0xff6600 : 0xff2200);
        break;
      }
      case 'frost': {
        // Crystalline sparkles that drift slowly
        p.vel.set(
          (Math.random() - 0.5) * 0.08,
          Math.random() * 0.05 + 0.02,
          (Math.random() - 0.5) * 0.08
        );
        p.life = 0.8 + Math.random() * 0.5;
        mat.color.setHex(Math.random() > 0.3 ? 0xccddff : 0x88bbff);
        break;
      }
      case 'toxic': {
        // Green wisps that swirl
        const angle = Math.random() * Math.PI * 2;
        p.vel.set(
          Math.cos(angle) * 0.12,
          Math.random() * 0.15 + 0.05,
          Math.sin(angle) * 0.12
        );
        p.life = 0.6 + Math.random() * 0.3;
        break;
      }
      case 'void': {
        // Dark particles that implode inward slightly
        p.vel.set(
          (Math.random() - 0.5) * 0.05,
          -Math.random() * 0.1 - 0.02,
          (Math.random() - 0.5) * 0.05
        );
        p.life = 0.7 + Math.random() * 0.4;
        mat.color.setHex(Math.random() > 0.4 ? 0x6622aa : 0x440088);
        break;
      }
      case 'gold': {
        // Golden shimmer sparks
        p.vel.set(
          (Math.random() - 0.5) * 0.2,
          Math.random() * 0.2 + 0.08,
          (Math.random() - 0.5) * 0.2
        );
        p.life = 0.4 + Math.random() * 0.3;
        mat.color.setHex(Math.random() > 0.5 ? 0xffdd44 : 0xffaa00);
        break;
      }
      case 'diamond': {
        // Prismatic sparkles — cycle colors
        const colors = [0xddeeff, 0xffddee, 0xddffee, 0xeeddff];
        mat.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
        p.vel.set(
          (Math.random() - 0.5) * 0.1,
          Math.random() * 0.12 + 0.05,
          (Math.random() - 0.5) * 0.1
        );
        p.life = 0.6 + Math.random() * 0.4;
        break;
      }
      case 'nebula': {
        // Swirling pink/magenta clouds
        const a = Math.random() * Math.PI * 2;
        p.vel.set(
          Math.cos(a) * 0.15,
          (Math.random() - 0.5) * 0.1,
          Math.sin(a) * 0.15
        );
        p.life = 0.7 + Math.random() * 0.5;
        mat.color.setHex(Math.random() > 0.5 ? 0xff66cc : 0xdd2288);
        break;
      }
      case 'obsidian': {
        // Dark red embers that crackle
        p.vel.set(
          (Math.random() - 0.5) * 0.18,
          Math.random() * 0.15 + 0.05,
          (Math.random() - 0.5) * 0.18
        );
        p.life = 0.3 + Math.random() * 0.3;
        mat.color.setHex(Math.random() > 0.6 ? 0xaa0055 : 0x660022);
        break;
      }
      case 'chrome': {
        // Sharp white sparks
        p.vel.set(
          (Math.random() - 0.5) * 0.25,
          Math.random() * 0.1 + 0.05,
          (Math.random() - 0.5) * 0.25
        );
        p.life = 0.25 + Math.random() * 0.2;
        break;
      }
      case 'emerald': {
        // Green gem dust
        p.vel.set(
          (Math.random() - 0.5) * 0.12,
          Math.random() * 0.1 + 0.04,
          (Math.random() - 0.5) * 0.12
        );
        p.life = 0.5 + Math.random() * 0.4;
        mat.color.setHex(Math.random() > 0.5 ? 0x44ee88 : 0x22cc44);
        break;
      }
      case 'royal': {
        // Purple sparkle stars
        p.vel.set(
          (Math.random() - 0.5) * 0.15,
          Math.random() * 0.18 + 0.06,
          (Math.random() - 0.5) * 0.15
        );
        p.life = 0.5 + Math.random() * 0.3;
        mat.color.setHex(Math.random() > 0.5 ? 0xdd88ff : 0xaa44ff);
        break;
      }
      default: {
        // Default cyan particles
        p.vel.set(
          (Math.random() - 0.5) * 0.08,
          Math.random() * 0.08 + 0.03,
          (Math.random() - 0.5) * 0.08
        );
        p.life = 0.5;
        break;
      }
    }

    p.maxLife = p.life;
    p.mesh.visible = true;
    mat.opacity = 0.8;
    this.trailParticles.push(p);
  }

  updateParticles(dt: number, marblePos: THREE.Vector3, speed: number) {
    // Emit new particles
    this.emitTimer += dt;
    const emitInterval = 1 / this.particleRate;
    while (this.emitTimer >= emitInterval) {
      this.emitTimer -= emitInterval;
      this.emitTrailParticle(marblePos, speed);
    }

    // Update existing particles
    for (let i = this.trailParticles.length - 1; i >= 0; i--) {
      const p = this.trailParticles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        this.trailParticlePool.push(p);
        this.trailParticles.splice(i, 1);
        continue;
      }

      // Style-specific movement
      if (this.trailStyle === 'void') {
        // Void particles contract slightly
        p.vel.multiplyScalar(0.95);
      } else if (this.trailStyle === 'fire') {
        // Fire particles slow + gravity resist
        p.vel.y *= 0.98;
      } else {
        // Standard gravity effect
        p.vel.y -= 0.3 * dt;
      }

      p.mesh.position.addScaledVector(p.vel, dt);
      const t = p.life / p.maxLife;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = t * 0.8;
      const s = 0.4 + t * 0.6;
      p.mesh.scale.set(s, s, s);
    }
  }

  clear() {
    this.points = [];
    this.geo.setDrawRange(0, 0);
    // Clear trail particles
    for (const p of this.trailParticles) {
      p.mesh.visible = false;
      this.trailParticlePool.push(p);
    }
    this.trailParticles = [];
    this.emitTimer = 0;
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

// Screen shake system
export class ScreenShake {
  private intensity = 0;
  private decay = 8;
  private offset = new THREE.Vector3();

  trigger(strength: number) {
    this.intensity = Math.max(this.intensity, strength);
  }

  update(dt: number, target: THREE.Object3D) {
    if (this.intensity < 0.0005) {
      this.offset.set(0, 0, 0);
      this.intensity = 0;
      return;
    }
    this.offset.set(
      (Math.random() - 0.5) * 2 * this.intensity,
      (Math.random() - 0.5) * 2 * this.intensity * 0.5,
      (Math.random() - 0.5) * 2 * this.intensity
    );
    target.position.x += this.offset.x;
    target.position.y += this.offset.y;
    target.position.z += this.offset.z;
    this.intensity *= Math.max(0, 1 - this.decay * dt);
  }
}

// Firework burst — multiple staggered bursts of colored particles
export function fireworkBurst(particles: ParticleSystem, center: THREE.Vector3, burstCount: number = 5) {
  const colors = [0xff3333, 0xffcc00, 0x00ff88, 0xff66ff, 0x00ccff, 0xff8800, 0xaaffee];
  for (let b = 0; b < burstCount; b++) {
    const off = new THREE.Vector3(
      (Math.random() - 0.5) * 0.15,
      Math.random() * 0.08 + 0.02,
      (Math.random() - 0.5) * 0.15
    );
    const pos = center.clone().add(off);
    const color = colors[b % colors.length];
    // Use setTimeout for staggered effect
    setTimeout(() => {
      particles.burst(pos, color, 12, 0.9, 1.0);
    }, b * 120);
  }
}
