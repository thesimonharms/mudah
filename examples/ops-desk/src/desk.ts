import {
  Column,
  Form,
  FuzzyList,
  HelpFooter,
  Overlay,
  Panel,
  Screen,
  Sparkline,
  Split,
  Stack,
  StatusBar,
  Table,
  Viewport,
  keys,
  type Layout,
} from '@mudah-cli/mudah/tui';
import { ENVIRONMENTS, LOAD, flagSchema, fleet, type ServiceRow } from './data.js';

export interface DeskState {
  env: string;
  canary: boolean;
  region: string;
  lastNote: string;
  services: ServiceRow[];
}

/** Full-screen ops desk: dashboard + palette + stacked screens. */
export class OpsDesk {
  readonly state: DeskState;
  readonly overlay: Overlay;
  private readonly stack = new Stack();
  private readonly table: Table;
  private readonly summary: Panel;

  constructor(initial?: Partial<DeskState>) {
    this.state = {
      env: initial?.env ?? 'staging',
      canary: initial?.canary ?? false,
      region: initial?.region ?? 'iad',
      lastNote: initial?.lastNote ?? '',
      services: initial?.services ?? fleet(),
    };

    this.table = new Table(
      [
        { header: 'service' },
        { header: 'env' },
        { header: 'status', align: 'right' },
      ],
      this.rows(),
      (_index, row) => {
        this.overlay.toast(row[0] ?? '');
      },
    );
    this.summary = new Panel('Fleet', this.sidebar());

    const home = new Column().add(
      new StatusBar(() => [
        'ops-desk',
        this.state.env,
        this.state.canary ? 'canary' : 'stable',
        this.state.region,
      ]),
      new Split({ axis: 'horizontal', ratio: 0.34 }).add(
        new Column().add(this.summary, new Sparkline(LOAD)),
        new Viewport(this.table, 12),
      ),
      new HelpFooter({ ...keys.table, ...keys.split, ...keys.overlay, escape: 'quit' }),
    );

    this.stack.push(home);
    this.overlay = new Overlay(this.stack);
    this.overlay.setPalette(
      [
        { id: 'ship', label: 'Ship a release' },
        { id: 'env', label: 'Switch environment' },
        { id: 'flags', label: 'Edit feature flags' },
        { id: 'find', label: 'Find a service' },
        { id: 'help', label: 'Keys' },
      ],
      (id) => this.open(id),
    );
  }

  get root(): Layout {
    return this.overlay;
  }

  private rows(): string[][] {
    return this.state.services.map((s) => [s.name, s.env, s.status]);
  }

  private sidebar(): string[] {
    const up = this.state.services.filter((s) => s.status === 'healthy').length;
    return [
      `${this.state.services.length} services`,
      `${up} healthy`,
      `env ${this.state.env}`,
      this.state.lastNote ? `note ${this.state.lastNote}` : 'no ship yet',
      '',
      'ctrl+k  palette',
      'esc     back / quit',
    ];
  }

  private refresh(): void {
    this.table.setRows(this.rows());
    this.summary.setBody(this.sidebar());
  }

  private open(id: string): void {
    if (id === 'help') {
      this.overlay.openModal('Keys', [
        'ctrl+k  palette',
        'esc     close / back',
        'enter   select',
        'drag    split',
      ]);
      return;
    }
    if (id === 'env') this.pushEnv();
    else if (id === 'ship') this.pushShip();
    else if (id === 'flags') this.pushFlags();
    else if (id === 'find') this.pushFind();
  }

  private pushEnv(): void {
    const screen = Screen.picker({ title: 'Environment', items: [...ENVIRONMENTS] });
    screen.onComplete((env) => {
      this.state.env = env;
      this.stack.pop();
      this.refresh();
      this.overlay.toast(`env ${env}`);
    });
    this.stack.push(screen.root);
  }

  private pushShip(): void {
    const names = this.state.services.map((s) => s.name);
    const screen = Screen.wizard({
      title: 'Ship',
      steps: [
        { name: 'env', kind: 'pick', items: [...ENVIRONMENTS] },
        { name: 'targets', kind: 'multi', items: names },
        { name: 'note', kind: 'text', label: 'Note' },
      ],
    });
    screen.onComplete((result) => {
      const env = String(result.env ?? this.state.env);
      const targets = Array.isArray(result.targets) ? (result.targets as string[]) : [];
      const note = String(result.note ?? '');
      this.state.env = env;
      this.state.lastNote = note;
      for (const service of this.state.services) {
        if (targets.includes(service.name)) {
          service.env = env;
          service.status = 'shipping';
        }
      }
      this.stack.pop();
      this.refresh();
      this.overlay.toast(`shipped ${targets.length} to ${env}`);
    });
    this.stack.push(screen.root);
  }

  private pushFlags(): void {
    const form = Form.fromSchema(flagSchema());
    form.onComplete((values) => {
      this.state.canary = values.canary === true;
      this.state.region = String(values.region ?? this.state.region);
      this.stack.pop();
      this.refresh();
      this.overlay.toast(`flags ${this.state.region}`);
    });
    this.stack.push(form.root);
  }

  private pushFind(): void {
    const names = this.state.services.map((s) => s.name);
    const fuzzy = new FuzzyList(names, (name) => {
      this.stack.pop();
      this.overlay.toast(name);
    });
    this.stack.push(fuzzy);
  }
}
