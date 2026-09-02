/**
 * Tiny message catalog for command descriptions and prompts.
 *
 * Command descriptions can stay English; this ships the API so apps and
 * built-ins can look up a string by key.
 */

export type MessageDict = Record<string, string>;

const catalogs = new Map<string, MessageDict>();
let currentLocale = 'en';

const EN: MessageDict = {
  'cmd.doctor.description': 'Check the runtime, app, and terminal setup',
  'cmd.info.description': 'Show runtime, app, and config information',
  'plugins.none': 'No plugins discovered',
  'plugins.upToDate': 'Plugins are up to date',
  'plugins.listed': '{count} plugin(s)',
  'plugins.reloaded': 'Plugins reloaded',
  'prompt.continue': 'Continue?',
  'cache.empty': 'Cache is empty',
};

/** Merge `dict` into the catalog for `locale` (later keys win). */
export function addMessages(locale: string, dict: MessageDict): void {
  const existing = catalogs.get(locale) ?? {};
  catalogs.set(locale, { ...existing, ...dict });
}

addMessages('en', EN);

/** Switch the active locale. Unknown locales fall back to `en` on lookup. */
export function setLocale(locale: string): void {
  currentLocale = locale;
}

/** Current locale (last value passed to {@link setLocale}). */
export function getLocale(): string {
  return currentLocale;
}

/**
 * Look up `key` in the active locale, then `en`, then return the key.
 * `{name}` placeholders are replaced from `vars`.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const dict = catalogs.get(currentLocale) ?? catalogs.get('en') ?? {};
  const fallback = catalogs.get('en') ?? {};
  let template = dict[key] ?? fallback[key] ?? key;
  if (vars !== undefined) {
    for (const [name, value] of Object.entries(vars)) {
      template = template.replaceAll(`{${name}}`, String(value));
    }
  }
  return template;
}
