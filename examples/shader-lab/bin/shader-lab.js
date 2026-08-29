#!/usr/bin/env node
import { run } from '@mudah-cli/mudah';

const argv = process.argv.slice(2);
process.exitCode = await run({ argv: argv.length === 0 ? ['play'] : argv });
