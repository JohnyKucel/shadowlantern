// All sound is synthesised with WebAudio: no audio files, no network. A tiny
// helper builds short blips, sweeps and noise bursts; each named effect is one
// small recipe on top of it. The context is created lazily on the first user
// gesture, so the page never complains about autoplay.
export function createAudio() {
  let context = null;
  let muted = false;
  let master = null;

  function ensure() {
    if (context) return context;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      context = new AudioContextClass();
      master = context.createGain();
      master.gain.value = 0.4;
      master.connect(context.destination);
    } catch {
      context = null;
    }
    return context;
  }

  function tone(freqStart, freqEnd, duration, type, volume, delay = 0) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx || !master) return;
    try {
      const start = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), start + duration);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + duration + 0.05);
    } catch {
      // Sound is garnish: a failed blip never breaks the game.
    }
  }

  function noiseBurst(duration, volume, filterFreq, delay = 0) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx || !master) return;
    try {
      const start = ctx.currentTime + delay;
      const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / length);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(start);
    } catch {
      // Sound is garnish.
    }
  }

  return {
    unlock() { ensure(); },
    setMuted(value) { muted = Boolean(value); },
    isMuted() { return muted; },
    footstep() { noiseBurst(0.07, 0.10, 500); },
    pebble() { tone(1900, 900, 0.09, 'triangle', 0.16); tone(2600, 1400, 0.06, 'sine', 0.10, 0.07); },
    pickup() { tone(880, 880, 0.08, 'sine', 0.18); tone(1318, 1318, 0.12, 'sine', 0.18, 0.08); },
    moonstone() { tone(523, 523, 0.1, 'sine', 0.2); tone(784, 784, 0.1, 'sine', 0.2, 0.1); tone(1046, 1568, 0.22, 'sine', 0.2, 0.2); },
    douse() { noiseBurst(0.35, 0.22, 1800); },
    spotted() { tone(440, 660, 0.25, 'square', 0.07); },
    alarm() { tone(620, 620, 0.14, 'sawtooth', 0.14); tone(620, 620, 0.14, 'sawtooth', 0.14, 0.18); tone(930, 930, 0.3, 'sawtooth', 0.14, 0.36); },
    caught() { tone(330, 110, 0.5, 'sawtooth', 0.18); noiseBurst(0.3, 0.15, 900, 0.05); },
    levelDone() { tone(523, 523, 0.12, 'sine', 0.2); tone(659, 659, 0.12, 'sine', 0.2, 0.12); tone(784, 784, 0.2, 'sine', 0.2, 0.24); },
    victory() {
      const notes = [523, 659, 784, 1046, 784, 1046, 1318];
      notes.forEach((freq, index) => tone(freq, freq, 0.18, 'sine', 0.2, index * 0.13));
    },
  };
}
