import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { Command } from '@mudah-cli/console';

function runChild(command: string, args: string[], cwd: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('error', () => resolve(1));
    child.on('close', (code) => resolve(code ?? 1));
  });
}

/**
 * Built-in `build` command: runs the app's `build` script (bun when the
 * app is running under Bun, npm otherwise), streaming output.
 */
export default class BuildCommand extends Command {
  signature = 'build';
  description = 'Build the application (runs the package.json build script)';

  async handle() {
    const pkgPath = `${this.app.basePath}/package.json`;
    let pkg: { scripts?: Record<string, string> };
    try {
      pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    } catch {
      throw this.usageError('No package.json found in the app directory.');
    }
    const script = pkg.scripts?.['build'];
    if (!script) {
      this.output.warn('No "build" script in package.json — nothing to do.');
      return;
    }

    const runner = process.versions.bun ? 'bun' : 'npm';
    this.output.info(`Running: ${runner} run build`);
    const code = await runChild(runner, ['run', 'build'], this.app.basePath);
    if (code === 0) {
      this.output.success('Build complete.');
      return 0;
    }
    this.output.error(`Build failed with exit code ${code}.`);
    return code;
  }
}
