# vps-lab

Laboratorio de experimentos visuales/matemáticos: celdas de Voronoi, fractales,
autómatas celulares y similares, pensados como experiencias interactivas/inmersivas
en el navegador (canvas / WebGL).

## Estado
- `/` — portada: lista de experimentos (array `experiments` en `index.astro`)
- `/voronoi` — Voronoi inmersivo a pantalla completa (canvas 2D + d3-delaunay):
  semillas en campo de flujo, el cursor es una celda-hueco, clic siembra, mantener
  hace remolino; paletas (C), estela (T), pantalla completa (F/doble clic).
  Sonido opcional (S / botón, apagado por defecto) en `src/scripts/voronoi-audio.ts`
  (Web Audio, pentatónica, nota al cambiar de celda). Panel "?" con la explicación
  matemática y toggle de triangulación de Delaunay (D).
  Baja la cantidad de semillas sola si el frame tarda >12 ms (`window.__voronoi`).
- `/mandelbrot` — WebGL2 en dos pasadas (`scripts/fractal-gl.ts`: iteraciones a textura
  float solo cuando cambia la vista, coloreo cada cuadro). Órbita del cursor + período
  (`scripts/orbit.ts`) dibujada y sonificada (`scripts/mandelbrot-audio.ts`), recuadro
  Julia (J/Enter), viajes a 6 lugares (V, arranca solo tras 25 s sin tocar).
  Límite de zoom ~×26.000 (float32). Diagnóstico: `__mandel.bench(span)` / `jump(span, i)`.
- `/bandadas` — boids 2.5D en canvas 2D (`scripts/flock.ts`, grilla espacial, tope de 16
  vecinos). Cursor = halcón, clic asusta, mantener atrae, halcón automático tras 8 s sin
  mover. Teclas 1/2/3 apagan reglas, E = mirar un pájaro (cámara lenta + fuerzas).
  "Orden" = alineación local promedio (azar ≈ 0). Parámetros ajustados midiendo grupos y
  distancia al vecino. Sonido en `scripts/flock-audio.ts`. Diagnóstico: `__bandada.advance(s)`.
- `/atomo` — hidrógeno: nube de puntos por orbital muestreada según |ψ|² (`scripts/hydrogen.ts`:
  radial por CDF invertida + ángulos por rechazo; puntos ordenados por sector para que el
  morph sea coherente) dibujada con WebGL2 (`scripts/orbital-gl.ts`, dos buffers y `uMix`).
  Escalera de niveles a escala real (botones DOM + rungs en overlay con líneas guía), espectro
  clicable (UV/IR log a los costados, visible lineal; `barU`/`barNm`) donde caen los fotones
  emitidos y de donde salen los absorbidos. Regla Δl = ±1 (`jumpPath`, cascadas).
  Modos: contemplar (se excita y decae solo), jugar (G: objetivo de nivel, tolerancia 3,5 %,
  pistas tras 2 fallos, vida 4,5–8,5 s), Bohr (B: órbitas r ∝ n² en overlay).
  Sonido `scripts/atom-audio.ts`: nota ∝ energía del fotón (129,4 Hz/eV). Diagnóstico:
  `__atomo.advance(s)`, `.go(n)`, `.fire(nm)`, `.lines()`.
- Plantilla común: `layouts/Experiment.astro` + `scripts/lab-ui.ts` (eventos `lab:sound`,
  `lab:info`, `lab:show-hud`, `lab:fullscreen`; teclas S ? H F Esc). Audio base: `scripts/lab-audio.ts`.
- Publicado en https://math.adamdub.xyz (nginx en `nginx/`, SSL con certbot).

## Stack
- Astro static site en `site/` (mismo patrón que vps-estilos); dependencias con bun
- Instalado: `d3-delaunay` (Voronoi), `d3-interpolate` (vuelos de cámara del Mandelbrot)
- Previstas: `three.js` (WebGL/3D)

## Domain
math.adamdub.xyz

## Deploy
```bash
./deploy.sh  # builds site/ y rsyncs al VPS
```
