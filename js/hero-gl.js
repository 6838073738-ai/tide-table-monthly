// Today's armillary, both apps: hand-written WebGL2, decoration only. Contract and reasons: hero-api.md (3, 5, 11).

const TAU = 2 * Math.PI, DEG = Math.PI / 180;

export const GL_OPTIONS = Object.freeze({ alpha: true, premultipliedAlpha: true, antialias: false, depth: true,
  stencil: false, preserveDrawingBuffer: false, powerPreference: "low-power", failIfMajorPerformanceCaveat: true });

export const PALETTE = Object.freeze({ ground: "#0C0F25", mist: "#1A2250", haze: "#2E3A78", ice: "#A9BCF0",
  iceRim: "#EEF3FF", gilt: "#C9A54A", giltLight: "#F1DA93", stoneLight: "#F5D88A", stoneHeart: "#FFF6DC",
  motes: "#CAD6F5", dispersion: Object.freeze(["#9DB6E6", "#D4C6EA", "#EAC9AE"]) });

export const SCENE = Object.freeze({ fov: 26, elevation: 16, fit: 0.8, meridian: 24, tilt: 23.44, turn: 240,
  breath: 9, breathDepth: 0.06, segments: 96, sides: 6, tube: 0.016, inner: 0.955, beads: 7, bead: 0.065,
  stone: 0.2, stretch: 1.15, motes: 32, rise: 4, moteAlpha: 0.35, drift: 1, edge: 0.08, dprCap: 1.5, minBuffer: 198 });

const SPAN = 2.4, MIST_K = 2.2, KEY = unit([-0.6, 0.62, 0.5]);

function unit(p) { const l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; }
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const along = (a, b, c, s) => [c * a[0] + s * b[0], c * a[1] + s * b[1], c * a[2] + s * b[2]];

export function camera() {
  const f = 1 / Math.tan((SCENE.fov / 2) * DEG), d = f / SCENE.fit;
  const c = Math.cos(SCENE.elevation * DEG), s = Math.sin(SCENE.elevation * DEG);
  const near = d - 1.6, far = d + 1.6, A = (far + near) / (near - far), B = (2 * far * near) / (near - far);
  return { vp: [f, 0, 0, 0, 0, f * c, A * s, -s, 0, -f * s, A * c, -c, 0, 0, B - A * d, d], focal: f, distance: d,
    eye: [0, d * s, d * c], up: [0, c, -s] };
}
const CAM = camera();

function ringBases() {
  const m = SCENE.meridian * DEG, e = SCENE.tilt * DEG;
  return [[[Math.cos(m), 0, -Math.sin(m)], [0, 1, 0], 1],
    [[1, 0, 0], [0, 0, -1], SCENE.inner],
    [[1, 0, 0], [0, Math.sin(e), -Math.cos(e)], SCENE.inner]];
}

function icosphere() {
  const g = (1 + Math.sqrt(5)) / 2, p = [], t = [];
  for (const [x, y] of [[-1, g], [1, g], [-1, -g], [1, -g]]) p.push([x, y, 0], [0, x, y], [y, 0, x]);
  const edge = (i, j) => (p[i][0] - p[j][0]) ** 2 + (p[i][1] - p[j][1]) ** 2 + (p[i][2] - p[j][2]) ** 2 < 4.01;
  for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) if (edge(a, b)) {
    for (let c = b + 1; c < 12; c++) if (edge(a, c) && edge(b, c)) t.push([a, b, c]);
  }
  const v = p.map(unit), half = new Map(), f = [];
  const mid = (a, b) => {
    const k = Math.min(a, b) * 64 + Math.max(a, b);
    if (!half.has(k)) { half.set(k, v.length); v.push(unit(along(v[a], v[b], 1, 1))); }
    return half.get(k);
  };
  for (const [a, b, c] of t) {
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    f.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
  }
  for (const q of f) if (dot(cross(sub(v[q[1]], v[q[0]]), sub(v[q[2]], v[q[0]])), v[q[0]]) < 0) q.reverse();
  return { v, f };
}

