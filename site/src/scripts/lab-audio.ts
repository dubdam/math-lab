// Base de sonido compartida por los experimentos: bus con reverb larga,
// encendido/apagado con fundido y un helper para notas sueltas.
// Todo sale de una pentatónica, así cualquier combinación suena afinada.

export const SCALE = [0, 3, 5, 7, 10];
export const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

function impulse(ac: AudioContext, seconds: number) {
  const len = Math.round(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.5;
  }
  return buf;
}

type ToneOptions = { type?: OscillatorType; peak?: number; decay?: number; pan?: number; delay?: number };

export class LabAudio {
  enabled = false;
  protected ac: AudioContext | null = null;
  protected master!: GainNode;
  /** Entrada común de todas las voces: va seco y a la reverb. */
  protected bus!: GainNode;
  protected wet!: GainNode;

  /** Las subclases arman acá sus voces permanentes (drones, ruido). */
  protected setup(_ac: AudioContext) {}

  private init() {
    const ac = new AudioContext();
    this.ac = ac;

    const comp = ac.createDynamicsCompressor();
    comp.connect(ac.destination);
    this.master = ac.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp);

    this.bus = ac.createGain();
    const reverb = ac.createConvolver();
    reverb.buffer = impulse(ac, 3.2);
    this.wet = ac.createGain();
    this.wet.gain.value = 0.5;
    this.bus.connect(this.master);
    this.bus.connect(reverb);
    reverb.connect(this.wet);
    this.wet.connect(this.master);

    this.setup(ac);
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

  protected get live() {
    return this.enabled && this.ac !== null;
  }

  /** Nota suelta con ataque corto y caída exponencial. */
  protected tone(freq: number, o: ToneOptions = {}) {
    const ac = this.ac!;
    const t = ac.currentTime + (o.delay ?? 0);
    const decay = o.decay ?? 1.2;
    const osc = ac.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.peak ?? 0.1, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const pan = ac.createStereoPanner();
    pan.pan.value = o.pan ?? 0;
    osc.connect(g);
    g.connect(pan);
    pan.connect(this.bus);
    osc.start(t);
    osc.stop(t + decay + 0.05);
  }
}
