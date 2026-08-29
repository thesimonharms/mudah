# melody

Public-domain tunes through the OS mixer for [`@mudah-cli/audio`](../../packages/audio). Starts with Beethoven's Ode to Joy. Kitty cannot carry PCM. This example writes to PipeWire / Pulse / ALSA (or stays silent in CI).

## Run

```sh
cd examples/melody
node bin/melody.js
```

Needs a TTY.

## Controls

| Key | Action |
| --- | --- |
| `1` | Ode to Joy (Beethoven, 1824) |
| `2` | Twinkle Twinkle Little Star (French folk) |
| `3` | Korobeiniki (Russian folk) |
| `←` `→` | Previous / next tune |
| `space` | Pause or resume |
| `r` | Restart the current tune |
| `esc` | Quit |

Each tune loops. The HUD line shows the backend (`native`, `spawn (pw-play)`, or `silent`) and the current pitch.
