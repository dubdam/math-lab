// Sonido del Mandelbrot: un colchón que se abre a medida que te hundís en el zoom,
// y la órbita del punto bajo el cursor tocada como melodía. Cada paso de la órbita
// es una nota según hacia dónde apunta z; si la órbita cae en un ciclo de período p,
// se escucha un arpegio de p notas que se repite.

import { LabAudio, SCALE, mtof } from './lab-audio';
import type { Pt } from './orbit';

const ROOTS = [57, 50, 52, 48, 55];
const STEP = 1 / 7;
const ESCAPE_GAP = 0.9;

export class MandelbrotAudio extends LabAudio {
  private droneFilter!: BiquadFilterNode;
  private droneOscs: { osc: OscillatorNode; semis: number }[] = [];
  private root = ROOTS[0];
  private notes: Pt[] = [];
  private loops = false;
  private idx = 0;
  private next = 0;

  protected setup(ac: AudioContext) {
    this.droneFilter = ac.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 300;
    this.droneFilter.Q.value = 3;
    const g = ac.createGain();
    g.gain.value = 0.06;
    this.droneFilter.connect(g);
    g.connect(this.bus);

    const voices: [number, OscillatorType][] = [[-12, 'sine'], [-5, 'sine'], [0, 'triangle'], [7, 'sawtooth']];
    for (const [semis, type] of voices) {
      const osc = ac.createOscillator();
      osc.type = type;
      osc.frequency.value = mtof(this.root + semis);
      osc.connect(this.droneFilter);
      osc.start();
      this.droneOscs.push({ osc, semis });
    }
    this.next = ac.currentTime;
  }

  setPalette(i: number) {
    this.root = ROOTS[i % ROOTS.length];
    if (!this.ac) return;
    for (const { osc, semis } of this.droneOscs) {
      osc.frequency.setTargetAtTime(mtof(this.root + semis), this.ac.currentTime, 0.5);
    }
  }

  /** depth 0..1: qué tan hondo está el zoom. Más hondo, más brillo y más reverb. */
  setDepth(depth: number) {
    if (!this.live) return;
    const now = this.ac!.currentTime;
    this.droneFilter.frequency.setTargetAtTime(250 + depth * 2500, now, 0.3);
    this.wet.gain.setTargetAtTime(0.45 + depth * 0.4, now, 0.3);
  }

  /** Puntos a tocar. loops=true para un ciclo; si no, se toca y se hace una pausa. */
  setMelody(notes: Pt[], loops: boolean) {
    this.notes = notes;
    this.loops = loops;
    // No se reinicia idx: si el cursor se mueve, la melodía cambia sin tartamudear.
    if (this.idx >= notes.length) this.idx = 0;
  }

  /** Una vez por cuadro: agenda las notas que tocan en los próximos 100 ms. */
  tick() {
    if (!this.live) return;
    const now = this.ac!.currentTime;
    if (this.next < now - 0.2) this.next = now;
    while (this.next < now + 0.1) {
      if (this.notes.length === 0) { this.next += STEP; continue; }
      const [x, y] = this.notes[this.idx];
      const k = Math.floor(((Math.atan2(y, x) + Math.PI) / (2 * Math.PI)) * 10) % 10;
      const midi = this.root + 12 + SCALE[k % 5] + 12 * Math.floor(k / 5);
      const pan = Math.max(-0.8, Math.min(0.8, x / 2));
      this.tone(mtof(midi), { type: 'triangle', peak: 0.07, decay: 0.9, pan, delay: this.next - now });
      this.next += STEP;
      this.idx++;
      if (this.idx >= this.notes.length) {
        this.idx = 0;
        if (!this.loops) this.next += ESCAPE_GAP;
      }
    }
  }
}
