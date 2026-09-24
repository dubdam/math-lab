// Sonido del átomo: cada fotón es una nota cuya frecuencia es proporcional a la frecuencia
// real de la luz (la misma luz, unas 41 octavas más grave), así los intervalos entre
// líneas son los de verdad. Emitir suena como una nota que se apaga; absorber, como una
// que se enciende y se corta. Debajo, un colchón grave apenas audible.

import { LabAudio } from './lab-audio';

/** Hz por eV: Lyman α (10,2 eV) queda en 1320 Hz. */
const HZ_PER_EV = 129.4;

export function photonPitch(dE: number) {
  let f = HZ_PER_EV * dE;
  while (f < 55) f *= 2;
  while (f > 3200) f /= 2;
  return f;
}

export class AtomAudio extends LabAudio {
  private padGain!: GainNode;

  protected setup(ac: AudioContext) {
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    this.padGain = ac.createGain();
    this.padGain.gain.value = 0.05;
    filter.connect(this.padGain);
    this.padGain.connect(this.bus);
    for (const [f, type] of [[55, 'sine'], [82.5, 'sine'], [110.3, 'triangle']] as [number, OscillatorType][]) {
      const osc = ac.createOscillator();
      osc.type = type;
      osc.frequency.value = f;
      osc.connect(filter);
      osc.start();
    }
  }

  /** dE en eV (positivo). pan -1..1. */
  photon(dE: number, kind: 'emit' | 'absorb', pan = 0) {
    if (!this.live) return;
    const f = photonPitch(dE);
    if (kind === 'emit') {
      this.tone(f, { type: 'sine', peak: 0.14, decay: 2.6, pan });
      this.tone(f * 2, { type: 'triangle', peak: 0.03, decay: 1.4, pan });
      return;
    }
    const ac = this.ac!;
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.55);
    g.gain.setValueAtTime(0.16, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    const p = ac.createStereoPanner();
    p.pan.value = pan;
    osc.connect(g);
    g.connect(p);
    p.connect(this.bus);
    osc.start(t);
    osc.stop(t + 0.75);
  }

  /** Un fotón que pasa de largo: un golpe sordo. */
  miss() {
    if (!this.live) return;
    const ac = this.ac!;
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuffer(0.3);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.bus);
    src.start(t);
  }

  /** Objetivo cumplido: la serie de Balmer como arpegio. */
  win(energies: number[]) {
    if (!this.live) return;
    energies.forEach((dE, i) => this.tone(photonPitch(dE), { type: 'triangle', peak: 0.08, decay: 1.6, delay: i * 0.13, pan: (i / energies.length) * 1.2 - 0.6 }));
  }
}
