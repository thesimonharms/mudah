export interface ShaderDef {
  readonly id: string;
  readonly name: string;
  readonly hint: string;
  readonly source: string;
}

const PARAMS = `
struct Params {
  time: f32,
  energy: f32,
  width: f32,
  height: f32,
}
@group(0) @binding(0) var<uniform> params: Params;
`;

export const SHADERS: readonly ShaderDef[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    hint: 'Hold space to flare',
    source: `${PARAMS}
      @fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
        var p = uv * vec2f(1.8, 1.0);
        p.x += params.time * 0.07;
        let n = sin(p.x * 3.2 + params.time) * sin(p.y * 4.1 - params.time * 0.65)
          + 0.5 * sin(length(p - vec2f(0.55, 0.45)) * 9.0 - params.time * 1.8);
        let e = params.energy;
        let col = vec3f(
          0.12 + 0.42 * sin(n + 0.2) + e * 0.35,
          0.22 + 0.50 * sin(n + 2.1) + e * 0.12,
          0.48 + 0.48 * sin(n + 4.0)
        );
        return vec4f(col, 1.0);
      }
    `,
  },
  {
    id: 'tunnel',
    name: 'Tunnel',
    hint: 'Hold space to accelerate',
    source: `${PARAMS}
      @fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
        var c = uv * 2.0 - 1.0;
        c.x *= params.width / max(params.height, 1.0);
        let a = atan2(c.y, c.x);
        let r = length(c);
        let speed = 0.55 + params.energy * 1.4;
        let z = 0.35 / max(r, 0.04) + params.time * speed;
        let bands = abs(sin(z * 5.0 + a * 8.0));
        let glow = 0.08 / max(r, 0.05);
        let col = vec3f(bands * 0.15 + glow, bands * 0.45 + glow * 0.4, bands * 0.95);
        return vec4f(col, 1.0);
      }
    `,
  },
  {
    id: 'phosphor',
    name: 'Phosphor',
    hint: 'Hold space to overdrive the beam',
    source: `${PARAMS}
      @fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
        let aspect = params.width / max(params.height, 1.0);
        var p = (uv - 0.5) * vec2f(aspect, 1.0);
        let t = params.time;
        let blob = 0.35 * sin(6.0 * p.x + t) * sin(7.0 * p.y - t * 1.2);
        let field = 0.5 + 0.5 * sin(length(p) * 18.0 - t * 3.0 + blob);
        let scan = 0.78 + 0.22 * sin(uv.y * params.height * 3.14159 + t * 10.0);
        let mask = 0.88 + 0.12 * sin(uv.x * params.width * 2.094);
        let e = params.energy;
        let col = vec3f(
          field * 0.15 * scan,
          (0.55 + e * 0.4) * field * scan * mask,
          field * 0.22 * scan
        );
        return vec4f(col, 1.0);
      }
    `,
  },
];
