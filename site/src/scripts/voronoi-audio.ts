// Sonido del Voronoi: un colchón grave que sigue al cursor, una nota cada vez que
// el cursor pasa a otra celda, campanas al sembrar y un soplido en el remolino.
// Todo sale de una escala pentatónica, así cualquier combinación suena afinada.

const SCALE = [0, 3, 5, 7, 10];
// Nota base (MIDI) por paleta: abisal La, magma Re, aurora Mi, vitral Do.
const ROOTS = [57, 50, 52, 48];
const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

function impulse(ac: AudioContext, seconds: number) {
  const len = Math.round(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.5;
  }
  return buf;
}

export class VoronoiAudio {
  enabled = false;
  private ac: AudioContext | null = null;
  private master!: GainNode;
  private bus!: GainNode;
  private droneFilter!: BiquadFilterNode;
  private droneOscs: { osc: OscillatorNode; ratio: number }[] = [];
  private noiseGain!: GainNode;
  private noiseFilter!: BiquadFilterNode;
  private root = ROOTS[0];
  private lastPluck = 0;

  private init() {
    const ac = new AudioContext();
    this.ac = ac;

    const comp = ac.createDynamicsCompressor();
    comp.connect(ac.destination);
    this.master = ac.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp);

    // Todas las voces entran al bus; el bus va seco y a una reverb larga.
    this.bus = ac.createGain();
    const reverb = ac.createConvolver();
    reverb.buffer = impulse(ac, 3.2);
    const wet = ac.createGain();
    wet.gain.value = 0.5;
    this.bus.connect(this.master);
    this.bus.connect(reverb);
    reverb.connect(wet);
    wet.connect(this.master);

    this.droneFilter = ac.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 400;
    this.droneFilter.Q.value = 4;
    const droneGain = ac.createGain();
    droneGain.gain.value = 0.05;
    this.droneFilter.connect(droneGain);
    droneGain.connect(this.bus);

    const voices: [number, OscillatorType, number][] = [
      [0.5, 'sawtooth', -6],
      [0.5, 'sawtooth', 7],
      [0.75, 'triangle', 0],
    ];
    for (const [ratio, type, detune] of voices) {
      const osc = ac.createOscillator();
      osc.type = type;
      osc.frequency.value = mtof(this.root) * ratio;
      osc.detune.value = detune;
      osc.connect(this.droneFilter);
      osc.start();
      this.droneOscs.push({ osc, ratio });
    }

    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoDepth = ac.createGain();
    lfoDepth.gain.value = 120;
    lfo.connect(lfoDepth);
    lfoDepth.connect(this.droneFilter.frequency);
    lfo.start();

    const noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = ac.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    this.noiseFilter = ac.createBiquadFilter();
    this.noiseFilter.type = 'bandpass';
    this.noiseFilter.frequency.value = 600;
    this.noiseFilter.Q.value = 1.2;
    this.noiseGain = ac.createGain();
    this.noiseGain.gain.value = 0;
    noise.connect(this.noiseFilter);
    this.noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.bus);
    noise.start();
  }

  // Debe llamarse desde un clic o tecla: el navegador no deja sonar antes.
  async setEnabled(on: boolean) {
    this.enabled = on;
    if (on && !this.ac) this.init();
    const ac = this.ac;
    if (!ac) return;
    const now = ac.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    if (on) {
      await ac.resume();
      this.master.gain.linearRampToValueAtTime(0.8, now + 0.6);
    } else {
      this.master.gain.linearRampToValueAtTime(0, now + 0.4);
      setTimeout(() => { if (!this.enabled) ac.suspend(); }, 500);
    }
  }

  setPalette(i: number) {
    this.root = ROOTS[i % ROOTS.length];
    if (!this.ac) return;
    for (const { osc, ratio } of this.droneOscs) {
      osc.frequency.setTargetAtTime(mtof(this.root) * ratio, this.ac.currentTime, 0.4);
    }
  }

  // Una vez por cuadro. x, y en 0..1; swirl 0..1 (cuánto remolino hay).
  update(x: number, y: number, swirl: number) {
    if (!this.enabled || !this.ac) return;
    const now = this.ac.currentTime;
    this.droneFilter.frequency.setTargetAtTime(220 + (1 - y) * 1400, now, 0.15);
    this.noiseGain.gain.setTargetAtTime(swirl * 0.14, now, 0.2);
    this.noiseFilter.frequency.setTargetAtTime(300 + swirl * 900 + x * 400, now, 0.2);
  }

  // Nota al entrar a otra celda: el tono sale del color de la celda (k) y de la altura.
  pluck(k: number, x: number, y: number, strength: number) {
    if (!this.enabled || !this.ac) return;
    const ac = this.ac;
    const now = ac.currentTime;
    if (now - this.lastPluck < 0.07) return;
    this.lastPluck = now;

    const octave = y < 0.33 ? 2 : y < 0.66 ? 1 : 0;
    const f = mtof(this.root + SCALE[Math.floor(k * SCALE.length)] + 12 * octave);
    const env = ac.createGain();
    const pan = ac.createStereoPanner();
    pan.pan.value = (x * 2 - 1) * 0.8;
    env.connect(pan);
    pan.connect(this.bus);

    const peak = 0.16 * strength;
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(peak, now + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

    for (const [mult, type, level] of [[1, 'triangle', 1], [2, 'sine', 0.25]] as const) {
      const osc = ac.createOscillator();
      osc.type = type;
      osc.frequency.value = f * mult;
      const g = ac.createGain();
      g.gain.value = level;
      osc.connect(g);
      g.connect(env);
      osc.start(now);
      osc.stop(now + 1.3);
    }
  }

  // Campanas al sembrar: arpegio corto con un parcial inarmónico (suena a metal).
  chime(x: number) {
    if (!this.enabled || !this.ac) return;
    const ac = this.ac;
    const pan = ac.createStereoPanner();
    pan.pan.value = (x * 2 - 1) * 0.8;
    pan.connect(this.bus);
    [0, 2, 4].forEach((deg, i) => {
      const t = ac.currentTime + i * 0.07;
      const f = mtof(this.root + 24 + SCALE[deg]);
      for (const [mult, level, decay] of [[1, 0.09, 2.5], [2.76, 0.03, 0.8]]) {
        const osc = ac.createOscillator();
        osc.frequency.value = f * mult;
        const g = ac.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(level, t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        osc.connect(g);
        g.connect(pan);
        osc.start(t);
        osc.stop(t + decay + 0.05);
      }
    });
  }
}