export function ringBuffers(into, only) {
  const S = SCENE, n = S.segments, k = S.sides, per = n * k, r = S.tube, cw = [], sw = [];
  const out = into || { rings: new Float32Array(3 * per * 10), index: new Uint16Array(3 * per * 6) }, { rings, index } = out;
  for (let j = 0; j < k; j++) { cw.push(Math.cos((j / k) * TAU)); sw.push(Math.sin((j / k) * TAU)); }
  ringBases().forEach(([[a0, a1, a2], [b0, b1, b2], radius], id) => {
    if (only !== undefined && id !== only) return;
    const n0 = a1 * b2 - a2 * b1, n1 = a2 * b0 - a0 * b2, n2 = a0 * b1 - a1 * b0, q = id * per;
    let o = q * 10, x = q * 6;
    for (let i = 0; i < n; i++) {
      const cu = Math.cos((i / n) * TAU), su = Math.sin((i / n) * TAU), i1 = q + ((i + 1) % n) * k;
      const o0 = cu * a0 + su * b0, o1 = cu * a1 + su * b1, o2 = cu * a2 + su * b2;
      for (let j = 0; j < k; j++) {
        const m0 = cw[j] * o0 + sw[j] * n0, m1 = cw[j] * o1 + sw[j] * n1, m2 = cw[j] * o2 + sw[j] * n2;
        const at = q + i * k + j, j1 = (j + 1) % k;
        rings[o] = radius * o0 + r * m0; rings[o + 1] = radius * o1 + r * m1; rings[o + 2] = radius * o2 + r * m2;
        rings[o + 3] = m0; rings[o + 4] = m1; rings[o + 5] = m2;
        rings[o + 6] = cu * b0 - su * a0; rings[o + 7] = cu * b1 - su * a1; rings[o + 8] = cu * b2 - su * a2;
        rings[o + 9] = id;
        index[x] = at; index[x + 1] = i1 + j; index[x + 2] = i1 + j1;
        index[x + 3] = at; index[x + 4] = i1 + j1; index[x + 5] = q + i * k + j1;
        o += 10;
        x += 6;
      }
    }
  });
  return out;
}

export function glassBuffers() {
  const S = SCENE, { v, f } = icosphere(), glass = new Float32Array(f.length * 18);
  f.forEach((q, i) => {
    const n = unit(cross(sub(v[q[1]], v[q[0]]), sub(v[q[2]], v[q[0]])));
    q.forEach((a, c) => glass.set([...v[a], ...n], (i * 3 + c) * 6));
  });
  const inst = new Float32Array(4 * (S.beads + 1)), [ea, eb, er] = ringBases()[2];
  inst.set([0, 0, 0, S.stone]);
  for (let i = 0; i < S.beads; i++) {
    const u = (i / S.beads - 0.25) * TAU, c = along(ea, eb, Math.cos(u), Math.sin(u));
    inst.set([er * c[0], er * c[1], er * c[2], S.bead], (i + 1) * 4);
  }
  const motes = new Float32Array(S.motes * 4);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < S.motes; i++) {
    const a = rnd() * TAU, r = 0.2 + Math.sqrt(rnd());
    motes.set([r * Math.cos(a), rnd() * SPAN, r * Math.sin(a), 1.4 + rnd()], i * 4);
  }
  return { glass, inst, motes };
}

function outline() {
  const S = SCENE, m = CAM.vp, { v, f } = icosphere(), at = [], out = [], sx = S.stone, sy = sx * S.stretch;
  const p = v.map((a) => {
    const x = a[0] * sx, y = a[1] * sy, z = a[2] * sx, w = m[3] * x + m[7] * y + m[11] * z + m[15];
    return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w];
  });
  const front = f.map((q) => {
    const a = p[q[0]], b = p[q[1]], c = p[q[2]];
    return (b[0] - a[0]) * (c[1] - a[1]) > (b[1] - a[1]) * (c[0] - a[0]);
  });
  for (let i = 0; i < f.length; i++) for (let c = 0; c < 3; c++) at[f[i][c] * 64 + f[i][(c + 1) % 3]] = i;
  for (let i = 0; i < f.length; i++) for (let c = 0; c < 3; c++) {
    const a = f[i][c], b = f[i][(c + 1) % 3];
    if (!front[i] || front[at[b * 64 + a]]) continue;
    const A = p[a], B = p[b], l = Math.hypot(B[0] - A[0], B[1] - A[1]);
    out.push([(A[1] - B[1]) / l, (B[0] - A[0]) / l, (A[0] * B[1] - A[1] * B[0]) / l]);
  }
  return out;
}

