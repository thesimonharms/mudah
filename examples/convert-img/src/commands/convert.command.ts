import { Command } from '@mudah-cli/mudah';
import { convertBatch, extensionFor, getConverter, targetFormats } from '../image/pipeline.js';
import { normalizeFormat } from '../image/formats.js';

/**
 * convert {paths...} [--to=webp] [--quality=80] [--outdir] [--suffix] [--no-overwrite]
 *
 * The workhorse: converts one or more images, concurrently, with live
 * per-file status. With no paths at all (bare `convert-img`), the TUI
 * wizard runs instead.
 */
export default class ConvertCommand extends Command {
  signature = 'convert {paths...} [--to=webp] [--quality=80] [--outdir=] [--suffix=] [--no-overwrite]';
  description = 'Convert images between png/jpeg/webp/heic/gif/avif';

  async handle() {
    const paths = this.list('paths');
    if (paths.length === 0) {
      // No paths: defer to the TUI wizard (interactive by design).
      const { runWizard } = await import('../tui/wizard.js');
      return runWizard(this.output);
    }

    const toRaw = this.option<string>('to') ?? 'webp';
    const to = normalizeFormat(toRaw);
    if (!to) {
      throw this.usageError(`Unknown target format "${toRaw}".`, 'Known: png, jpeg/jpg, webp, heic/heif, gif, avif');
    }

    const quality = Number(this.option<string>('quality') ?? 80);
    const outdir = this.option<string>('outdir') || undefined;
    const suffix = this.option<string>('suffix') || undefined;
    const overwrite = this.option('no-overwrite') !== true;

    const results = await convertBatch(
      paths,
      { to, quality, outdir, suffix, overwrite },
      this.output,
    );

    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    for (const result of results) {
      if (result.ok) {
        this.output.success(`${result.input} → ${result.output}  (${result.bytes ?? 0} bytes, ${result.ms ?? 0}ms)`);
      } else {
        this.output.error(`${result.input}: ${result.error}`);
      }
    }

    if (this.output.isMachineReadable) {
      this.output.emit('data', 'conversion-report', {
        target: to,
        converted: ok.map((r) => ({ input: r.input, output: r.output, bytes: r.bytes, ms: r.ms })),
        failed: failed.map((r) => ({ input: r.input, error: r.error })),
      });
    }

    this.output.line();
    this.output.keyValue('converted', String(ok.length));
    if (failed.length > 0) this.output.keyValue('failed', String(failed.length));

    return failed.length > 0 ? 1 : 0;
  }
}
