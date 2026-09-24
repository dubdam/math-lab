// Bandada de "boids" (Craig Reynolds, 1986). Cada pájaro mira solo a sus vecinos
// cercanos y suma tres empujones: separación (no chocar), alineación (ir para el mismo
// lado) y cohesión (no quedarse solo). Nadie dirige: la forma de la bandada emerge.
//
// Los vecinos se buscan con una grilla: cada pájaro solo revisa su casillero y los
// 8 de alrededor, en vez de compararse con todos los demás.

export type Rules = { separation: number; alignment: number; cohesion: number };
export type Point = { x: number; y: number };

/** Fuerzas de un pájaro, separadas, para poder dibujarlas (x, y de cada una). */
export type Forces = { sep: Point; ali: Point; coh: Point; neighbors: number[] };

const MAX_NEIGHBORS = 16;

export class Flock {
  n = 0;
  readonly depth = 260;
  perception = 90;
  separationDist = 32;
  maxSpeed = 190;
  minSpeed = 90;
  maxForce = 320;
  /** Peso base de cada regla; las Rules del usuario multiplican estos valores. */
  weights = { separation: 3, alignment: 2, cohesion: 0.5 };

  x: Float32Array; y: Float32Array; z: Float32Array;
  vx: Float32Array; vy: Float32Array; vz: Float32Array;
  /** Fase del aleteo y miedo (0..1, decae solo) de cada pájaro. */
  phase: Float32Array; fear: Float32Array;
  private ax: Float32Array; private ay: Float32Array; private az: Float32Array;

  /** 0..1: cuánto va cada pájaro para el mismo lado que sus vecinos (promedio). */
  order = 0;
  /** Velocidad media relativa a maxSpeed. */
  speed = 0;
  center: Point = { x: 0, y: 0 };

  private W = 0;
  private H = 0;
  private cols = 0;
  private rows = 0;
  private cellStart = new Int32Array(0);
  private cellCount = new Int32Array(0);
  private cellOf: Int32Array;
  private sorted: Int32Array;
  private tmp = new Float32Array(10);

  constructor(readonly capacity: number) {
    const f = () => new Float32Array(capacity);
    this.x = f(); this.y = f(); this.z = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.ax = f(); this.ay = f(); this.az = f();
    this.phase = f(); this.fear = f();
    this.cellOf = new Int32Array(capacity);
    this.sorted = new Int32Array(capacity);
  }

  resize(W: number, H: number) {
    this.W = W;
    this.H = H;
    const pad = 200;
    this.cols = Math.ceil((W + 2 * pad) / this.perception);
    this.rows = Math.ceil((H + 2 * pad) / this.perception);
    this.cellStart = new Int32Array(this.cols * this.rows);
    this.cellCount = new Int32Array(this.cols * this.rows);
  }

  setCount(n: number) {
    n = Math.min(n, this.capacity);
    for (let i = this.n; i < n; i++) {
      this.x[i] = this.W * (0.3 + Math.random() * 0.4);
      this.y[i] = this.H * (0.3 + Math.random() * 0.4);
      this.z[i] = Math.random() * this.depth;
      const a = Math.random() * Math.PI * 2;
      this.vx[i] = Math.cos(a) * this.minSpeed;
      this.vy[i] = Math.sin(a) * this.minSpeed;
      this.vz[i] = 0;
      this.phase[i] = Math.random() * Math.PI * 2;
      this.fear[i] = 0;
    }
    this.n = n;
  }

