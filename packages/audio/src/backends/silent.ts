import type { AudioBackend } from '../types.js';

export class SilentBackend implements AudioBackend {
  readonly kind = 'silent' as const;
  bytesWritten = 0;

  write(bytes: Uint8Array): void {
    this.bytesWritten += bytes.byteLength;
  }

  dispose(): void {}
}
