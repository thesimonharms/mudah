import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function mudahRange(): string {
  const pkg = JSON.parse(
    readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
  ) as { version: string };
  return `^${pkg.version}`;
}

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'mudah-app';
}

/**
 * All files of a fresh Mudah app, as `[relativePath, content]` pairs.
 * The app name is kebab-case (e.g. `hello-cli`).
 */
export function appTemplates(name: string): [string, string][] {
  const pascal = name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

  return [
    [
      'package.json',
      JSON.stringify(
        {
          name,
          version: '0.1.0',
          description: `${name} — built with Mudah`,
          type: 'module',
          private: true,
          bin: { [name]: `./bin/${name}.js` },
          engines: { node: '>=26' },
          scripts: {
            start: `node bin/${name}.js`,
            dev: `node bin/${name}.js dev welcome`,
            doctor: `node bin/${name}.js doctor`,
            test: 'vitest run',
            typecheck: 'tsc --noEmit',
          },
          dependencies: { '@mudah-cli/mudah': mudahRange() },
          devDependencies: {
            '@types/node': '^26.0.0',
            typescript: '^7.0.0',
            vitest: '^4.0.0',
          },
        },
        null,
        2,
      ) + '\n',
    ],
    [
      'mudah.json',
      JSON.stringify(
        {
          name,
          version: '0.1.0',
          bin: name,
          description: `${name} — built with Mudah`,
          ui: { theme: 'auto' },
        },
        null,
        2,
      ) + '\n',
    ],
    [
      `bin/${name}.js`,
      `#!/usr/bin/env node
import { run } from '@mudah-cli/mudah';

process.exitCode = await run();
`,
    ],
    [
      'tsconfig.json',
      JSON.stringify(
        {
          compilerOptions: {
            target: 'es2024',
            lib: ['es2024'],
            types: ['node'],
            module: 'nodenext',
            moduleResolution: 'nodenext',
            strict: true,
            noUncheckedIndexedAccess: true,
            verbatimModuleSyntax: true,
            isolatedModules: true,
            skipLibCheck: true,
            noEmit: true,
          },
          include: ['src', 'config', 'test'],
        },
        null,
        2,
      ) + '\n',
    ],
    [
      'src/commands/welcome.command.ts',
      `import { Command } from '@mudah-cli/mudah';

export default class WelcomeCommand extends Command {
  signature = 'welcome {name?}';
  description = 'Say hello from ${name}';

  async handle() {
    this.output.section('Mudah');
    this.output.success(\`Hello, \${this.arg('name') ?? 'world'}!\`);
    this.output.muted('Run "${name} --help" to see all commands.');
  }
}
`,
    ],
    [
      'src/providers/AppProvider.ts',
      `import { ServiceProvider } from '@mudah-cli/mudah';

export default class ${pascal}Provider extends ServiceProvider {
  register(): void {
    this.app.config().merge('app', {
      name: '${name}',
      env: 'local',
    });
  }
}
`,
    ],
    [
      'config/app.ts',
      `import { defineConfig } from '@mudah-cli/mudah';

export default defineConfig({
  name: '${name}',
  env: 'local',
});
`,
    ],
    [
      '.env.example',
      `# Copy to .env and adjust.
# APP_ENV=local
`,
    ],
    [
      '.gitignore',
      `node_modules/
dist/
.env
.DS_Store
`,
    ],
    [
      'test/welcome.test.ts',
      `import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TestApp } from '@mudah-cli/mudah/testing';

const appDir = fileURLToPath(new URL('..', import.meta.url));

describe('welcome', () => {
  it('greets a named person', async () => {
    const app = await TestApp.create({ cwd: appDir });
    const result = await app.dispatch(['welcome', 'Mudah']);
    result.exit(0).outContains('Hello, Mudah!');
  });

  it('greets the world by default', async () => {
    const app = await TestApp.create({ cwd: appDir });
    const result = await app.dispatch(['welcome']);
    result.exit(0).outContains('Hello, world!');
  });
});
`,
    ],
    [
      'vitest.config.ts',
      `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
`,
    ],
    [
      'README.md',
      `# ${name}

Built with [Mudah](https://github.com/thesimonharms/mudah) — speed, sleek design, and developer ergonomics for the terminal.

## Quick start

\`\`\`sh
npm install
npm run start        # run the CLI (no args shows help)
npm run dev          # watch mode: re-runs \`welcome\` on changes
npm test             # in-process command tests via mudah/testing
\`\`\`

## Structure

- \`bin/${name}.js\` — the executable entrypoint (calls \`run()\`)
- \`mudah.json\` — app manifest (name, version, theme, update nudge)
- \`src/commands/\` — one file per command (\`*.command.ts\`, default export)
- \`src/providers/\` — service providers (\`register()\` → \`boot()\`)
- \`config/\` — configuration files merged into \`app.config()\`

Create a new command:

\`\`\`sh
node bin/${name}.js make command deploy-site
\`\`\`
`,
    ],
  ];
}
