# tone

Live sine through the OS mixer for [`@mudah-cli/audio`](../../packages/audio). Kitty cannot carry PCM. This example writes to PipeWire / Pulse / ALSA (or stays silent in CI).

## Run

```sh
cd examples/tone
node bin/tone.js
```

Needs a TTY. Ghostty, Kitty, and WezTerm get real key-up on space.

## Controls

| Key | Action |
| --- | --- |
| `space` (hold) | Raise pitch and level. Release drops them. Without key-up, space toggles. |
| `1` | Queue a short blip over the sine. |
| `esc` | Quit |

The HUD line shows the backend (`native`, `spawn (pw-play)`, or `silent`).
