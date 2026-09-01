import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  gitignoreToGlobs,
  readGitignore,
  scanProject,
} from "../lib/scanner.js";
import fs from "fs";
import path from "path";
import os from "os";

let tmpDir;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-files-scanner-"));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

describe("gitignoreToGlobs", () => {
  const content = [
    "# x",
    "",
    "!keep",
    "/dist",
    "coverage/",
    "node_modules",
  ].join("\n");

  const globs = gitignoreToGlobs(content);

  it("expands a plain entry into both **/<name>/** and **/<name>", () => {
    expect(globs).toContain("**/node_modules/**");
    expect(globs).toContain("**/node_modules");
  });

  it("roots a leading-slash entry against the project root", () => {
    expect(globs).toContain("dist/**");
    expect(globs).toContain("dist");
  });

  it("treats a trailing-slash entry as a directory only", () => {
    expect(globs).toContain("**/coverage/**");
    expect(globs).not.toContain("**/coverage");
  });

  it("skips comment, blank, and negation lines", () => {
    expect(globs.some((g) => g.includes("keep"))).toBe(false);
    expect(globs.some((g) => g.includes("#"))).toBe(false);
    expect(globs).not.toContain("");
    expect(globs).not.toContain("**/");
  });
});

describe("readGitignore", () => {
  it("returns globs when a .gitignore exists", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-gi-"));
    fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules\n/dist\n");
    const globs = readGitignore(dir);
    expect(globs).toContain("**/node_modules");
    expect(globs).toContain("dist/**");
    fs.rmSync(dir, { recursive: true });
  });

  it("returns an empty array when no .gitignore exists", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-gi-empty-"));
    expect(readGitignore(dir)).toEqual([]);
    fs.rmSync(dir, { recursive: true });
  });
});

describe("scanProject respectGitignore", () => {
  let projectDir;

  beforeAll(() => {
    projectDir = path.join(tmpDir, "project");
    fs.mkdirSync(projectDir);
    fs.writeFileSync(path.join(projectDir, "a.js"), "export const a = 1;");
    fs.writeFileSync(path.join(projectDir, "secret.js"), "export const s = 1;");
    fs.writeFileSync(path.join(projectDir, ".gitignore"), "secret.js\n");
  });

  it("excludes gitignored files when respectGitignore is true", async () => {
    const files = await scanProject(
      projectDir,
      "**/*.js",
      ["**/node_modules/**"],
      { respectGitignore: true },
    );
    expect(files.some((f) => f.endsWith("a.js"))).toBe(true);
    expect(files.some((f) => f.endsWith("secret.js"))).toBe(false);
  });

  it("includes gitignored files when respectGitignore is omitted", async () => {
    const files = await scanProject(projectDir, "**/*.js");
    expect(files.some((f) => f.endsWith("a.js"))).toBe(true);
    expect(files.some((f) => f.endsWith("secret.js"))).toBe(true);
  });
});
