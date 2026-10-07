/**
 * Gameplay sound is synthesised with the Web Audio API. Chapter recordings are played separately.
 * There are three layers: one-shot effects for events and the player's acts, an ambient bed that follows
 * what the map is showing (sea, wind, fire, birdsong), and a slow generative music pad.
 */

export type SoundMode = 'all' | 'effects' | 'off';

const MODE_KEY = 'evo-sound';

export interface AmbientMix {
  /** 0..1 shares of what is on screen. */
  water: number;
  land: number;
  /** 0..1 how many fires are in view. */
  fire: number;
  /** 0..1 how much animal life is in view, when zoomed in close enough to hear it. */
  life: number;
  birds: boolean;
  /** 0 = age of microbes .. 1 = complex life: steers the music from minor to major. */
  age: number;
  paused: boolean;
}

export class Sound {
  mode: SoundMode = 'all';
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private fx!: GainNode;
  private amb!: GainNode;
  private music!: GainNode;
  private white!: AudioBuffer;
  private brown!: AudioBuffer;
  private crackle!: AudioBuffer;
  private seaGain!: GainNode;
  private windGain!: GainNode;
  private fireGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private lastPlay = new Map<string, number>();
  private nextChord = 0;
  private chordIndex = 0;
  private nextChirp = 0;
  private playedThisFrame = 0;
  private ducked = false;

  constructor() {
    try {
      const m = localStorage.getItem(MODE_KEY);
      if (m === 'all' || m === 'effects' || m === 'off') this.mode = m;
    } catch {
      // storage blocked: keep the default
    }
  }

  /** Browsers only allow sound after a click or key press, so this is called from those. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.mode === 'off' || this.ducked ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.fx = this.bus(0.9);
    this.amb = this.bus(0.55);
    this.music = this.bus(this.mode === 'all' ? 0.5 : 0);

    // noise sources, made once
    const len = ctx.sampleRate * 2;
    this.white = ctx.createBuffer(1, len, ctx.sampleRate);
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    this.crackle = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.white.getChannelData(0);
    const b = this.brown.getChannelData(0);
    const c = this.crackle.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      w[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * w[i]) / 1.02;
      b[i] = last * 3.5;
    }
    for (let i = 0; i < len; i++) {
      if (Math.random() < 0.0009) {
        const amp = 0.3 + Math.random() * 0.7;
        const dur = 40 + Math.floor(Math.random() * 300);
        for (let j = 0; j < dur && i + j < len; j++) c[i + j] += (Math.random() * 2 - 1) * amp * Math.exp(-j / (dur / 4));
      }
    }

    // the ambient bed: sea surf and wind, always running, faded in and out by the view
    this.seaGain = this.loop(this.brown, this.amb, 'lowpass', 520, 0.7);
    const surf = ctx.createOscillator();
    surf.frequency.value = 0.11;
    const surfDepth = ctx.createGain();
    surfDepth.gain.value = 0.35;
    surf.connect(surfDepth).connect(this.seaGain.gain);
    surf.start();
    this.windGain = this.loop(this.white, this.amb, 'bandpass', 700, 0.6);
    this.windFilter = this.lastFilter;
    const gust = ctx.createOscillator();
    gust.frequency.value = 0.07;
    const gustDepth = ctx.createGain();
    gustDepth.gain.value = 350;
    gust.connect(gustDepth).connect(this.windFilter.frequency);
    gust.start();
    this.fireGain = this.loop(this.crackle, this.amb, 'highpass', 300, 0.7);
  }

  setMode(mode: SoundMode): void {
    this.mode = mode;
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // ignore
    }
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(mode === 'off' || this.ducked ? 0 : 0.8, t, 0.1);
    this.music.gain.setTargetAtTime(mode === 'all' ? 0.5 : 0, t, 0.3);
  }

  /** Supplied chapter tracks include their own score; leave room for the recording. */
  setDucked(ducked: boolean): void {
    this.ducked = ducked;
    if (this.ctx) this.master.gain.setTargetAtTime(this.mode === 'off' || ducked ? 0 : 0.8, this.ctx.currentTime, 0.15);
  }

  // -------------------------------------------------------------------------
  // building blocks
  // -------------------------------------------------------------------------

  private lastFilter!: BiquadFilterNode;

  private bus(level: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = level;
    g.connect(this.master);
    return g;
  }

