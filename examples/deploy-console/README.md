# deploy-console

Example app that uses every Mudah v0.2 and v0.3 feature.

## Quick start

```sh
npm install
node bin/deploy.js --help
node bin/deploy.js deploy --dry-run
node bin/deploy.js db:status --profile
node bin/deploy.js theme
node bin/deploy.js audit:last
node bin/deploy.js dashboard          # full-screen TUI; esc to exit
npm test
```

## What it shows

| Feature | Where |
| --- | --- |
| Config schema validation | `config/deploy.ts` |
| Grouped commands (`deploy:`, `db:`) | `src/commands/` |
| TUI table, panel, viewport, mouse | `dashboard` |
| OSC 10/11 theme query | `theme` |
| `--profile` timings | `db:status --profile` |
| Update nudge | `bin/deploy.js` (`updatePackage`) |
| Plugin from `node_modules` | `@thesimonharms/deploy-audit` → `audit:last` |

The audit plugin lives in [`examples/deploy-audit-plugin`](../deploy-audit-plugin). It declares the `mudah-plugin` keyword. Mudah loads its provider and `audit:last` command from `node_modules` at boot.

## Structure

- `bin/deploy.js` — entrypoint. Passes `updatePackage` so a published app can nudge.
- `mudah.json` — manifest (`theme: auto`, `updates: true`)
- `config/deploy.ts` — schema-validated deploy targets
- `src/commands/` — grouped app commands plus `theme` and `dashboard`
- `src/providers/` — `DeployProvider` merges and re-checks the schema

Create a new command:

```sh
node bin/deploy.js make command deploy-rollback
```
