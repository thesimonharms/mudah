export interface ShaderSliderParam {
  name: string;
  min: number;
  max: number;
  value: number;
}

export interface ShaderSlidersOptions {
  /** Bar width in cells. Default 8. */
  width?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Data model for shader parameter sliders. `renderLines()` is a TUI overlay
 * fragment — enough to paint next to a framebuffer without a full Program.
 */
export class ShaderSliders {
  readonly params: ShaderSliderParam[];
  private readonly width: number;

  constructor(params: readonly ShaderSliderParam[], options: ShaderSlidersOptions = {}) {
    this.params = params.map((param) => ({
      name: param.name,
      min: param.min,
      max: param.max,
      value: clamp(param.value, param.min, param.max),
    }));
    this.width = options.width ?? 8;
  }

  set(name: string, value: number): void {
    const param = this.params.find((entry) => entry.name === name);
    if (param === undefined) throw new Error(`[vgpu] Unknown slider "${name}".`);
    param.value = clamp(value, param.min, param.max);
  }

  snapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const param of this.params) out[param.name] = param.value;
    return out;
  }

  /** One line per param, e.g. `energy [████░░] 0.62`. */
  renderLines(): string[] {
    const nameWidth = Math.max(0, ...this.params.map((param) => param.name.length));
    return this.params.map((param) => {
      const span = param.max - param.min;
      const t = span === 0 ? 1 : (param.value - param.min) / span;
      const filled = Math.round(this.width * clamp(t, 0, 1));
      const bar = `${'█'.repeat(filled)}${'░'.repeat(this.width - filled)}`;
      const name = param.name.padEnd(nameWidth);
      return `${name} [${bar}] ${formatValue(param.value)}`;
    });
  }
}

function formatValue(value: number): string {
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 0.01 || abs >= 100)) return value.toFixed(2);
  return value.toFixed(2);
}
