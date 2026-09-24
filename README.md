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
[d3-delaunay](https://github.com/d3/d3-delaunay) y Web Audio para el sonido.
