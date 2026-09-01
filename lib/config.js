import path from "path";
import fs from "fs";
import { pathToFileURL } from "url";
import { globSync } from "glob";
import { tryResolveFile } from "./resolver.js";

export const DEFAULT_CONFIG = {
  include: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
  exclude: [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/out/**",
    "**/.next/**",
    "**/.nuxt/**",
    "**/.output/**",
    "**/.svelte-kit/**",
    "**/storybook-static/**",
    "**/.storybook/**",
    "**/coverage/**",
    "**/vendor/**",
  ],
  exceptions: [
    "index.{js,ts}",
    "*.config.{js,ts,mjs,cjs}",
    "**/*.test.{js,ts,tsx}",
    "**/*.spec.{js,ts,tsx}",
    "bin/**",
    "scripts/**",
  ],
};

// Files matching these globs always seed reachability — they are entry points
// even when nothing imports them (index/main barrels, ambient types, tests,
// configs). This is what makes orphan islands of mutually-importing dead files
// detectable instead of masking each other.
export const BASELINE_ENTRY_PATTERNS = [
  "index.{js,jsx,ts,tsx,mjs,cjs}",
  "main.{js,jsx,ts,tsx,mjs,cjs}",
  "**/*.d.ts",
  "**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs}",
  "*.config.{js,ts,mjs,cjs}",
];

export function detectFrameworkEntries(projectDir) {
  const pkgPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(pkgPath)) return [];

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  } catch {
    return [];
  }

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const entries = [];

  if (allDeps["next"]) {
    entries.push(
      "next.config.*",
      "next-env.d.ts",
      "middleware.{ts,js}",
      "instrumentation.ts",
      "instrumentation-client.ts",
    );
    const appSpecialFiles = [
      "sitemap.{ts,js}",
      "manifest.{ts,js}",
      "robots.{ts,js}",
      "page.{ts,tsx,js,jsx}",
      "layout.{ts,tsx,js,jsx}",
      "route.{ts,tsx,js}",
      "loading.{ts,tsx,js,jsx}",
      "error.{ts,tsx,js,jsx}",
      "global-error.{ts,tsx,js,jsx}",
      "not-found.{ts,tsx,js,jsx}",
      "template.{ts,tsx,js,jsx}",
      "default.{ts,tsx,js,jsx}",
      "opengraph-image.{ts,tsx}",
      "twitter-image.{ts,tsx}",
      "icon.{ts,tsx}",
    ];
    for (const dir of ["app", "src/app"]) {
      for (const f of appSpecialFiles) entries.push(`${dir}/**/${f}`);
    }
    entries.push("pages/**", "src/pages/**");
  }

  if (
    Object.keys(allDeps).some(
      (k) => k === "storybook" || k.startsWith("@storybook/"),
    )
  ) {
    entries.push("**/*.stories.{js,ts,tsx,jsx,mjs}");
  }

  if (allDeps["remotion"] || allDeps["@remotion/core"]) {
    entries.push("remotion.config.*", "src/index.{ts,tsx,js,jsx}");
  }

  if (
    allDeps["vite"] ||
    allDeps["@sveltejs/kit"] ||
    allDeps["astro"] ||
    allDeps["nuxt"]
  ) {
    entries.push(
      "vite.config.*",
      "src/main.{ts,tsx,js,jsx}",
      "src/routes/**",
      "src/pages/**",
    );
  }

  return entries;
}

function collectExportPaths(node, sink) {
  if (typeof node === "string") {
    sink.push(node);
  } else if (node && typeof node === "object") {
    for (const value of Object.values(node)) collectExportPaths(value, sink);
  }
}

function resolveCandidate(candidate, pkgDir, allFiles, allFilesSet, sink) {
  if (typeof candidate !== "string") return;
  if (candidate.includes("*")) {
    const absPattern = path.resolve(pkgDir, candidate);
    for (const f of allFiles) {
      if (allFilesSet.has(f) && globMatchesFile(f, absPattern)) sink.add(f);
    }
    return;
  }
  const resolved = tryResolveFile(path.resolve(pkgDir, candidate));
  if (resolved && allFilesSet.has(resolved)) sink.add(resolved);
}