// the shaders
function head(o) {
  const P = PALETTE, num = (x) => x.toFixed(6), vec = (a) => `vec3(${a.map(num).join(",")})`;
  const lin = (h) => [1, 3, 5].map((i) => (parseInt(h.slice(i, i + 2), 16) / 255) ** 2.2);
  const v3 = (name, a) => `const vec3 ${name} = ${vec(a)};\n`;
  return "#version 300 es\nprecision highp float;\nprecision highp int;\n" + `const mat4 VP = mat4(${CAM.vp.map(num).join(",")});\n` +
    `const vec3 OUTL[${o.length}] = vec3[](${o.map(vec).join(",")});\n` +
    `const float FOCAL = ${num(CAM.focal)}, TUBE = ${num(SCENE.tube)}, STRETCH = ${num(SCENE.stretch)}, ` +
    `SPAN = ${num(SPAN)}, MOTE_A = ${num(SCENE.moteAlpha)}, EDGE = ${num(1 - SCENE.edge)};\n` +
    v3("EYE", CAM.eye) + v3("CAM_U", CAM.up) + v3("KEY", KEY) +
    v3("MIST", lin(P.mist)) + v3("HAZE", lin(P.haze)) + v3("ICE", lin(P.ice)) + v3("RIM", lin(P.iceRim)) +
    v3("GILT", lin(P.gilt)) + v3("GILT_L", lin(P.giltLight)) + v3("STONE_L", lin(P.stoneLight)) +
    v3("STONE_H", lin(P.stoneHeart)) + v3("MOTE", lin(P.motes)) + P.dispersion.map((h, i) => v3(`DISP${i}`, lin(h))).join("");
}

const FRAG = `
uniform vec4 uT, uPx;
out vec4 outColor;
float hash(vec2 p) {
  uvec2 q = uvec2(p);
  uint h = q.x * 0x8DA6B343u ^ q.y * 0xD8163841u;
  h = (h ^ (h >> 15)) * 0x2C1B3C6Du;
  return float(h ^ (h >> 12)) / 4294967296.0;
}
float noise(vec2 p) {
  vec2 i = floor(p), f = p - i, u = f * f * (3.0 - 2.0 * f);
  i = mod(i, 256.0);
  vec2 j = mod(i + 1.0, 256.0);
  return mix(mix(hash(i), hash(vec2(j.x, i.y)), u.x), mix(hash(vec2(i.x, j.y)), hash(j), u.x), u.y);
}
vec3 mistAt(vec2 px, float k) {
  vec2 p = px / uPx.x * 2.0 - 1.0, q = p * ${MIST_K.toFixed(1)} + uT.z * vec2(0.8, 0.6);
  float r = length(p), n = 0.5 * noise(q) + 0.3 * noise(q * 2.0 + 17.0) + 0.2 * noise(q * 4.0 + 41.0);
  vec3 c = mix(MIST, HAZE, 0.6 - 0.6 * smoothstep(-0.8, -0.25, p.y)) * (0.8 + 0.4 * n);
  c += STONE_L * (uT.y * k) * (0.13 * exp(-11.0 * r * r) + 0.02 * exp(-3.0 * r * r));
  return mix(c, MIST, smoothstep(0.7, 0.99, r));
}
vec4 finish(vec3 c, float a, float vig) {
  float r = length(gl_FragCoord.xy / uPx.x * 2.0 - 1.0);
  c = pow(max(c * (1.0 - vig * smoothstep(0.3, 1.0, r)), 0.0), vec3(0.4545)) + (hash(gl_FragCoord.xy) - 0.5) * 0.03;
  a *= 1.0 - smoothstep(EDGE, 1.0, r);
  return vec4(clamp(c, 0.0, 1.0) * a, a);
}
`;
const TURN = "uniform vec4 uT, uPx;\nmat3 turn(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }\n";

const MIST_VS = `
void main() { gl_Position = vec4(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0, 1.0, 1.0); }`;
const MIST_FS = `
void main() { outColor = finish(mistAt(gl_FragCoord.xy, 1.0), 1.0, 0.0); }`;

