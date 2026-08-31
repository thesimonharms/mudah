import { ServiceProvider } from '@mudah-cli/mudah';

export default class OpsDeskProvider extends ServiceProvider {
  register(): void {
    this.app.config().merge('app', {
      name: 'ops-desk',
      env: 'staging',
    });
  }
}