function globMatchesFile(file, absPattern) {
  // Lightweight check used only for package.json `exports` wildcards.
  const star = absPattern.indexOf("*");
  const prefix = absPattern.slice(0, star);
  const suffix = absPattern.slice(star + 1);
  return file.startsWith(prefix) && file.endsWith(suffix);
}

function packageEntriesFor(pkgDir, allFiles, allFilesSet) {
  const pkgPath = path.join(pkgDir, "package.json");
  if (!fs.existsSync(pkgPath)) return [];
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  } catch {
    return [];
  }

  const found = new Set();
  const candidates = [];

  for (const field of ["main", "module", "browser", "types", "typings"]) {
    if (typeof pkg[field] === "string") candidates.push(pkg[field]);
  }
  if (typeof pkg.bin === "string") candidates.push(pkg.bin);
  else if (pkg.bin && typeof pkg.bin === "object")
    candidates.push(...Object.values(pkg.bin));
  if (pkg.exports !== undefined) collectExportPaths(pkg.exports, candidates);

  for (const cmd of Object.values(pkg.scripts ?? {})) {
    if (typeof cmd !== "string") continue;
    // Any token that looks like a source-file path is a potential entry
    // (e.g. `tsx src/cli.ts`, `node ./server.js`, `webpack --config build/w.js`).
    // resolveCandidate() filters out anything that is not a real file.
    for (const token of cmd.split(/\s+/)) {
      const clean = token.replace(/^['"]|['"]$/g, "");
      if (/^(?:\.\/)?[\w./-]+\.(?:js|jsx|ts|tsx|mjs|cjs)$/.test(clean)) {
        candidates.push(clean);
      }
    }
  }

  for (const c of candidates)
    resolveCandidate(c, pkgDir, allFiles, allFilesSet, found);
  return [...found];
}

// Returns the workspace package directories declared in the root package.json
// (`workspaces`) or pnpm-workspace.yaml, so monorepo sub-package entry points
// are honoured too.
export function findWorkspacePackageDirs(projectDir) {
  const patterns = [];
  const pkgPath = path.join(projectDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const ws = Array.isArray(pkg.workspaces)
        ? pkg.workspaces
        : pkg.workspaces?.packages;
      if (Array.isArray(ws)) patterns.push(...ws);
    } catch {
      /* ignore malformed package.json */
    }
  }
  const pnpmPath = path.join(projectDir, "pnpm-workspace.yaml");
  if (fs.existsSync(pnpmPath)) {
    const raw = fs.readFileSync(pnpmPath, "utf-8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*-\s*['"]?([^'"\n]+?)['"]?\s*$/);
      if (m) patterns.push(m[1]);
    }
  }
  if (patterns.length === 0) return [];

  const dirs = new Set();
  for (const pattern of patterns) {
    const matched = globSync(pattern, { cwd: projectDir, absolute: true });
    for (const dir of matched) {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) dirs.add(dir);
    }
  }
  return [...dirs];
}

export function collectPackageEntryFiles(projectDir, allFiles, allFilesSet) {
  const dirs = [projectDir, ...findWorkspacePackageDirs(projectDir)];
  const entries = new Set();
  for (const dir of dirs) {
    for (const f of packageEntriesFor(dir, allFiles, allFilesSet))
      entries.add(f);
  }
  return entries;
}

const CONFIG_EXTENSIONS = [".js", ".mjs", ".cjs", ".json"];

// Loads a user config file. Supports ESM/CJS modules (default export) and JSON.
export async function loadUserConfig(absConfigPath) {
  if (!fs.existsSync(absConfigPath)) return null;
  const ext = path.extname(absConfigPath);
  if (ext === ".json") {
    return JSON.parse(fs.readFileSync(absConfigPath, "utf-8"));
  }
  if (!CONFIG_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported config extension: ${ext}`);
  }
  const url = `${pathToFileURL(absConfigPath).href}?t=${fs.statSync(absConfigPath).mtimeMs}`;
  const mod = await import(url);
  const cfg = mod.default ?? mod.config ?? mod;
  if (!cfg || typeof cfg !== "object") {
    throw new Error("Config file did not export a configuration object");
  }
  return cfg;
}
