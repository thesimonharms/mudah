import { type ImageFormat } from './formats.js';
import { normalizeFormat } from './formats.js';
import {
  BunImageDriver,
  FfmpegDriver,
  HeifDriver,
  MagickDriver,
  type DriverCapabilities,
  type ImageDriver,
} from './drivers.js';

export interface EngineCapabilities {
  decode: Set<ImageFormat>;
  encode: Set<ImageFormat>;
  /** Driver name per capability, for diagnostics. */
  sources: Map<string, string>;
}

export interface ConversionPlan {
  /** ['heif', 'bun'] — driver chain for one hop each. */
  drivers: string[];
  via?: ImageFormat;
}

export interface ConversionResult {
  bytes: Uint8Array;
  plan: ConversionPlan;
}

/**
 * The conversion engine: probes all registered drivers once, then routes
 * each requested (from → to) pair. A pair is served by the first driver
 * that can do it directly; otherwise a two-hop plan through PNG
 * (decode → png → encode) is built from two drivers.
 */
export class Converter {
  private readonly drivers: ImageDriver[];
  private caps = new Map<string, DriverCapabilities>();
  private probed: Promise<void> | null = null;

  constructor(drivers: ImageDriver[]) {
    this.drivers = drivers;
  }

  /** Probe every driver once (idempotent, safe to await repeatedly). */
  async init(): Promise<void> {
    if (!this.probed) {
      this.probed = (async (): Promise<void> => {
        const results = await Promise.all(
          this.drivers.map(async (driver) => [driver.name, await driver.probe()] as const),
        );
        for (const [name, capabilities] of results) {
          this.caps.set(name, capabilities);
        }
      })();
    }
    await this.probed;
  }

  /** Aggregated machine capabilities. */
  capabilities(): EngineCapabilities {
    const decode = new Set<ImageFormat>();
    const encode = new Set<ImageFormat>();
    const sources = new Map<string, string>();
    for (const driver of this.drivers) {
      const caps = this.caps.get(driver.name);
      if (!caps) continue;
      for (const format of caps.decode) {
        if (!sources.has(`decode:${format}`)) sources.set(`decode:${format}`, driver.name);
        decode.add(format);
      }
      for (const format of caps.encode) {
        if (!sources.has(`encode:${format}`)) sources.set(`encode:${format}`, driver.name);
        encode.add(format);
      }
    }
    return { decode, encode, sources };
  }

  /** Build a driver chain for from → to, or undefined when impossible. */
  plan(from: ImageFormat, to: ImageFormat): ConversionPlan | undefined {
    const { decode, encode } = this.capabilities();
    const direct = this.drivers.find(
      (driver) => this.caps.get(driver.name)?.decode.includes(from) && this.caps.get(driver.name)?.encode.includes(to),
    );
    if (direct) return { drivers: [direct.name] };

    // Two-hop via PNG (universally decodable + encodable here).
    if (decode.has(from) && decode.has('png') && encode.has('png') && encode.has(to)) {
      const decodeDriver = this.drivers.find((driver) => this.caps.get(driver.name)?.decode.includes(from));
      const encodeDriver = this.drivers.find((driver) => this.caps.get(driver.name)?.encode.includes(to));
      if (decodeDriver && encodeDriver) {
        return { drivers: [decodeDriver.name, encodeDriver.name], via: 'png' }
      }
    }
    void decode;
    void encode;
    return undefined;
  }

  /** Execute a conversion. Throws with a readable message when impossible. */
  async convert(
    from: ImageFormat,
    to: ImageFormat,
    bytes: Uint8Array,
    options: { quality?: number } = {},
  ): Promise<ConversionResult> {
    await this.init();
    const plan = this.plan(from, to);
    if (!plan) {
      const { decode, encode } = this.capabilities();
      throw new Error(
        `No conversion path ${from} → ${to}. Can decode: ${[...decode].join(', ')}. Can encode: ${[...encode].join(', ')}.`,
      );
    }

    const driverFor = (name: string): ImageDriver => {
      const driver = this.drivers.find((d) => d.name === name);
      if (!driver) throw new Error(`internal: driver ${name} missing`);
      return driver;
    };

    if (plan.via === undefined) {
      const driver = driverFor(plan.drivers[0]!);
      const out = await driver.convert(from, to, bytes, options);
      return { bytes: out, plan };
    }

    const [first, second] = plan.drivers as [string, string];
    const intermediate = await driverFor(first).convert(from, 'png', bytes, options);
    const out = await driverFor(second).convert('png', to, intermediate, options);
    return { bytes: out, plan };
  }
}

/** The default driver stack for this machine (order = preference). */
export function defaultDrivers(): ImageDriver[] {
  return [new BunImageDriver(), new HeifDriver(), new MagickDriver(), new FfmpegDriver()];
}

export function normalizeOrThrow(raw: string): ImageFormat {
  const normalized = normalizeFormat(raw);
  if (!normalized) {
    throw new Error(`Unknown format "${raw}". Known: png, jpeg, jpg, webp, heic, heif, gif, avif.`);
  }
  return normalized;
}
