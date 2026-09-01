import { describe, expect, it } from 'vitest';
import { Column, Toolbar } from '@mudah-cli/tui';
import { TestTui } from '@mudah-cli/testing';

describe('Toolbar', () => {
  function make(onSelect?: (id: string) => void): Toolbar {
    return new Toolbar({
      items: [
        { id: 'run', label: 'Run', icon: '▶', shortcut: 'r', onSelect: () => onSelect?.('run') },
        { id: 'stop', label: 'Stop', icon: '■', shortcut: 's', onSelect: () => onSelect?.('stop') },
      ],
      onSelect,
    });
  }

  it('snapshot contains a label', () => {
    const tui = TestTui.mount(new Column().add(make()), { cols: 40, rows: 4 });
    expect(tui.snapshot()).toContain('Run');
    expect(tui.snapshot()).toContain('Stop');
  });

  it('enter selects the cursor item', () => {
    let picked: string | undefined;
    const toolbar = make((id) => {
      picked = id;
    });
    const tui = TestTui.mount(new Column().add(toolbar), { cols: 40, rows: 4 });
    tui.send('enter');
    expect(picked).toBe('run');
    expect(toolbar.result).toBe('run');
  });

  it('click selects the item under the pointer', () => {
    let picked: string | undefined;
    const toolbar = make((id) => {
      picked = id;
    });
    const tui = TestTui.mount(new Column().add(toolbar), { cols: 40, rows: 4 });
    tui.send('right');
    expect(toolbar.selectedId).toBe('stop');
    tui.click(1, 0);
    expect(picked).toBe('run');
    expect(toolbar.result).toBe('run');
  });

  it('inspect reports the toolbar role and selected id', () => {
    const toolbar = make();
    expect(toolbar.inspect()).toEqual({ role: 'toolbar', name: 'Run', value: 'run' });
    expect(toolbar.focusable).toBe(true);
  });
});
