// Emberline: boot and the one loop. A fixed 60 Hz simulation feeds a render at
// the display's rate. rounds.js owns the phase; main.js wires every module
// together and owns the cross-module rules (who a bullet may hit, when a round
// ends, what an explosion does).
// ?shot=start|play|buy|win with &seed=N sets up a deterministic frame, renders
// it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32, hasLineOfSight } from './physics.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';
import { createGrenades } from './grenades.js';
import { createBots } from './bots.js';
import { createBomb } from './bomb.js';
import { createRounds } from './rounds.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
if (shot) window.__shotMode = true;
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

const random = mulberry32(seed);
const CALLSIGNS = { 'ally-1': 'Rook', 'ally-2': 'Havoc', 'foe-1': 'Viper', 'foe-2': 'Ghost', 'foe-3': 'Reaper', 'foe-4': 'Jinx', 'foe-5': 'Onyx' };

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const hud = createHud();
const rounds = createRounds();
const player = createPlayer(world.colliders);
const weapons = createWeapons(camera);
const bomb = createBomb(scene);
const bots = createBots(scene, world, seed);
const grenades = createGrenades(scene, world.colliders, onDetonate);
const input = createInput(renderer.domElement, onLockChange, () => {
  if (started && (rounds.state.phase === 'buy' || rounds.state.phase === 'combat') && !hud.buyVisible()) input.requestLock();
});

const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const direction = new THREE.Vector3();
const shootOrigin = new THREE.Vector3();

// The player's hitbox: two meshes with zero opacity (invisible, still raycast
// so bot fire uses the same ray rules as the player's own shots).
const invisibleMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
const playerTorso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), invisibleMat);
playerTorso.userData = { playerHit: true, part: 'torso' };
const playerHead = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 12), invisibleMat);
playerHead.userData = { playerHit: true, part: 'head' };
scene.add(playerTorso, playerHead);

const body = player.state;
const markerHoldMs = shot ? 4000 : 90;
let kills = 0;
let grenadeCount = 0;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;

