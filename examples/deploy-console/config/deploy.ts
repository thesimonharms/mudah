import { defineConfig, env, s } from '@mudah-cli/mudah';

/**
 * Deploy targets, validated at boot.
 *
 * A typo in this file fails immediately with every offending key listed,
 * instead of surfacing as `undefined` three layers down.
 */
export default defineConfig(
  s.object({
    defaultEnvironment: s.enum(['staging', 'production'] as const).default('staging'),
    environments: s.object({
      staging: s.object({
        host: s.string().min(1),
        port: s.number().int().min(1).max(65535).default(22),
        replicas: s.number().int().min(1).default(1),
      }),
      production: s.object({
        host: s.string().min(1),
        port: s.number().int().min(1).max(65535).default(22),
        replicas: s.number().int().min(1).default(3),
      }),
    }),
    timeouts: s.object({
      connect: s.number().min(1).default(5),
      drain: s.number().min(1).default(30),
    }),
  }),
  {
    defaultEnvironment: env('DEPLOY_ENV', 'staging'),
    environments: {
      staging: {
        host: env('STAGING_HOST', 'staging.internal'),
        port: env('STAGING_PORT', 22),
        replicas: env('STAGING_REPLICAS', 1),
      },
      production: {
        host: env('PRODUCTION_HOST', 'prod.internal'),
        port: env('PRODUCTION_PORT', 22),
        replicas: env('PRODUCTION_REPLICAS', 3),
      },
    },
    timeouts: {
      connect: env('DEPLOY_CONNECT_TIMEOUT', 5),
      drain: env('DEPLOY_DRAIN_TIMEOUT', 30),
    },
  },
);
