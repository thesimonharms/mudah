import { ServiceProvider } from '@mudah-cli/mudah';

export default class MinimalAppProvider extends ServiceProvider {
  register(): void {
    this.app.config().merge('app', {
      name: 'minimal',
      env: 'local',
    });
  }
}