const raycastTargets = world.shootables.concat(bots.hitMeshes);
const botRaycastTargets = world.shootables.concat(bots.hitMeshes, [playerTorso, playerHead]);
const targetEntries = [{ kind: 'player', team: 'attack', position: body.position, alive: true, isPlayer: true, speed: 0 }];
for (const bot of bots.bots) {
  targetEntries.push({ kind: 'bot', team: bot.team, position: bot.position, alive: true, isPlayer: false, speed: 0, ref: bot });
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  playerTorso.position.set(body.position.x, body.position.y + 1.0, body.position.z);
  playerHead.position.set(body.position.x, body.position.y + 1.53, body.position.z);
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function targetsList() {
  // Persistent entries: positions are live vectors, only the scalars refresh,
  // so the hot loop allocates nothing.
  targetEntries[0].alive = body.alive;
  targetEntries[0].speed = player.groundSpeed();
  for (let i = 0; i < bots.bots.length; i += 1) {
    const entry = targetEntries[i + 1];
    const bot = bots.bots[i];
    entry.alive = bot.alive;
    entry.speed = Math.hypot(bot.velocity.x, bot.velocity.z);
  }
  return targetEntries;
}

function aliveCounts() {
  return {
    attack: (body.alive ? 1 : 0) + bots.aliveCount('ally'),
    defend: bots.aliveCount('foe'),
  };
}

function refreshHud() {
  const counts = aliveCounts();
  hud.setAlive(counts.attack, counts.defend);
  hud.setScore(rounds.state.scoreAttack, rounds.state.scoreDefend, rounds.state.round);
  hud.setMoney(rounds.state.money);
  hud.setHealth(body.health, body.armor);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
  const phase = rounds.state.phase;
  if (phase === 'buy') hud.setTimer(rounds.state.phaseLeft, 'BUY');
  else if (phase === 'combat') hud.setTimer(bomb.state.status === 'planted' ? bomb.state.fuseLeft : rounds.state.phaseLeft, bomb.state.status === 'planted' ? 'BOMB' : 'ROUND');
  else if (phase === 'roundEnd') hud.setTimer(rounds.state.phaseLeft, 'NEXT');
  else hud.setTimer(0, 'MATCH');
}

function buyItem(id) {
  if (rounds.state.phase !== 'buy') return;
  const price = id === 'rifle' ? WEAPONS.rifle.price : id === 'shotgun' ? WEAPONS.shotgun.price : id === 'grenade' ? GRENADE_PRICE : ARMOR_PRICE;
  if (!rounds.spend(price)) { audio.dryFire(); return; }
  if (id === 'grenade') {
    if (grenadeCount >= 1) { rounds.state.money += price; return; }
    grenadeCount = 1;
  } else if (id === 'armor') {
    if (body.armor >= 50) { rounds.state.money += price; return; }
    body.armor = 50;
  } else {
    weapons.buy(id);
    weapons.equip(id);
  }
  audio.click();
  hud.showBuy(rounds.state.money, weapons.owned);
  refreshHud();
}

function setupRound() {
  const spawn = world.spawns.attack[1];
  player.reset(spawn.x, spawn.z, spawn.yaw);
  weapons.resetOwned();
  weapons.refill();
  grenadeCount = 0;
  kills = 0;
  bomb.reset();
  grenades.clear();
  bots.spawnRound();
  hud.hideBuy();
  refreshHud();
}

function startMatch() {
  rounds.startMatch();
  setupRound();
  started = true;
}

function finishRound(winner, reason) {
  const result = rounds.endRound(winner, reason);
  hud.hideBuy();
  if (result === 'matchEnd') {
    hud.showOverlay('matchEnd', `${rounds.state.message}. Final score VAN ${rounds.state.scoreAttack} — ${rounds.state.scoreDefend} SEN.`);
    if (document.pointerLockElement) document.exitPointerLock();
    audio.roundWin();
  } else {
    hud.showOverlay('roundEnd', `${rounds.state.message} — ${reason}. VAN ${rounds.state.scoreAttack} — ${rounds.state.scoreDefend} SEN. Next round starts shortly.`);
    if (document.pointerLockElement) document.exitPointerLock();
    if (winner === 'attack') audio.roundWin();
    else audio.roundLose();
  }
  refreshHud();
}

function checkRoundEnd() {
  if (rounds.state.phase !== 'combat') return;
  const counts = aliveCounts();
  const planted = bomb.state.status === 'planted';
  if (counts.defend === 0) {
    finishRound('attack', planted ? 'Bomb detonated' : 'Sentinel squad eliminated');
    return;
  }
  if (counts.attack === 0 && !planted) {
    finishRound('defend', 'Vanguard squad eliminated');
  }
}

function onDetonate(position, radius, maxDamage) {
  audio.explosion();
  const victims = [];
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const dist = bot.position.distanceTo(position);
    if (dist > radius) continue;
    const amount = Math.round(maxDamage * (1 - dist / radius) + 20);
    const killed = bots.damage(bot, amount);
    victims.push({ name: CALLSIGNS[bot.id], killed, team: bot.team });
  }
  if (body.alive) {
    const dist = body.position.distanceTo(position);
    if (dist <= radius) {
      const amount = Math.round(maxDamage * (1 - dist / radius) + 20);
      const died = player.damage(amount);
      hud.damageFlash();
      audio.hurt();
      if (died) {
        hud.killfeed('You were caught in the blast', false);
        if (document.pointerLockElement) document.exitPointerLock();
      }
    }
  }
  for (const victim of victims) {
    hud.killfeed(`Blast ▸ ${victim.name}${victim.killed ? ' ✕' : ''}`, victim.team === 'foe');
  }
}

function onBotEvent(event) {
  if (event.type !== 'shot') return;
  const { bot, out } = event;
  const dist = bot.position.distanceTo(body.position);
  if (dist < 28) audio.shot('rifle');
  if (!out.damage) return;
  if (out.playerHit) {
    if (shot) return; // Staged captures: the player never takes damage.
    const died = player.damage(out.damage);
    hud.damageFlash();
    audio.hurt();
    hud.killfeed(`${CALLSIGNS[bot.id]} ▸ You${out.part === 'head' ? ' (headshot)' : ''}`, false);
    if (died && document.pointerLockElement) document.exitPointerLock();
  } else if (out.victim) {
    const killed = bots.damage(out.victim, out.damage);
    hud.killfeed(`${CALLSIGNS[bot.id]} ▸ ${CALLSIGNS[out.victim.id]}${killed ? ' ✕' : ''}`, out.victim.team === 'foe');
  }
}

