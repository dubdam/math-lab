// Física del átomo de hidrógeno: niveles de energía, el fotón de cada salto y el muestreo
// de orbitales como nubes de puntos repartidos según |ψ|².
// Distancias en radios de Bohr (a0 = 0,0529 nm), energías en eV.

export const A0_NM = 0.0529177;
/** Energía para arrancar el electrón desde n = 1 (eV). Incluye la masa del protón. */
export const E_ION = 13.598434;
/** h·c en eV·nm: la energía de un fotón es hc/λ. */
export const HC = 1239.84198;
export const MAX_N = 6;
export const L_NAMES = ['s', 'p', 'd', 'f', 'g', 'h'];
const SERIES = ['Lyman', 'Balmer', 'Paschen', 'Brackett', 'Pfund'];
const SERIES_ABBR = ['Ly', 'H', 'Pa', 'Br', 'Pf'];
const GREEK = ['α', 'β', 'γ', 'δ', 'ε'];

export type Orbital = { n: number; l: number; m: number };
export type Band = 'uv' | 'vis' | 'ir';
export type Line = { ni: number; nf: number; nm: number; dE: number; series: string; name: string };

export const energy = (n: number) => -E_ION / (n * n);
export const orbitalName = (o: Orbital) => `${o.n}${L_NAMES[o.l]}`;
/** Radio medio ⟨r⟩ en a0. */
export const meanRadius = (o: Orbital) => (3 * o.n * o.n - o.l * (o.l + 1)) / 2;
export const band = (nm: number): Band => (nm < 380 ? 'uv' : nm > 750 ? 'ir' : 'vis');

export function line(ni: number, nf: number): Line {
  const dE = energy(ni) - energy(nf);
  return {
    ni,
    nf,
    dE,
    nm: HC / dE,
    series: SERIES[nf - 1],
    name: SERIES_ABBR[nf - 1] + GREEK[ni - nf - 1],
  };
}

/** Todas las líneas entre los niveles 1..MAX_N, de la más energética a la menos. */
export const LINES: Line[] = [];
for (let nf = 1; nf < MAX_N; nf++) for (let ni = nf + 1; ni <= MAX_N; ni++) LINES.push(line(ni, nf));
LINES.sort((a, b) => a.nm - b.nm);

/** Color aproximado de una longitud de onda visible (0..1). Fuera del rango, un color fantasma. */
export function wavelengthToRgb(nm: number): [number, number, number] {
  if (nm < 380) return [0.5, 0.42, 0.95];
  if (nm > 750) return [0.75, 0.22, 0.14];
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = (440 - nm) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = (510 - nm) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = (645 - nm) / 65; }
  else r = 1;
  let f = 1;
  if (nm < 420) f = 0.35 + 0.65 * (nm - 380) / 40;
  else if (nm > 700) f = 0.35 + 0.65 * (750 - nm) / 50;
  return [(r * f) ** 0.8, (g * f) ** 0.8, (b * f) ** 0.8];
}

