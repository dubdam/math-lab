# math-lab

Laboratorio de experimentos visuales y matemáticos para mirar y tocar.
Se publica en [math.adamdub.xyz](https://math.adamdub.xyz).

## Experimentos

| # | Experimento | Qué es |
|---|---|---|
| 01 | [Voronoi](site/src/pages/voronoi.astro) | Celdas a la deriva en un campo de flujo. El cursor es una celda más. Sonido opcional y explicación del concepto (`?`). |

## Desarrollo

```bash
cd site
bun install
bun run dev      # http://localhost:4321
bun run build    # genera site/dist/
```

Sitio estático con [Astro](https://astro.build). El Voronoi usa
[d3-delaunay](https://github.com/d3/d3-delaunay); el Mandelbrot se dibuja en la GPU con
WebGL2. El sonido es Web Audio.

Cada experimento usa la plantilla `site/src/layouts/Experiment.astro` (ayuda, botón de
sonido, panel `?`) y la base de sonido `site/src/scripts/lab-audio.ts`.