function shoot(spread) {
  const def = weapons.def();
  if (!weapons.takeRound()) { audio.dryFire(); return false; }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const pellets = def.pellets;
  let anyHit = false;
  let anyKill = false;
  for (let p = 0; p < pellets; p += 1) {
    if (p > 0) {
      direction.x += (random() * 2 - 1) * spread * 2;
      direction.y += (random() * 2 - 1) * spread * 2;
      direction.normalize();
      raycaster.set(camera.position, direction);
    }
    const hit = raycaster.intersectObjects(raycastTargets, false)[0];
    if (!hit || !hit.object.userData.bot) continue;
    const bot = hit.object.userData.bot;
    if (!bot.alive) continue;
    const damage = hit.object.userData.part === 'head' ? def.headDamage : def.damage;
    const killed = bots.damage(bot, damage);
    anyHit = true;
    if (killed) {
      anyKill = true;
      kills += 1;
      rounds.awardKill();
      hud.killfeed(`You ▸ ${CALLSIGNS[bot.id]}${hit.object.userData.part === 'head' ? ' (headshot)' : ''} ✕`, true);
    }
  }
  if (anyHit) {
    hud.hitMarker(anyKill, markerHoldMs);
    audio.hit();
    if (anyKill) audio.kill();
  }
  weapons.pullTrigger();
  audio.shot(def.kind);
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, def.name);
  return true;
}

function throwGrenade() {
  if (grenadeCount <= 0 || rounds.state.phase !== 'combat') return;
  grenadeCount -= 1;
  camera.getWorldDirection(direction);
  shootOrigin.copy(camera.position).addScaledVector(direction, 0.5);
  grenades.throwGrenade(shootOrigin, direction, 15);
  audio.click();
}

