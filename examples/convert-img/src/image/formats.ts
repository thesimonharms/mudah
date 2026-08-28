/** Supported image formats. */
export type ImageFormat = 'png' | 'jpeg' | 'jpg' | 'webp' | 'heic' | 'heif' | 'gif' | 'avif';

/** Canonical normalization: jpg→jpeg, heif→heic. */
export function normalizeFormat(raw: string): ImageFormat | undefined {
  const lowered = raw.toLowerCase().replace(/^\./, '');
  if (lowered === 'jpg') return 'jpeg';
  if (lowered === 'heif') return 'heic';
  switch (lowered) {
    case 'png':
    case 'jpeg':
    case 'webp':
    case 'heic':
    case 'gif':
    case 'avif':
      return lowered;
    default:
      return undefined;
  }
}

/** File extension for a (normalized) format. */
export function extensionFor(format: ImageFormat): string {
  return format === 'jpeg' ? 'jpg' : format;
}

export function mimeFor(format: ImageFormat): string {
  switch (format) {
    case 'png':
      return 'image/png';
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'heic':
    case 'heif':
      return 'image/heic';
    case 'gif':
      return 'image/gif';
    case 'avif':
      return 'image/avif';
  }
}

/** All formats the CLI names in help output. */
export const knownFormats: readonly ImageFormat[] = ['png', 'jpeg', 'jpg', 'webp', 'heic', 'heif', 'gif', 'avif'];

/** Formats we can target for output (normalized). */
export const targetFormats: readonly ImageFormat[] = ['png', 'jpeg', 'webp', 'heic', 'gif', 'avif'];

export interface SniffResult {
  format: ImageFormat;
  /** Offset of the first pixel-data byte (used to skip container headers). */
  headerLength: number;
}

/**
 * Identify a format from magic bytes. Returns undefined for unknown data.
 * Handles the ISO-BMFF container family (heic/heif/avif) via ftyp brands.
 */
export function sniffFormat(bytes: Uint8Array): SniffResult | undefined {
  if (bytes.length < 4) return undefined;

  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { format: 'png', headerLength: 8 };
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { format: 'jpeg', headerLength: 2 };
  }
  // GIF: GIF87a / GIF89a
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return { format: 'gif', headerLength: 6 };
  }
  if (bytes.length < 12) return undefined;
  // RIFF....WEBP
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return { format: 'webp', headerLength: 12 };
  }
  // ISO-BMFF: size(4) + 'ftyp' at offset 4, brand at 8..12.
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
    if (brand.startsWith('heic') || brand.startsWith('heix') || brand.startsWith('mif1') || brand.startsWith('msf1')) {
      return { format: 'heic', headerLength: 12 };
    }
    if (brand.startsWith('avif') || brand.startsWith('avis')) {
      return { format: 'avif', headerLength: 12 };
    }
    return undefined;
  }

  return undefined;
}
