import { Command } from '@mudah-cli/console';
import { CORE_VERSION, gatePlugin, t, type PluginInfo } from '@mudah-cli/core';

/**
 * Built-in `audit` — warn on deprecated plugins and peer-range mismatches.
 * No CVE database; this is a local compatibility / deprecation check.
 */
export default class AuditCommand extends Command {
  signature = 'audit';
  description = 'Check plugins for deprecation and peer mismatches';

  async handle() {
    const plugins = typeof this.app.plugins === 'function' ? this.app.plugins() : [];
    let warnings = 0;

    for (const warning of this.app.pluginWarnings()) {
      this.output.warn(warning);
      warnings += 1;
    }

    for (const plugin of plugins as PluginInfo[]) {
      if (plugin.deprecated) {
        const reason = typeof plugin.deprecated === 'string' && plugin.deprecated.length > 0 ? `: ${plugin.deprecated}` : '';
        this.output.warn(`${plugin.name} is deprecated${reason}`);
        warnings += 1;
      }
      const gate = gatePlugin(plugin, { coreVersion: CORE_VERSION });
      if (!gate.ok && gate.reason) {
        this.output.warn(gate.reason);
        warnings += 1;
      }
    }

    if (warnings === 0) this.output.success(t('audit.clean'));
  }
}
