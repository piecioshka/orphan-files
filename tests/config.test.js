import { describe, it, expect } from "vitest";
import {
  DEFAULT_CONFIG,
  BASELINE_ENTRY_PATTERNS,
  detectFrameworkEntries,
  findWorkspacePackageDirs,
  collectPackageEntryFiles,
  loadUserConfig,
} from "../lib/config.js";
import path from "path";
import fs from "fs";
import os from "os";

function makeTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("config exports", () => {
  it("exposes DEFAULT_CONFIG with include/exclude/exceptions arrays", () => {
    expect(Array.isArray(DEFAULT_CONFIG.include)).toBe(true);
    expect(Array.isArray(DEFAULT_CONFIG.exclude)).toBe(true);
    expect(Array.isArray(DEFAULT_CONFIG.exceptions)).toBe(true);
  });

  it("exposes BASELINE_ENTRY_PATTERNS as a non-empty array", () => {
    expect(Array.isArray(BASELINE_ENTRY_PATTERNS)).toBe(true);
    expect(BASELINE_ENTRY_PATTERNS.length).toBeGreaterThan(0);
  });
});

describe("detectFrameworkEntries", () => {
  it("returns [] when package.json is missing", () => {
    const tmpDir = makeTmpDir("orphan-cfg-fw-nopkg-");
    try {
      expect(detectFrameworkEntries(tmpDir)).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("returns [] when package.json is invalid JSON", () => {
    const tmpDir = makeTmpDir("orphan-cfg-fw-badpkg-");
    try {
      fs.writeFileSync(path.join(tmpDir, "package.json"), "not json at all");
      expect(detectFrameworkEntries(tmpDir)).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("returns [] for a plain package.json with no known frameworks", () => {
    const tmpDir = makeTmpDir("orphan-cfg-fw-plain-");
    try {
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({
          dependencies: { lodash: "4.0.0" },
          devDependencies: { eslint: "9.0.0" },
        }),
      );
      expect(detectFrameworkEntries(tmpDir)).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('includes Next.js patterns when "next" is a dependency', () => {
    const tmpDir = makeTmpDir("orphan-cfg-fw-next-");
    try {
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({
          dependencies: { next: "14.0.0" },
        }),
      );
      const entries = detectFrameworkEntries(tmpDir);
      expect(entries).toContain("next.config.*");
      expect(entries).toContain("next-env.d.ts");
      expect(entries).toContain("pages/**");
      expect(entries).toContain("src/pages/**");
      expect(entries).toContain("app/**/page.{ts,tsx,js,jsx}");
      expect(entries).toContain("src/app/**/layout.{ts,tsx,js,jsx}");
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("includes the stories pattern for @storybook/* packages", () => {
    const tmpDir = makeTmpDir("orphan-cfg-fw-sb-");
    try {
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({
          devDependencies: { "@storybook/react": "8.0.0" },
        }),
      );
      expect(detectFrameworkEntries(tmpDir)).toContain(
        "**/*.stories.{js,ts,tsx,jsx,mjs}",
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('includes the stories pattern for the "storybook" package', () => {
    const tmpDir = makeTmpDir("orphan-cfg-fw-sb2-");
    try {
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({
          devDependencies: { storybook: "8.0.0" },
        }),
      );
      expect(detectFrameworkEntries(tmpDir)).toContain(
        "**/*.stories.{js,ts,tsx,jsx,mjs}",
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('includes Remotion patterns for the "remotion" package', () => {
    const tmpDir = makeTmpDir("orphan-cfg-fw-remotion-");
    try {
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({
          dependencies: { remotion: "4.0.0" },
        }),
      );
      const entries = detectFrameworkEntries(tmpDir);
      expect(entries).toContain("remotion.config.*");
      expect(entries).toContain("src/index.{ts,tsx,js,jsx}");
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('includes Remotion patterns for the "@remotion/core" package', () => {
    const tmpDir = makeTmpDir("orphan-cfg-fw-remotion2-");
    try {
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({
          dependencies: { "@remotion/core": "4.0.0" },
        }),
      );
      const entries = detectFrameworkEntries(tmpDir);
      expect(entries).toContain("remotion.config.*");
      expect(entries).toContain("src/index.{ts,tsx,js,jsx}");
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('includes Vite patterns for the "vite" package', () => {
    const tmpDir = makeTmpDir("orphan-cfg-fw-vite-");
    try {
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({
          devDependencies: { vite: "5.0.0" },
        }),
      );
      const entries = detectFrameworkEntries(tmpDir);
      expect(entries).toContain("vite.config.*");
      expect(entries).toContain("src/main.{ts,tsx,js,jsx}");
      expect(entries).toContain("src/routes/**");
      expect(entries).toContain("src/pages/**");
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("includes Vite patterns for astro / nuxt / @sveltejs/kit", () => {
    for (const dep of ["astro", "nuxt", "@sveltejs/kit"]) {
      const tmpDir = makeTmpDir("orphan-cfg-fw-vitelike-");
      try {
        fs.writeFileSync(
          path.join(tmpDir, "package.json"),
          JSON.stringify({
            dependencies: { [dep]: "1.0.0" },
          }),
        );
        expect(detectFrameworkEntries(tmpDir)).toContain("vite.config.*");
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    }
  });
});

describe("findWorkspacePackageDirs", () => {
  it("returns the dirs declared by workspaces as an array", () => {
    const tmpDir = makeTmpDir("orphan-cfg-ws-array-");
    try {
      fs.mkdirSync(path.join(tmpDir, "packages", "a"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, "packages", "b"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "packages", "a", "package.json"),
        JSON.stringify({ name: "a" }),
      );
      fs.writeFileSync(
        path.join(tmpDir, "packages", "b", "package.json"),
        JSON.stringify({ name: "b" }),
      );
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({
          workspaces: ["packages/*"],
        }),
      );
      const dirs = findWorkspacePackageDirs(tmpDir)
        .map((d) => path.basename(d))
        .sort();
      expect(dirs).toEqual(["a", "b"]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("returns the dirs declared by workspaces as an object ({ packages: [...] })", () => {
    const tmpDir = makeTmpDir("orphan-cfg-ws-object-");
    try {
      fs.mkdirSync(path.join(tmpDir, "packages", "a"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "packages", "a", "package.json"),
        JSON.stringify({ name: "a" }),
      );
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({
          workspaces: { packages: ["packages/*"] },
        }),
      );
      const dirs = findWorkspacePackageDirs(tmpDir).map((d) =>
        path.basename(d),
      );
      expect(dirs).toEqual(["a"]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("returns the dirs declared in pnpm-workspace.yaml", () => {
    const tmpDir = makeTmpDir("orphan-cfg-ws-pnpm-");
    try {
      fs.mkdirSync(path.join(tmpDir, "packages", "a"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "packages", "a", "package.json"),
        JSON.stringify({ name: "a" }),
      );
      // No "workspaces" in package.json - only the pnpm yaml file.
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({ name: "root" }),
      );
      fs.writeFileSync(
        path.join(tmpDir, "pnpm-workspace.yaml"),
        "packages:\n  - 'packages/*'\n",
      );
      const dirs = findWorkspacePackageDirs(tmpDir).map((d) =>
        path.basename(d),
      );
      expect(dirs).toEqual(["a"]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("returns [] when there are no workspaces and no pnpm yaml", () => {
    const tmpDir = makeTmpDir("orphan-cfg-ws-none-");
    try {
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({ name: "root" }),
      );
      expect(findWorkspacePackageDirs(tmpDir)).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("returns [] when package.json is missing entirely", () => {
    const tmpDir = makeTmpDir("orphan-cfg-ws-nopkg-");
    try {
      expect(findWorkspacePackageDirs(tmpDir)).toEqual([]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("ignores a malformed root package.json but still reads pnpm yaml", () => {
    const tmpDir = makeTmpDir("orphan-cfg-ws-badpkg-");
    try {
      fs.mkdirSync(path.join(tmpDir, "packages", "a"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "packages", "a", "package.json"),
        JSON.stringify({ name: "a" }),
      );
      fs.writeFileSync(path.join(tmpDir, "package.json"), "not json at all");
      fs.writeFileSync(
        path.join(tmpDir, "pnpm-workspace.yaml"),
        "packages:\n  - 'packages/*'\n",
      );
      const dirs = findWorkspacePackageDirs(tmpDir).map((d) =>
        path.basename(d),
      );
      expect(dirs).toEqual(["a"]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("filters out workspace glob matches that are files, not directories", () => {
    const tmpDir = makeTmpDir("orphan-cfg-ws-file-");
    try {
      fs.mkdirSync(path.join(tmpDir, "packages"), { recursive: true });
      // A real directory and a real file both matching packages/*.
      fs.mkdirSync(path.join(tmpDir, "packages", "realdir"));
      fs.writeFileSync(
        path.join(tmpDir, "packages", "realdir", "package.json"),
        JSON.stringify({ name: "realdir" }),
      );
      fs.writeFileSync(
        path.join(tmpDir, "packages", "README.md"),
        "# not a package",
      );
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({
          workspaces: ["packages/*"],
        }),
      );
      const dirs = findWorkspacePackageDirs(tmpDir).map((d) =>
        path.basename(d),
      );
      expect(dirs).toEqual(["realdir"]);
      expect(dirs).not.toContain("README.md");
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});

describe("collectPackageEntryFiles", () => {
  it("resolves main/module/browser/types/typings/bin/exports/scripts entries", () => {
    const tmpDir = makeTmpDir("orphan-cfg-entries-");
    try {
      // Create real files for every entry candidate.
      const files = {
        main: path.join(tmpDir, "index.js"),
        module: path.join(tmpDir, "index.mjs"),
        browser: path.join(tmpDir, "browser.js"),
        types: path.join(tmpDir, "index.d.ts"),
        typings: path.join(tmpDir, "typings.d.ts"),
        binString: path.join(tmpDir, "cli.js"),
        binObject: path.join(tmpDir, "tool.js"),
        exportMain: path.join(tmpDir, "export-main.js"),
        exportSub: path.join(tmpDir, "sub.js"),
        server: path.join(tmpDir, "server.js"),
      };
      // Wildcard export target dir.
      fs.mkdirSync(path.join(tmpDir, "feat"), { recursive: true });
      const wildcardFile = path.join(tmpDir, "feat", "thing.js");

      const allFiles = [...Object.values(files), wildcardFile];
      for (const f of allFiles) fs.writeFileSync(f, "// file");

      // A file that exists on disk but is NOT in allFilesSet - must be excluded.
      const orphanFile = path.join(tmpDir, "orphan.js");
      fs.writeFileSync(orphanFile, "// orphan");

      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({
          main: "./index.js",
          module: "./index.mjs",
          browser: "./browser.js",
          types: "./index.d.ts",
          typings: "./typings.d.ts",
          bin: "./cli.js",
          exports: {
            ".": { import: "./export-main.js" },
            "./sub": "./sub.js",
            "./*": "./feat/*.js",
            // Points at a file that does not exist - must be ignored.
            "./missing": "./nope.js",
          },
          scripts: {
            start: "node ./server.js",
            build: "vite build",
          },
        }),
      );

      const allFilesSet = new Set(allFiles);
      const result = collectPackageEntryFiles(tmpDir, allFiles, allFilesSet);

      expect(result.has(files.main)).toBe(true);
      expect(result.has(files.module)).toBe(true);
      expect(result.has(files.browser)).toBe(true);
      expect(result.has(files.types)).toBe(true);
      expect(result.has(files.typings)).toBe(true);
      expect(result.has(files.binString)).toBe(true);
      expect(result.has(files.exportMain)).toBe(true);
      expect(result.has(files.exportSub)).toBe(true);
      expect(result.has(files.server)).toBe(true);
      // Wildcard export `./*` -> ./feat/*.js matched the real feat/thing.js.
      expect(result.has(wildcardFile)).toBe(true);

      // The "vite build" script references no file path -> nothing added.
      // The "./nope.js" export does not exist -> excluded.
      // The orphan file is not in allFilesSet -> excluded.
      expect(result.has(orphanFile)).toBe(false);
      expect([...result]).not.toContain(path.join(tmpDir, "nope.js"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("ignores non-string export values and non-string scripts", () => {
    const tmpDir = makeTmpDir("orphan-cfg-nonstring-");
    try {
      const real = path.join(tmpDir, "index.js");
      fs.writeFileSync(real, "// real");
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({
          main: "./index.js",
          exports: {
            // Non-string, non-object leaf values exercise the neither-branch
            // of collectExportPaths; null/number must not become candidates.
            ".": { import: "./index.js", types: 42, fallback: null },
            "./flag": true,
          },
          scripts: {
            // Non-string script value exercises the `typeof cmd !== 'string'` guard.
            config: { nested: "object" },
            start: "node ./index.js",
          },
        }),
      );
      const allFiles = [real];
      const result = collectPackageEntryFiles(
        tmpDir,
        allFiles,
        new Set(allFiles),
      );
      expect(result.has(real)).toBe(true);
      expect(result.size).toBe(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("ignores candidates that are not strings (numeric bin values)", () => {
    const tmpDir = makeTmpDir("orphan-cfg-numbin-");
    try {
      const real = path.join(tmpDir, "cli.js");
      fs.writeFileSync(real, "// cli");
      // A bin object whose value is a number reaches resolveCandidate with a
      // non-string candidate, exercising its early return.
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({
          bin: { good: "./cli.js", bad: 123 },
        }),
      );
      const allFiles = [real];
      const result = collectPackageEntryFiles(
        tmpDir,
        allFiles,
        new Set(allFiles),
      );
      expect(result.has(real)).toBe(true);
      expect(result.size).toBe(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("resolves bin given as an object with multiple commands", () => {
    const tmpDir = makeTmpDir("orphan-cfg-binobj-");
    try {
      const one = path.join(tmpDir, "one.js");
      const two = path.join(tmpDir, "two.js");
      fs.writeFileSync(one, "// one");
      fs.writeFileSync(two, "// two");
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({
          bin: { one: "./one.js", two: "./two.js" },
        }),
      );
      const allFiles = [one, two];
      const result = collectPackageEntryFiles(
        tmpDir,
        allFiles,
        new Set(allFiles),
      );
      expect(result.has(one)).toBe(true);
      expect(result.has(two)).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("returns an empty set when the project has no package.json", () => {
    const tmpDir = makeTmpDir("orphan-cfg-entries-nopkg-");
    try {
      const result = collectPackageEntryFiles(tmpDir, [], new Set());
      expect(result.size).toBe(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("returns an empty set when package.json is malformed", () => {
    const tmpDir = makeTmpDir("orphan-cfg-entries-badpkg-");
    try {
      fs.writeFileSync(path.join(tmpDir, "package.json"), "not json at all");
      const result = collectPackageEntryFiles(tmpDir, [], new Set());
      expect(result.size).toBe(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("resolves entries declared in both the root and a workspace package", () => {
    const tmpDir = makeTmpDir("orphan-cfg-entries-ws-");
    try {
      // Root package.
      const rootMain = path.join(tmpDir, "root-main.js");
      fs.writeFileSync(rootMain, "// root main");
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({
          main: "./root-main.js",
          workspaces: ["packages/*"],
        }),
      );

      // Workspace package.
      const pkgDir = path.join(tmpDir, "packages", "a");
      fs.mkdirSync(pkgDir, { recursive: true });
      const wsMain = path.join(pkgDir, "ws-main.js");
      fs.writeFileSync(wsMain, "// ws main");
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({
          main: "./ws-main.js",
        }),
      );

      const allFiles = [rootMain, wsMain];
      const result = collectPackageEntryFiles(
        tmpDir,
        allFiles,
        new Set(allFiles),
      );
      expect(result.has(rootMain)).toBe(true);
      expect(result.has(wsMain)).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});

describe("loadUserConfig", () => {
  it("returns null when the config file does not exist", async () => {
    const tmpDir = makeTmpDir("orphan-cfg-load-missing-");
    try {
      const p = path.join(tmpDir, "nope.json");
      await expect(loadUserConfig(p)).resolves.toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("parses a .json config file into an object", async () => {
    const tmpDir = makeTmpDir("orphan-cfg-load-json-");
    try {
      const p = path.join(tmpDir, "orphan.json");
      fs.writeFileSync(
        p,
        JSON.stringify({ include: ["**/*.js"], exclude: ["**/dist/**"] }),
      );
      const cfg = await loadUserConfig(p);
      expect(cfg).toEqual({ include: ["**/*.js"], exclude: ["**/dist/**"] });
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("loads a .js ESM config via its default export", async () => {
    const tmpDir = makeTmpDir("orphan-cfg-load-js-");
    try {
      const p = path.join(tmpDir, "orphan.config.js");
      fs.writeFileSync(
        p,
        `export default { include: ['src/**/*.ts'], exceptions: ['index.ts'] };`,
      );
      const cfg = await loadUserConfig(p);
      expect(cfg).toEqual({
        include: ["src/**/*.ts"],
        exceptions: ["index.ts"],
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('loads a .js config via a named "config" export when there is no default', async () => {
    const tmpDir = makeTmpDir("orphan-cfg-load-named-");
    try {
      const p = path.join(tmpDir, "named.config.js");
      fs.writeFileSync(p, `export const config = { include: ['lib/**'] };`);
      const cfg = await loadUserConfig(p);
      expect(cfg).toEqual({ include: ["lib/**"] });
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("loads a .mjs config via its default export", async () => {
    const tmpDir = makeTmpDir("orphan-cfg-load-mjs-");
    try {
      const p = path.join(tmpDir, "orphan.config.mjs");
      fs.writeFileSync(p, `export default { include: ['**/*.mjs'] };`);
      const cfg = await loadUserConfig(p);
      expect(cfg).toEqual({ include: ["**/*.mjs"] });
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("falls back to the module namespace when neither default nor config is exported", async () => {
    const tmpDir = makeTmpDir("orphan-cfg-load-ns-");
    try {
      const p = path.join(tmpDir, "ns.config.js");
      // No default and no `config` export: loadUserConfig falls back to the
      // module namespace object itself (exercising the final `?? mod`).
      fs.writeFileSync(p, `export const include = ['**/*.js'];`);
      const cfg = await loadUserConfig(p);
      expect(cfg.include).toEqual(["**/*.js"]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("throws on an unsupported config extension", async () => {
    const tmpDir = makeTmpDir("orphan-cfg-load-ts-");
    try {
      const p = path.join(tmpDir, "orphan.config.ts");
      fs.writeFileSync(p, "export default {};");
      await expect(loadUserConfig(p)).rejects.toThrow(
        /Unsupported config extension/,
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("throws when a .js config does not export a configuration object", async () => {
    const tmpDir = makeTmpDir("orphan-cfg-load-nonobj-");
    try {
      const p = path.join(tmpDir, "bad.config.js");
      fs.writeFileSync(p, "export default 42;");
      await expect(loadUserConfig(p)).rejects.toThrow(
        /did not export a configuration object/,
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
