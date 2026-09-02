import { BaseComponent } from './component.js';
import type { KeyEvent } from '@mudah-cli/terminal';
import { visibleLength } from '@mudah-cli/ui';

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export interface CalendarOptions {
  date?: Date;
  onSelect?: (date: Date) => void;
}

/** A navigable month calendar. Focusable: arrows move the cursor day, enter selects. */
export class Calendar extends BaseComponent {
  cursor: Date;
  selected: Date;
  private readonly onSelect?: (date: Date) => void;

  readonly focusable = true;
  readonly keys = {
    left: 'prev-day',
    right: 'next-day',
    up: 'prev-week',
    down: 'next-week',
    home: 'first-of-month',
    end: 'last-of-month',
    enter: 'select',
    'page-up': 'prev-month',
    'page-down': 'next-month',
  };

  constructor(options: CalendarOptions = {}) {
    super();
    const now = options.date ?? new Date();
    this.cursor = new Date(now);
    this.selected = new Date(now);
    this.onSelect = options.onSelect;
  }

  private daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  }

  private moveDays(days: number): void {
    const d = new Date(this.cursor);
    d.setUTCDate(d.getUTCDate() + days);
    this.cursor = d;
  }

  private moveMonths(months: number): void {
    const d = new Date(this.cursor);
    const day = d.getUTCDate();
    d.setUTCMonth(d.getUTCMonth() + months);
    if (d.getUTCDate() < day) d.setUTCDate(0);
    this.cursor = d;
  }

  confirm(): void {
    this.selected = new Date(this.cursor);
    this.onSelect?.(new Date(this.cursor));
  }

  render(): string[] {
    const year = this.cursor.getUTCFullYear();
    const month = this.cursor.getUTCMonth();
    const day = this.cursor.getUTCDate();
    const start = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const days = this.daysInMonth(year, month);

    const out: string[] = [`${MONTHS[month] ?? '???'} ${year}`, DAYS.map((d) => d.padEnd(3)).join('')];
    const cells: string[] = [];
    for (let i = 0; i < start; i++) cells.push('   ');
    for (let d = 1; d <= days; d++) {
      const num = d.toString().padStart(2);
      cells.push(d === day ? `▸${num}` : ` ${num}`);
    }
    while (cells.length > 0) {
      out.push(cells.splice(0, 7).join(''));
    }
    return out;
  }

  measure(width: number, _height: number): { width: number; height: number } {
    const lines = this.render();
    const content = Math.max(0, ...lines.map((line) => visibleLength(line)));
    return { width: Math.min(width, Math.max(content, 1)), height: lines.length };
  }

  override onKey(event: KeyEvent): boolean {
    switch (event.name) {
      case 'left':
        this.moveDays(-1);
        return true;
      case 'right':
        this.moveDays(1);
        return true;
      case 'up':
        this.moveDays(-7);
        return true;
      case 'down':
        this.moveDays(7);
        return true;
      case 'page-up':
        this.moveMonths(-1);
        return true;
      case 'page-down':
        this.moveMonths(1);
        return true;
      case 'home': {
        const d = new Date(this.cursor);
        d.setUTCDate(1);
        this.cursor = d;
        return true;
      }
      case 'end': {
        const d = new Date(this.cursor);
        d.setUTCDate(this.daysInMonth(d.getUTCFullYear(), d.getUTCMonth()));
        this.cursor = d;
        return true;
      }
      case 'enter':
        this.confirm();
        return true;
      default:
        if (event.ch !== undefined && event.ch >= '0' && event.ch <= '9') {
          this.typeDigit(event.ch);
          return true;
        }
        return false;
    }
  }

  private typed = '';

  private typeDigit(ch: string): void {
    this.typed += ch;
    if (this.typed.length > 8) this.typed = this.typed.slice(-8);
    const year = this.cursor.getUTCFullYear();
    const month = this.cursor.getUTCMonth();
    if (this.typed.length <= 2) {
      const day = Number(this.typed);
      const max = this.daysInMonth(year, month);
      if (day >= 1 && day <= max) {
        const d = new Date(this.cursor);
        d.setUTCDate(day);
        this.cursor = d;
      }
      return;
    }
    if (this.typed.length === 8) {
      const y = Number(this.typed.slice(0, 4));
      const m = Number(this.typed.slice(4, 6));
      const day = Number(this.typed.slice(6, 8));
      if (y >= 1970 && m >= 1 && m <= 12 && day >= 1 && day <= this.daysInMonth(y, m - 1)) {
        this.cursor = new Date(Date.UTC(y, m - 1, day));
        this.typed = '';
      }
    }
  }

  inspect(): { role: string; name?: string; value?: unknown } {
    return {
      role: 'calendar',
      name: `${this.cursor.getUTCFullYear()}-${this.cursor.getUTCMonth() + 1}`,
      value: this.cursor.toISOString(),
    };
  }
}

/**
 * Calendar plus digit typing (`15` jumps to the 15th; `20260901` is YYYYMMDD).
 */
export class DatePicker extends Calendar {
  inspect(): { role: string; name?: string; value?: unknown } {
    const base = super.inspect();
    return { ...base, role: 'datePicker' };
  }
}
