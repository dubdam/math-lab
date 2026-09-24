// Dibujo de Mandelbrot/Julia en la GPU (WebGL2).
// Dos pasadas: la cara (iterar z → z² + c) se guarda en una textura y solo se rehace
// cuando cambia la vista; la barata (colorear) corre cada cuadro para animar los colores.
// Sin texturas float (GPUs viejas) se usa una sola pasada combinada.

export type View = { cx: number; cy: number; span: number };
export type FractalParams = View & { julia: boolean; c: [number, number]; maxIter: number };
export type Palette = { name: string; a: number[]; b: number[]; c: number[]; d: number[] };

const VERT = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const COMMON = `#version 300 es
precision highp float;
uniform vec2 uCenter;
uniform float uSpan;
uniform int uMaxIter;
uniform int uJulia;
uniform vec2 uC;
uniform vec4 uRect;
uniform vec3 uPa, uPb, uPc, uPd;
uniform float uTime;

// Devuelve (iteración suavizada, escapó 0/1, |z| final si no escapó).
vec3 fractal(vec2 frag) {
  vec2 p = (frag - uRect.xy - 0.5 * uRect.zw) / uRect.w;
  vec2 pt = uCenter + p * uSpan;
  vec2 z = uJulia == 1 ? pt : vec2(0.0);
  vec2 c = uJulia == 1 ? uC : pt;
  if (uJulia == 0) {
    // Atajo: el cardioide principal y el bulbo de período 2 son interiores seguros.
    float x = c.x - 0.25;
    float q = x * x + c.y * c.y;
    if (q * (q + x) < 0.25 * c.y * c.y) return vec3(0.0, 0.0, 0.5);
    float x1 = c.x + 1.0;
    if (x1 * x1 + c.y * c.y < 0.0625) return vec3(0.0, 0.0, 0.5);
  }
  float r2 = 0.0;
  for (int i = 0; i < uMaxIter; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    r2 = dot(z, z);
    if (r2 > 256.0) {
      float nu = float(i) + 1.0 - log2(0.5 * log(r2));
      return vec3(nu, 1.0, 0.0);
    }
  }
  return vec3(0.0, 0.0, sqrt(r2));
}

vec3 pal(float t) { return uPa + uPb * cos(6.28318 * (uPc * t + uPd)); }

vec3 colorize(vec3 f) {
  if (f.y < 0.5) return pal(f.z * 0.35 + uTime * 0.02) * 0.07;
  // Lejos del conjunto (pocas iteraciones) se apaga: solo brilla cerca del borde.
  float glow = 1.0 - exp(-f.x * 0.06);
  return pal(pow(f.x, 0.6) * 0.09 - uTime * 0.025) * glow;
}
`;

const ITER_FRAG = COMMON + `
out vec4 o;
void main() { o = vec4(fractal(gl_FragCoord.xy), 1.0); }`;

const COMBINED_FRAG = COMMON + `
out vec4 o;
void main() { o = vec4(colorize(fractal(gl_FragCoord.xy)), 1.0); }`;

const COLOR_FRAG = COMMON + `
uniform sampler2D uTex;
uniform vec2 uTexScale;
uniform vec2 uRes;
out vec4 o;
void main() {
  ivec2 size = textureSize(uTex, 0);
  ivec2 ij = min(ivec2(gl_FragCoord.xy * uTexScale), size - 1);
  vec3 col = colorize(texelFetch(uTex, ij, 0).xyz);
  vec2 v = gl_FragCoord.xy / uRes - 0.5;
  col *= 1.0 - 0.9 * dot(v, v);
  o = vec4(col, 1.0);
}`;

type Program = { p: WebGLProgram; u: (name: string) => WebGLUniformLocation | null };

export class FractalRenderer {
  readonly gl: WebGL2RenderingContext;
  /** false si la GPU no puede guardar floats en texturas: todo en una pasada. */
  readonly twoPass: boolean;
  private iter?: Program;
  private color?: Program;
  private combined: Program;
  private fbo: WebGLFramebuffer | null = null;
  private tex: WebGLTexture | null = null;
  private texW = 0;
  private texH = 0;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) throw new Error('WebGL2 no disponible');
    this.gl = gl;
    this.twoPass = !!gl.getExtension('EXT_color_buffer_float');

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.combined = this.program(COMBINED_FRAG);
    if (this.twoPass) {
      this.iter = this.program(ITER_FRAG);
      this.color = this.program(COLOR_FRAG);
    }
  }

  private program(fragSrc: string): Program {
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
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.bindAttribLocation(p, 0, 'a');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
    const cache = new Map<string, WebGLUniformLocation | null>();
    const u = (name: string) => {
      if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name));
      return cache.get(name)!;
    };
    return { p, u };
  }

  private setFractal(prog: Program, f: FractalParams, rect: number[]) {
    const gl = this.gl;
    gl.uniform2f(prog.u('uCenter'), f.cx, f.cy);
    gl.uniform1f(prog.u('uSpan'), f.span);
    gl.uniform1i(prog.u('uMaxIter'), f.maxIter);
    gl.uniform1i(prog.u('uJulia'), f.julia ? 1 : 0);
    gl.uniform2f(prog.u('uC'), f.c[0], f.c[1]);
    gl.uniform4f(prog.u('uRect'), rect[0], rect[1], rect[2], rect[3]);
  }

  private setPalette(prog: Program, pal: Palette, time: number) {
    const gl = this.gl;
    gl.uniform3fv(prog.u('uPa'), pal.a);
    gl.uniform3fv(prog.u('uPb'), pal.b);
    gl.uniform3fv(prog.u('uPc'), pal.c);
    gl.uniform3fv(prog.u('uPd'), pal.d);
    gl.uniform1f(prog.u('uTime'), time);
  }

  /** Pasada cara: itera a resolución w×h y guarda el resultado en la textura. */
  computeIterations(f: FractalParams, w: number, h: number) {
    const gl = this.gl;
    if (!this.iter) return;
    if (w !== this.texW || h !== this.texH) {
      if (this.tex) gl.deleteTexture(this.tex);
      this.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      this.fbo ??= gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
      this.texW = w;
      this.texH = h;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.SCISSOR_TEST);
    gl.useProgram(this.iter.p);
    this.setFractal(this.iter, f, [0, 0, w, h]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Pasada barata: colorea la textura en pantalla completa. */
  drawColors(pal: Palette, time: number) {
    const gl = this.gl;
    if (!this.color || !this.tex) return;
    const cw = gl.drawingBufferWidth, ch = gl.drawingBufferHeight;
    gl.viewport(0, 0, cw, ch);
    gl.disable(gl.SCISSOR_TEST);
    gl.useProgram(this.color.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.color.u('uTex'), 0);
    gl.uniform2f(this.color.u('uTexScale'), this.texW / cw, this.texH / ch);
    gl.uniform2f(this.color.u('uRes'), cw, ch);
    this.setPalette(this.color, pal, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Una sola pasada en un rectángulo de la pantalla (x, y desde abajo, en px del buffer). */
  drawCombined(f: FractalParams, pal: Palette, time: number, rect: number[]) {
    const gl = this.gl;
    gl.viewport(rect[0], rect[1], rect[2], rect[3]);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(rect[0], rect[1], rect[2], rect[3]);
    gl.useProgram(this.combined.p);
    this.setFractal(this.combined, f, rect);
    this.setPalette(this.combined, pal, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
  }
}
