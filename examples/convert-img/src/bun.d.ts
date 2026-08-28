/**
 * Minimal ambient declarations for the Bun runtime globals convert-img
 * uses (Bun.Image, Bun.file, Bun.write, Bun.spawn). Kept hand-rolled so
 * `@mudah-cli/mudah` stays the only npm dependency — add @types/bun if the
 * app grows more Bun surface.
 */
declare namespace Bun {
  interface ImageMetadata {
    width: number;
    height: number;
    format: string;
  }

  interface ImagePipeline {
    resize(width?: number, height?: number, options?: { fit?: 'fill' | 'inside'; withoutEnlargement?: boolean }): ImagePipeline;
    jpeg(options?: { quality?: number }): ImagePipeline;
    png(options?: { compressionLevel?: number }): ImagePipeline;
    webp(options?: { quality?: number; lossless?: boolean }): ImagePipeline;
    bytes(): Promise<Uint8Array>;
    write(path: string): Promise<number>;
  }

  class Image {
    constructor(input: string | Uint8Array | ArrayBuffer | { arrayBuffer(): Promise<ArrayBuffer> });
    metadata(): Promise<ImageMetadata>;
    jpeg(options?: { quality?: number }): ImagePipeline;
    png(options?: { compressionLevel?: number }): ImagePipeline;
    webp(options?: { quality?: number; lossless?: boolean }): ImagePipeline;
  }

  interface BunFile {
    exists(): Promise<boolean>;
    arrayBuffer(): Promise<ArrayBuffer>;
    slice(start?: number, end?: number): BunFile;
  }

  function file(path: string): BunFile;
  function write(path: string, data: Uint8Array | string): Promise<number>;
  interface SpawnOptions {
    stdout?: 'pipe' | 'inherit' | 'ignore';
    stderr?: 'pipe' | 'inherit' | 'ignore';
    stdin?: 'pipe' | 'inherit' | 'ignore';
  }
  interface Subprocess {
    stdin: { write(data: Uint8Array | string): unknown; end(): unknown };
    stdout: ReadableStream<Uint8Array>;
    stderr: ReadableStream<Uint8Array>;
    exited: Promise<number>;
    exitCode: number | null;
  }
  function spawn(command: string[], options?: SpawnOptions): Subprocess;
  function tmpdir(): string;
}

declare module 'bun' {
  export = Bun;
}
