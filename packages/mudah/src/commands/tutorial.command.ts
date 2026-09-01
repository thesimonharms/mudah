import { Command } from '@mudah-cli/console';

interface TutorialStep {
  title: string;
  body: string;
}

const STEPS: readonly TutorialStep[] = [
  {
    title: 'create app',
    body: 'npm create @mudah-cli/mudah my-app && cd my-app && npm install',
  },
  {
    title: 'make command',
    body: 'node bin/my-app.js make command hello\n# or: make tui picker | make plugin audit',
  },
  {
    title: 'TestTui',
    body: "import { TestTui } from '@mudah-cli/mudah/testing';\nconst tui = TestTui.mount(screen.root, { cols: 80, rows: 24 });\ntui.send('down').send('enter');\nexpect(tui.snapshot()).toContain('title');",
  },
  {
    title: 'doctor',
    body: 'node bin/my-app.js doctor\n# prints runtime, manifest, terminal caps, and a TUI dumpTree sample',
  },
];

/**
 * Built-in `tutorial` command: an interactive walkthrough.
 * Non-TTY or `--plain` prints every step and exits.
 */
export default class TutorialCommand extends Command {
  signature = 'tutorial';
  description = 'Interactive walkthrough: create app, make command, TestTui, doctor';

  async handle(): Promise<number> {
    const plain = this.output.mode === 'plain' || process.stdin.isTTY !== true;
    this.output.section('Mudah tutorial');
    if (plain) {
      for (const [i, step] of STEPS.entries()) this.printStep(i, step);
      this.output.success('tutorial complete');
      return 0;
    }

    for (const [i, step] of STEPS.entries()) {
      this.printStep(i, step);
      const more = i < STEPS.length - 1;
      if (more) {
        const ok = await this.confirm('Continue?', true);
        if (!ok) {
          this.output.muted('Stopped. Re-run tutorial to continue.');
          return 0;
        }
      }
    }
    this.output.success('tutorial complete');
    return 0;
  }

  private printStep(index: number, step: TutorialStep): void {
    this.output.line();
    this.output.info(`${index + 1}. ${step.title}`);
    this.output.raw(`${step.body}\n`);
  }
}