  private loop(buf: AudioBuffer, out: AudioNode, type: BiquadFilterType, freq: number, q: number): GainNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = Math.random();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(out);
    src.start(0, Math.random() * 1.5);
    this.lastFilter = f;
    return g;
  }

  /** A burst of filtered noise with an attack/decay envelope. */
  private noise(buf: AudioBuffer, type: BiquadFilterType, freq: number, q: number, peak: number, attack: number, decay: number, delay = 0, freqEnd?: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + attack + decay);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(f).connect(g).connect(this.fx);
    src.start(t, Math.random());
    src.stop(t + attack + decay + 0.1);
  }

  /** A pitched tone, optionally gliding to another pitch. */
  private tone(type: OscillatorType, freq: number, peak: number, attack: number, decay: number, delay = 0, freqEnd?: number, out?: AudioNode): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + attack + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g).connect(out ?? this.fx);
    o.start(t);
    o.stop(t + attack + decay + 0.1);
  }

  private bell(freq: number, peak: number, delay = 0, decay = 2.5): void {
    // inharmonic partials make a bell
    for (const [ratio, amp] of [
      [1, 1],
      [2.76, 0.4],
      [5.4, 0.2],
      [0.5, 0.35],
    ])
      this.tone('sine', freq * ratio, peak * amp, 0.005, decay / Math.sqrt(ratio), delay);
  }

  // -------------------------------------------------------------------------
  // effects
  // -------------------------------------------------------------------------

  /** Play the sound for a named effect; the same effect is not repeated within a short moment. */
  play(name: string): void {
    if (!this.ctx || this.mode === 'off') return;
    const now = performance.now();
    if (now - (this.lastPlay.get(name) ?? -1e9) < 350 || this.playedThisFrame >= 3) return;
    this.lastPlay.set(name, now);
    this.playedThisFrame++;
    const W = this.white;
    const B = this.brown;
    switch (name) {
      case 'click':
        this.tone('triangle', 880, 0.05, 0.002, 0.06);
        break;
      case 'select':
        this.tone('sine', 660, 0.06, 0.004, 0.12);
        this.tone('sine', 990, 0.04, 0.004, 0.16, 0.05);
        break;
      case 'fire':
        this.noise(this.crackle, 'highpass', 400, 0.7, 0.9, 0.05, 1.8);
        this.noise(W, 'lowpass', 300, 0.8, 0.35, 0.3, 1.4, 0, 900);
        break;
      case 'rain':
        this.noise(W, 'highpass', 2500, 0.5, 0.18, 0.6, 2.2);
        this.noise(W, 'bandpass', 900, 0.4, 0.12, 0.8, 2);
        this.tone('sine', 196, 0.05, 0.4, 1.6);
        break;
      case 'drought':
        this.noise(W, 'bandpass', 500, 1.2, 0.2, 0.8, 2, 0, 1600);
        break;
      case 'minerals':
        [1568, 2093, 2637].forEach((f, i) => this.tone('sine', f, 0.07, 0.003, 0.9, i * 0.09));
        break;
      case 'acid':
        this.noise(W, 'highpass', 4000, 0.7, 0.16, 0.05, 1.4);
        [0, 0.15, 0.3, 0.45].forEach((d) => this.noise(W, 'bandpass', 3000 + Math.random() * 2000, 4, 0.12, 0.005, 0.08, d));
        break;
      case 'alkali':
        this.noise(W, 'highpass', 6000, 0.5, 0.1, 0.05, 0.9);
        this.tone('sine', 1320, 0.04, 0.01, 0.5);
        break;
      case 'mutagen':
        for (let i = 0; i < 6; i++) this.tone('sawtooth', 220 * Math.pow(1.26, i), 0.025, 0.02, 0.35, i * 0.07, 330 * Math.pow(1.26, i));
        this.tone('sine', 110, 0.08, 0.05, 1.2, 0, 440);
        break;
      case 'plague':
        this.tone('sawtooth', 73.4, 0.06, 0.4, 2.2);
        this.tone('sawtooth', 77.8, 0.06, 0.4, 2.2);
        this.noise(B, 'lowpass', 300, 1, 0.25, 0.5, 2);
        break;
      case 'ark':
        [392, 494, 587, 784].forEach((f, i) => this.tone('triangle', f, 0.08, 0.005, 1.2, i * 0.11));
        break;
      case 'volcano':
        this.noise(B, 'lowpass', 160, 1.2, 1.2, 0.08, 3.5);
        this.tone('sine', 55, 0.5, 0.01, 1.4, 0, 30);
        this.noise(this.crackle, 'bandpass', 900, 0.8, 0.5, 0.3, 2.5, 0.4);
        break;
      case 'meteor':
        this.noise(W, 'bandpass', 3000, 6, 0.3, 1.2, 0.2, 0, 400);
        this.tone('sine', 1800, 0.06, 1.0, 0.3, 0, 300);
        this.noise(B, 'lowpass', 220, 0.8, 1.6, 0.01, 4.5, 1.35);
        this.tone('sine', 60, 0.7, 0.005, 2.2, 1.35, 25);
        break;
      case 'evolve':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone('sine', f, 0.07, 0.005, 0.7, i * 0.06));
        break;
      case 'air':
        this.noise(W, 'bandpass', 400, 1, 0.18, 0.4, 1.4, 0, 2400);
        break;
      case 'milestone':
        this.bell(523.25, 0.09);
        this.bell(659.25, 0.07, 0.18);
        this.bell(783.99, 0.06, 0.36);
        break;
      case 'extinct':
        this.bell(146.8, 0.12, 0, 3.5);
        break;
      case 'mass-extinction':
        this.bell(98, 0.18, 0, 5);
        this.bell(92.5, 0.12, 0.05, 5);
        this.noise(B, 'lowpass', 120, 1, 0.4, 0.5, 4);
        break;
      case 'ice':
        [1760, 2349, 2637, 3136].forEach((f, i) => this.tone('sine', f, 0.035, 0.002, 1.4, i * 0.13));
        this.noise(W, 'highpass', 3000, 0.5, 0.06, 0.6, 2);
        break;
      case 'win':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.bell(f, 0.09, i * 0.22, 3));
        break;
      case 'lose':
        [220, 207.65, 174.61].forEach((f, i) => this.tone('triangle', f, 0.08, 0.05, 2.2, i * 0.5));
        break;
      case 'error':
        this.tone('square', 180, 0.04, 0.005, 0.18);
        break;
    }
  }

  /** Map a chronicle entry to its sound. */
  forEvent(icon: string, major: boolean): void {
    const map: Record<string, string> = {
      '🔥': 'fire',
      '🌧️': 'rain',
      '🏜️': 'drought',
      '💎': 'minerals',
      '🧪': 'acid',
      '🧂': 'alkali',
      '☢️': 'mutagen',
      '🦠': 'plague',
      '🕊️': 'ark',
      '🌋': 'volcano',
      '☄️': 'meteor',
      '🧬': 'evolve',
      '🌡️': 'air',
      '💀': 'extinct',
      '☠️': 'mass-extinction',
      '❄️': 'ice',
      '🏆': 'win',
      '⚰️': 'lose',
    };
    const name = map[icon] ?? (major ? 'milestone' : '');
    if (name) this.play(name);
  }

  // -------------------------------------------------------------------------
  // ambience and music, called every frame
  // -------------------------------------------------------------------------

  update(mix: AmbientMix): void {
    this.playedThisFrame = 0;
    if (!this.ctx || this.mode === 'off') return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const quiet = mix.paused ? 0.4 : 1;
    this.seaGain.gain.setTargetAtTime(0.32 * mix.water * quiet + 0.02, t, 0.8);
    this.windGain.gain.setTargetAtTime((0.05 + 0.1 * mix.land) * quiet, t, 0.8);
    this.fireGain.gain.setTargetAtTime(0.55 * mix.fire, t, 0.3);

    // birdsong and the hum of life, when zoomed in on a living land
    if (mix.life > 0.05 && t > this.nextChirp) {
      this.nextChirp = t + 0.4 + Math.random() * (3 / mix.life);
      if (mix.birds && Math.random() < 0.7) this.chirp();
      else this.tone('sawtooth', 180 + Math.random() * 120, 0.012, 0.15, 0.6, 0, undefined, this.amb);
    }

    // a slow, quiet pad: minor in the age of microbes, major once complex life arrives
    if (this.mode === 'all' && t > this.nextChord) {
      const minor = [
        [220, 261.63, 329.63],
        [174.61, 220, 261.63],
        [196, 246.94, 293.66],
        [164.81, 196, 246.94],
      ];
      const major = [
        [261.63, 329.63, 392],
        [220, 261.63, 329.63],
        [174.61, 220, 261.63],
        [196, 246.94, 293.66],
      ];
      const chords = mix.age > 0.5 ? major : minor;
      const chord = chords[this.chordIndex++ % chords.length];
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      lp.connect(this.music);
      for (const f of chord) {
        for (const det of [-3, 3]) {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = f / 2;
          o.detune.value = det;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.03, t + 2.5);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 9);
          o.connect(g).connect(lp);
          o.start(t);
          o.stop(t + 9.2);
        }
      }
      this.nextChord = t + 7;
    }
  }

  private chirp(): void {
    const base = 2200 + Math.random() * 1800;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.tone('sine', base, 0.025, 0.01, 0.09, i * 0.13, base * (0.75 + Math.random() * 0.6), this.amb);
  }
}