const GLASS_VS = `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=3) in vec4 aInst;
out vec3 vW, vN, vS, vB;
flat out vec4 vC;
${TURN}void main() {
  bool stone = gl_InstanceID == 0;
  mat3 R = turn(stone ? 0.0 : uT.x);
  vec3 k = stone ? vec3(1.0, STRETCH, 1.0) : vec3(1.0), c = R * aInst.xyz;
  vec4 cc = VP * vec4(c, 1.0);
  float pw = 0.5 * uPx.x * FOCAL / cc.w;
  vS = R * normalize(aPos / k);
  vN = R * normalize(aNrm / k);
  vW = c + R * (aPos * k) * aInst.w + vS * (0.8 / pw);
  int v = gl_VertexID % 3;
  vB = vec3(v == 0, v == 1, v == 2);
  vC = vec4((cc.xy / cc.w * 0.5 + 0.5) * uPx.x, aInst.w * pw, stone);
  gl_Position = VP * vec4(vW, 1.0);
}`;
const GLASS_FS = `
in vec3 vW, vN, vS, vB;
flat in vec4 vC;
void main() {
  bool stone = vC.w > 0.5;
  vec2 q = gl_FragCoord.xy / uPx.x * 2.0 - 1.0;
  float o = 9.0;
  if (stone) for (int i = 0; i < OUTL.length(); i++) o = min(o, dot(OUTL[i].xy, q) + OUTL[i].z);
  vec3 b = vB / max(fwidth(vB), 1e-5);
  float cov = clamp(stone ? o * 0.5 * uPx.x + 0.5 : vC.z + 0.5 - length(gl_FragCoord.xy - vC.xy), 0.0, 1.0);
  if (cov < 0.004) discard;
  gl_FragDepth = stone && cov < 0.5 ? 1.0 : gl_FragCoord.z;
  vec3 V = normalize(EYE - vW), F = normalize(vN), S = normalize(vS), N = stone ? F : normalize(S + 0.6 * F);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  vec2 nv = vec2(N.x, dot(N, CAM_U)), fv = vec2(F.x, dot(F, CAM_U));
  float h = fract(atan(fv.y, fv.x) * 0.4775 + 0.5), w = 0.2 * smoothstep(0.15, 0.85, 1.0 - dot(F, V));
  vec3 m = mistAt(gl_FragCoord.xy - nv * vC.z * 1.6, stone ? 1.0 : 0.0), d = h < 0.3333 ? DISP0 : h < 0.6667 ? DISP1 : DISP2, g = vec3(0.4545);
  vec3 c = stone ? mix(mix(m, ICE, 0.18), d, w) : pow(mix(mix(pow(m, g), pow(ICE, g), 0.18), pow(d, g), w), vec3(2.2));
  if (stone) {
    float heart = 1.0 - smoothstep(0.0, 0.95, length((gl_FragCoord.xy - vC.xy) / (vC.z * vec2(1.0, 1.12))));
    vec3 glow = mix(STONE_L * 0.85, STONE_H, pow(heart, 4.0)) * ((0.66 + 0.55 * max(dot(F, KEY), 0.0)) * uT.y);
    c = mix(c, glow, 0.25 + 0.7 * smoothstep(0.05, 0.6, ndv)) + RIM * (0.1 * (1.0 - smoothstep(0.0, 1.2, min(b.x, min(b.y, b.z)))));
    N = S;
  }
  if (!stone) c = mix(c, STONE_L * uT.y, 0.62 * (1.0 - smoothstep(0.75, 1.0, length(q / vec2(0.16, 0.18)))));
  c += RIM * ((stone ? 0.6 : 1.0) * pow(max(dot(N, normalize(KEY + V)), 0.0), 70.0) + 0.55 * pow(1.0 - ndv, stone ? 3.0 : 5.0));
  outColor = finish(c, cov, 0.15);
}`;

