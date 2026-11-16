// The bomb: carried by the player, planted at a site, defused by the nearest
// defender who reaches it. Plant takes 3 s, defuse 5 s, the fuse 35 s. This
// module owns the timers and the visuals; main.js owns who may plant or defuse
// and what an explosion does.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const PLANT_SECONDS = 3.0;
const DEFUSE_SECONDS = 5.0;
const FUSE_SECONDS = 35;

export function createBomb(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.22, 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#20242a'), roughness: 0.6, metalness: 0.4 }),
  );
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 8, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.foe) }),
  );
  light.position.set(0, 0.14, 0);
  group.add(body, light);
  group.visible = false;
  scene.add(group);

  const flash = new THREE.PointLight(new THREE.Color('#ffcf7d'), 0, 20);
  scene.add(flash);
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcf7d'), transparent: true, opacity: 0, depthWrite: false }),
  );
  shell.visible = false;
  scene.add(shell);
  let blastLife = 0;

  const state = {
    status: 'carried', // carried | planting | planted | exploded | defused
    site: null,
    plantProgress: 0,
    defuseProgress: 0,
    fuseLeft: FUSE_SECONDS,
    beepLeft: 0,
  };

  return {
    state,
    reset() {
      state.status = 'carried';
      state.site = null;
      state.plantProgress = 0;
      state.defuseProgress = 0;
      state.fuseLeft = FUSE_SECONDS;
      group.visible = false;
      flash.intensity = 0;
      shell.visible = false;
      blastLife = 0;
    },
    siteOf(x, z, sites) {
      for (const site of sites) {
        const dx = x - site.x;
        const dz = z - site.z;
        if (dx * dx + dz * dz <= site.radius * site.radius) return site;
      }
      return null;
    },
    // Returns 'planted' the moment the plant finishes, else null.
    plantTick(dt, inSite, site) {
      if (!inSite || !site) { state.plantProgress = 0; state.status = 'carried'; return null; }
      state.status = 'planting';
      state.site = site;
      state.plantProgress += dt / PLANT_SECONDS;
      if (state.plantProgress >= 1) {
        state.status = 'planted';
        state.fuseLeft = FUSE_SECONDS;
        group.position.set(site.x, 0.12, site.z);
        group.visible = true;
        return 'planted';
      }
      return null;
    },
    plantCancel() {
      if (state.status === 'planting') {
        state.status = 'carried';
        state.plantProgress = 0;
      }
    },
    // Returns 'defused' when the channel completes, 'exploded' when the fuse
    // runs out. beep is true on the frames the plant should beep.
    fuseTick(dt, defuserPresent) {
      if (state.status !== 'planted') return null;
      state.fuseLeft -= dt;
      state.beepLeft -= dt;
      let beep = false;
      if (state.beepLeft <= 0) {
        beep = true;
        state.beepLeft = state.fuseLeft < 10 ? 0.35 : 0.9;
      }
      light.visible = Math.floor(state.fuseLeft * 2) % 2 === 0;
      if (defuserPresent) {
        state.defuseProgress += dt / DEFUSE_SECONDS;
        if (state.defuseProgress >= 1) {
          state.status = 'defused';
          group.visible = false;
          return 'defused';
        }
      } else {
        state.defuseProgress = Math.max(0, state.defuseProgress - dt / DEFUSE_SECONDS);
      }
      if (state.fuseLeft <= 0) {
        state.status = 'exploded';
        group.visible = false;
        blastLife = 0.5;
        shell.visible = true;
        shell.position.copy(group.position).setY(1);
        flash.position.copy(group.position).setY(1.5);
        return 'exploded';
      }
      return beep ? 'beep' : null;
    },
    blastStep(dt) {
      if (blastLife <= 0) return;
      blastLife -= dt;
      const t = Math.max(0, blastLife / 0.5);
      shell.scale.setScalar((1 - t) * 14 + 0.5);
      shell.material.opacity = t * 0.7;
      flash.intensity = t * 80;
      if (blastLife <= 0) {
        shell.visible = false;
        flash.intensity = 0;
      }
    },
  };
}
