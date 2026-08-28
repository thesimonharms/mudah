import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const packageSource = (name: string): string =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: '@mudah-cli/create-mudah', replacement: fileURLToPath(new URL('./packages/create-mudah/src/index.ts', import.meta.url)) },
      { find: '@mudah-cli/mudah/testing', replacement: fileURLToPath(new URL('./packages/mudah/src/testing.ts', import.meta.url)) },
      { find: '@mudah-cli/mudah/tui', replacement: fileURLToPath(new URL('./packages/mudah/src/tui.ts', import.meta.url)) },
      { find: '@mudah-cli/mudah/ui', replacement: fileURLToPath(new URL('./packages/mudah/src/ui.ts', import.meta.url)) },
      { find: '@mudah-cli/mudah/terminal', replacement: fileURLToPath(new URL('./packages/mudah/src/terminal.ts', import.meta.url)) },
      { find: '@mudah-cli/mudah/animation', replacement: fileURLToPath(new URL('./packages/mudah/src/animation.ts', import.meta.url)) },
      { find: '@mudah-cli/mudah', replacement: packageSource('mudah') },
      ...[
        'container',
        'config',
        'core',
        'terminal',
        'animation',
        'ui',
        'tui',
        'console',
        'testing',
      ].map((name) => ({ find: `@mudah-cli/${name}`, replacement: packageSource(name) })),
    ],
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'examples/*/test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15_000,
  },
});