export function rgbCss(c: [number, number, number], alpha = 1) {
  return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${alpha})`;
}

// --- Función de onda ---

function laguerre(k: number, alpha: number, x: number) {
  let l0 = 1;
  let l1 = 1 + alpha - x;
  if (k === 0) return l0;
  for (let i = 1; i < k; i++) {
    const l2 = ((2 * i + 1 + alpha - x) * l1 - (i + alpha) * l0) / (i + 1);
    l0 = l1;
    l1 = l2;
  }
  return l1;
}

/** Parte radial R_nl(r), sin normalizar (solo importan la forma y el signo). */
export function radial(n: number, l: number, r: number) {
  const rho = (2 * r) / n;
  return Math.exp(-rho / 2) * rho ** l * laguerre(n - l - 1, 2 * l + 1, rho);
}

function legendre(l: number, m: number, x: number) {
  let pmm = 1;
  if (m > 0) {
    const s = Math.sqrt(1 - x * x);
    let f = 1;
    for (let i = 1; i <= m; i++) {
      pmm *= -f * s;
      f += 2;
    }
  }
  if (l === m) return pmm;
  let pmm1 = x * (2 * m + 1) * pmm;
  if (l === m + 1) return pmm1;
  let pll = 0;
  for (let ll = m + 2; ll <= l; ll++) {
    pll = ((2 * ll - 1) * x * pmm1 - (ll + m - 1) * pmm) / (ll - m);
    pmm = pmm1;
    pmm1 = pll;
  }
  return pll;
}

/** Armónico esférico real (m > 0 con coseno, m < 0 con seno), sin normalizar. */
export function angular(l: number, m: number, cosT: number, phi: number) {
  const am = Math.abs(m);
  const p = legendre(l, am, cosT);
  if (m > 0) return p * Math.cos(am * phi);
  if (m < 0) return p * Math.sin(am * phi);
  return p;
}

export type Cloud = {
  orbital: Orbital;
  /** x, y, z, signo de ψ por punto (4 floats). */
  data: Float32Array;
  count: number;
  /** Radio que encierra el 97 % de la probabilidad, en a0. */
  r97: number;
};

/**
 * Muestrea `count` puntos según |ψ_nlm|²: el radio sale de la distribución radial r²R²
 * (tabulada e invertida) y los ángulos por rechazo contra |Y_lm|².
 * Los puntos quedan ordenados por sector angular para que la transformación entre dos
 * nubes se vea como un reacomodo y no como un enjambre al azar.
 */
export function sampleOrbital(orbital: Orbital, count: number, rng = Math.random): Cloud {
  const { n, l, m } = orbital;
  const rMax = 3 * n * n + 10 * n;
  const STEPS = 2048;
  const cdf = new Float64Array(STEPS + 1);
  for (let i = 1; i <= STEPS; i++) {
    const r = (rMax * i) / STEPS;
    const R = radial(n, l, r);
    cdf[i] = cdf[i - 1] + r * r * R * R;
  }
  for (let i = 1; i <= STEPS; i++) cdf[i] /= cdf[STEPS];
  const invR = (u: number) => {
    let lo = 0, hi = STEPS;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] <= u) lo = mid;
      else hi = mid;
    }
    const f = (u - cdf[lo]) / (cdf[hi] - cdf[lo] || 1);
    return (rMax * (lo + f)) / STEPS;
  };

  let yMax = 0;
  for (let i = 0; i <= 96; i++) {
    for (let j = 0; j < 96; j++) {
      const v = Math.abs(angular(l, m, -1 + (2 * i) / 96, (2 * Math.PI * j) / 96));
      if (v > yMax) yMax = v;
    }
  }
  const yMax2 = (yMax * 1.15) ** 2;

  const pts: { x: number; y: number; z: number; s: number; key: number }[] = new Array(count);
  for (let k = 0; k < count; k++) {
    const r = invR(rng());
    let ct = 0, phi = 0, y = 0;
    do {
      ct = 2 * rng() - 1;
      phi = 2 * Math.PI * rng();
      y = angular(l, m, ct, phi);
    } while (y * y < rng() * yMax2);
    const st = Math.sqrt(1 - ct * ct);
    const sign = Math.sign(y * radial(n, l, r)) || 1;
    const key = (Math.floor((phi / (2 * Math.PI)) * 32) * 16 + Math.floor((ct + 1) * 7.99)) * 1000 + Math.min(999, (r / rMax) * 1000);
    pts[k] = { x: r * st * Math.cos(phi), y: r * st * Math.sin(phi), z: r * ct, s: sign, key };
  }
  pts.sort((a, b) => a.key - b.key);

  const data = new Float32Array(count * 4);
  for (let k = 0; k < count; k++) {
    const p = pts[k];
    data[k * 4] = p.x;
    data[k * 4 + 1] = p.y;
    data[k * 4 + 2] = p.z;
    data[k * 4 + 3] = p.s;
  }
  return { orbital, data, count, r97: invR(0.97) };
}

// --- Saltos permitidos ---

function pickM(l: number, rng: () => number) {
  if (l === 0) return 0;
  const u = rng();
  if (u < 0.4) return 0;
  if (u < 0.75) return rng() < 0.5 ? l : -l;
  return Math.floor(rng() * (2 * l + 1)) - l;
}

const okL = (n: number, l: number) => l >= 0 && l <= n - 1;

/**
 * Serie de orbitales por los que pasa el electrón para llegar al nivel `n`.
 * Un fotón se lleva (o trae) una unidad de giro, así que l cambia en ±1 en cada salto.
 * Al subir es un solo salto. Al bajar, si el orbital de destino no admite l ± 1, hay que
 * pasar por niveles intermedios: una cascada de varios fotones.
 */
export function jumpPath(from: Orbital, n: number, rng = Math.random): Orbital[] {
  const path: Orbital[] = [];
  if (n === from.n) return path;
  if (n > from.n) {
    const up = from.l + 1;
    const down = from.l - 1;
    const l = okL(n, down) && rng() < 0.3 ? down : up;
    path.push({ n, l, m: pickM(l, rng) });
    return path;
  }
  let cur = from;
  while (cur.n > n) {
    const down = cur.l - 1;
    const up = cur.l + 1;
    const canDown = okL(n, down);
    const canUp = okL(n, up);
    let next: Orbital;
    if (canDown && (!canUp || rng() < 0.65)) next = { n, l: down, m: pickM(down, rng) };
    else if (canUp) next = { n, l: up, m: pickM(up, rng) };
    else if (down >= 1) next = { n: cur.l, l: down, m: pickM(down, rng) };
    else next = { n, l: 0, m: 0 };
    path.push(next);
    cur = next;
  }
  return path;
}
