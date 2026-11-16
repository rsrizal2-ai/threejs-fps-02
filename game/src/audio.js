// Sound, synthesised live with WebAudio: no audio files, no network, no assets.
// The context starts on the first user gesture (the play click), as browsers demand.
export function createAudio() {
  let ctx = null;
  let noise = null;
  let master = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      const length = Math.floor(ctx.sampleRate * 0.5);
      noise = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }

  function burst(duration, frequency, gainValue, type = 'lowpass') {
    const c = ensure();
    if (!c) return;
    const src = c.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const gain = c.createGain();
    gain.gain.setValueAtTime(gainValue, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    src.connect(filter).connect(gain).connect(master);
    src.start();
    src.stop(c.currentTime + duration);
  }

  function tone(frequency, duration, gainValue, type = 'sine', slideTo = 0) {
    const c = ensure();
    if (!c) return;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, c.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + duration);
    const gain = c.createGain();
    gain.gain.setValueAtTime(gainValue, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(c.currentTime + duration);
  }

  return {
    unlock() { ensure(); },
    shot(kind) {
      if (kind === 'pistol') { burst(0.09, 1400, 0.5); tone(190, 0.07, 0.25, 'square', 90); }
      else if (kind === 'shotgun') { burst(0.22, 700, 0.7); tone(120, 0.14, 0.3, 'square', 55); }
      else { burst(0.11, 1800, 0.55); tone(220, 0.06, 0.2, 'square', 110); }
    },
    dryFire() { tone(1200, 0.03, 0.15, 'square'); },
    hit() { tone(2400, 0.05, 0.2, 'sine'); },
    kill() { tone(1800, 0.07, 0.22, 'sine'); tone(1200, 0.12, 0.2, 'sine', 800); },
    hurt() { tone(160, 0.12, 0.3, 'sawtooth', 90); },
    reload() { tone(900, 0.04, 0.15, 'square'); setTimeout(() => tone(650, 0.04, 0.15, 'square'), 260); },
    plantBeep() { tone(1400, 0.09, 0.25, 'sine'); },
    defuseBeep() { tone(1100, 0.09, 0.25, 'sine'); },
    explosion() {
      burst(1.4, 320, 0.9);
      tone(70, 1.1, 0.5, 'sine', 28);
    },
    roundWin() { tone(523, 0.14, 0.22, 'triangle'); setTimeout(() => tone(659, 0.14, 0.22, 'triangle'), 140); setTimeout(() => tone(784, 0.3, 0.25, 'triangle'), 280); },
    roundLose() { tone(392, 0.16, 0.22, 'triangle'); setTimeout(() => tone(311, 0.34, 0.22, 'triangle'), 160); },
    click() { tone(1000, 0.03, 0.12, 'square'); },
    bounce() { tone(300, 0.05, 0.15, 'sine', 140); },
  };
}
