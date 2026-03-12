"use strict";

throw new Error(
  'edict-lang is ESM-only. To use it:\n' +
  '  1. Add "type": "module" to your package.json\n' +
  '  2. Use "import" instead of "require()":\n' +
  '     import { check, compile, run } from "edict-lang";\n' +
  '\n' +
  'Alternatively, use dynamic import() in CommonJS:\n' +
  '     const edict = await import("edict-lang");'
);
