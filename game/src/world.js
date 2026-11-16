// The map: Dock 7, a dusk container yard. Two bomb sites (A west, B east), a mid
// lane with double doors, and crate lanes on both flanks. Every box is a collider
// for walkers and a surface a bullet stops on. Plain geometry only, no models,
// no textures; the palette carries the look.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoints the bots walk: nodes with BFS edges. Kept in open lanes, never inside a box.
const WAYPOINTS = [
  { x: -6, z: 12 }, { x: 0, z: 12 }, { x: 6, z: 12 },      // 0-2 attacker spawns
  { x: -12, z: 6 }, { x: 0, z: 6 }, { x: 12, z: 6 },       // 3-5 lane entries
  { x: -12, z: 0 }, { x: -3, z: 0 }, { x: 3, z: 0 }, { x: 12, z: 0 }, // 6-9 mid band
  { x: -12, z: -6 }, { x: 0, z: -6 }, { x: 12, z: -6 },     // 10-12 site approaches
  { x: -15, z: -10 }, { x: 15, z: -10 }, { x: 0, z: -11 },  // 13-15 sites + back mid
];
const EDGES = [
  [0, 3], [1, 4], [2, 5], [3, 6], [4, 7], [4, 8], [5, 9],
  [6, 10], [7, 11], [8, 11], [9, 12], [10, 13], [11, 15], [12, 14], [13, 15], [14, 15],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function barrel(x, z) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 12), materials.hairline);
    mesh.position.set(x, 0.55, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and perimeter: 40 x 30 m, 5 m walls, open sky so one low sun reaches in.
  box(40.4, 0.4, 30.4, 0, -0.2, 0, 'canvas');
  box(0.4, 5, 30.4, -20.2, 2.5, 0, 'surface');
  box(0.4, 5, 30.4, 20.2, 2.5, 0, 'surface');
  box(40.4, 5, 0.4, 0, 2.5, -15.2, 'surface');
  box(40.4, 5, 0.4, 0, 2.5, 15.2, 'surface');

  // Site A (west): two stacked containers as the back wall, one low crate as cover.
  box(6, 2.6, 2.4, -17, 1.3, -12.5, 'site');
  box(6, 2.6, 2.4, -17, 3.9, -12.5, 'foe');
  box(2.4, 1.1, 1.2, -13, 0.55, -8, 'hairline');
  box(1.2, 1.1, 2.4, -11, 0.55, -12, 'hairline');
  // Site B (east): mirrored, teal stack.
  box(6, 2.6, 2.4, 17, 1.3, -12.5, 'ally');
  box(6, 2.6, 2.4, 17, 3.9, -12.5, 'site');
  box(2.4, 1.1, 1.2, 13, 0.55, -8, 'hairline');
  box(1.2, 1.1, 2.4, 11, 0.55, -12, 'hairline');

  // Mid: a container wall with a double-door gap at x = -3 and x = 3.
  box(7, 2.6, 2.4, -8.5, 1.3, -2, 'accent');
  box(7, 2.6, 2.4, 8.5, 1.3, -2, 'accent');
  box(3.4, 1.1, 1.2, -4.5, 0.55, 3, 'hairline');
  box(3.4, 1.1, 1.2, 4.5, 0.55, 3, 'hairline');

  // Flank lanes: crates and barrels to break sightlines.
  box(1.6, 1.1, 1.6, -10, 0.55, 6, 'hairline');
  box(1.6, 1.1, 1.6, 10, 0.55, 6, 'hairline');
  box(1.2, 2.2, 1.2, -10, 1.1, -4, 'hairline');
  box(1.2, 2.2, 1.2, 10, 1.1, -4, 'hairline');
  box(2.4, 0.9, 1.2, -6, 0.45, 9, 'hairline');
  box(2.4, 0.9, 1.2, 6, 0.45, 9, 'hairline');
  barrel(-7, -8);
  barrel(7, -8);
  barrel(-16, 2);
  barrel(16, 2);
  barrel(-2, -9);
  barrel(2, -9);

  // Site markers: flat rings on the floor so a site reads at a glance.
  function siteRing(x, z) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.2, 3.6, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.site), transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.02, z);
    group.add(ring);
  }
  siteRing(-15, -10);
  siteRing(15, -10);

  // Light: a low amber sun from the west, a cool fill from the east, dusk sky.
  const sky = new THREE.HemisphereLight(new THREE.Color('#3a4556'), new THREE.Color(PALETTE.canvas), 1.35);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffb35c'), 2.4);
  key.position.set(-14, 12, 6);
  key.target.position.set(4, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -24;
  key.shadow.camera.right = 24;
  key.shadow.camera.top = 24;
  key.shadow.camera.bottom = -24;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.75);
  fill.position.set(12, 9, 10);
  scene.add(fill);

  const sites = [
    { name: 'A', x: -15, z: -10, radius: 3.6 },
    { name: 'B', x: 15, z: -10, radius: 3.6 },
  ];
  const spawns = {
    attack: [{ x: -6, z: 12, yaw: 0 }, { x: 0, z: 12.5, yaw: 0 }, { x: 6, z: 12, yaw: 0 }],
    defend: [
      { x: -14, z: -6, yaw: Math.PI }, { x: -6, z: -11, yaw: Math.PI }, { x: 0, z: -11, yaw: Math.PI },
      { x: 6, z: -11, yaw: Math.PI }, { x: 14, z: -6, yaw: Math.PI },
    ],
  };

  return { colliders, shootables, group, sites, spawns, waypoints: WAYPOINTS, edges: EDGES };
}
