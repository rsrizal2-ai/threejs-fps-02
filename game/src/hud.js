// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score, alive
// counts, kill feed, buy menu, bomb banner and the one overlay panel. It never
// touches the simulation; main.js pushes numbers in and reads callbacks out.
const COPY = {
  start: {
    title: 'Emberline',
    copy: 'Vanguard attacks Dock 7. Plant the bomb at A or B — or eliminate the Sentinel squad. First to 5 rounds takes the match.',
    action: 'Deploy',
  },
  paused: {
    title: 'Emberline',
    copy: 'Paused. Click to resume.',
    action: 'Resume',
  },
  roundEnd: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  matchEnd: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const el = (id) => document.getElementById(id);
  const overlay = el('overlay');
  const title = el('overlay-title');
  const copy = el('overlay-copy');
  const play = el('play');
  const crosshair = el('crosshair');
  const hitmarker = el('hitmarker');
  const vignette = el('damage-vignette');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const weaponName = el('weapon-name');
  const healthFill = el('health-fill');
  const healthValue = el('health-value');
  const armorValue = el('armor-value');
  const moneyValue = el('money-value');
  const timerValue = el('timer-value');
  const timerLabel = el('timer-label');
  const scoreValue = el('score-value');
  const aliveValue = el('alive-value');
  const killfeed = el('killfeed');
  const bombBanner = el('bomb-banner');
  const bombText = el('bomb-text');
  const bombFill = el('bomb-fill');
  const buyMenu = el('buy-menu');
  const hint = el('hint');
  let hitTimer = 0;
  let lastAmmo = '';
  let lastHealth = '';
  let lastMoney = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastAlive = '';

  function setText(node, value, last) {
    if (value === last) return last;
    node.textContent = value;
    return value;
  }

  return {
    setAmmo(mag, reserve, name) {
      const value = `${mag}|${reserve}|${name}`;
      if (value === lastAmmo) return;
      lastAmmo = value;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      weaponName.textContent = name;
    },
    setHealth(health, armor) {
      const value = `${health}|${armor}`;
      if (value === lastHealth) return;
      lastHealth = value;
      healthFill.style.width = `${Math.max(0, health)}%`;
      healthFill.classList.toggle('low', health <= 30);
      healthValue.textContent = String(Math.ceil(health));
      armorValue.textContent = armor > 0 ? `+${Math.ceil(armor)}` : '';
    },
    setMoney(money) {
      if (money === lastMoney) return;
      lastMoney = money;
      moneyValue.textContent = `$${money}`;
    },
    setTimer(seconds, label) {
      const value = `${Math.ceil(Math.max(0, seconds))}|${label}`;
      if (value === lastTimer) return;
      lastTimer = value;
      timerValue.textContent = String(Math.ceil(Math.max(0, seconds)));
      timerLabel.textContent = label;
    },
    setScore(attack, defend, round) {
      const value = `${attack}|${defend}|${round}`;
      if (value === lastScore) return;
      lastScore = value;
      scoreValue.textContent = `VAN ${attack} — ${defend} SEN · R${round}`;
    },
    setAlive(attackAlive, defendAlive) {
      const value = `${attackAlive}|${defendAlive}`;
      if (value === lastAlive) return;
      lastAlive = value;
      aliveValue.textContent = `● ${attackAlive}  vs  ${defendAlive} ●`;
    },
    setSpread(spread) {
      crosshair.style.setProperty('--gap', `${Math.round(3 + spread * 260)}px`);
    },
    damageFlash() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 180);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    killfeed(text, good) {
      const entry = document.createElement('div');
      entry.className = good ? 'feed-good' : 'feed-bad';
      entry.textContent = text;
      killfeed.prepend(entry);
      while (killfeed.children.length > 4) killfeed.removeChild(killfeed.lastChild);
      // In a staged capture the virtual-time budget fast-forwards timers, so
      // entries stay until the shot freezes; in live play they fade after 5 s.
      if (!window.__shotMode) setTimeout(() => entry.remove(), 5000);
    },
    setBomb(text, progress) {
      if (!text) {
        bombBanner.hidden = true;
        return;
      }
      bombBanner.hidden = false;
      bombText.textContent = text;
      bombFill.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
    },
    setHint(text) {
      hint.textContent = text || '';
      hint.hidden = !text;
    },
    showBuy(money, owned) {
      buyMenu.hidden = false;
      for (const button of buyMenu.querySelectorAll('button[data-item]')) {
        const item = button.dataset.item;
        const price = Number(button.dataset.price);
        button.disabled = money < price || (owned.has(item) && item !== 'grenade' && item !== 'armor');
        button.querySelector('.price').textContent = owned.has(item) && item !== 'grenade' && item !== 'armor' ? 'OWNED' : `$${price}`;
      }
    },
    hideBuy() { buyMenu.hidden = true; },
    buyVisible() { return !buyMenu.hidden; },
    showOverlay(mode, detail) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'roundEnd' || mode === 'matchEnd' ? detail : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { play.addEventListener('click', handler); },
    onBuy(handler) {
      for (const button of buyMenu.querySelectorAll('button[data-item]')) {
        button.addEventListener('click', () => handler(button.dataset.item));
      }
    },
  };
}
