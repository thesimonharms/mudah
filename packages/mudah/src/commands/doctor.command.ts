import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from '@mudah-cli/console';
import { detectCapabilities } from '@mudah-cli/terminal';

/**
 * Built-in `doctor` command: a quick health check of the runtime, manifest,
 * scaffolding, and terminal capabilities.
 */
export default class DoctorCommand extends Command {
  signature = 'doctor';
  description = 'Check the runtime, app, and terminal setup';

  async handle() {
    const caps = detectCapabilities();
    this.output.section('Runtime');

    const nodeMajor = Number(process.versions.node.split('.')[0]);
    if (nodeMajor >= 26) {
      this.output.success(`Node.js ${process.versions.node}`);
    } else if (process.versions.bun) {
      this.output.success(`Bun ${process.versions.bun}`);
    } else {
      this.output.warn(`Node.js ${process.versions.node} (Mudah targets Node >= 26)`);
    }

    this.output.section('Application');
    this.output.keyValue('name', this.app.manifest.name);
    this.output.keyValue('version', this.app.manifest.version);

    const binDir = join(this.app.basePath, 'bin');
    if (existsSync(join(binDir, this.app.manifest.bin)) || existsSync(binDir)) {
      this.output.success(`bin/${this.app.manifest.bin} present`);
    } else {
      this.output.warn(`bin/${this.app.manifest.bin} missing — add the bin stub`);
    }

    const modules = await this.app.discoverCommandModules();
    if (modules.length > 0) {
      this.output.success(`${modules.length} command(s) discovered`);
    } else {
      this.output.warn('no commands discovered in src/commands');
    }

    this.output.section('Terminal');
    this.output.keyValue('brand', caps.brand);
    this.output.keyValue('color', caps.trueColor ? 'truecolor' : caps.colorLevel === 8 ? '256' : caps.colorLevel === 1 ? '16' : 'off');
    this.output.keyValue('unicode', String(caps.unicode));
    this.output.keyValue('animations', String(caps.animations));
    this.output.keyValue('notifications', caps.osc9 ? 'osc 9' : 'none');
    this.output.keyValue('semantic prompts', caps.osc133 ? 'osc 133' : 'none');

    this.output.line();
    this.output.success('doctor complete');
  }
}
