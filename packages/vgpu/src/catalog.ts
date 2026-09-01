const PARAMS = `
struct Params {
  time: f32,
  energy: f32,
  bass: f32,
  mid: f32,
  high: f32,
  width: f32,
  height: f32,
}
@group(0) @binding(0) var<uniform> params: Params;
`;

/** Built-in fragment snippets. Keys are lowercase catalog ids. */
export const SHADER_CATALOG: Record<string, string> = {
  plasma: `${PARAMS}
@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let t = params.time;
  let e = params.energy;
  let n = sin(uv.x * 8.0 + t) + sin(uv.y * 6.0 - t * 0.7) + sin((uv.x + uv.y) * 4.0 + t * 1.3);
  let v = 0.5 + 0.5 * sin(n + e);
  return vec4f(v, 0.35 + 0.45 * sin(n + 2.1), 0.75 + 0.2 * e, 1.0);
}
`,
  metaballs: `${PARAMS}
@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let t = params.time;
  let a = vec2f(0.35 + 0.2 * sin(t), 0.45 + 0.15 * cos(t * 0.8));
  let b = vec2f(0.65 + 0.18 * cos(t * 1.1), 0.55 + 0.2 * sin(t * 0.9));
  let c = vec2f(0.5 + 0.22 * sin(t * 0.6), 0.35 + 0.18 * cos(t * 1.4));
  let field = 0.12 / max(dot(uv - a, uv - a), 0.001)
    + 0.10 / max(dot(uv - b, uv - b), 0.001)
    + 0.08 / max(dot(uv - c, uv - c), 0.001);
  let m = smoothstep(0.85, 1.15, field + params.energy * 0.25);
  return vec4f(m * 0.2, m * 0.75, m * 0.95, 1.0);
}
`,
  fire: `${PARAMS}
@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let t = params.time;
  let flicker = sin(uv.x * 18.0 + t * 6.0) * sin(uv.y * 11.0 - t * 4.0);
  let rise = 1.0 - uv.y;
  let heat = rise * rise * (0.7 + 0.3 * flicker + params.energy * 0.4);
  let col = vec3f(heat, heat * 0.45, heat * 0.08);
  return vec4f(col, 1.0);
}
`,
  voronoi: `${PARAMS}
@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let t = params.time * 0.15;
  var cell = floor(uv * 6.0);
  var local = fract(uv * 6.0);
  var md = 8.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let neighbor = vec2f(f32(i), f32(j));
      let seed = cell + neighbor;
      let p = neighbor + 0.5 + 0.5 * sin(vec2f(seed.x * 3.1 + t, seed.y * 2.7 - t));
      md = min(md, length(local - p));
    }
  }
  let edge = smoothstep(0.0, 0.18, md);
  let e = params.energy;
  return vec4f(edge * 0.15 + e * 0.2, edge * 0.55, 0.85 - edge * 0.3, 1.0);
}
`,
};

const ALIASES: Record<string, string> = {
  plasma: 'plasma',
  metaballs: 'metaballs',
  metaball: 'metaballs',
  fire: 'fire',
  voronoi: 'voronoi',
};

/** Catalog ids in a stable order. */
export function listShaders(): string[] {
  return Object.keys(SHADER_CATALOG);
}

/** Look up a catalog snippet. Names are case-insensitive. */
export function getShader(name: string): string {
  const key = ALIASES[name.toLowerCase()];
  const source = key === undefined ? undefined : SHADER_CATALOG[key];
  if (source === undefined) {
    throw new Error(`[vgpu] Unknown shader "${name}". Available: ${listShaders().join(', ')}`);
  }
  return source;
}
