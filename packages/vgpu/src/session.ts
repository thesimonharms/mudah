import type { OscWriter } from '@mudah-cli/terminal';
import { FramePresenter, type PresentMode } from './presenter.js';

export type GpuAdapterKind = 'auto' | 'hardware' | 'software' | 'mock';

export interface ShaderSessionOptions {
  /** Fragment-only WGSL. vgpu injects a fullscreen triangle and `uv`. */
  shader: string;
  width?: number;
  height?: number;
  /** Initial uniform / texture bindings, keyed by WGSL name. */
  set?: Record<string, unknown>;
  adapter?: GpuAdapterKind;
  stdout?: OscWriter;
  present?: PresentMode;
  label?: string;
}

interface VgpuModule {
  init: (opts?: { adapter?: 'auto' | 'hardware' | 'software' }) => Promise<VgpuGpu>;
  effect: (
    gpu: VgpuGpu,
    source: string,
    opts?: { set?: Record<string, unknown>; label?: string },
  ) => VgpuEffect;
  target: (gpu: VgpuGpu, opts: { size: readonly [number, number]; format?: string }) => VgpuTarget;
}

interface VgpuGpu {
  settled?: () => Promise<void>;
  dispose: () => void;
  onError?: (cb: (error: Error) => void) => () => void;
}

interface VgpuEffect {
  set: (values: Record<string, unknown>) => VgpuEffect;
  draw: (target: VgpuTarget) => void;
}

interface VgpuTarget {
  read: () => Promise<Uint8Array>;
  size: readonly [number, number];
}

async function loadVgpu(adapter: GpuAdapterKind): Promise<VgpuModule> {
  try {
    if (adapter === 'mock') {
      return (await import('vgpu/mock')) as unknown as VgpuModule;
    }
    return (await import('vgpu/node')) as unknown as VgpuModule;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[vgpu] Failed to load the vgpu ${adapter === 'mock' ? 'mock' : 'Node'} adapter (${reason}). Install the vgpu package and, on a machine with no GPU, run \`npx vgpu install-software-renderer\`.`,
    );
  }
}

/**
 * A WGSL effect that renders offscreen through vgpu, then blits the pixels
 * to the terminal. Optional: apps that never import `@mudah-cli/vgpu` never
 * load Dawn or vgpu.
 */
export class ShaderSession {
  readonly width: number;
  readonly height: number;
  readonly presenter: FramePresenter;
  private readonly gpu: VgpuGpu;
  private readonly vgpu: VgpuModule;
  private effect: VgpuEffect;
  private readonly target: VgpuTarget;
  private lastFrame: Uint8Array | undefined;

  private constructor(
    vgpu: VgpuModule,
    gpu: VgpuGpu,
    effect: VgpuEffect,
    target: VgpuTarget,
    presenter: FramePresenter,
    width: number,
    height: number,
  ) {
    this.vgpu = vgpu;
    this.gpu = gpu;
    this.effect = effect;
    this.target = target;
    this.presenter = presenter;
    this.width = width;
    this.height = height;
  }

  static async create(options: ShaderSessionOptions): Promise<ShaderSession> {
    const width = options.width ?? 320;
    const height = options.height ?? 180;
    const adapter = options.adapter ?? 'auto';
    const vgpu = await loadVgpu(adapter);
    const initOpts = adapter === 'mock' || adapter === 'auto' ? {} : { adapter };
    const gpu = await vgpu.init(initOpts);
    const colorTarget = vgpu.target(gpu, { size: [width, height], format: 'rgba8unorm' });
    const fx = vgpu.effect(gpu, options.shader, {
      label: options.label ?? 'mudah-vgpu',
      set: options.set,
    });
    const presenter = new FramePresenter({
      stdout: options.stdout,
      mode: options.present,
    });
    return new ShaderSession(vgpu, gpu, fx, colorTarget, presenter, width, height);
  }

  /** Replace the fragment shader without tearing down the GPU device. */
  useShader(source: string, set?: Record<string, unknown>, label?: string): this {
    this.effect = this.vgpu.effect(this.gpu, source, {
      label: label ?? 'mudah-vgpu',
      set,
    });
    return this;
  }

  set(values: Record<string, unknown>): this {
    this.effect.set(values);
    return this;
  }

  /** Draw one frame and return tightly packed RGBA bytes. */
  async render(): Promise<Uint8Array> {
    const errors: Error[] = [];
    const off = this.gpu.onError?.((error) => {
      errors.push(error);
    });
    try {
      this.effect.draw(this.target);
      if (this.gpu.settled !== undefined) await this.gpu.settled();
      if (errors[0] !== undefined) throw errors[0];
      this.lastFrame = await this.target.read();
      return this.lastFrame;
    } finally {
      off?.();
    }
  }

  /** Draw, then blit to the terminal. */
  async frame(layout: { columns?: number; rows?: number } = {}): Promise<Uint8Array> {
    const pixels = await this.render();
    this.presenter.present(pixels, this.width, this.height, layout);
    return pixels;
  }

  /** Re-blit the last rendered frame without another GPU pass. */
  presentLast(layout: { columns?: number; rows?: number } = {}): void {
    if (this.lastFrame === undefined) return;
    this.presenter.present(this.lastFrame, this.width, this.height, layout);
  }

  dispose(): void {
    this.presenter.clear();
    this.gpu.dispose();
  }
}
