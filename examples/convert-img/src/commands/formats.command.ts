import { Command } from '@mudah-cli/mudah';
import { getConverter } from '../image/pipeline.js';
import { targetFormats } from '../image/formats.js';

/**
 * formats — show the conversion capability matrix for this machine.
 * Pure diagnostics: which directions are possible and with which driver.
 */
export default class FormatsCommand extends Command {
  signature = 'formats';
  description = 'Show the conversion capability matrix for this machine';

  async handle() {
    const converter = getConverter();
    await converter.init();
    const { decode, encode, sources } = converter.capabilities();

    // Canonical formats only — jpg/heif are aliases handled by normalize().
    const canonical = [...new Set(targetFormats)];

    this.output.section('Decoders');
    for (const format of canonical) {
      const driver = sources.get(`decode:${format}`);
      if (driver) this.output.bullet(`${format}  (${driver})`);
      else this.output.muted(`${format}  — unavailable`);
    }

    this.output.section('Encoders');
    for (const format of canonical) {
      const driver = sources.get(`encode:${format}`);
      if (driver) this.output.bullet(`${format}  (${driver})`);
      else this.output.muted(`${format}  — unavailable`);
    }

    this.output.section('Possible directions');
    const rows: string[][] = [];
    for (const from of canonical) {
      if (!decode.has(from)) continue;
      const row: string[] = [from];
      for (const to of targetFormats) {
        const possible = from === to ? '—' : converter.plan(from, to) !== undefined ? '✓' : '·';
        row.push(possible);
      }
      rows.push(row);
    }
    this.output.table(
      [{ header: 'from \\ to' }, ...targetFormats.map((f) => ({ header: f, align: 'right' as const }))],
      rows,
    );

    if (this.output.isMachineReadable) {
      this.output.emit('data', 'capabilities', {
        decode: [...decode],
        encode: [...encode],
        drivers: [...sources.entries()].map(([key, driver]) => ({ key, driver })),
      });
    }
  }
}
