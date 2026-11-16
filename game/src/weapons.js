// The arsenal: three hitscan weapons, one view model each, bought with round
// money. It owns the numbers and the models; main.js owns the ray and the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'VK-7 Longshot', price: 2700, mag: 30, reserve: 90,
    auto: true, gap: 0.096, reload: 1.9, damage: 34, headDamage: 100,
    spreadStill: 0.0022, spreadMove: 0.028, pellets: 1, kind: 'rifle',
  },
  shotgun: {
    id: 'shotgun', name: 'SG-12 Breacher', price: 1800, mag: 6, reserve: 24,
    auto: false, gap: 0.8, reload: 2.4, damage: 14, headDamage: 28,
    spreadStill: 0.02, spreadMove: 0.045, pellets: 8, kind: 'shotgun',
  },
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 0, mag: 12, reserve: 36,
    auto: false, gap: 0.16, reload: 1.2, damage: 26, headDamage: 78,
    spreadStill: 0.004, spreadMove: 0.02, pellets: 1, kind: 'pistol',
  },
};
export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;

function buildModel(kind) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const model = new THREE.Group();
  if (kind === 'rifle') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
    barrel.position.set(0, 0.025, -0.38);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
    stock.position.set(0, -0.02, 0.3);
    model.add(receiver, barrel, stock);
  } else if (kind === 'shotgun') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.11, 0.4), body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 10), grip);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.4);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.16), grip);
    pump.position.set(0, -0.03, -0.32);
    model.add(receiver, barrel, pump);
  } else {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.24), body);
    const gripMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.08), grip);
    gripMesh.position.set(0, -0.08, 0.08);
    gripMesh.rotation.x = 0.25;
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.05), grip);
    muzzle.position.set(0, 0.01, -0.13);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.025, 0.03), grip);
    sight.position.set(0, 0.04, -0.1);
    model.add(slide, gripMesh, muzzle, sight);
    model.scale.setScalar(0.85);
    model.rotation.y = 0.1;
  }
  model.position.set(0.24, -0.2, -0.42);
  model.visible = false;
  return model;
}

export function createWeapons(camera) {
  const models = {};
  for (const id of Object.keys(WEAPONS)) {
    models[id] = buildModel(WEAPONS[id].kind);
    camera.add(models[id]);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const ammo = {};
  for (const id of Object.keys(WEAPONS)) ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
  const owned = new Set(['pistol']);
  const state = { id: 'pistol', mag: 12, reserve: 36, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0 };
  models.pistol.visible = true;

  function sync() {
    const current = ammo[state.id];
    state.mag = current.mag;
    state.reserve = current.reserve;
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.id];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (WEAPONS[state.id].reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const def = WEAPONS[state.id];
        const need = def.mag - ammo[state.id].mag;
        const take = Math.min(need, ammo[state.id].reserve);
        ammo[state.id].mag += take;
        ammo[state.id].reserve -= take;
        sync();
      }
    }
  }

  return {
    state,
    owned,
    def() { return WEAPONS[state.id]; },
    ammoOf(id) { return ammo[id]; },
    equip(id) {
      if (!owned.has(id) || id === state.id) return false;
      models[state.id].visible = false;
      state.id = id;
      state.cooldown = 0;
      state.reloadLeft = 0;
      models[id].visible = true;
      sync();
      return true;
    },
    buy(id) {
      if (owned.has(id)) return false;
      owned.add(id);
      ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      return true;
    },
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = WEAPONS[state.id].gap;
      state.flash = 0.06;
      state.kick = state.id === 'shotgun' ? 0.11 : 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      ammo[state.id].mag -= 1;
      state.mag -= 1;
      return true;
    },
    reload() {
      const def = WEAPONS[state.id];
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return;
      state.reloadLeft = def.reload;
    },
    spread(speed) {
      const def = WEAPONS[state.id];
      return def.spreadStill + Math.min(1, speed / 5.2) * def.spreadMove;
    },
    refill() {
      for (const id of Object.keys(WEAPONS)) ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      sync();
    },
    resetOwned() {
      owned.clear();
      owned.add('pistol');
      models[state.id].visible = false;
      state.id = 'pistol';
      models.pistol.visible = true;
      this.refill();
    },
  };
}
