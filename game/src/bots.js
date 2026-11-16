// The bots: two Vanguard teammates and five Sentinel defenders. Each bot walks a
// waypoint graph (BFS paths), holds angles at a site, and fights with the same
// raycast rules as the player: eye to target, spread error, wall blocks the shot.
// Tracers are a fixed pool of lines, never allocated per frame.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createMover, hasLineOfSight, mulberry32 } from './physics.js';

const BOT_SPEED = 3.8;
const BOT_HEALTH = 100;
const BODY_DAMAGE = 22;
const HEAD_DAMAGE = 55;
const REACTION_MIN = 0.3;
const REACTION_MAX = 0.5;
const BURST_MIN = 3;
const BURST_MAX = 5;
const SHOT_GAP = 0.13;
const PAUSE_MIN = 0.55;
const PAUSE_MAX = 1.0;
const PERCEIVE_EVERY = 0.15;
const LOSE_AFTER = 2.0;
const TRACER_POOL = 24;
const TRACER_LIFE = 0.07;

function buildBotMesh(team) {
  const group = new THREE.Group();
  const torsoMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'foe' ? PALETTE.foe : PALETTE.ally), roughness: 0.6, metalness: 0.05 });
  const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.45, metalness: 0.1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), torsoMat);
  torso.position.y = 1.0;
  torso.userData.part = 'torso';
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 12), headMat);
  head.position.y = 1.53;
  head.userData.part = 'head';
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.2), darkMat);
  legL.position.set(-0.13, 0.28, 0);
  const legR = legL.clone();
  legR.position.x = 0.13;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), darkMat);
  gun.position.set(0.25, 1.15, -0.2);
  group.add(torso, head, legL, legR, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
  });
  return { group, torso, head };
}

