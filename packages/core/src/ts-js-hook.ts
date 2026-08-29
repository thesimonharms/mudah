import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

let installed = false;

/**
 * Node type-stripping loads `foo.command.ts`, then fails on `import './bar.js'`
 * because `bar.ts` is the file on disk. Rewrite a missing relative `.js`
 * specifier to `.ts` so `node bin/app.js` works without a compile step.
 */
export function installTsJsResolveHook(): void {
  if (installed) return;
  installed = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      try {
        return nextResolve(specifier, context);
      } catch (error) {
        if (!isRelativeJs(specifier) || context.parentURL === undefined) throw error;
        const tsUrl = new URL(specifier.replace(/\.js$/u, '.ts'), context.parentURL);
        if (!existsSync(fileURLToPath(tsUrl))) throw error;
        return nextResolve(tsUrl.href, context);
      }
    },
  });
}

function isRelativeJs(specifier: string): boolean {
  return (specifier.startsWith('./') || specifier.startsWith('../')) && specifier.endsWith('.js');
}
