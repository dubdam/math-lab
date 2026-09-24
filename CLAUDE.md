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
- No publicado todavía: falta config nginx + DNS para math.adamdub.xyz.

## Stack
- Astro static site en `site/` (mismo patrón que vps-estilos); dependencias con bun
- Instalado: `d3-delaunay` — celdas de Voronoi / triangulación de Delaunay
- Previstas: `three.js` (WebGL/3D), `p5.js` (sketches 2D rápidos)

## Domain
math.adamdub.xyz

## Deploy
```bash
./deploy.sh  # builds site/ y rsyncs al VPS
```