export function createBots(scene, world, seed) {
  const random = mulberry32(seed);
  const mover = createMover(world.colliders, 0.34);
  const adjacency = world.waypoints.map(() => []);
  for (const [a, b] of world.edges) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  // Tracer pool: fixed lines, reused, never allocated in the hot loop.
  const tracers = [];
  const tracerMat = new THREE.LineBasicMaterial({ color: new THREE.Color('#ffd27d'), transparent: true, opacity: 0.9 });
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, tracerMat.clone());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerNext = 0;
  const raycaster = new THREE.Raycaster();
  raycaster.far = 90;
  const eye = new THREE.Vector3();
  const aimPoint = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const endVec = new THREE.Vector3();
  const stepSpeed = new THREE.Vector3();
  const perceiveFrom = new THREE.Vector3();
  const perceiveTo = new THREE.Vector3();
  const perceiveFacing = new THREE.Vector3();
  const perceiveDir = new THREE.Vector3();

  function nearestNode(x, z) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < world.waypoints.length; i += 1) {
      const dx = world.waypoints[i].x - x;
      const dz = world.waypoints[i].z - z;
      const d = dx * dx + dz * dz;
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  function findPath(from, to) {
    if (from === to) return [to];
    const prev = new Array(world.waypoints.length).fill(-1);
    const queue = [from];
    prev[from] = from;
    while (queue.length) {
      const node = queue.shift();
      for (const next of adjacency[node]) {
        if (prev[next] !== -1) continue;
        prev[next] = node;
        if (next === to) {
          const path = [to];
          let current = to;
          while (current !== from) { current = prev[current]; path.unshift(current); }
          return path;
        }
        queue.push(next);
      }
    }
    return [to];
  }

  const bots = [];
  const hitMeshes = [];

  function makeBot(id, team) {
    const { group, torso, head } = buildBotMesh(team);
    scene.add(group);
    const bot = {
      id, team, group, torso, head,
      position: group.position,
      velocity: new THREE.Vector3(),
      yaw: 0, health: BOT_HEALTH, alive: true,
      state: 'patrol', path: [], pathIndex: 0, site: 'A',
      perceiveLeft: random() * PERCEIVE_EVERY,
      target: null, lastSeenAt: -99, reactionLeft: 0,
      burstLeft: 0, shotLeft: 0, pauseLeft: 0, fall: 0,
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  function spawnRound() {
    // Two allies push a random site; five foes split: two hold A, two hold B, one mid.
    const pushSite = random() < 0.5 ? 'A' : 'B';
    const siteNode = (name) => (name === 'A' ? 13 : 14);
    let allyIndex = 0;
    let foeIndex = 0;
    for (const bot of bots) {
      bot.health = BOT_HEALTH;
      bot.alive = true;
      bot.fall = 0;
      bot.group.rotation.set(0, 0, 0);
      bot.group.visible = true;
      bot.state = 'patrol';
      bot.target = null;
      bot.burstLeft = 0;
      bot.pauseLeft = 0;
      if (bot.team === 'ally') {
        const spawn = world.spawns.attack[allyIndex % world.spawns.attack.length];
        bot.position.set(spawn.x, 0, spawn.z);
        bot.yaw = spawn.yaw;
        bot.site = pushSite;
        bot.path = findPath(nearestNode(spawn.x, spawn.z), siteNode(pushSite));
        bot.pathIndex = 0;
        allyIndex += 1;
      } else {
        const spawn = world.spawns.defend[foeIndex % world.spawns.defend.length];
        bot.position.set(spawn.x, 0, spawn.z);
        bot.yaw = spawn.yaw;
        bot.site = foeIndex < 2 ? 'A' : foeIndex < 4 ? 'B' : 'mid';
        const goal = bot.site === 'mid' ? 11 : siteNode(bot.site);
        bot.path = findPath(nearestNode(spawn.x, spawn.z), goal);
        bot.pathIndex = 0;
        foeIndex += 1;
      }
    }
  }

  function retargetToSite(bot, siteName) {
    const goal = siteName === 'A' ? 13 : siteName === 'B' ? 14 : 11;
    bot.site = siteName;
    bot.path = findPath(nearestNode(bot.position.x, bot.position.z), goal);
    bot.pathIndex = 0;
    bot.state = 'patrol';
    bot.target = null;
  }

  function fireTracer(from, to) {
    const tracer = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % TRACER_POOL;
    const positions = tracer.line.geometry.attributes.position.array;
    positions[0] = from.x; positions[1] = from.y; positions[2] = from.z;
    positions[3] = to.x; positions[4] = to.y; positions[5] = to.z;
    tracer.line.geometry.attributes.position.needsUpdate = true;
    tracer.line.visible = true;
    tracer.life = TRACER_LIFE;
  }

  // One bot shot: aim with error, raycast, report the outcome. Returns the
  // damage dealt (0 on a miss) and fills out.hit with the part struck.
  function shoot(bot, target, raycastTargets, out) {
    eye.set(bot.position.x, 1.5, bot.position.z);
    aimPoint.copy(target.position);
    aimPoint.y = target.position.y + (target.isPlayer ? 1.2 : 1.0);
    direction.subVectors(aimPoint, eye);
    const distance = direction.length() || 1;
    direction.multiplyScalar(1 / distance);
    const targetSpeed = target.speed || 0;
    const error = 0.012 + distance * 0.00045 + targetSpeed * 0.002;
    direction.x += (random() * 2 - 1) * error;
    direction.y += (random() * 2 - 1) * error;
    direction.z += (random() * 2 - 1) * error;
    direction.normalize();
    raycaster.set(eye, direction);
    const hits = raycaster.intersectObjects(raycastTargets, false);
    endVec.copy(eye).addScaledVector(direction, Math.min(distance + 6, 80));
    if (hits.length) endVec.copy(hits[0].point);
    fireTracer(eye, endVec);
    const hit = hits[0];
    if (!hit) { out.damage = 0; out.part = null; return out; }
    if (hit.object.userData.bot || hit.object.userData.playerHit) {
      const part = hit.object.userData.part;
      out.damage = part === 'head' ? HEAD_DAMAGE : BODY_DAMAGE;
      out.part = part;
      out.victim = hit.object.userData.bot || null;
      out.playerHit = Boolean(hit.object.userData.playerHit);
      return out;
    }
    out.damage = 0;
    out.part = null;
    return out;
  }

  function stepBot(bot, dt, time, targets, raycastTargets, onEvent) {
    if (!bot.alive) {
      if (bot.fall < 1) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.group.rotation.x = -bot.fall * 1.45;
      }
      return;
    }
    bot.perceiveLeft -= dt;
    if (bot.perceiveLeft <= 0) {
      bot.perceiveLeft = PERCEIVE_EVERY;
      // Find the nearest visible enemy.
      let best = null;
      let bestDist = Infinity;
      for (const target of targets) {
        if (target.team === bot.team || !target.alive) continue;
        const dx = target.position.x - bot.position.x;
        const dz = target.position.z - bot.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 45 || dist >= bestDist) continue;
        const to = perceiveTo.set(target.position.x, target.position.y + 1.2, target.position.z);
        const from = perceiveFrom.set(bot.position.x, 1.5, bot.position.z);
        const facing = perceiveFacing.set(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
        const toTarget = perceiveDir.set(dx, 0, dz).normalize();
        if (facing.dot(toTarget) < 0.15 && dist > 4) continue;
        if (!hasLineOfSight(raycaster, from, to, raycastTargets)) continue;
        best = target;
        bestDist = dist;
      }
      if (best) {
        if (bot.target !== best) {
          bot.target = best;
          bot.reactionLeft = REACTION_MIN + random() * (REACTION_MAX - REACTION_MIN);
          bot.burstLeft = 0;
          bot.pauseLeft = 0;
        }
        bot.lastSeenAt = time;
        bot.state = 'engage';
      } else if (bot.target && time - bot.lastSeenAt > LOSE_AFTER) {
        bot.target = null;
        bot.state = 'patrol';
      }
    }

    const speed = stepSpeed.set(0, 0, 0);
    if (bot.state === 'engage' && bot.target && bot.target.alive) {
      // Face the target, hold still, fire in bursts after the reaction delay.
      const dx = bot.target.position.x - bot.position.x;
      const dz = bot.target.position.z - bot.position.z;
      bot.yaw = Math.atan2(-dx, -dz);
      if (bot.reactionLeft > 0) {
        bot.reactionLeft -= dt;
      } else if (bot.burstLeft > 0) {
        bot.shotLeft -= dt;
        if (bot.shotLeft <= 0) {
          bot.shotLeft = SHOT_GAP;
          bot.burstLeft -= 1;
          const out = { damage: 0, part: null, victim: null, playerHit: false };
          shoot(bot, bot.target, raycastTargets, out);
          onEvent({ type: 'shot', bot, target: bot.target, out });
          if (bot.burstLeft === 0) bot.pauseLeft = PAUSE_MIN + random() * (PAUSE_MAX - PAUSE_MIN);
        }
      } else if (bot.pauseLeft > 0) {
        bot.pauseLeft -= dt;
        if (bot.pauseLeft <= 0) bot.burstLeft = BURST_MIN + Math.floor(random() * (BURST_MAX - BURST_MIN + 1));
      } else {
        bot.burstLeft = BURST_MIN + Math.floor(random() * (BURST_MAX - BURST_MIN + 1));
      }
      // Slow strafe while engaging, to be a harder target.
      const strafe = Math.sin(time * 0.7 + bot.id.length) * 0.6;
      speed.set(Math.cos(bot.yaw) * strafe, 0, -Math.sin(bot.yaw) * strafe);
      bot.velocity.x += (speed.x - bot.velocity.x) * Math.min(1, dt * 6);
      bot.velocity.z += (speed.z - bot.velocity.z) * Math.min(1, dt * 6);
    } else {
      // Walk the waypoint path; at the end, hold and face the likely approach.
      const node = world.waypoints[bot.path[bot.pathIndex]];
      if (node) {
        const dx = node.x - bot.position.x;
        const dz = node.z - bot.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.5) {
          bot.pathIndex += 1;
          if (bot.pathIndex >= bot.path.length) {
            bot.state = 'hold';
            bot.yaw = bot.site === 'A' ? Math.PI / 2 : bot.site === 'B' ? -Math.PI / 2 : Math.PI;
          }
        } else {
          bot.yaw = Math.atan2(-dx, -dz);
          speed.set((dx / dist) * BOT_SPEED, 0, (dz / dist) * BOT_SPEED);
          bot.velocity.x += (speed.x - bot.velocity.x) * Math.min(1, dt * 8);
          bot.velocity.z += (speed.z - bot.velocity.z) * Math.min(1, dt * 8);
        }
      } else {
        bot.velocity.x *= Math.max(0, 1 - 8 * dt);
        bot.velocity.z *= Math.max(0, 1 - 8 * dt);
      }
    }
    bot.velocity.y -= 20 * dt;
    bot.onGround = mover.move(bot.position, bot.velocity, dt, 1.72);
    bot.group.rotation.y = bot.yaw;
    if (bot.state === 'hold') {
      bot.group.rotation.y = bot.yaw + Math.sin(time * 0.4 + bot.id.length) * 0.25;
    }
  }

  // Build the squad once; rounds only reposition them.
  makeBot('ally-1', 'ally');
  makeBot('ally-2', 'ally');
  makeBot('foe-1', 'foe');
  makeBot('foe-2', 'foe');
  makeBot('foe-3', 'foe');
  makeBot('foe-4', 'foe');
  makeBot('foe-5', 'foe');

  return {
    bots,
    hitMeshes,
    spawnRound,
    retargetToSite,
    aliveCount(team) {
      return bots.filter((bot) => bot.team === team && bot.alive).length;
    },
    step(dt, time, targets, raycastTargets, onEvent) {
      for (const tracer of tracers) {
        if (tracer.life > 0) {
          tracer.life -= dt;
          tracer.line.material.opacity = Math.max(0, tracer.life / TRACER_LIFE) * 0.9;
          if (tracer.life <= 0) tracer.line.visible = false;
        }
      }
      for (const bot of bots) stepBot(bot, dt, time, targets, raycastTargets, onEvent);
    },
    damage(bot, amount) {
      if (!bot.alive) return false;
      bot.health -= amount;
      if (bot.health > 0) return false;
      bot.health = 0;
      bot.alive = false;
      bot.fall = 0;
      bot.state = 'dead';
      return true;
    },
    reset() {
      for (const bot of bots) {
        bot.group.visible = false;
        bot.alive = false;
      }
    },
  };
}
