import { describe, expect, it } from 'vitest';
import type { KeyEvent } from '@mudah-cli/terminal';
import { Tabs } from '@mudah-cli/tui';

const key = (name: string): KeyEvent => ({ name, ch: undefined });

describe('Tabs', () => {
  it('shows the active tab content with a header of all tabs', () => {
    const tabs = new Tabs([
      { label: 'Home', content: ['hi'] },
      { label: 'Settings', content: ['set'] },
    ]);
    expect(tabs.render()).toEqual(['[Home][ Settings ]', 'hi']);
  });

  it('switches with left/right, home/end, and clamps', () => {
    const tabs = new Tabs([
      { label: 'Home', content: ['a'] },
      { label: 'Settings', content: ['b'] },
      { label: 'Profile', content: ['c'] },
    ]);
    tabs.onKey(key('right'));
    expect(tabs.selected).toBe(1);
    expect(tabs.render()[0]).toBe('[ Home ][Settings][ Profile ]');
    tabs.onKey(key('right'));
    tabs.onKey(key('right'));
    expect(tabs.selected).toBe(2);
    tabs.onKey(key('left'));
    expect(tabs.selected).toBe(1);
    tabs.onKey(key('home'));
    expect(tabs.selected).toBe(0);
    tabs.onKey(key('end'));
    expect(tabs.selected).toBe(2);
  });

  it('fires onSelect with enter and ignores unknown keys', () => {
    let picked: number | undefined;
    const tabs = new Tabs([{ label: 'a', content: ['x'] }], (i) => {
      picked = i;
    });
    expect(tabs.onKey(key('x'))).toBe(false);
    tabs.onKey(key('enter'));
    expect(picked).toBe(0);
  });

  it('updates content when tabs are replaced', () => {
    const tabs = new Tabs([{ label: 'a', content: ['one'] }]);
    tabs.setTabs([
      { label: 'b', content: ['two'] },
      { label: 'c', content: ['three'] },
    ]);
    expect(tabs.selectedIndex).toBe(0);
    expect(tabs.render()).toEqual(['[b][ c ]', 'two']);
  });
});
