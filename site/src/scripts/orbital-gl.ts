// Nube de puntos de un orbital en la GPU (WebGL2). Guarda dos nubes, la de salida y la de
// llegada, y las mezcla con un solo número (uMix): así el salto entre orbitales es una
// transformación continua de una nube en otra. Suma de luz (blending aditivo): donde hay
// más puntos, más brilla.

import type { Cloud } from './hydrogen';

const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aA;
layout(location = 1) in vec4 aB;
uniform mat3 uRot;
uniform vec2 uRes;
uniform float uScale;
uniform float uMix;
uniform float uTime;
uniform float uSize;
out float vSign;
out float vDepth;
void main() {
  float k = uMix;
  vec3 p = mix(aA.xyz, aB.xyz, k);
  // En pleno salto la nube tiembla: cada punto se corre un poco con su propia fase.
  float shake = sin(3.14159 * k);
  vec3 h = fract(aA.xyz * 0.7311 + aB.xyz * 0.2913) * 6.2831;
  p += shake * 0.08 * length(p) * vec3(sin(uTime * 9.0 + h.x), sin(uTime * 7.0 + h.y), sin(uTime * 8.0 + h.z));
  vec3 q = uRot * p * uScale;
  gl_Position = vec4(q.xy / (0.5 * uRes), 0.0, 1.0);
  vDepth = clamp(q.z / (0.5 * min(uRes.x, uRes.y)), -1.0, 1.0);
  gl_PointSize = uSize * (1.0 + 0.4 * vDepth);
  vSign = mix(aA.w, aB.w, k);
}`;

const FRAG = `#version 300 es
precision highp float;
in float vSign;
in float vDepth;
uniform vec3 uPos;
uniform vec3 uNeg;
uniform float uAlpha;
out vec4 o;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d);
  if (r2 > 0.25) discard;
  float soft = 1.0 - smoothstep(0.02, 0.25, r2);
  vec3 col = mix(uNeg, uPos, clamp(vSign * 0.5 + 0.5, 0.0, 1.0));
  float a = uAlpha * soft * (0.6 + 0.4 * vDepth);
  o = vec4(col * a, a);
}`;

export type DrawOptions = {
  rot: Float32Array;
  scale: number;
  mix: number;
  time: number;
  size: number;
  alpha: number;
  pos: [number, number, number];
  neg: [number, number, number];
};

export class OrbitalRenderer {
  readonly gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private u = new Map<string, WebGLUniformLocation | null>();
  private bufs: [WebGLBuffer, WebGLBuffer];
  private vaos: [WebGLVertexArrayObject, WebGLVertexArrayObject];
  /** Qué VAO está activo: en el 0, la nube A está en bufs[0]; en el 1, al revés. */
  private flip = 0;
  private count = 0;
  private bg: [number, number, number];

  constructor(canvas: HTMLCanvasElement, bg: [number, number, number]) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: true });
    if (!gl) throw new Error('WebGL2 no disponible');
    this.gl = gl;
    this.bg = bg;
    this.prog = this.program();
    this.bufs = [gl.createBuffer()!, gl.createBuffer()!];
    this.vaos = [gl.createVertexArray()!, gl.createVertexArray()!];
    for (let i = 0; i < 2; i++) {
      gl.bindVertexArray(this.vaos[i]);
      const a = this.bufs[i], b = this.bufs[1 - i];
      gl.bindBuffer(gl.ARRAY_BUFFER, a);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 16, 0);
    }
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
  }

  private program() {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
    for (const name of ['uRot', 'uRes', 'uScale', 'uMix', 'uTime', 'uSize', 'uPos', 'uNeg', 'uAlpha']) {
      this.u.set(name, gl.getUniformLocation(p, name));
    }
    return p;
  }

  /** Carga las dos nubes iniciales (A = la que se ve con mix 0, B = con mix 1). */
  setClouds(a: Cloud, b: Cloud) {
    const gl = this.gl;
    this.flip = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs[0]);
    gl.bufferData(gl.ARRAY_BUFFER, a.data, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs[1]);
    gl.bufferData(gl.ARRAY_BUFFER, b.data, gl.DYNAMIC_DRAW);
    this.count = Math.min(a.count, b.count);
  }

  /** La nube B pasa a ser A y la nueva ocupa el lugar de B: dibujar con mix 0 → 1. */
  setNext(cloud: Cloud) {
    const gl = this.gl;
    // El buffer que hoy hace de A queda libre: ahí va la nube nueva, que pasa a ser B.
    const freed = this.flip === 0 ? this.bufs[0] : this.bufs[1];
    gl.bindBuffer(gl.ARRAY_BUFFER, freed);
    gl.bufferData(gl.ARRAY_BUFFER, cloud.data, gl.DYNAMIC_DRAW);
    this.flip = 1 - this.flip;
    this.count = cloud.count;
  }

  clear() {
    const gl = this.gl;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(this.bg[0], this.bg[1], this.bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  draw(o: DrawOptions) {
    const gl = this.gl;
    this.clear();
    if (!this.count) return;
    gl.useProgram(this.prog);
    gl.uniformMatrix3fv(this.u.get('uRot')!, false, o.rot);
    gl.uniform2f(this.u.get('uRes')!, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(this.u.get('uScale')!, o.scale);
    gl.uniform1f(this.u.get('uMix')!, o.mix);
    gl.uniform1f(this.u.get('uTime')!, o.time);
    gl.uniform1f(this.u.get('uSize')!, o.size);
    gl.uniform1f(this.u.get('uAlpha')!, o.alpha);
    gl.uniform3fv(this.u.get('uPos')!, o.pos);
    gl.uniform3fv(this.u.get('uNeg')!, o.neg);
    gl.bindVertexArray(this.vaos[this.flip]);
    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.bindVertexArray(null);
  }
}

/** Matriz de rotación 3×3 (column-major) para yaw alrededor de Y y pitch alrededor de X. */
export function rotation(yaw: number, pitch: number) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  // R = Rx(pitch) · Ry(yaw)
  return new Float32Array([
    cy, sp * sy, -cp * sy,
    0, cp, sp,
    sy, -sp * cy, cp * cy,
  ]);
}
