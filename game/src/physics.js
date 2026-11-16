// Shared physics: a seeded RNG, the axis-separated AABB mover the player and
// the bots both walk on, and a line-of-sight test. One place, no copies.
import * as THREE from 'three';

export function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Move a standing box (feet at position.y, height tall, radius wide) through the
// world's colliders one axis at a time, so a wall never swallows the walker.
// Returns true when the walker stands on something. Reuses the caller's vectors.
export function createMover(colliders, radius) {
  const probe = new THREE.Box3();
  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + height - lift, z + radius);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }
  return {
    overlaps,
    move(position, velocity, dt, height) {
      const nextX = position.x + velocity.x * dt;
      if (!overlaps(nextX, position.y, position.z, height, 0.04)) position.x = nextX;
      else velocity.x = 0;
      const nextZ = position.z + velocity.z * dt;
      if (!overlaps(position.x, position.y, nextZ, height, 0.04)) position.z = nextZ;
      else velocity.z = 0;
      position.y += velocity.y * dt;
      let onGround = false;
      const hit = overlaps(position.x, position.y, position.z, height, 0);
      if (hit && velocity.y <= 0) {
        position.y = hit.max.y;
        velocity.y = 0;
        onGround = true;
      } else if (hit) {
        position.y = hit.min.y - height;
        velocity.y = 0;
      }
      if (position.y < 0) {
        position.y = 0;
        velocity.y = 0;
        onGround = true;
      }
      return onGround;
    },
  };
}

// True when nothing solid stands between from and to. The caller updates the
// scene matrix world first; raycaster is the caller's reused instance.
export function hasLineOfSight(raycaster, from, to, obstacles) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const distance = dir.length();
  if (distance < 0.01) return true;
  dir.multiplyScalar(1 / distance);
  raycaster.set(from, dir);
  raycaster.far = distance;
  return raycaster.intersectObjects(obstacles, false).length === 0;
}
