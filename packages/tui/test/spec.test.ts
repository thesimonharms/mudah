import { describe, expect, it } from 'vitest';
import { s } from '@mudah-cli/config';
import { parseKeys } from '@mudah-cli/terminal';
import {
  Column,
  Form,
  FuzzyList,
  Label,
  List,
  Overlay,
  Screen,
  Sparkline,
  Stack,
  TextInput,
  Tree,
} from '@mudah-cli/tui';
import { TestTui } from '@mudah-cli/testing';

describe('TestTui + Screen.picker', () => {
  it('paints a title and moves the selection', () => {
    const screen = Screen.picker({ title: 'Env', items: ['staging', 'production'] });
    const tui = TestTui.mount(screen.root, { cols: 40, rows: 8 });
    expect(tui.snapshot()).toContain('Env');
    expect(tui.snapshot()).toContain('▸ staging');
    tui.send('down');
    expect(tui.snapshot()).toContain('▸ production');
    tui.send('enter');
    expect(screen.result()).toBe('production');
  });

  it('dumps a JSON tree with a focused list', () => {
    const screen = Screen.picker({ title: 'Env', items: ['a'] });
    const tree = TestTui.mount(screen.root).tree();
    expect(tree.role).toBe('Column');
    expect(tree.children?.some((c) => c.role === 'list' && c.focused)).toBe(true);
  });
});

describe('Screen.wizard', () => {
  it('walks two pick steps', () => {
    const screen = Screen.wizard({
      title: 'Ship',
      steps: [
        { name: 'env', kind: 'pick', items: ['dev', 'prod'] },
        { name: 'ok', kind: 'pick', items: ['yes'] },
      ],
    });
    const tui = TestTui.mount(screen.root);
    tui.send('down').send('enter').send('enter');
    expect(screen.result()).toEqual({ env: 'prod', ok: 'yes' });
  });
});

describe('Screen.dashboard', () => {
  it('renders a split with a table', () => {
    const screen = Screen.dashboard({
      title: 'Ops',
      sidebar: ['8 services'],
      columns: [{ header: 'name' }],
      rows: [['api'], ['web']],
    });
    const snap = TestTui.mount(screen.root, { cols: 60, rows: 16 }).snapshot();
    expect(snap).toContain('Ops');
    expect(snap).toContain('│');
  });
});

describe('TextInput caret and paste', () => {
  it('moves the caret and inserts in the middle', () => {
    const input = new TextInput();
    for (const ch of 'ab') input.onKey({ name: ch, ch });
    input.onKey({ name: 'left' });
    input.onKey({ name: 'x', ch: 'x' });
    expect(input.value).toBe('axb');
    expect(input.cursor).toBe(2);
  });

  it('inserts a bracketed paste', () => {
    const input = new TextInput();
    input.onKey({ name: 'paste', paste: 'hi\nthere' });
    expect(input.value).toBe('hithere');
  });
});

describe('parseKeys paste', () => {
  it('emits a paste event', () => {
    const [event] = parseKeys('\x1b[200~hello\x1b[201~');
    expect(event?.name).toBe('paste');
    expect(event?.paste).toBe('hello');
  });
});

describe('Form.fromSchema', () => {
  it('toggles a boolean and submits', () => {
    const form = Form.fromSchema(
      s.object({
        name: s.string(),
        live: s.boolean(),
        env: s.enum(['dev', 'prod']),
      }),
    );
    const tui = TestTui.mount(form.root);
    tui.send('tab').send('space').send('enter');
    expect(form.result()?.live).toBe(true);
  });
});

describe('Overlay', () => {
  it('consumes escape while a modal is open', () => {
    const overlay = new Overlay(new Column().add(new Label('base')));
    overlay.openModal('Wait', ['ok']);
    expect(overlay.handleKey({ name: 'escape' })).toBe(true);
    expect(overlay.render().join('\n')).toContain('base');
  });

  it('opens a registered palette on ctrl+k', () => {
    const overlay = new Overlay(new Column().add(new Label('base')));
    let picked = '';
    overlay.setPalette([{ id: 'go', label: 'Go now' }], (id) => {
      picked = id;
    });
    overlay.resize(40, 8);
    overlay.handleKey({ name: 'ctrl+k' });
    expect(overlay.render().join('\n')).toContain('Go now');
    overlay.handleKey({ name: 'enter' });
    expect(picked).toBe('go');
  });
});

describe('Stack', () => {
  it('shows the top screen', () => {
    const previous = process.env.MUDAH_REDUCED_MOTION;
    process.env.MUDAH_REDUCED_MOTION = '1';
    const stack = new Stack();
    stack.push(new Label('one'));
    stack.push(new Label('two'));
    stack.resize(10, 3);
    expect(stack.render().join('\n')).toContain('two');
    stack.pop();
    expect(stack.render().join('\n')).toContain('one');
    if (previous === undefined) delete process.env.MUDAH_REDUCED_MOTION;
    else process.env.MUDAH_REDUCED_MOTION = previous;
  });

  it('pops on escape when more than one screen is open', () => {
    const previous = process.env.MUDAH_REDUCED_MOTION;
    process.env.MUDAH_REDUCED_MOTION = '1';
    const stack = new Stack();
    stack.push(new Label('home'));
    stack.push(new List(['a']));
    expect(stack.handleKey({ name: 'escape' })).toBe(true);
    expect(stack.render().join('\n')).toContain('home');
    if (previous === undefined) delete process.env.MUDAH_REDUCED_MOTION;
    else process.env.MUDAH_REDUCED_MOTION = previous;
  });
});

describe('Sparkline Tree FuzzyList', () => {
  it('draws a sparkline', () => {
    expect(new Sparkline([0, 1, 2, 3]).render()[0]?.length).toBe(4);
  });

  it('expands a tree', () => {
    const tree = new Tree([{ label: 'root', children: [{ label: 'leaf' }] }]);
    expect(tree.render().join('\n')).not.toContain('leaf');
    tree.onKey({ name: 'space' });
    expect(tree.render().join('\n')).toContain('leaf');
  });

  it('filters a fuzzy list', () => {
    const fuzzy = new FuzzyList(['alpha', 'beta', 'gamma']);
    const tui = TestTui.mount(fuzzy);
    tui.send('b');
    expect(tui.snapshot()).toContain('beta');
    expect(tui.snapshot()).not.toContain('alpha');
  });

  it('selects the filtered row on enter', () => {
    let picked: string | undefined;
    const fuzzy = new FuzzyList(['alpha', 'beta', 'gamma'], (item) => {
      picked = item;
    });
    TestTui.mount(fuzzy).send('b').send('enter');
    expect(picked).toBe('beta');
  });
});

describe('List mouse', () => {
  it('selects the clicked row', () => {
    const list = new List(['a', 'b', 'c']);
    const tui = TestTui.mount(new Column().add(list));
    tui.click(0, 1);
    expect(list.selectedIndex).toBe(1);
  });
});
