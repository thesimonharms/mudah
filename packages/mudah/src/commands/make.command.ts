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

const TUI_HINT = 'Use: make {command|provider|config|tui} {name}';

const TUI_PICKER = (command: string, className: string): string => `import { Command } from '@mudah-cli/mudah';
import { Program, Screen } from '@mudah-cli/mudah/tui';

export default class ${className} extends Command {
  signature = '${command}';
  description = 'Pick one item';

  async handle(): Promise<number> {
    if (process.stdout.isTTY !== true) {
      this.output.error('This command needs an interactive terminal.');
      return 2;
    }
    const screen = Screen.picker({ title: '${command}', items: ['one', 'two', 'three'] });
    const program = new Program();
    screen.attach(program);
    const code = await program.run();
    const picked = screen.result();
    if (picked) this.output.success(\`Picked \${picked}.\`);
    return code;
  }
}
`;

const TUI_WIZARD = (command: string, className: string): string => `import { Command } from '@mudah-cli/mudah';
import { Program, Screen } from '@mudah-cli/mudah/tui';

export default class ${className} extends Command {
  signature = '${command}';
  description = 'Multi-step wizard';

  async handle(): Promise<number> {
    if (process.stdout.isTTY !== true) {
      this.output.error('This command needs an interactive terminal.');
      return 2;
    }
    const screen = Screen.wizard({
      title: '${command}',
      steps: [
        { name: 'env', kind: 'pick', items: ['staging', 'production'] },
        { name: 'note', kind: 'text', label: 'Note' },
      ],
    });
    const program = new Program();
    screen.attach(program);
    const code = await program.run();
    const result = screen.result();
    if (result) this.output.success(JSON.stringify(result));
    return code;
  }
}
`;

const TUI_DASHBOARD = (command: string, className: string): string => `import { Command } from '@mudah-cli/mudah';
import { Program, Screen } from '@mudah-cli/mudah/tui';

export default class ${className} extends Command {
  signature = '${command}';
  description = 'Full-screen dashboard';

  async handle(): Promise<number> {
    if (process.stdout.isTTY !== true) {
      this.output.error('This command needs an interactive terminal.');
      return 2;
    }
    const screen = Screen.dashboard({
      title: '${command}',
      sidebar: ['esc to quit', 'drag the split'],
      columns: [{ header: 'name' }, { header: 'status' }],
      rows: [['api', 'ok'], ['worker', 'ok']],
    });
    const program = new Program({ mouse: true });
    screen.attach(program);
    return program.run();
  }
}
`;

/**
 * Built-in `make` command: scaffold commands, providers, config files, and TUI recipes.
 */
export default class MakeCommand extends Command {
  signature = 'make {type} {name}';
  description = 'Scaffold a command, provider, config file, or TUI screen';

  async handle() {
    const type = this.arg('type')!;
    const name = this.arg('name')!;

    if (!['command', 'provider', 'config', 'tui'].includes(type)) {
      throw this.usageError(`Unknown make type "${type}".`, TUI_HINT);
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
    } else if (type === 'tui') {
      if (!['picker', 'wizard', 'dashboard'].includes(k)) {
        throw this.usageError(`Unknown TUI recipe "${name}".`, 'Use: make tui {picker|wizard|dashboard}');
      }
      filePath = join(this.app.basePath, 'src', 'commands', `${k}.command.ts`);
      content = k === 'wizard' ? TUI_WIZARD(k, className) : k === 'dashboard' ? TUI_DASHBOARD(k, className) : TUI_PICKER(k, className);
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
