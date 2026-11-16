// The frag grenade: a thrown ball with gravity and one bounce, a 1.8 s fuse,
// then an area blast. Flight is simulated here; main.js applies the damage
// through onDetonate, so this module never touches a bot or the player.
import * as THREE from 'three';

const GRAVITY = 14;
const FUSE_SECONDS = 1.8;
const BLAST_RADIUS = 6.5;
const MAX_DAMAGE = 110;

export function createGrenades(scene, colliders, onDetonate) {
  const meshMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3f7a4e'), roughness: 0.6, metalness: 0.3 });
  const geometry = new THREE.SphereGeometry(0.09, 10, 8);
  const live = [];

  function throwGrenade(from, direction, speed) {
    const mesh = new THREE.Mesh(geometry, meshMaterial);
    mesh.position.copy(from);
    mesh.castShadow = true;
    scene.add(mesh);
    live.push({
      mesh,
      velocity: direction.clone().multiplyScalar(speed),
      fuse: FUSE_SECONDS,
      bounced: false,
    });
  }

  function detonate(item) {
    const position = item.mesh.position.clone();
    scene.remove(item.mesh);
    const flash = new THREE.PointLight(new THREE.Color('#ffb35c'), 60, 18);
    flash.position.copy(position);
    scene.add(flash);
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcf7d'), transparent: true, opacity: 0.85, depthWrite: false }),
    );
    shell.position.copy(position);
    scene.add(shell);
    let life = 0.35;
    const shrink = { update(dt) { life -= dt; shell.scale.setScalar(Math.max(0.01, (0.35 - life) / 0.35 * 4)); shell.material.opacity = Math.max(0, life / 0.35 * 0.85); flash.intensity = Math.max(0, life / 0.35 * 60); if (life <= 0) { scene.remove(shell); scene.remove(flash); return false; } return true; } };
    effects.push(shrink);
    onDetonate(position, BLAST_RADIUS, MAX_DAMAGE);
  }

  const effects = [];

  function step(dt) {
    for (let i = effects.length - 1; i >= 0; i -= 1) {
      if (!effects[i].update(dt)) effects.splice(i, 1);
    }
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const item = live[i];
      item.fuse -= dt;
      item.velocity.y -= GRAVITY * dt;
      const next = item.mesh.position.clone().addScaledVector(item.velocity, dt);
      if (next.y <= 0.09) {
        next.y = 0.09;
        if (Math.abs(item.velocity.y) > 2.5 && !item.bounced) {
          item.velocity.y = -item.velocity.y * 0.45;
          item.velocity.x *= 0.7;
          item.velocity.z *= 0.7;
          item.bounced = true;
        } else {
          item.velocity.y = 0;
          item.velocity.x *= 0.6;
          item.velocity.z *= 0.6;
        }
      }
      for (const collider of colliders) {
        if (collider.containsPoint(next)) {
          item.velocity.multiplyScalar(-0.4);
          next.copy(item.mesh.position);
          break;
        }
      }
      item.mesh.position.copy(next);
      if (item.fuse <= 0) {
        live.splice(i, 1);
        detonate(item);
      }
    }
  }

  return {
    throwGrenade,
    step,
    clear() {
      for (const item of live) scene.remove(item.mesh);
      live.length = 0;
    },
    count() { return live.length; },
  };
}
