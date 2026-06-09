# orphan-files

<p align="center">
  <img src="assets/logo.svg" width="128" alt="orphan-files logo"/>
</p>

[![cli-available](https://badgen.net/static/cli/available/?icon=terminal)](#cli)
[![node version](https://img.shields.io/node/v/orphan-files.svg)](https://www.npmjs.com/package/orphan-files)
[![npm version](https://badge.fury.io/js/orphan-files.svg)](https://badge.fury.io/js/orphan-files)
[![downloads count](https://img.shields.io/npm/dt/orphan-files.svg)](https://www.npmjs.com/package/orphan-files)
[![size](https://packagephobia.com/badge?p=orphan-files)](https://packagephobia.com/result?p=orphan-files)
[![license](https://img.shields.io/npm/l/orphan-files.svg)](https://piecioshka.mit-license.org)
[![github-ci](https://github.com/piecioshka/orphan-files/actions/workflows/testing.yml/badge.svg)](https://github.com/piecioshka/orphan-files/actions/workflows/testing.yml)

CLI tool for finding unused files in JavaScript/TypeScript projects.

![orphan-files demo](demo/orphan-files.gif)

Analyses the import graph (`import`, `require`, `jest.mock`, `export * from`, etc.) and reports files that are **not reachable from any entry point** — including whole islands of files that only import each other.

## How it works

1. Globs the project for source files (honouring `.gitignore` and your `exclude` patterns).
2. Parses each file with Babel and extracts every import specifier.
3. Resolves each specifier (relative paths, `tsconfig` path aliases, `baseUrl`, `import.meta.glob`).
4. Determines **entry points** — `package.json` (`main`/`module`/`exports`/`bin`/`types`), framework conventions (Next.js, Vite, Storybook, Remotion…), tests, configs, `index`/`main` barrels, and your config.
5. Walks the graph from those entry points; anything it can't reach is unused.

This is a true reachability analysis: two dead files that import each other will **not** mask each other.

## Installation

```bash
npm install -g orphan-files
```

## CLI

```bash
# scan current directory
orphan-files

# scan a specific project
orphan-files /path/to/project

# preview what would be deleted, then actually delete
orphan-files --fix
orphan-files --fix --force

# explain why a file is kept (or unused)
orphan-files --why src/utils/helpers.ts

# CI: machine-readable output (exit code 1 when unused files are found)
orphan-files --format json
orphan-files --format sarif > orphan.sarif

# scaffold a config file
orphan-files --init
```

### Options

| Option                     | Description                                               |
| -------------------------- | --------------------------------------------------------- |
| `-c, --config <path>`      | Config file (default: `orphan-files.config.js`)           |
| `-f, --format <type>`      | Output: `cli`, `json`, `sarif`, `pdf` (default: `cli`)    |
| `--sort <key>`             | Sort unused files: `path`, `name`, `size`                 |
| `--group`                  | Group unused files by directory                           |
| `--why <file>`             | Explain why a file is kept or unused, then exit           |
| `--graph <type>`           | Print the dependency graph: `mermaid`, `dot`, `html`      |
| `--fix`                    | Preview files that would be deleted (dry-run)             |
| `--force`                  | With `--fix`, actually delete the files                   |
| `--baseline <path>`        | Ignore unused files recorded in a baseline file           |
| `--update-baseline [path]` | Write the current unused files as the baseline, then exit |
| `--max-unused <n>`         | Exit `0` when the unused count is at most `<n>`           |
| `--no-gitignore`           | Do not honour `.gitignore`                                |
| `--init`                   | Write a starter config file, then exit                    |
| `-v, --version`            | Print version                                             |
| `-h, --help`               | Show help                                                 |

### Incremental adoption (baseline)

Record the current unused files and fail CI only on **new** ones:

```bash
npx orphan-files --update-baseline        # writes .orphan-files-baseline.json
npx orphan-files --baseline .orphan-files-baseline.json
```

### Visualise the dependency graph

```bash
npx orphan-files --graph mermaid          # paste into a Mermaid renderer
npx orphan-files --graph html > graph.html
```

## Configuration

Create an `orphan-files.config.js` file in your project root:

```js
export default {
  include: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
  exclude: [
    "**/node_modules/**",
    "**/dist/**",
    "**/.next/**",
    "**/storybook-static/**",
  ],
  // Entry points: kept, and everything they import is kept transitively.
  entry: ["src/index.ts"],
  // Also treated as entry points (kept and seed reachability).
  exceptions: [
    "index.{js,ts}",
    "*.config.{js,ts,mjs,cjs}",
    "**/*.test.{js,ts,tsx}",
    "**/*.spec.{js,ts,tsx}",
    "bin/**",
    "scripts/**",
  ],
};
```

Config files may be `.js`, `.mjs`, `.cjs` (default export) or `.json`. Monorepos
are supported: each workspace package's `package.json` entry points are honoured.

### Framework auto-detection

The tool reads `package.json` and automatically adds exceptions for known frameworks:

| Framework     | Detected exceptions                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------- |
| **Next.js**   | `app/**/page.tsx`, `app/**/route.ts`, `app/**/layout.tsx`, `sitemap.ts`, `middleware.ts`, etc. |
| **Storybook** | `**/*.stories.{ts,tsx}`                                                                        |
| **Remotion**  | `remotion.config.*`, `src/index.ts`                                                            |

### TypeScript path aliases

Reads `tsconfig.json` and resolves path aliases automatically (e.g. `@/*` → `src/*`).

## Supported import expressions

- `import '...'` / `import x from '...'`
- `require('...')`
- `import('...')` (dynamic import) — template literals like ``import(`./pages/${name}.js`)`` are matched as a glob
- `import.meta.glob('./dir/*.js')` (Vite)
- `jest.mock('...')` / `vi.mock('...')`
- `export * from '...'` / `export { x } from '...'`

Files using **decorators** (Angular, NestJS, TypeORM, MobX) and other modern
TypeScript syntax are parsed correctly.

## Continuous integration

Run it in CI and fail the build when unused files appear. Upload SARIF to get
inline annotations in the GitHub "Code scanning" tab:

```yaml
# .github/workflows/orphan-files.yml
name: orphan-files
on: [push, pull_request]
jobs:
  unused:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npx orphan-files --format sarif > orphan.sarif
        continue-on-error: true
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: orphan.sarif
```

A reusable composite action is also provided:

```yaml
- uses: piecioshka/orphan-files@v1
  with:
    directory: .
    format: sarif
```

## API

```js
import {
  scanProject,
  extractImports,
  analyze,
  findUnusedFiles,
  explainFile,
} from "orphan-files";

const files = await scanProject("/path/to/project", "**/*.{js,ts}");
const fileImports = {};
for (const file of files) {
  fileImports[file] = extractImports(file);
}

// High-level: graph + entry points + reachability + unused list
const result = analyze(files, fileImports, { projectDir: "/path/to/project" });
console.log(result.unused);
console.log(explainFile(files[0], result, "/path/to/project"));

// Or the simple helper (exceptionPatterns double as entry points):
const unused = findUnusedFiles(files, fileImports, [], "/path/to/project");
console.log(unused);
```

---

## Related packages

### CLI / API

- **[knip](https://www.npmjs.com/package/knip)** — Detects unused files, exports, and dependencies in JS/TS projects; ~150 built-in framework plugins, supports monorepos.
- **[unimported](https://www.npmjs.com/package/unimported)** — Scans a Node.js project and reports unimported files and modules. _(archived March 2024 — author recommends knip)_
- **[dead-files](https://www.npmjs.com/package/dead-files)** — Finds unused files in source code.
- **[deadfile](https://www.npmjs.com/package/deadfile)** — CLI for detecting unused (dead) code in JavaScript projects.
- **[dead-code-checker](https://www.npmjs.com/package/dead-code-checker)** — Finds dead code in JavaScript and TypeScript projects.
- **[tsr](https://www.npmjs.com/package/tsr)** — TypeScript Remove: removes unused code from TypeScript projects (tree-shaking for source files).
- **[ts-unused-exports](https://www.npmjs.com/package/ts-unused-exports)** — Finds exported TypeScript symbols (functions, classes, variables) not imported anywhere in the project.
- **[find-unused-exports](https://www.npmjs.com/package/find-unused-exports)** — CLI and JS API for finding unused ECMAScript module exports.
- **[depcheck](https://www.npmjs.com/package/depcheck)** — Checks unused and missing dependencies in a Node.js project. _(archived June 2025 — author recommends knip)_
- **[orphan](https://www.npmjs.com/package/orphan)** — Finds orphaned (unimported) files in a project.
- **[skott](https://www.npmjs.com/package/skott)** — Automatically builds and visualises the dependency graph, detects disconnected files.
- **[madge](https://www.npmjs.com/package/madge)** — Creates graphs from module dependencies; can identify files with no connections.
- **[rev-dep](https://www.npmjs.com/package/rev-dep)** — Tracks imports, detects unused code, and cleans up dependencies via a fast CLI.
- **[next-unused](https://www.npmjs.com/package/next-unused)** — Finds unused files in Next.js projects.
- **[delete-react-zombies](https://www.npmjs.com/package/delete-react-zombies)** — Finds and removes unimported components in React projects.

### Webpack plugins

- **[webpack-deadcode-plugin](https://www.npmjs.com/package/webpack-deadcode-plugin)** — Detects unused files and unused exports during a Webpack build.
- **[unused-files-webpack-plugin](https://www.npmjs.com/package/unused-files-webpack-plugin)** — Globs all files not compiled by Webpack in a given context.
- **[webpack-unused](https://www.npmjs.com/package/webpack-unused)** — Compares files in `src/` against modules processed by the bundler. See also: [overview on YouTube](https://www.youtube.com/watch?v=8nCz0bHS980).

### Vite / Rollup plugins

- **[vite-plugin-unused-code](https://www.npmjs.com/package/vite-plugin-unused-code)** — Vite/Rollup plugin for detecting unused files and exports.
- **[rollup-plugin-unused](https://www.npmjs.com/package/rollup-plugin-unused)** — Rollup plugin for checking unused files.
- **[unplugin-slim](https://www.npmjs.com/package/unplugin-slim)** — Detects unused dependencies and source files (unplugin).

### ESLint plugins

- **[eslint-plugin-unused-imports](https://www.npmjs.com/package/eslint-plugin-unused-imports)** — Reports and removes unused ES6 imports during linting.

---

## License

[The MIT License](https://piecioshka.mit-license.org) @ 2026
