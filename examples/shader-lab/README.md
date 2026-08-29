# shader-lab

Live WGSL playground for [`@mudah-cli/vgpu`](../../packages/vgpu). Three effects blit to the terminal through the Kitty graphics protocol, or unicode half-blocks when the terminal cannot place images.

## Run

```sh
cd examples/shader-lab
node bin/shader-lab.js
```

Needs a TTY. Ghostty, Kitty, and WezTerm get pixel images and real key-up.

## Controls

| Key | Action |
| --- | --- |
| `1` `2` `3` or `←` `→` | Switch shader |
| `space` (hold) | Raise energy. Release drops it. Without key-up, space toggles. |
| `esc` | Quit |

Shaders: Aurora, Tunnel, Phosphor. Each reads a `params` uniform (`time`, `energy`, `width`, `height`).