function step(dt) {
  elapsed += dt;
  const phase = rounds.state.phase;
  const tick = rounds.tick(dt);
  if (tick === 'combat') {
    hud.setHint('Plant the bomb at A or B — hold E inside a site ring');
    setTimeout(() => hud.setHint(''), 4000);
  } else if (tick === 'nextRound') {
    setupRound();
    hud.hideOverlay();
    if (!input.state.locked) hud.showOverlay('paused', 0);
    return;
  } else if (tick === 'timeUp' && phase === 'combat' && bomb.state.status !== 'planted') {
    finishRound('defend', 'Time expired — bomb never planted');
    return;
  }

  if (phase === 'buy' || phase === 'combat') {
    player.step(dt, input.state.keys);
    weapons.step(dt);
  }
  if (phase === 'combat') {
    scene.updateMatrixWorld(true);
    bots.step(dt, elapsed, targetsList(), botRaycastTargets, onBotEvent);
    grenades.step(dt);
    bomb.blastStep(dt);

    // Plant / defuse.
    const site = bomb.siteOf(body.position.x, body.position.z, world.sites);
    if (body.alive && bomb.state.status !== 'planted' && input.state.keys.has('KeyE') && site) {
      const planted = bomb.plantTick(dt, true, site);
      hud.setBomb(`Planting at ${site.name}…`, bomb.state.plantProgress);
      if (planted === 'planted') {
        rounds.awardPlant();
        audio.plantBeep();
        hud.killfeed(`Bomb planted at ${site.name}`, true);
        hud.setBomb('Bomb planted — defend it', 1);
        for (const bot of bots.bots) {
          if (bot.team === 'foe' && bot.alive) bots.retargetToSite(bot, site.name);
        }
      }
    } else {
      if (bomb.state.status === 'planting') bomb.plantCancel();
      if (bomb.state.status !== 'planted') hud.setBomb(null, 0);
    }
    if (bomb.state.status === 'planted') {
      const plantedSite = bomb.state.site;
      let defuserPresent = false;
      for (const bot of bots.bots) {
        if (bot.team !== 'foe' || !bot.alive) continue;
        const dx = bot.position.x - plantedSite.x;
        const dz = bot.position.z - plantedSite.z;
        if (dx * dx + dz * dz <= plantedSite.radius * plantedSite.radius) { defuserPresent = true; break; }
      }
      const result = bomb.fuseTick(dt, defuserPresent);
      if (result === 'beep') audio.plantBeep();
      else if (result === 'defused') {
        hud.setBomb(null, 0);
        finishRound('defend', 'Bomb defused');
        return;
      } else if (result === 'exploded') {
        hud.setBomb(null, 0);
        onDetonate(new THREE.Vector3(plantedSite.x, 0.5, plantedSite.z), 12, 150);
        finishRound('attack', 'Bomb detonated');
        return;
      } else {
        hud.setBomb(`Bomb at ${plantedSite.name} — ${Math.ceil(bomb.state.fuseLeft)}s`, 1 - bomb.state.fuseLeft / 35);
      }
    }
    checkRoundEnd();
  }
  refreshHud();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    const pressed = input.takePressed();
    if (pressed.has('KeyB') && rounds.state.phase === 'buy') {
      if (hud.buyVisible()) hud.hideBuy();
      else hud.showBuy(rounds.state.money, weapons.owned);
    }
    if (rounds.state.phase === 'buy') {
      if (pressed.has('Digit1')) buyItem('rifle');
      if (pressed.has('Digit2')) buyItem('shotgun');
      if (pressed.has('Digit4')) buyItem('grenade');
      if (pressed.has('Digit3')) buyItem('armor');
    } else if (rounds.state.phase === 'combat') {
      if (pressed.has('Digit1')) weapons.equip('rifle');
      if (pressed.has('Digit2')) weapons.equip('shotgun');
      if (pressed.has('Digit3')) weapons.equip('pistol');
      if (pressed.has('KeyG') || pressed.has('Digit4')) throwGrenade();
    }
    const def = weapons.def();
    const firing = input.state.firing && body.alive && (rounds.state.phase === 'combat');
    const risingEdge = firing && !prevFiring;
    prevFiring = firing;
    if (firing && weapons.ready() && (def.auto || risingEdge)) {
      shoot(shot ? 0 : weapons.spread(player.groundSpeed()));
    }
    if (input.state.keys.has('KeyR')) weapons.reload();
    hud.setSpread(weapons.spread(player.groundSpeed()));
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  audio.unlock();
  startMatch();
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'play') {
    rounds.startCombat();
    body.position.set(-2, 0, 8);
    settle(30);
    // Advance the bots toward the sites, then shoot the nearest foe.
    settle(150);
    let foe = null;
    let best = Infinity;
    for (const bot of bots.bots) {
      if (bot.team !== 'foe' || !bot.alive) continue;
      const d = bot.position.distanceTo(body.position);
      if (d < best) { best = d; foe = bot; }
    }
    if (foe) {
      aimAt(new THREE.Vector3(foe.position.x, 1.2, foe.position.z));
      let killName = null;
      for (let round = 0; round < 5 && foe.alive; round += 1) {
        shoot(0);
        if (!foe.alive) killName = CALLSIGNS[foe.id];
        settle(6);
      }
      // Re-assert the hit marker right before the capture: the virtual-time
      // budget fast-forwards its timeout otherwise. The kill feed entry from
      // shoot() already persists in shot mode (no fade timeout there).
      if (killName) hud.hitMarker(true, 60000);
    }
    settle(10);
  } else if (name === 'buy') {
    body.position.set(0, 0, 12);
    body.yaw = 0;
    settle(20);
    hud.showBuy(rounds.state.money, weapons.owned);
    aimAt(new THREE.Vector3(-8, 1.5, -6));
  } else if (name === 'win') {
    rounds.startCombat();
    body.position.set(-8, 0, -2);
    settle(30);
    for (const bot of bots.bots) {
      if (bot.team === 'foe') bots.damage(bot, 1000);
    }
    checkRoundEnd();
    settle(20);
    aimAt(new THREE.Vector3(-12, 1.2, -8));
  } else {
    body.position.set(0.6, 0, 12);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showOverlay('start', 0);
  }
  refreshHud();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (rounds.state.phase === 'matchEnd') {
    startMatch();
    input.requestLock();
    return;
  }
  if (!started) startMatch();
  input.requestLock();
});
hud.onBuy((item) => buyItem(item));

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
  } else if (started && rounds.state.phase !== 'roundEnd' && rounds.state.phase !== 'matchEnd') {
    hud.showOverlay('paused', 0);
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
