// Sonido del Voronoi: un colchón grave que sigue al cursor, una nota cada vez que
// el cursor pasa a otra celda, campanas al sembrar y un soplido en el remolino.

import { LabAudio, SCALE, mtof } from './lab-audio';

// Nota base (MIDI) por paleta: abisal La, magma Re, aurora Mi, vitral Do.
const ROOTS = [57, 50, 52, 48];

export class VoronoiAudio extends LabAudio {
  private droneFilter!: BiquadFilterNode;
  private droneOscs: { osc: OscillatorNode; ratio: number }[] = [];
  private noiseGain!: GainNode;
  private noiseFilter!: BiquadFilterNode;
  private root = ROOTS[0];
  private lastPluck = 0;

  protected setup(ac: AudioContext) {
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

  setPalette(i: number) {
    this.root = ROOTS[i % ROOTS.length];
    if (!this.ac) return;
    for (const { osc, ratio } of this.droneOscs) {
      osc.frequency.setTargetAtTime(mtof(this.root) * ratio, this.ac.currentTime, 0.4);
    }
  }

  // Una vez por cuadro. x, y en 0..1; swirl 0..1 (cuánto remolino hay).
  update(x: number, y: number, swirl: number) {
    if (!this.live) return;
    const now = this.ac!.currentTime;
    this.droneFilter.frequency.setTargetAtTime(220 + (1 - y) * 1400, now, 0.15);
    this.noiseGain.gain.setTargetAtTime(swirl * 0.14, now, 0.2);
    this.noiseFilter.frequency.setTargetAtTime(300 + swirl * 900 + x * 400, now, 0.2);
  }

  // Nota al entrar a otra celda: el tono sale del color de la celda (k) y de la altura.
  pluck(k: number, x: number, y: number, strength: number) {
    if (!this.live) return;
    const now = this.ac!.currentTime;
    if (now - this.lastPluck < 0.07) return;
    this.lastPluck = now;

    const octave = y < 0.33 ? 2 : y < 0.66 ? 1 : 0;
    const f = mtof(this.root + SCALE[Math.floor(k * SCALE.length)] + 12 * octave);
    const pan = (x * 2 - 1) * 0.8;
    const peak = 0.16 * strength;
    this.tone(f, { type: 'triangle', peak, pan });
    this.tone(f * 2, { peak: peak * 0.25, pan });
  }

  // Campanas al sembrar: arpegio corto con un parcial inarmónico (suena a metal).
  chime(x: number) {
    if (!this.live) return;
    const pan = (x * 2 - 1) * 0.8;
    [0, 2, 4].forEach((deg, i) => {
      const f = mtof(this.root + 24 + SCALE[deg]);
      const delay = i * 0.07;
      this.tone(f, { peak: 0.09, decay: 2.5, pan, delay });
      this.tone(f * 2.76, { peak: 0.03, decay: 0.8, pan, delay });
    });
  }
}
