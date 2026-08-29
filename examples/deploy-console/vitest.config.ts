import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const packageSource = (name: string, file = 'index.ts'): string =>
  fileURLToPath(new URL(`../../packages/${name}/src/${file}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: '@mudah-cli/mudah/testing', replacement: packageSource('mudah', 'testing.ts') },
      { find: '@thesimonharms/deploy-audit', replacement: fileURLToPath(new URL('../deploy-audit-plugin/src/index.ts', import.meta.url)) },
      { find: '@mudah-cli/mudah/tui', replacement: packageSource('mudah', 'tui.ts') },
      { find: '@mudah-cli/mudah/ui', replacement: packageSource('mudah', 'ui.ts') },
      { find: '@mudah-cli/mudah/terminal', replacement: packageSource('mudah', 'terminal.ts') },
      { find: '@mudah-cli/mudah/animation', replacement: packageSource('mudah', 'animation.ts') },
      { find: '@mudah-cli/mudah', replacement: packageSource('mudah') },
      ...['container', 'config', 'core', 'terminal', 'animation', 'ui', 'tui', 'console', 'testing'].map(
        (name) => ({ find: `@mudah-cli/${name}`, replacement: packageSource(name) }),
      ),
    ],
  },
  test: {
    environment: 'node',
  },
});
