import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { findUnusedFiles } from "../lib/analyzer.js";
import { scanProject } from "../lib/scanner.js";
import { extractImports } from "../lib/parser.js";
import path from "path";
import fs from "fs";
import os from "os";

const FIXTURE_DIR = path.resolve(import.meta.dirname, "fixtures/project");

async function buildFileImports(files) {
  const fileImports = {};
  for (const file of files) {
    try {
      fileImports[file] = extractImports(file);
    } catch {
      fileImports[file] = [];
    }
  }
  return fileImports;
}

describe("findUnusedFiles", () => {
  describe("with fixture project", () => {
    let allFiles;
    let fileImports;

    beforeAll(async () => {
      allFiles = await scanProject(FIXTURE_DIR, "**/*.js");
      fileImports = await buildFileImports(allFiles);
    });

    it("detects unused.js as unused", () => {
      const unused = findUnusedFiles(allFiles, fileImports, [], FIXTURE_DIR);
      const unusedNames = unused.map((f) => path.basename(f));
      expect(unusedNames).toContain("unused.js");
    });

    it("does not report index.js as unused when it is in exceptions", () => {
      const unused = findUnusedFiles(
        allFiles,
        fileImports,
        ["index.js"],
        FIXTURE_DIR,
      );
      const unusedNames = unused.map((f) => path.basename(f));
      expect(unusedNames).not.toContain("index.js");
    });

    it("does not report imported files (a, b, c) as unused", () => {
      const unused = findUnusedFiles(allFiles, fileImports, [], FIXTURE_DIR);
      const unusedNames = unused.map((f) => path.basename(f));
      expect(unusedNames).not.toContain("a.js");
      expect(unusedNames).not.toContain("b.js");
      expect(unusedNames).not.toContain("c.js");
    });

    it("excludes files matching exception patterns", () => {
      const unused = findUnusedFiles(
        allFiles,
        fileImports,
        ["**/unused.js"],
        FIXTURE_DIR,
      );
      const unusedNames = unused.map((f) => path.basename(f));
      expect(unusedNames).not.toContain("unused.js");
    });

    it("excludes spec files via exception pattern", () => {
      const unused = findUnusedFiles(
        allFiles,
        fileImports,
        ["**/*.spec.js"],
        FIXTURE_DIR,
      );
      const unusedNames = unused.map((f) => path.basename(f));
      expect(unusedNames).not.toContain("test.spec.js");
    });

    it("excludes config files via exception pattern", () => {
      const unused = findUnusedFiles(
        allFiles,
        fileImports,
        ["*.config.js"],
        FIXTURE_DIR,
      );
      const unusedNames = unused.map((f) => path.basename(f));
      expect(unusedNames).not.toContain("orphan-files.config.js");
    });
  });

  describe("with all files used", () => {
    let tmpDir;

    beforeAll(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-files-used-"));
      fs.writeFileSync(path.join(tmpDir, "a.js"), `import './b.js';`);
      fs.writeFileSync(path.join(tmpDir, "b.js"), `export const x = 1;`);
    });

    afterAll(() => {
      fs.rmSync(tmpDir, { recursive: true });
    });

    it("does not report b.js as unused when it is imported by a.js", () => {
      const a = path.join(tmpDir, "a.js");
      const b = path.join(tmpDir, "b.js");
      const files = [a, b];
      const imports = { [a]: ["./b.js"], [b]: [] };
      const unused = findUnusedFiles(files, imports, ["a.js"], tmpDir);
      expect(unused).toHaveLength(0);
    });
  });

  describe("with TypeScript path aliases", () => {
    let tmpDir;

    beforeAll(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-files-alias-"));
      fs.mkdirSync(path.join(tmpDir, "src"));
      fs.writeFileSync(
        path.join(tmpDir, "src", "utils.ts"),
        "export const x = 1;",
      );
      fs.writeFileSync(
        path.join(tmpDir, "src", "index.ts"),
        `import { x } from '@/utils';`,
      );
      fs.writeFileSync(
        path.join(tmpDir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { paths: { "@/*": ["./src/*"] }, baseUrl: "." },
        }),
      );
    });

    afterAll(() => {
      fs.rmSync(tmpDir, { recursive: true });
    });

    it("resolves aliased imports and marks file as used", () => {
      const indexFile = path.join(tmpDir, "src", "index.ts");
      const utilsFile = path.join(tmpDir, "src", "utils.ts");
      const allFiles = [indexFile, utilsFile];
      const fileImports = {
        [indexFile]: ["@/utils"],
        [utilsFile]: [],
      };
      const unused = findUnusedFiles(allFiles, fileImports, [], tmpDir);
      const unusedNames = unused.map((f) => path.basename(f));
      expect(unusedNames).not.toContain("utils.ts");
    });

    it("resolves exact (non-wildcard) alias", () => {
      const tmpDir2 = fs.mkdtempSync(
        path.join(os.tmpdir(), "orphan-alias-exact-"),
      );
      try {
        fs.mkdirSync(path.join(tmpDir2, "src"));
        fs.writeFileSync(
          path.join(tmpDir2, "src", "utils.ts"),
          "export const x = 1;",
        );
        fs.writeFileSync(
          path.join(tmpDir2, "src", "index.ts"),
          `import { x } from '@utils';`,
        );
        fs.writeFileSync(
          path.join(tmpDir2, "tsconfig.json"),
          JSON.stringify({
            compilerOptions: {
              paths: { "@utils": ["./src/utils.ts"] },
              baseUrl: ".",
            },
          }),
        );
        const indexFile = path.join(tmpDir2, "src", "index.ts");
        const utilsFile = path.join(tmpDir2, "src", "utils.ts");
        const unused = findUnusedFiles(
          [indexFile, utilsFile],
          {
            [indexFile]: ["@utils"],
            [utilsFile]: [],
          },
          [],
          tmpDir2,
        );
        expect(unused.map((f) => path.basename(f))).not.toContain("utils.ts");
      } finally {
        fs.rmSync(tmpDir2, { recursive: true });
      }
    });

    it("resolves wildcard alias where target has no /* suffix", () => {
      const tmpDir2 = fs.mkdtempSync(
        path.join(os.tmpdir(), "orphan-alias-nonwild-target-"),
      );
      try {
        fs.mkdirSync(path.join(tmpDir2, "src"));
        fs.writeFileSync(
          path.join(tmpDir2, "src", "utils.ts"),
          "export const x = 1;",
        );
        fs.writeFileSync(
          path.join(tmpDir2, "src", "index.ts"),
          `import { x } from '@/utils';`,
        );
        // target "./src" without "/*" - exercises the false branch of target.endsWith('/*')
        fs.writeFileSync(
          path.join(tmpDir2, "tsconfig.json"),
          JSON.stringify({
            compilerOptions: { paths: { "@/*": ["./src"] }, baseUrl: "." },
          }),
        );
        const indexFile = path.join(tmpDir2, "src", "index.ts");
        const utilsFile = path.join(tmpDir2, "src", "utils.ts");
        const unused = findUnusedFiles(
          [indexFile, utilsFile],
          {
            [indexFile]: ["@/utils"],
            [utilsFile]: [],
          },
          [],
          tmpDir2,
        );
        expect(unused.map((f) => path.basename(f))).not.toContain("utils.ts");
      } finally {
        fs.rmSync(tmpDir2, { recursive: true });
      }
    });

    it("tries next target when first exact alias target does not exist", () => {
      const tmpDir2 = fs.mkdtempSync(
        path.join(os.tmpdir(), "orphan-alias-fallback-"),
      );
      try {
        fs.mkdirSync(path.join(tmpDir2, "src"));
        fs.writeFileSync(
          path.join(tmpDir2, "src", "utils.ts"),
          "export const x = 1;",
        );
        fs.writeFileSync(
          path.join(tmpDir2, "src", "index.ts"),
          `import { x } from '@utils';`,
        );
        // first target missing, second target exists - exercises the false branch of if (found) in exact alias loop
        fs.writeFileSync(
          path.join(tmpDir2, "tsconfig.json"),
          JSON.stringify({
            compilerOptions: {
              paths: { "@utils": ["./src/missing.ts", "./src/utils.ts"] },
              baseUrl: ".",
            },
          }),
        );
        const indexFile = path.join(tmpDir2, "src", "index.ts");
        const utilsFile = path.join(tmpDir2, "src", "utils.ts");
        const unused = findUnusedFiles(
          [indexFile, utilsFile],
          {
            [indexFile]: ["@utils"],
            [utilsFile]: [],
          },
          [],
          tmpDir2,
        );
        expect(unused.map((f) => path.basename(f))).not.toContain("utils.ts");
      } finally {
        fs.rmSync(tmpDir2, { recursive: true });
      }
    });
  });

  describe("tsconfig edge cases", () => {
    it("handles tsconfig with comments", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-tsconfig-"));
      try {
        fs.mkdirSync(path.join(tmpDir, "src"));
        fs.writeFileSync(
          path.join(tmpDir, "src", "a.ts"),
          "export const x = 1;",
        );
        fs.writeFileSync(
          path.join(tmpDir, "src", "b.ts"),
          `import { x } from '@/a';`,
        );
        // tsconfig with JS-style comments (invalid JSON, valid JSONC)
        fs.writeFileSync(
          path.join(tmpDir, "tsconfig.json"),
          `// root config\n{ "compilerOptions": { /* paths */ "paths": { "@/*": ["./src/*"] }, "baseUrl": "." } }`,
        );
        const a = path.join(tmpDir, "src", "a.ts");
        const b = path.join(tmpDir, "src", "b.ts");
        // b.ts is the entry point; a.ts is reachable from it via the JSONC alias
        const unused = findUnusedFiles(
          [a, b],
          { [a]: [], [b]: ["@/a"] },
          ["b.ts"],
          tmpDir,
        );
        expect(unused.map((f) => path.basename(f))).not.toContain("a.ts");
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it("returns empty aliases when tsconfig has invalid JSON", () => {
      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "orphan-tsconfig-bad-"),
      );
      try {
        fs.writeFileSync(
          path.join(tmpDir, "tsconfig.json"),
          "{ completely: invalid json @@@ }",
        );
        fs.writeFileSync(path.join(tmpDir, "a.js"), "// nothing");
        const a = path.join(tmpDir, "a.js");
        // Should not throw - gracefully ignores bad tsconfig
        const unused = findUnusedFiles([a], { [a]: [] }, [], tmpDir);
        expect(unused).toContain(a);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it("returns empty aliases when tsconfig does not exist", () => {
      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "orphan-no-tsconfig-"),
      );
      try {
        fs.writeFileSync(path.join(tmpDir, "a.js"), "// nothing");
        const a = path.join(tmpDir, "a.js");
        const unused = findUnusedFiles([a], { [a]: [] }, [], tmpDir);
        expect(unused).toContain(a);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it("uses empty paths and default baseUrl when tsconfig has no compilerOptions.paths", () => {
      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "orphan-tsconfig-nopaths-"),
      );
      try {
        fs.writeFileSync(
          path.join(tmpDir, "tsconfig.json"),
          JSON.stringify({
            compilerOptions: {},
          }),
        );
        fs.writeFileSync(path.join(tmpDir, "a.js"), `import './b.js';`);
        fs.writeFileSync(path.join(tmpDir, "b.js"), `export const x = 1;`);
        const a = path.join(tmpDir, "a.js");
        const b = path.join(tmpDir, "b.js");
        const unused = findUnusedFiles(
          [a, b],
          { [a]: ["./b.js"], [b]: [] },
          ["a.js"],
          tmpDir,
        );
        expect(unused).toHaveLength(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });
  });

  describe("import resolution edge cases", () => {
    it("ignores non-relative imports without aliases (e.g. node_modules)", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-resolve-"));
      try {
        fs.writeFileSync(path.join(tmpDir, "a.js"), `import 'lodash';`);
        const a = path.join(tmpDir, "a.js");
        const unused = findUnusedFiles([a], { [a]: ["lodash"] }, [], tmpDir);
        expect(unused).toContain(a);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it("returns null from resolveAliasedImport when no alias matches", () => {
      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "orphan-alias-miss-"),
      );
      try {
        fs.mkdirSync(path.join(tmpDir, "src"));
        fs.writeFileSync(
          path.join(tmpDir, "src", "a.ts"),
          "export const x = 1;",
        );
        fs.writeFileSync(
          path.join(tmpDir, "src", "b.ts"),
          `import { x } from '@components/a';`,
        );
        fs.writeFileSync(
          path.join(tmpDir, "tsconfig.json"),
          JSON.stringify({
            compilerOptions: {
              paths: { "@utils/*": ["./src/*"] },
              baseUrl: ".",
            },
          }),
        );
        const a = path.join(tmpDir, "src", "a.ts");
        const b = path.join(tmpDir, "src", "b.ts");
        // @components/a doesn't match @utils/* alias → resolveAliasedImport returns null → a.ts is unused
        const unused = findUnusedFiles(
          [a, b],
          { [a]: [], [b]: ["@components/a"] },
          [],
          tmpDir,
        );
        expect(unused.map((f) => path.basename(f))).toContain("a.ts");
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it("returns null from tryResolveFile when resolved path does not exist", () => {
      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "orphan-noresolve-"),
      );
      try {
        fs.mkdirSync(path.join(tmpDir, "src"));
        fs.writeFileSync(
          path.join(tmpDir, "src", "a.ts"),
          "export const x = 1;",
        );
        fs.writeFileSync(
          path.join(tmpDir, "src", "b.ts"),
          `import { x } from '@/nonexistent';`,
        );
        fs.writeFileSync(
          path.join(tmpDir, "tsconfig.json"),
          JSON.stringify({
            compilerOptions: { paths: { "@/*": ["./src/*"] }, baseUrl: "." },
          }),
        );
        const a = path.join(tmpDir, "src", "a.ts");
        const b = path.join(tmpDir, "src", "b.ts");
        // @/nonexistent resolves to a path that doesn't exist → a.ts still unused
        const unused = findUnusedFiles(
          [a, b],
          { [a]: [], [b]: ["@/nonexistent"] },
          [],
          tmpDir,
        );
        expect(unused.map((f) => path.basename(f))).toContain("a.ts");
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it("resolves import with extension added", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-ext-"));
      try {
        fs.writeFileSync(path.join(tmpDir, "a.js"), `import './b';`);
        fs.writeFileSync(path.join(tmpDir, "b.js"), `export const x = 1;`);
        const a = path.join(tmpDir, "a.js");
        const b = path.join(tmpDir, "b.js");
        const unused = findUnusedFiles(
          [a, b],
          { [a]: ["./b"], [b]: [] },
          ["a.js"],
          tmpDir,
        );
        expect(unused).toHaveLength(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it("resolves import via index file in directory", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-index-"));
      try {
        fs.mkdirSync(path.join(tmpDir, "utils"));
        fs.writeFileSync(
          path.join(tmpDir, "utils", "index.js"),
          `export const x = 1;`,
        );
        fs.writeFileSync(path.join(tmpDir, "a.js"), `import './utils';`);
        const a = path.join(tmpDir, "a.js");
        const idx = path.join(tmpDir, "utils", "index.js");
        const unused = findUnusedFiles(
          [a, idx],
          { [a]: ["./utils"], [idx]: [] },
          ["a.js"],
          tmpDir,
        );
        expect(unused).toHaveLength(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });
  });

  describe("framework auto-detection", () => {
    it("does not throw when package.json is missing", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-fw-nopkg-"));
      try {
        fs.writeFileSync(path.join(tmpDir, "a.js"), "// nothing");
        const a = path.join(tmpDir, "a.js");
        expect(() =>
          findUnusedFiles([a], { [a]: [] }, [], tmpDir),
        ).not.toThrow();
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it("handles invalid package.json gracefully", () => {
      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "orphan-fw-badpkg-"),
      );
      try {
        fs.writeFileSync(path.join(tmpDir, "package.json"), "not json at all");
        fs.writeFileSync(path.join(tmpDir, "a.js"), "// nothing");
        const a = path.join(tmpDir, "a.js");
        expect(() =>
          findUnusedFiles([a], { [a]: [] }, [], tmpDir),
        ).not.toThrow();
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it("adds Next.js exceptions and treats page.tsx as not unused", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-fw-next-"));
      try {
        fs.mkdirSync(path.join(tmpDir, "app"));
        const page = path.join(tmpDir, "app", "page.tsx");
        fs.writeFileSync(page, "export default function Page() {}");
        fs.writeFileSync(
          path.join(tmpDir, "package.json"),
          JSON.stringify({
            dependencies: { next: "14.0.0", react: "18.0.0" },
          }),
        );
        const unused = findUnusedFiles([page], { [page]: [] }, [], tmpDir);
        expect(unused).toHaveLength(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it("adds Next.js exceptions for src/app/ layout", () => {
      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "orphan-fw-next-src-"),
      );
      try {
        fs.mkdirSync(path.join(tmpDir, "src", "app"), { recursive: true });
        const layout = path.join(tmpDir, "src", "app", "layout.tsx");
        fs.writeFileSync(layout, "export default function Layout() {}");
        fs.writeFileSync(
          path.join(tmpDir, "package.json"),
          JSON.stringify({
            dependencies: { next: "14.0.0" },
          }),
        );
        const unused = findUnusedFiles([layout], { [layout]: [] }, [], tmpDir);
        expect(unused).toHaveLength(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it("adds Storybook exceptions for @storybook/ packages", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-fw-sb-"));
      try {
        const story = path.join(tmpDir, "Button.stories.tsx");
        fs.writeFileSync(story, "export default {}");
        fs.writeFileSync(
          path.join(tmpDir, "package.json"),
          JSON.stringify({
            devDependencies: { "@storybook/react": "7.0.0" },
          }),
        );
        const unused = findUnusedFiles([story], { [story]: [] }, [], tmpDir);
        expect(unused).toHaveLength(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it("adds Storybook exceptions for storybook package", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-fw-sb2-"));
      try {
        const story = path.join(tmpDir, "Button.stories.js");
        fs.writeFileSync(story, "export default {}");
        fs.writeFileSync(
          path.join(tmpDir, "package.json"),
          JSON.stringify({
            devDependencies: { storybook: "7.0.0" },
          }),
        );
        const unused = findUnusedFiles([story], { [story]: [] }, [], tmpDir);
        expect(unused).toHaveLength(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it("adds Remotion exceptions for remotion package", () => {
      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "orphan-fw-remotion-"),
      );
      try {
        fs.mkdirSync(path.join(tmpDir, "src"));
        const entry = path.join(tmpDir, "src", "index.ts");
        fs.writeFileSync(entry, "export const Root = () => null;");
        fs.writeFileSync(
          path.join(tmpDir, "package.json"),
          JSON.stringify({
            dependencies: { remotion: "4.0.0" },
          }),
        );
        const unused = findUnusedFiles([entry], { [entry]: [] }, [], tmpDir);
        expect(unused).toHaveLength(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it("adds Remotion exceptions for @remotion/core package", () => {
      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "orphan-fw-remotion2-"),
      );
      try {
        fs.mkdirSync(path.join(tmpDir, "src"));
        const entry = path.join(tmpDir, "src", "index.tsx");
        fs.writeFileSync(entry, "export const Root = () => null;");
        fs.writeFileSync(
          path.join(tmpDir, "package.json"),
          JSON.stringify({
            dependencies: { "@remotion/core": "4.0.0" },
          }),
        );
        const unused = findUnusedFiles([entry], { [entry]: [] }, [], tmpDir);
        expect(unused).toHaveLength(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it("adds exception for main field in package.json", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-fw-main-"));
      try {
        const main = path.join(tmpDir, "index.js");
        fs.writeFileSync(main, "module.exports = {};");
        fs.writeFileSync(
          path.join(tmpDir, "package.json"),
          JSON.stringify({
            main: "./index.js",
          }),
        );
        const unused = findUnusedFiles([main], { [main]: [] }, [], tmpDir);
        expect(unused).toHaveLength(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it("adds exception for entry points found in scripts", () => {
      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "orphan-fw-scripts-"),
      );
      try {
        const entry = path.join(tmpDir, "server.js");
        fs.writeFileSync(entry, 'console.log("start");');
        fs.writeFileSync(
          path.join(tmpDir, "package.json"),
          JSON.stringify({
            scripts: { start: "node ./server.js" },
          }),
        );
        const unused = findUnusedFiles([entry], { [entry]: [] }, [], tmpDir);
        expect(unused).toHaveLength(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it("does not add exceptions for scripts without file paths", () => {
      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "orphan-fw-scripts-nomatch-"),
      );
      try {
        const entry = path.join(tmpDir, "a.js");
        fs.writeFileSync(entry, 'console.log("hello");');
        fs.writeFileSync(
          path.join(tmpDir, "package.json"),
          JSON.stringify({
            scripts: { start: "next dev", build: "webpack --mode production" },
          }),
        );
        const unused = findUnusedFiles([entry], { [entry]: [] }, [], tmpDir);
        expect(unused).toContain(entry);
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });
  });
});
