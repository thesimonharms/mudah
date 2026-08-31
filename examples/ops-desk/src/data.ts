import { s } from '@mudah-cli/mudah';

export const ENVIRONMENTS = ['staging', 'production'] as const;
export const REGIONS = ['iad', 'sfo', 'ams'] as const;

export interface ServiceRow {
  name: string;
  env: string;
  status: string;
}

export function fleet(): ServiceRow[] {
  const names = [
    'api-gateway',
    'auth-service',
    'billing-worker',
    'edge-cache',
    'mail-sender',
    'search-indexer',
    'web-frontend',
    'analytics-sink',
  ];
  return names.map((name, i) => ({
    name,
    env: i % 2 === 0 ? 'production' : 'staging',
    status: i % 5 === 0 ? 'degraded' : 'healthy',
  }));
}

export function flagSchema() {
  return s.object({
    canary: s.boolean().describe('canary'),
    region: s.enum(REGIONS).describe('region'),
  });
}

export const LOAD = [2, 5, 4, 8, 6, 9, 7, 5, 8, 4];
