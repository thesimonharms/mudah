import { ServiceProvider } from '@mudah-cli/mudah';

export default class HelloCliProvider extends ServiceProvider {
  register(): void {
    this.app.config().merge('app', {
      name: 'hello-cli',
      env: 'local',
    });
  }
}
