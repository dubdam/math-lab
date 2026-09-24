// Sonido de la bandada: viento que crece con la velocidad y sigue a la bandada de
// izquierda a derecha, un acorde que se desafina cuando la bandada se desordena,
// aleteos al asustarla y el grito del halcón cuando pasa solo.

import { LabAudio, mtof } from './lab-audio';

const ROOTS = [52, 45, 50];

export class FlockAudio extends LabAudio {
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private windPan!: StereoPannerNode;
  private pad: { osc: OscillatorNode; semis: number; spread: number }[] = [];
  private padFilter!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private root = ROOTS[0];

  protected setup(ac: AudioContext) {
    this.noise = this.noiseBuffer(2);

    const wind = ac.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    this.windFilter = ac.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.8;
    this.windGain = ac.createGain();
    this.windGain.gain.value = 0;
    this.windPan = ac.createStereoPanner();
    wind.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.windPan);
    this.windPan.connect(this.bus);
    wind.start();

    this.padFilter = ac.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 900;
    const padGain = ac.createGain();
    padGain.gain.value = 0.035;
    this.padFilter.connect(padGain);
    padGain.connect(this.bus);
    // Raíz, quinta, octava y décima: con desafinación 0 suena limpio y abierto.
    const voices: [number, number][] = [[-12, 0], [-5, 1], [0, -1], [4, 1.5]];
    for (const [semis, spread] of voices) {
      const osc = ac.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = mtof(this.root + semis);
      osc.connect(this.padFilter);
      osc.start();
      this.pad.push({ osc, semis, spread });
    }
  }

  setPalette(i: number) {
    this.root = ROOTS[i % ROOTS.length];
    if (!this.ac) return;
    for (const { osc, semis } of this.pad) {
      osc.frequency.setTargetAtTime(mtof(this.root + semis), this.ac.currentTime, 0.6);
    }
  }

  /** order 0..1, speed ~0.5..1.5, x 0..1 (centro de la bandada). */
  update(order: number, speed: number, x: number) {
    if (!this.live) return;
    const now = this.ac!.currentTime;
    this.windGain.gain.setTargetAtTime(0.03 + Math.max(0, speed - 0.4) * 0.12, now, 0.3);
    this.windFilter.frequency.setTargetAtTime(300 + speed * 700, now, 0.3);
    this.windPan.pan.setTargetAtTime((x * 2 - 1) * 0.7, now, 0.4);
    // Desorden → cada voz se corre unos centésimos para su lado: el acorde "tiembla".
    const cents = (1 - order) * 45;
    for (const { osc, spread } of this.pad) osc.detune.setTargetAtTime(spread * cents, now, 0.5);
    this.padFilter.frequency.setTargetAtTime(500 + order * 1400, now, 0.5);
  }

  /** Ráfaga de aleteos: granos cortos de ruido filtrado. */
  flutter(x: number, amount = 1) {
    if (!this.live) return;
    const ac = this.ac!;
    const grains = Math.round(10 + amount * 14);
    for (let i = 0; i < grains; i++) {
      const t = ac.currentTime + Math.random() * 0.45;
      const src = ac.createBufferSource();
      src.buffer = this.noise;
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400 + Math.random() * 2600;
      bp.Q.value = 2;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12 * amount, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      const pan = ac.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, (x * 2 - 1) + (Math.random() - 0.5) * 0.6));
      src.connect(bp);
      bp.connect(g);
      g.connect(pan);
      pan.connect(this.bus);
      src.start(t, Math.random() * 1.5, 0.08);
    }
  }

  /** Grito del halcón: un silbido agudo que cae. */
  cry(x: number) {
    if (!this.live) return;
    const ac = this.ac!;
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    osc.frequency.setValueAtTime(2100, t);
    osc.frequency.exponentialRampToValueAtTime(1500, t + 0.5);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    const pan = ac.createStereoPanner();
    pan.pan.value = (x * 2 - 1) * 0.8;
    osc.connect(g);
    g.connect(pan);
    pan.connect(this.bus);
    osc.start(t);
    osc.stop(t + 0.65);
  }
}
