# Contributing to orphan-files

How to work on the CLI, the library and the GitHub Action. For what the tool does and how to use it, see the [README](README.md).

## Getting started

Prerequisites: Node.js version from `.nvmrc` (`lts/krypton`). The package supports `node >= 20.12.0`; CI tests on Node 20, 22 and 24.

```bash
git clone https://github.com/piecioshka/orphan-files
cd orphan-files
npm install
```

Run the CLI from the checkout:

```bash
node bin/orphan-files.js
node bin/orphan-files.js /path/to/project --format json
```

## Scripts

| Script                 | What it does                    |
| ---------------------- | ------------------------------- |
| `npm test`             | Runs the Vitest suite once      |
| `npm run test:watch`   | Runs Vitest in watch mode       |
| `npm run format`       | Formats the repo with Prettier  |
| `npm run format:check` | Checks formatting with Prettier |

Coverage: `npx vitest run --coverage`. `vitest.config.js` sets a 100% threshold for statements, branches, functions and lines in `lib/` and `index.js`.

## Project structure

```
bin/orphan-files.js        - CLI entry (shebang + call into lib/cli.js)
index.js                   - library entry, public API
types/index.d.ts           - type declarations for the API
lib/cli.js                 - argument parsing (minimist), commands, exit codes
lib/config.js              - config discovery (orphan-files.config.{js,mjs,cjs,json})
lib/scanner.js             - globbing, .gitignore handling
lib/parser.js              - Babel AST parsing, import extraction
lib/resolver.js            - specifier resolution, tsconfig paths and baseUrl
lib/analyzer.js            - entry points, framework detection, reachability walk
lib/baseline.js            - baseline read/write
lib/report.js              - cli, json, sarif, pdf and graph output
action.yml                 - composite GitHub Action
.github/actions/pr-comment.mjs - pull request comment step of the Action
tests/                     - Vitest tests
tests/fixtures/            - sample projects used by the tests
scripts/demo.tape          - VHS script for docs/demo.gif
docs/comparison.md         - comparison with other tools
```

The repo checks itself: `orphan-files.config.js` keeps `tests/fixtures/**` as exceptions, because fixture files are intentionally not imported anywhere.

## Demo GIF

`docs/demo.gif` is recorded with [VHS](https://github.com/charmbracelet/vhs) from `scripts/demo.tape`:

```bash
vhs scripts/demo.tape
```

The tape needs `orphan-files` on `PATH` and a prepared demo project in `/tmp/orphan-files-demo`.

## CI

`.github/workflows/ci.yml` runs on every push and pull request:

- `format` - `npm run format:check` on the Node version from `.nvmrc`;
- `test` - `npm test` on Node 20, 22 and 24;
- `action-self-test` - runs the composite Action (`uses: ./`) against this repository in `cli` and `json` mode, checks its outputs and checks that the comment step degrades without a token.

## Releasing

1. `npm version <patch|minor|major>` - the `postversion` hook regenerates `CHANGELOG.md` with auto-changelog, amends the version commit and moves the tag.
2. Publish a GitHub release for the `vX.Y.Z` tag. `.github/workflows/release.yml` then moves the major tag (`v1`) to it, so `piecioshka/orphan-files@v1` in users' workflows picks up the new version.

## Conventions

- Prettier with `proseWrap: never`; run `npm run format:check` before committing.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `style:`, `chore:`), scoped where it helps (`feat(action):`).
- Plain hyphens only, no em dashes in docs.
