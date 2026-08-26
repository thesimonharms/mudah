# hello-cli

Built with [Mudah](https://github.com/thesimonharms/mudah) — speed, sleek design, and developer ergonomics for the terminal.

## Quick start

```sh
npm install
npm run start        # run the CLI (no args shows help)
npm run dev          # watch mode: re-runs `welcome` on changes
npm test             # in-process command tests via mudah/testing
```

## Structure

- `bin/hello-cli.js` — the executable entrypoint (calls `run()`)
- `mudah.json` — app manifest (name, version, theme, update nudge)
- `src/commands/` — one file per command (`*.command.ts`, default export)
- `src/providers/` — service providers (`register()` → `boot()`)
- `config/` — configuration files merged into `app.config()`

Create a new command:

```sh
node bin/hello-cli.js make command deploy-site
```