const RING_VS = `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 aTan;
out vec3 vW, vN, vT, vA;
${TURN}void main() {
  mat3 R = turn(aTan.w > 0.5 ? uT.x : 0.0);
  vN = R * aNrm;
  vT = R * aTan.xyz;
  vec3 p = R * aPos;
  vec4 cc = VP * vec4(p - vN * TUBE, 1.0);
  float pw = 0.5 * uPx.x * FOCAL / cc.w;
  vA = vec3((cc.xy / cc.w * 0.5 + 0.5) * uPx.x, TUBE * pw);
  vW = p + vN * ((0.8 - 0.8 * smoothstep(0.6, 0.95, abs(dot(vT, normalize(EYE - p))))) / pw);
  gl_Position = VP * vec4(vW, 1.0);
}`;
const RING_FS = `
in vec3 vW, vN, vT, vA;
void main() {
  vec3 N = normalize(vN), V = normalize(EYE - vW);
  float d = length(gl_FragCoord.xy - vA.xy), cov = clamp(vA.z + 0.5 - d * (1.0 - smoothstep(0.6, 0.95, abs(dot(normalize(vT), V)))), 0.0, 1.0);
  if (cov < 0.004) discard;
  float key = max(dot(N, KEY), 0.0), th = dot(normalize(vT), normalize(KEY + V));
  float stripe = pow(max(1.0 - th * th, 0.0), 24.0);
  vec3 c = GILT * (0.12 + 0.6 * key + STONE_L * (0.95 * uT.y) * max(dot(N, -normalize(vW)), 0.0)) + GILT_L * (0.75 * stripe);
  float inlay = (1.0 - smoothstep(0.5 * uPx.y - 0.5, 0.5 * uPx.y + 0.5, d)) * smoothstep(0.5, 1.5, vA.z / uPx.y);
  c = mix(c, ICE * (0.5 + 0.5 * key) + RIM * (0.3 * stripe), 0.5 * inlay);
  outColor = finish(c, cov, 0.18);
}`;

const MOTE_VS = `
layout(location=0) in vec4 aM;
out float vA;
${TURN}void main() {
  float y = mod(aM.y + uT.w, SPAN);
  vA = MOTE_A * (0.35 + 0.65 * smoothstep(1.4, 2.4, aM.w)) * sin(3.14159 * y / SPAN);
  gl_Position = VP * vec4(aM.x, y - 0.5 * SPAN, aM.z, 1.0);
  gl_PointSize = aM.w * uPx.y;
}`;
const MOTE_FS = `
in float vA;
void main() { outColor = finish(MOTE, vA * (1.0 - smoothstep(0.35, 1.0, length(gl_PointCoord * 2.0 - 1.0))), 0.0); }`;

