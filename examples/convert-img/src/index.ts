/**
 * convert-img — the ultimate image converter.
 *
 * Both a CLI (convert <files...> --to=webp) and a TUI (bare invocation
 * opens the wizard). Zero npm dependencies beyond @mudah-cli/mudah;
 * codecs come from Bun.Image plus optional system tools (libheif,
 * ImageMagick) for the gaps.
 */
export { sniffFormat, normalizeFormat, extensionFor, mimeFor, targetFormats, knownFormats, type ImageFormat } from './image/formats.js';
export { Converter, defaultDrivers, normalizeOrThrow, type ConversionPlan, type EngineCapabilities } from './image/converter.js';
export type { ImageDriver, DriverCapabilities, ConvertOptions } from './image/drivers.js';
export { getConverter, loadImage, convertBatch, outputPathFor, type BatchOptions, type BatchItemResult } from './image/pipeline.js';
export { runWizard, pickWithWizard, type WizardResult } from './tui/wizard.js';
