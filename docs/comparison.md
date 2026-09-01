# orphan-files vs. alternatives

A detailed comparison of tools for finding unused ("orphan") files in JavaScript/TypeScript projects.

> Data current as of **2026-09-01**. Versions, publish dates, weekly downloads and repository
> status come from the npm registry (`registry.npmjs.org`), the npm downloads API and the GitHub API.
> Download counts are approximate and change over time.

---

## TL;DR

- **`orphan-files`** sits in a narrow category: it finds **whole unused files** through a **true
  reachability analysis** of the import graph (BFS from entry points). The key property: two dead
  islands of files that only import each other **do not mask each other** — neither is reachable from
  an entry point, so both are reported.
- Tools that do the **same job** (whole files + reachability + standalone CLI) are few:
  **[knip](https://www.npmjs.com/package/knip)** (the de-facto standard, but much broader in scope),
  **[rev-dep](https://www.npmjs.com/package/rev-dep)**, **[skott](https://www.npmjs.com/package/skott)**,
  plus the deprecated/abandoned `unimported`, `deadfile`, `next-unused` and `orphan`.
- Most other tools are a **different category**: unused _exports/symbols_
  (`ts-unused-exports`, `find-unused-exports`, `tsr`), _local dead code_ (`dead-code-checker`),
  _dependencies_ (`depcheck`), _imports_ (`eslint-plugin-unused-imports`) or _graph visualisation_
  (`madge`). They are complementary, not substitutes for whole-file detection.
- Bundler plugins (`webpack-*`, `vite-plugin-unused-code`, `rollup-plugin-unused`, `unplugin-slim`)
  require **running a build** — a fundamental difference from a static CLI.
- **What's unique about `orphan-files`**: it is the only _file-level_ tool that combines
  **SARIF + PDF + baseline + `--why` + graph export (mermaid/dot/html) + framework auto-detection +
  a composite GitHub Action** in one place.

---

## Legend

| Detects          | Meaning                                          |
| ---------------- | ------------------------------------------------ |
| 🗂️ **Files**     | whole unused ("orphan") files                    |
| 🔣 **Exports**   | unused exported symbols (functions, types)       |
| 🧩 **Imports**   | unused `import` statements in a file             |
| 📦 **Deps**      | unused packages in `package.json`                |
| 💀 **Dead code** | unused local functions/variables                 |
| 🕸️ **Graph**     | dependency-graph visualisation / cycle detection |

**File-analysis model:**

- **Reachability** — graph traversal from entry points; also catches dead islands.
- **`importedBy=0` heuristic** — a file is "unused" only if nothing imports it; **does not** catch
  mutually-importing islands cut off from entry points.
- **Isolated nodes** — same as above, in graph tools (orphan nodes).
- **Textual** — string search, no AST/graph (brittle).

---

## Reference card: `orphan-files`

| Feature                         | Value                                                                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Detects                         | 🗂️ Files                                                                                                                                              |
| Analysis model                  | **Reachability** (BFS from entry points; dead islands don't mask each other)                                                                          |
| Parser                          | Babel (AST) — JSX, TS, decorators (Angular/NestJS/TypeORM/MobX), top-level await, import attributes                                                   |
| Recognised imports              | `import`, `require`, dynamic `import()` (+ template literal as a glob), `import.meta.glob`, `jest.mock`/`vi.mock`, `export * from`, `export {x} from` |
| TypeScript                      | ✅ `tsconfig` `paths` + `baseUrl` aliases                                                                                                             |
| Monorepo / workspaces           | ✅ honours each package's `package.json` entry points                                                                                                 |
| Framework auto-detection        | Next.js (`app/**/page.tsx`, `route.ts`, `layout.tsx`, `middleware.ts`, `sitemap.ts`…), Vite, Storybook (`*.stories`), Remotion                        |
| Entry points                    | `package.json` (`main`/`module`/`exports`/`bin`/`types`), framework conventions, tests, configs, `index` barrels, user config                         |
| Auto-fix / deletion             | ✅ `--fix` (dry-run), `--force` (actually delete)                                                                                                     |
| Output formats                  | **`cli`, `json`, `sarif`, `pdf`**                                                                                                                     |
| Graph export                    | ✅ `--graph mermaid` / `dot` / `html`                                                                                                                 |
| Baseline (incremental adoption) | ✅ `--update-baseline` / `--baseline`                                                                                                                 |
| Explainability                  | ✅ `--why <file>` — why a file is kept or unused                                                                                                      |
| CI                              | SARIF → "Code scanning" tab, composite **GitHub Action** (`piecioshka/orphan-files@v1`), `--max-unused`, exit code 1                                  |
| Other                           | honours `.gitignore`, `--sort`, `--group`, `--init`                                                                                                   |
| Version / status                | 1.0.0 — new, MIT, Node ≥ 20.12                                                                                                                        |

---

## A. Direct competitors — whole-file detection (standalone CLI)

This is the real "same category". Ordered roughly by usefulness in 2026.

| Tool                                                                           | Detects      | File model                  | TS      | Monorepo         | Auto-delete                        | Formats                                                 | Version (date)    | Downloads/wk | Status                           |
| ------------------------------------------------------------------------------ | ------------ | --------------------------- | ------- | ---------------- | ---------------------------------- | ------------------------------------------------------- | ----------------- | ------------ | -------------------------------- |
| **`orphan-files`**                                                             | 🗂️           | **Reachability**            | ✅      | ✅               | ✅ `--fix`/`--force`               | cli, **json, sarif, pdf**                               | 1.0.0             | new          | **active**                       |
| **[knip](https://www.npmjs.com/package/knip)**                                 | 🗂️🔣📦       | **Reachability**            | ✅      | ✅ (strong)      | ✅ (files: `--allow-remove-files`) | json, markdown, codeowners, codeclimate, github-actions | 6.34.0 (2026-08)  | ~14.3M       | **active — market standard**     |
| **[rev-dep](https://www.npmjs.com/package/rev-dep)**                           | 🗂️🔣🕸️📦     | **Reachability**            | ✅      | ✅ (first-class) | ✅ `config run --fix`              | json, text                                              | 3.0.0 (2026-08)   | ~55k         | **most actively developed**      |
| **[skott](https://www.npmjs.com/package/skott)**                               | 🗂️🕸️📦       | **Reachability**            | ✅      | ✅ (partial)     | ❌                                 | webapp, json, mermaid                                   | 0.35.11 (2026-04) | ~91k         | active                           |
| **[deadfile](https://www.npmjs.com/package/deadfile)**                         | 🗂️           | **Reachability**            | ⚠️ weak | ❌               | ❌                                 | console, HTML report, json                              | 2.1.1 (2024-03)   | ~1k          | inactive ~2 yrs                  |
| **[dead-files](https://www.npmjs.com/package/dead-files)**                     | 🗂️           | ⚠️ `importedBy=0` heuristic | ✅      | ❌               | ✅ interactive                     | json                                                    | 0.1.2 (2026-03)   | ~7           | new, niche                       |
| **[next-unused](https://www.npmjs.com/package/next-unused)**                   | 🗂️ (Next.js) | Reachability (from `pages`) | ⚠️      | ❌               | ❌                                 | console                                                 | 0.0.6 (2021-03)   | ~17.5k       | **archived → knip**              |
| **[unimported](https://www.npmjs.com/package/unimported)**                     | 🗂️📦         | Reachability                | ✅      | ❌               | ✅ `--fix`                         | console                                                 | 1.31.1 (2023-11)  | ~114k        | **archived + deprecated → knip** |
| **[delete-react-zombies](https://www.npmjs.com/package/delete-react-zombies)** | 🗂️ (React)   | ⚠️ Textual (brittle)        | ❓      | ❌               | ✅ `--force`                       | none                                                    | 2.0.1 (2022-04)   | ~53          | dead                             |
| **[orphan](https://www.npmjs.com/package/orphan)**                             | 🗂️           | basic (entry + globs)       | ❌      | ❌               | ❌                                 | none                                                    | 1.0.0 (2016-10)   | ~1           | dead (since 2016)                |

### Per-tool notes

- **knip** — the most serious competitor and a functional superset: files **+** exports **+**
  dependencies, ~155 framework plugins, excellent monorepo support, auto-fix, many reporters.
  It's where the authors of `unimported`, `next-unused`, `tsr` and `depcheck` redirect users.
  **What it lacks that `orphan-files` has:** native **SARIF**, **PDF**, the **`--why`** command, graph
  export (mermaid/dot/html) as a built-in, and a ready-made composite GitHub Action. In return, knip
  has a heavier configuration surface and needs Node ≥ 20.19. **Positioning:** `orphan-files` is a
  lighter, focused "files only, but with rich CI/reporting I/O" alternative (SARIF/PDF/baseline/why).
- **rev-dep** — written in Go, very fast; reachability + file auto-deletion + architecture-boundary
  enforcement + first-class monorepo. Closest to `orphan-files` in philosophy (reachability + fix),
  but **no** SARIF/PDF/graph and a more "engineering-heavy" config. A real, growing competitor.
- **skott** — strong on **graph visualisation** (web app, mermaid) + reachability + cycles, but does
  **not** delete files and does not analyse exports. Complementary: good for exploration, weaker for
  "clean up and fail CI".
- **deadfile** — does a true entry-point traversal (better on dead islands than `dead-files`), has a
  nice HTML report, but effectively unmaintained since 2024, weak TS support (no `tsconfig paths`),
  no monorepo, no auto-deletion.
- **dead-files** — a paradox: the only one here with interactive deletion, but the **weakest model** —
  an `importedBy=0` heuristic (regex, not AST) that **misses dead islands**. Negligible adoption, no repo.
- **next-unused** / **unimported** / **orphan** — historical, **abandoned**; the first two explicitly
  redirect to `knip`. `unimported` still sees ~114k downloads/wk (legacy in pipelines).
- **delete-react-zombies** — text search for `import ${name}`; brittle (misses dynamic imports,
  aliases, barrels), React components only, dead since 2022.

---

## B. Graph tools (visualisation + orphan files as a side effect)

| Tool                                             | Detects | File model                                 | Visualisation                 | Auto-fix | Version           | Downloads/wk | Status              |
| ------------------------------------------------ | ------- | ------------------------------------------ | ----------------------------- | -------- | ----------------- | ------------ | ------------------- |
| **[madge](https://www.npmjs.com/package/madge)** | 🕸️🗂️    | ⚠️ isolated nodes (`--orphans`/`--leaves`) | dot, svg/png (Graphviz), json | ❌       | 8.0.0 (2024-08)   | **~3.0M**    | stable, slow-moving |
| **[skott](https://www.npmjs.com/package/skott)** | 🕸️🗂️📦  | Reachability                               | webapp, mermaid, json         | ❌       | 0.35.11 (2026-04) | ~91k         | active              |

- **madge** — a popularity giant (~2.5M/wk, often a dependency of other tools). But `--orphans`
  only reports **isolated nodes** (nothing imports them), **not** code unreachable from entry points —
  so it **misses dead islands**. No export analysis, no auto-deletion, visualisation needs Graphviz.
  A different goal (drawing the graph), not cleanup.

---

## C. Different category — unused EXPORTS / DEAD CODE (not whole files)

These work at the **symbol** level, not whole files — **complementary**, not competing.

| Tool                                                                         | Detects | Whole files?                     | Auto-fix     | TS      | Version          | Downloads/wk | Status                     |
| ---------------------------------------------------------------------------- | ------- | -------------------------------- | ------------ | ------- | ---------------- | ------------ | -------------------------- |
| **[tsr](https://www.npmjs.com/package/tsr)** (TypeScript Remove)             | 🔣🗂️💀  | ✅ + removes                     | ✅ `--write` | TS only | 1.3.4 (2025-01)  | ~12.7k       | **archived → knip**        |
| **[ts-unused-exports](https://www.npmjs.com/package/ts-unused-exports)**     | 🔣      | ⚠️ `--findCompletelyUnusedFiles` | ❌           | ✅      | 11.0.1 (2024-11) | ~268k        | moderate (no release ~2yr) |
| **[find-unused-exports](https://www.npmjs.com/package/find-unused-exports)** | 🔣      | ❌                               | ❌           | ✅      | 9.0.0 (2026-06)  | ~6.5k        | active (freshest)          |
| **[dead-code-checker](https://www.npmjs.com/package/dead-code-checker)**     | 💀      | ❌                               | ❌           | ✅      | 1.1.0 (2025-07)  | ~1.6k        | niche, maintained          |

- **tsr** is notable: the only one in this group that operates on whole files **and** deletes them
  (tree-shaking for source) — but the project is **ended/archived** (LINE redirects to `knip`).
- **ts-unused-exports** — the most popular "export checker"; has a flag that reports files where
  **all** exports are unused (partial "whole file" coverage), but it doesn't delete and has no JSON/SARIF.
- **dead-code-checker** — looks for unused functions/variables (not files, not dependencies).

---

## D. Dependencies and imports (entirely different scope)

| Tool                                                                                           | Detects | Mode                      | Auto-fix          | Version         | Downloads/wk | Status   |
| ---------------------------------------------------------------------------------------------- | ------- | ------------------------- | ----------------- | --------------- | ------------ | -------- |
| **[eslint-plugin-unused-imports](https://www.npmjs.com/package/eslint-plugin-unused-imports)** | 🧩      | static (ESLint, no build) | ✅ `eslint --fix` | 4.4.1 (2026-02) | **~9.6M**    | dominant |
| **[depcheck](https://www.npmjs.com/package/depcheck)**                                         | 📦      | heuristic                 | ❌                | 1.4.7 (2023-10) | ~1.68M       | archived |

- **eslint-plugin-unused-imports** — huge adoption, auto-fix, but detects **imports only**, not whole
  files. Great **alongside** `orphan-files`, not instead of it.
- **depcheck** — `package.json` dependencies only; no files, no monorepo, no fix; its README
  recommends `knip`.

---

## E. Bundler plugins — require running a build

A fundamental difference: they analyse the module graph **from a compilation**, so you must run the
bundler. `orphan-files` works **statically**, with no build.

| Tool                                                                                         | Integration             | Detects | Needs build | Auto-fix | Version          | Downloads/wk | Status                |
| -------------------------------------------------------------------------------------------- | ----------------------- | ------- | ----------- | -------- | ---------------- | ------------ | --------------------- |
| **[webpack-deadcode-plugin](https://www.npmjs.com/package/webpack-deadcode-plugin)**         | Webpack                 | 🗂️🔣    | ✅          | ❌       | 0.1.17 (2022-07) | ~61.5k       | dead                  |
| **[unused-files-webpack-plugin](https://www.npmjs.com/package/unused-files-webpack-plugin)** | Webpack                 | 🗂️      | ✅          | ❌       | 3.4.0 (2018-03)  | ~17.9k       | dead                  |
| **[webpack-unused](https://www.npmjs.com/package/webpack-unused)**                           | Webpack CLI (`--json`)  | 🗂️      | ✅          | ❌       | 0.1.0 (2016-08)  | ~1.6k        | dead                  |
| **[vite-plugin-unused-code](https://www.npmjs.com/package/vite-plugin-unused-code)**         | Vite/Rollup             | 🗂️🔣    | ✅          | ❌       | 0.1.8 (2026-03)  | ~12.3k       | active\*              |
| **[rollup-plugin-unused](https://www.npmjs.com/package/rollup-plugin-unused)**               | Rollup                  | 🗂️      | ✅          | ❌       | 0.1.1 (2021-12)  | ~2.25k       | dead                  |
| **[unplugin-slim](https://www.npmjs.com/package/unplugin-slim)**                             | unplugin (all bundlers) | 📦🗂️    | ✅          | ❌       | 0.2.1 (2026-04)  | ~6           | new, niche (repo 404) |

\* `vite-plugin-unused-code`: in **Vite 8+** unused exports will no longer be reported
(Rolldown tree-shaking); file detection remains.

---

## F. Differentiation matrix — `orphan-files` vs. the rest

| Feature                         | orphan-files | knip        | rev-dep | skott | madge | unimported | dead-files |
| ------------------------------- | ------------ | ----------- | ------- | ----- | ----- | ---------- | ---------- |
| Whole unused files              | ✅           | ✅          | ✅      | ✅    | ⚠️    | ✅         | ✅         |
| Reachability (dead islands)     | ✅           | ✅          | ✅      | ✅    | ❌    | ✅         | ❌         |
| AST (not regex)                 | ✅ Babel     | ✅          | ✅      | ✅    | ✅    | ✅         | ❌ regex   |
| Auto-deletion                   | ✅           | ✅          | ✅      | ❌    | ❌    | ✅         | ✅         |
| **SARIF**                       | ✅           | ❌          | ❌      | ❌    | ❌    | ❌         | ❌         |
| **PDF**                         | ✅           | ❌          | ❌      | ❌    | ❌    | ❌         | ❌         |
| **`--why` (explainability)**    | ✅           | partial     | partial | ❌    | ❌    | ❌         | ❌         |
| Graph export (mermaid/dot/html) | ✅           | ❌          | ❌      | ✅    | ✅    | ❌         | ❌         |
| Baseline (incremental adoption) | ✅           | ✅          | ❓      | ❌    | ❌    | ❌         | ❌         |
| Framework auto-detection        | ✅ (a few)   | ✅✅ (~155) | ✅      | ✅    | ❌    | ⚠️         | ✅         |
| Composite GitHub Action         | ✅           | ❌          | ❌      | ❌    | ❌    | ❌         | ❌         |
| Exports/symbols                 | ❌           | ✅          | ✅      | ❌    | ❌    | ❌         | ❌         |
| Dependencies                    | ❌           | ✅          | ✅      | ✅    | ❌    | ✅         | ❌         |
| Monorepo                        | ✅           | ✅✅        | ✅✅    | ✅    | ❓    | ❌         | ❌         |

---

## G. Where `orphan-files` wins, and where it loses

**Wins (unique or rare strengths):**

- **Richest I/O for CI in its class:** the only _file-level_ tool that ships **SARIF** (Code scanning
  tab), **PDF**, **JSON** and a ready **composite GitHub Action** all at once. knip/rev-dep/skott have
  neither SARIF nor PDF.
- **`--why <file>`** — explains why a file is kept or considered dead (debugging false positives).
  Rare in this category.
- **Built-in graph export** (mermaid/dot/html) together with dead-file detection in one tool — knip
  doesn't have this; madge/skott don't delete files.
- **Light and focused:** does one thing (files) well, with reachability and AST, without knip's config
  weight and without requiring Node ≥ 20.19.

**Loses / gaps vs. the leaders:**

- **Scope:** knip and rev-dep additionally detect **exports** and **dependencies** in one pass.
  `orphan-files` deliberately does files only — less in a single tool.
- **Framework plugins:** knip has ~155; `orphan-files` has a handful of auto-detections
  (Next/Vite/Storybook/Remotion). Exotic frameworks may need manual config.
- **Adoption / maturity:** knip (~14.3M/wk) and madge (~3.0M/wk) are ecosystems; `orphan-files` is new
  (1.0.0), so less battle-tested and a smaller community.
- **Speed:** rev-dep (Go) claims a performance edge on very large codebases (Babel is slower than
  native Go — though that's the author's claim, not an independent benchmark).

---

## H. Positioning — one sentence

> **`orphan-files`** is a lightweight, focused "unused files only, done properly" tool: true
> reachability (dead islands don't mask each other) + AST + auto-fix, wrapped in **the richest
> CI/reporting output in its class (SARIF, PDF, baseline, `--why`, graph, GitHub Action)**.
> A natural alternative for those who find `knip` too broad, yet want more than the abandoned
> `unimported`/`deadfile` — especially when GitHub Code Scanning (SARIF) integration or a PDF report
> matters.

---

## Status sources (summary)

- **Active:** knip (6.34.0, 2026-08), rev-dep (3.0.0, 2026-08), skott (0.35.11, 2026-04),
  find-unused-exports (9.0.0, 2026-06), vite-plugin-unused-code (0.1.8, 2026-03),
  eslint-plugin-unused-imports (4.4.1, 2026-02), dead-code-checker (1.1.0, 2025-07).
- **Stable, slow-moving:** madge (8.0.0, 2024-08), ts-unused-exports (11.0.1, 2024-11).
- **Archived / deprecated (redirect to `knip`):** unimported, next-unused, tsr, depcheck.
- **Dead / abandoned:** deadfile (2024), dead-files (niche), orphan (2016),
  delete-react-zombies (2022), webpack-deadcode-plugin (2022), unused-files-webpack-plugin (2018),
  webpack-unused (2016), rollup-plugin-unused (2021), unplugin-slim (repo 404).