// the scene
export function createScene(gl, { cssPx, dpr } = {}) {
  const S = SCENE, T = new Float32Array(4), made = { vao: [], buf: [], prog: [], shader: [] };
  let G = null, ext = null, pending = [], draws = [], ready = false, dirty = true, last = 0, size = 1, ratio = 1, outl = null;
  let driftRate = 0, riseRate = 0;
  const shader = (p, type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    gl.attachShader(p, sh);
    made.shader.push(sh);
    return sh;
  };
  const check = ([name, p, vs, fs]) => {
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`hero-gl: the ${name} program did not link: ${gl.getProgramInfoLog(p) || ""} ` +
        `${gl.getShaderInfoLog(vs) || ""} ${gl.getShaderInfoLog(fs) || ""}`.trim());
    }
  };
  const vao = (layout, index) => {
    const v = gl.createVertexArray();
    gl.bindVertexArray(v);
    made.vao.push(v);
    for (const [data, attrs] of layout) {
      const b = gl.createBuffer();
      made.buf.push(b);
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      for (const [loc, n, stride, off, each] of attrs) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, n, gl.FLOAT, false, stride * 4, off * 4);
        if (each) gl.vertexAttribDivisor(loc, 1);
      }
    }
    if (index) {
      const b = gl.createBuffer();
      made.buf.push(b);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
    }
    gl.bindVertexArray(null);
    return v;
  };

  function resize(cssSize, devicePixelRatio) {
    const css = Math.max(1, Number(cssSize) || 1), was = size, dpr = Math.max(Number(devicePixelRatio) || 1, 0.5);
    ratio = Math.min(dpr, S.dprCap);
    if (css * ratio < S.minBuffer) ratio = Math.min(dpr, S.minBuffer / css);
    size = Math.max(1, Math.round(css * ratio));
    if (gl.canvas && (gl.canvas.width !== size || gl.canvas.height !== size)) gl.canvas.width = gl.canvas.height = size;
    driftRate = (S.drift * MIST_K) / (css / 2);
    riseRate = (S.rise * CAM.distance) / ((css / 2) * CAM.focal);
    dirty = true;
    return size !== was;
  }

  function draw(seconds) {
    if (!ready) return false;
    const t = (last = Math.max(0, Number(seconds) || 0));
    T[0] = ((t % S.turn) / S.turn) * TAU;
    T[1] = 1 + S.breathDepth * Math.sin(((t % S.breath) / S.breath) * TAU);
    T[2] = (t * driftRate) % 1280;
    T[3] = (t * riseRate) % SPAN;
    if (dirty) gl.viewport(0, 0, size, size);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    for (const d of draws) {
      gl.useProgram(d.p);
      if (dirty) gl.uniform4f(d.px, size, ratio, 0, 0);
      gl.uniform4fv(d.t, T);
      if (d.vao) gl.bindVertexArray(d.vao);
      d.go();
    }
    dirty = false;
    return true;
  }

  const steps = Object.freeze([
    { name: "state", run() {
      ext = gl.getExtension("KHR_parallel_shader_compile");
      gl.clearColor(0, 0, 0, 0);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      outl = outline();
      return true;
    } },
    { name: "compile", run() {
      const top = head(outl);
      for (const [name, vs, fs] of [["mist", MIST_VS, MIST_FS], ["glass", GLASS_VS, GLASS_FS],
        ["rings", RING_VS, RING_FS], ["motes", MOTE_VS, MOTE_FS]]) {
        const p = gl.createProgram(), a = shader(p, gl.VERTEX_SHADER, top + vs), b = shader(p, gl.FRAGMENT_SHADER, top + FRAG + fs);
        gl.linkProgram(p);
        made.prog.push(p);
        pending.push([name, p, a, b]);
      }
      return true;
    } },
    ...["meridian", "equator", "ecliptic"].map((name, id) => ({ name, run() { G = ringBuffers(G, id); return true; } })),
    { name: "glass", run() { Object.assign(G, glassBuffers()); return true; } },
    { name: "link", run() {
      if (ext) {
        if (pending.some(([, p]) => !gl.getProgramParameter(p, ext.COMPLETION_STATUS_KHR))) return false;
        pending.forEach(check);
        pending = [];
      } else if (pending.length) check(pending.shift());
      return pending.length === 0;
    } },
    { name: "buffers", run() {
      const [mist, glass, rings, motes] = made.prog, n = G.index.length, verts = G.glass.length / 6;
      const U = (p, v, go) => ({ p, vao: v, go, t: gl.getUniformLocation(p, "uT"), px: gl.getUniformLocation(p, "uPx") });
      draws = [
        U(mist, null, () => gl.drawArrays(gl.TRIANGLES, 0, 3)),
        U(glass, vao([[G.glass, [[0, 3, 6, 0], [1, 3, 6, 3]]], [G.inst, [[3, 4, 4, 0, 1]]]]),
          () => gl.drawArraysInstanced(gl.TRIANGLES, 0, verts, S.beads + 1)),
        U(rings, vao([[G.rings, [[0, 3, 10, 0], [1, 3, 10, 3], [2, 4, 10, 6]]]], G.index),
          () => { gl.depthMask(false); gl.drawElements(gl.TRIANGLES, n, gl.UNSIGNED_SHORT, 0); gl.depthMask(true); }),
        U(motes, vao([[G.motes, [[0, 4, 4, 0]]]]), () => gl.drawArrays(gl.POINTS, 0, S.motes)),
      ];
      for (const s of made.shader) gl.deleteShader(s);
      made.shader = [];
      G = null;
      ready = dirty = true;
      return true;
    } },
    { name: "frame", run() { return draw(0); } },
  ]);

  if (cssPx) resize(cssPx, dpr);
  return {
    steps,
    get pollMs() { return ext ? 16 : 0; },
    get ready() { return ready; },
    info: Object.freeze({ drawCalls: 4, programs: 4, triangles: 6 * S.segments * S.sides + 80 * (S.beads + 1) + 1 }),
    draw,
    resize,
    setTheme() { return false; },
    litPixels() { return draw(last) ? litPixels(gl) : 0; },
    dispose() {
      ready = false;
      draws = [];
      for (const v of made.vao) gl.deleteVertexArray(v);
      for (const b of made.buf) gl.deleteBuffer(b);
      for (const p of made.prog) gl.deleteProgram(p);
      for (const s of made.shader) gl.deleteShader(s);
      for (const k in made) made[k] = [];
      pending = [];
    },
  };
}

export function litPixels(gl) {
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let lit = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] > 0) lit++;
  return lit;
}
