// Órbita de un punto bajo z → z² + c: el camino que se dibuja bajo el cursor.
// Además de los primeros pasos, averigua cómo termina: escapa, cae en un ciclo
// (y de qué período) o sigue acotada sin repetirse.

export type Pt = [number, number];
export type Orbit = {
  /** Primeros pasos desde z0, para dibujar. */
  path: Pt[];
  /** Paso en que |z| supera 2 (a partir de ahí escapa seguro); -1 si no escapa. */
  escapedAt: number;
  /** Período del ciclo final; 0 si escapa o no se detecta ciclo corto. */
  period: number;
  /** El ciclo final (o una muestra si no hay ciclo corto), para sonificar. */
  cycle: Pt[];
};

const DRAW_STEPS = 120;
const SETTLE_STEPS = 2000;
const MAX_PERIOD = 24;

export function orbit(z0: Pt, c: Pt): Orbit {
  let [x, y] = z0;
  const [cx, cy] = c;
  const path: Pt[] = [[x, y]];

  for (let i = 1; i <= DRAW_STEPS; i++) {
    const xx = x * x - y * y + cx;
    y = 2 * x * y + cy;
    x = xx;
    path.push([x, y]);
    if (x * x + y * y > 4) return { path, escapedAt: i, period: 0, cycle: [] };
  }

  for (let i = 1; i <= SETTLE_STEPS; i++) {
    const xx = x * x - y * y + cx;
    y = 2 * x * y + cy;
    x = xx;
    if (x * x + y * y > 4) return { path, escapedAt: DRAW_STEPS + i, period: 0, cycle: [] };
  }

  const rx = x, ry = y;
  const cycle: Pt[] = [[x, y]];
  for (let p = 1; p <= MAX_PERIOD; p++) {
    const xx = x * x - y * y + cx;
    y = 2 * x * y + cy;
    x = xx;
    if (Math.hypot(x - rx, y - ry) < 1e-6) return { path, escapedAt: -1, period: p, cycle };
    cycle.push([x, y]);
  }
  return { path, escapedAt: -1, period: 0, cycle: cycle.slice(0, 16) };
}

export function describe(o: Orbit, julia: boolean): string {
  const set = julia ? 'Julia' : 'Mandelbrot';
  if (o.escapedAt >= 0) {
    const n = o.escapedAt;
    return `escapa en ${n} ${n === 1 ? 'paso' : 'pasos'} · afuera del ${set}`;
  }
  if (o.period === 1) return `se queda en un punto · adentro del ${set}`;
  if (o.period > 1) return `ciclo de ${o.period} · adentro del ${set}`;
  return `ni escapa ni se repite · en el borde del ${set}`;
}
