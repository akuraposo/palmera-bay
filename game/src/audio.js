// All sound is synthesised with WebAudio — no audio files, no network.
// The context is created on the first key or click, so the page never tries
// to play before the player has interacted with it.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return false;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function noiseBurst(duration, volume, filterFreq) {
    if (!ctx || muted) return;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  function tone(freq, duration, volume, type = 'sine', slideTo = null) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  return {
    /** Call from any keydown / pointerdown handler. */
    unlock() {
      ensure();
    },
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    /** Engine hum follows speed (0..1); siren wails while the heat is on. */
    update(speed01, sirenOn, time) {
      if (!ctx || muted) return;
      engineGain.gain.value = 0.02 + speed01 * 0.05;
      engineOsc.frequency.value = 52 + speed01 * 130;
      if (sirenOn) {
        sirenGain.gain.value = 0.035;
        sirenOsc.frequency.value = Math.sin(time * 5.2) > 0 ? 920 : 660;
      } else {
        sirenGain.gain.value = 0;
      }
    },
    shot() {
      noiseBurst(0.12, 0.5, 2600);
      tone(180, 0.08, 0.25, 'square', 60);
    },
    punch() {
      noiseBurst(0.09, 0.35, 700);
    },
    crash() {
      noiseBurst(0.22, 0.5, 500);
    },
    explosion() {
      noiseBurst(0.7, 0.7, 320);
      tone(70, 0.5, 0.4, 'sine', 30);
    },
    pickup() {
      tone(880, 0.09, 0.22);
      setTimeout(() => tone(1318, 0.12, 0.22), 70);
    },
    jingle() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.16, 0.25), i * 95));
    },
    fail() {
      tone(220, 0.35, 0.25, 'sawtooth', 110);
    },
    click() {
      tone(660, 0.05, 0.18, 'square');
    },
    phone() {
      tone(1046, 0.1, 0.2);
      setTimeout(() => tone(1046, 0.1, 0.2), 160);
    },
  };
}
