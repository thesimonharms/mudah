import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { Command } from '@mudah-cli/console';

function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function pascal(name: string): string {
  return kebab(name)
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

const COMMAND_TEMPLATE = (command: string, className: string): string => `import { Command } from '@mudah-cli/mudah';

export default class ${className} extends Command {
  signature = '${command} {target?}';
  description = 'Describe ${command} in one line.';

  async handle() {
    this.output.success('Hello from ${command}!');
  }
}
`;

const PROVIDER_TEMPLATE = (className: string): string => `import { ServiceProvider } from '@mudah-cli/mudah';

export default class ${className} extends ServiceProvider {
  register(): void {}

  boot(): void {}
}
`;

const CONFIG_TEMPLATE = `import { defineConfig } from '@mudah-cli/mudah';

export default defineConfig({
  // Add configuration for this component.
});
`;

/**
 * Built-in `make` command: scaffold commands, providers, and config files
 * with the right structure and imports.
 */
export default class MakeCommand extends Command {
  signature = 'make {type} {name}';
  description = 'Scaffold a command, provider, or config file';

  async handle() {
    const type = this.arg('type')!;
    const name = this.arg('name')!;

    if (!['command', 'provider', 'config'].includes(type)) {
      throw this.usageError(`Unknown make type "${type}".`, 'Use: make {command|provider|config} {name}');
    }
    if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(name)) {
      throw this.usageError(`Invalid name "${name}".`, 'Use letters, numbers, and dashes (e.g. "deploy-site").');
    }

    const k = kebab(name);
    const className = pascal(name);

    let filePath: string;
    let content: string;
    if (type === 'command') {
      filePath = join(this.app.basePath, 'src', 'commands', `${k}.command.ts`);
      content = COMMAND_TEMPLATE(k, className);
    } else if (type === 'provider') {
      filePath = join(this.app.basePath, 'src', 'providers', `${className}Provider.ts`);
      content = PROVIDER_TEMPLATE(`${className}Provider`);
    } else {
      filePath = join(this.app.basePath, 'config', `${k}.ts`);
      content = CONFIG_TEMPLATE;
    }

    if (isAbsolute(filePath) === false || !filePath.startsWith(this.app.basePath)) {
      throw this.usageError('Refusing to write outside the app directory.');
    }

    try {
      await mkdir(join(filePath, '..'), { recursive: true });
      await writeFile(filePath, content, { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw this.usageError(`${relative(this.app.basePath, filePath)} already exists.`);
      }
      throw error;
    }

    this.output.success(`Created ${relative(this.app.basePath, filePath)}`);
  }
}