  private cellIndex(i: number) {
    const pad = 200;
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor((this.x[i] + pad) / this.perception)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor((this.y[i] + pad) / this.perception)));
    return cy * this.cols + cx;
  }

  private buildGrid() {
    this.cellCount.fill(0);
    for (let i = 0; i < this.n; i++) {
      const c = this.cellIndex(i);
      this.cellOf[i] = c;
      this.cellCount[c]++;
    }
    let acc = 0;
    for (let c = 0; c < this.cellStart.length; c++) {
      this.cellStart[c] = acc;
      acc += this.cellCount[c];
    }
    const fill = this.cellCount.slice();
    for (let i = 0; i < this.n; i++) {
      const c = this.cellOf[i];
      this.sorted[this.cellStart[c] + this.cellCount[c] - fill[c]] = i;
      fill[c]--;
    }
  }

  /** Deja en out las tres fuerzas (sep, ali, coh en x,y,z) del pájaro i y, en out[9],
   *  el coseno entre su dirección y la de sus vecinos (1 = alineado). */
  private computeForces(i: number, out: Float32Array, list?: number[]) {
    out.fill(0);
    const r2 = this.perception ** 2;
    const s2 = this.separationDist ** 2;
    const xi = this.x[i], yi = this.y[i], zi = this.z[i];
    const c = this.cellOf[i];
    const ccx = c % this.cols, ccy = (c / this.cols) | 0;
    let count = 0;
    let avx = 0, avy = 0, avz = 0, px = 0, py = 0, pz = 0, sx = 0, sy = 0, sz = 0;

    search:
    for (let gy = Math.max(0, ccy - 1); gy <= Math.min(this.rows - 1, ccy + 1); gy++) {
      for (let gx = Math.max(0, ccx - 1); gx <= Math.min(this.cols - 1, ccx + 1); gx++) {
        const cell = gy * this.cols + gx;
        const end = this.cellStart[cell] + this.cellCount[cell];
        for (let k = this.cellStart[cell]; k < end; k++) {
          const j = this.sorted[k];
          if (j === i) continue;
          const dx = this.x[j] - xi, dy = this.y[j] - yi, dz = this.z[j] - zi;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= r2) continue;
          count++;
          avx += this.vx[j]; avy += this.vy[j]; avz += this.vz[j];
          px += dx; py += dy; pz += dz;
          if (d2 < s2 && d2 > 0) { sx -= dx / d2; sy -= dy / d2; sz -= dz / d2; }
          list?.push(j);
          // Los estorninos reales atienden a unos 7 vecinos; con 16 alcanza y es rápido.
          if (count >= MAX_NEIGHBORS) break search;
        }
      }
    }
    if (count === 0) return;
    const vl = Math.hypot(this.vx[i], this.vy[i], this.vz[i]) * Math.hypot(avx, avy, avz);
    out[9] = vl > 0 ? (this.vx[i] * avx + this.vy[i] * avy + this.vz[i] * avz) / vl : 0;

    const steer = (dx: number, dy: number, dz: number, o: number) => {
      const len = Math.hypot(dx, dy, dz);
      if (len === 0) return;
      let fx = (dx / len) * this.maxSpeed - this.vx[i];
      let fy = (dy / len) * this.maxSpeed - this.vy[i];
      let fz = (dz / len) * this.maxSpeed - this.vz[i];
      const f = Math.hypot(fx, fy, fz);
      if (f > this.maxForce) { fx *= this.maxForce / f; fy *= this.maxForce / f; fz *= this.maxForce / f; }
      out[o] = fx; out[o + 1] = fy; out[o + 2] = fz;
    };
    steer(sx, sy, sz, 0);
    steer(avx, avy, avz, 3);
    steer(px, py, pz, 6);
  }

  /** Fuerzas del pájaro i, para dibujarlas en el modo "mirar un pájaro". */
  forcesOf(i: number): Forces {
    const out = new Float32Array(10);
    const neighbors: number[] = [];
    this.computeForces(i, out, neighbors);
    return {
      sep: { x: out[0], y: out[1] },
      ali: { x: out[3], y: out[4] },
      coh: { x: out[6], y: out[7] },
      neighbors,
    };
  }

  nearest(px: number, py: number) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < this.n; i++) {
      const d = (this.x[i] - px) ** 2 + (this.y[i] - py) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /** Susto: empuja hacia afuera a los que están cerca del punto. */
  scare(px: number, py: number, radius = 220) {
    for (let i = 0; i < this.n; i++) {
      const dx = this.x[i] - px, dy = this.y[i] - py;
      const d = Math.hypot(dx, dy);
      if (d > radius || d === 0) continue;
      const k = (1 - d / radius) * 320;
      this.vx[i] += (dx / d) * k;
      this.vy[i] += (dy / d) * k;
      this.fear[i] = 1;
    }
  }

  step(dt: number, rules: Rules, predator: Point | null, attractor: Point | null) {
    this.buildGrid();
    const f = this.tmp;
    const ws = this.weights.separation * rules.separation;
    const wa = this.weights.alignment * rules.alignment;
    const wc = this.weights.cohesion * rules.cohesion;
    const margin = 90, turn = this.maxForce * 1.6;
    const fleeR = 170;

    let alignSum = 0;
    for (let i = 0; i < this.n; i++) {
      this.computeForces(i, f);
      alignSum += f[9];
      let ax = f[0] * ws + f[3] * wa + f[6] * wc;
      let ay = f[1] * ws + f[4] * wa + f[7] * wc;
      let az = f[2] * ws + f[5] * wa + f[8] * wc;

      // Un poco de azar: sin esto la bandada se vuelve demasiado perfecta.
      ax += (Math.random() - 0.5) * 60;
      ay += (Math.random() - 0.5) * 60;
      az += (Math.random() - 0.5) * 30;

      if (predator) {
        const dx = this.x[i] - predator.x, dy = this.y[i] - predator.y;
        const d = Math.hypot(dx, dy);
        if (d < fleeR && d > 0) {
          const k = this.maxForce * 5 * (1 - d / fleeR);
          ax += (dx / d) * k;
          ay += (dy / d) * k;
          this.fear[i] = Math.max(this.fear[i], 1 - d / fleeR);
        }
      }
      if (attractor) {
        const dx = attractor.x - this.x[i], dy = attractor.y - this.y[i];
        const d = Math.hypot(dx, dy) || 1;
        ax += (dx / d) * this.maxForce * 0.9;
        ay += (dy / d) * this.maxForce * 0.9;
      }

      // Bordes blandos: cerca del borde, doblan de a poco en vez de rebotar.
      const x = this.x[i], y = this.y[i], z = this.z[i];
      if (x < margin) ax += turn * (margin - x) / margin;
      if (x > this.W - margin) ax -= turn * (x - this.W + margin) / margin;
      if (y < margin) ay += turn * (margin - y) / margin;
      if (y > this.H - margin) ay -= turn * (y - this.H + margin) / margin;
      if (z < 20) az += turn * 0.5;
      if (z > this.depth - 20) az -= turn * 0.5;

      this.ax[i] = ax; this.ay[i] = ay; this.az[i] = az;
    }

    let speedSum = 0, cx = 0, cy = 0;
    for (let i = 0; i < this.n; i++) {
      let vx = this.vx[i] + this.ax[i] * dt;
      let vy = this.vy[i] + this.ay[i] * dt;
      let vz = this.vz[i] + this.az[i] * dt;
      const cap = this.maxSpeed * (1 + 0.6 * this.fear[i]);
      const s = Math.hypot(vx, vy, vz) || 1;
      const k = s > cap ? cap / s : s < this.minSpeed ? this.minSpeed / s : 1;
      vx *= k; vy *= k; vz *= k;
      this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
      this.x[i] += vx * dt;
      this.y[i] += vy * dt;
      this.z[i] += vz * dt;
      this.fear[i] = Math.max(0, this.fear[i] - dt * 0.8);
      const s2 = s * k;
      this.phase[i] += dt * (9 + s2 / 30 + this.fear[i] * 10);

      speedSum += s2;
      cx += this.x[i];
      cy += this.y[i];
    }
    const n = Math.max(1, this.n);
    // Direcciones al azar promedian 0; alineadas, 1.
    this.order = Math.max(0, alignSum / n);
    this.speed = speedSum / n / this.maxSpeed;
    this.center = { x: cx / n, y: cy / n };
  }
}
