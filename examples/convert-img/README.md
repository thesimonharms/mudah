# @thesimonharms/convert-img

The ultimate image converter — a CLI **and** a full-screen TUI — for **png · jpeg · webp · heic · gif · avif**, built with [Mudah](https://github.com/thesimonharms/mudah).

Zero npm runtime dependencies: the whole framework is bundled into one ~110 kB file. Codecs come from **Bun.Image** (native libjpeg-turbo/spng/libwebp) with automatic fallback to system tools (libheif, ImageMagick, ffmpeg) — detected at startup.

## Run it

```sh
bunx @thesimonharms/convert-img            # full-screen TUI wizard
bunx @thesimonharms/convert-img --help     # command list
```

## CLI

```sh
# One file
convert-img convert photo.heic --to=webp

# A whole directory of files (variadic paths)
convert-img convert *.png --to=webp --quality=90

# Different output directory + suffix
convert-img convert shot.png --to=jpeg --outdir=./out --suffix=-small

# Machine-readable output for scripts
convert-img convert *.heic --to=png --json
```

## TUI

Bare `convert-img` (or `convert` with no paths) opens the wizard:

1. **Select images** — `space` toggles, `a` selects all, `enter` continues
2. **Pick target format** — arrow keys
3. Conversions run concurrently with live per-file status

`esc` cancels at any point.

## Capability matrix

```sh
convert-img formats
```

Shows which formats decode/encode **on your machine** and with which driver, plus the full from → to grid.

| Runtime | Drivers used |
| --- | --- |
| Bun | `Bun.Image` (png/jpeg/webp encode+decode, gif decode) → libheif → ImageMagick → ffmpeg |
| Node ≥ 26 | libheif → ImageMagick → ffmpeg (all system tools, auto-detected) |

HEIC/AVIF need `libheif` on Linux (macOS/Windows handle them natively via `Bun.Image`). GIF encode needs ImageMagick or ffmpeg. When no single tool covers a direction, the planner routes through PNG in two hops (e.g. `heic → png → gif`).

## Notes

- Output lands next to each input (same stem, new extension) unless `--outdir` is given.
- Converting to the same format is skipped with a friendly notice.
- `--plain` strips all ANSI; `--json` emits machine-readable JSON lines plus a final `{ok, results|error}` envelope.

Built with [Mudah](https://github.com/thesimonharms/mudah) — the ergonomic CLI framework.
