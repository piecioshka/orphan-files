import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  formatBytes,
  fileStats,
  buildUnusedEntries,
  formatCli,
  formatJson,
  formatSarif,
  formatPdfMarkdown,
  formatGraph,
} from "../lib/report.js";
import fs from "fs";
import path from "path";
import os from "os";

let tmpDir;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-files-report-test-"));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

function writeFixture(name, content) {
  const filePath = path.join(tmpDir, name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe("formatBytes", () => {
  it("formats bytes below 1024 as B", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formats bytes below 1MB as KB", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
  });

  it("formats bytes at or above 1MB as MB", () => {
    expect(formatBytes(1024 * 1024 * 3)).toBe("3.0 MB");
  });
});

describe("fileStats", () => {
  it("returns size and loc for a real file", () => {
    const file = writeFixture("stats.js", "line one\nline two\nline three");
    const stats = fileStats(file);
    expect(stats.size).toBeGreaterThan(0);
    expect(stats.loc).toBe(3);
  });

  it("returns loc 0 for an empty file", () => {
    const file = writeFixture("empty-stats.js", "");
    const stats = fileStats(file);
    expect(stats.size).toBe(0);
    expect(stats.loc).toBe(0);
  });

  it("returns {size:0, loc:0} for a non-existent file", () => {
    const stats = fileStats(path.join(tmpDir, "does-not-exist.js"));
    expect(stats).toEqual({ size: 0, loc: 0 });
  });
});

describe("buildUnusedEntries", () => {
  let big;
  let small;
  let medium;

  beforeAll(() => {
    big = writeFixture("build/zzz.js", "x".repeat(500));
    small = writeFixture("build/aaa.js", "x".repeat(10));
    medium = writeFixture("build/mmm.js", "x".repeat(100));
  });

  it("sorts by path (default)", () => {
    const entries = buildUnusedEntries([big, small, medium], tmpDir, "path");
    expect(entries.map((e) => e.rel)).toEqual([
      "build/aaa.js",
      "build/mmm.js",
      "build/zzz.js",
    ]);
  });

  it("sorts by name", () => {
    const entries = buildUnusedEntries([big, small, medium], tmpDir, "name");
    expect(entries.map((e) => path.basename(e.rel))).toEqual([
      "aaa.js",
      "mmm.js",
      "zzz.js",
    ]);
  });

  it("sorts by size descending", () => {
    const entries = buildUnusedEntries([small, medium, big], tmpDir, "size");
    expect(entries.map((e) => e.size)).toEqual([
      entries[0].size,
      entries[1].size,
      entries[2].size,
    ]);
    expect(entries[0].size).toBeGreaterThanOrEqual(entries[1].size);
    expect(entries[1].size).toBeGreaterThanOrEqual(entries[2].size);
    expect(entries[0].rel).toBe("build/zzz.js");
  });

  it("falls back to path sort for an unknown sort key", () => {
    const entries = buildUnusedEntries([big, small, medium], tmpDir, "unknown");
    expect(entries.map((e) => e.rel)).toEqual([
      "build/aaa.js",
      "build/mmm.js",
      "build/zzz.js",
    ]);
  });
});

describe("formatCli", () => {
  it("returns message when there are no unused files", () => {
    expect(formatCli([])).toBe("No unused files found!");
  });

  it("formats entries without grouping", () => {
    const entries = [
      { abs: "/p/a.js", rel: "a.js", size: 100, loc: 5 },
      { abs: "/p/b.js", rel: "b.js", size: 200, loc: 10 },
    ];
    const out = formatCli(entries);
    expect(out).toContain("Found 2 unused files");
    expect(out).toContain("a.js");
    expect(out).toContain("b.js");
    expect(out).not.toContain("./ (");
  });

  it("formats entries grouped by directory (root and subdir)", () => {
    const entries = [
      { abs: "/p/root.js", rel: "root.js", size: 100, loc: 5 },
      { abs: "/p/src/nested.js", rel: "src/nested.js", size: 200, loc: 10 },
      { abs: "/p/src/other.js", rel: "src/other.js", size: 300, loc: 15 },
    ];
    const out = formatCli(entries, { group: true });
    expect(out).toContain("./ (1)");
    expect(out).toContain("src/ (2)");
    expect(out).toContain("root.js");
    expect(out).toContain("src/nested.js");
    expect(out).toContain("src/other.js");
  });
});

describe("formatJson", () => {
  it("returns JSON with totals and unused file list", () => {
    const entries = [
      { rel: "a.js", size: 100 },
      { rel: "b.js", size: 200 },
    ];
    const parsed = JSON.parse(formatJson(entries, 42));
    expect(parsed.totalFiles).toBe(42);
    expect(parsed.unusedCount).toBe(2);
    expect(parsed.reclaimableBytes).toBe(300);
    expect(parsed.unusedFiles).toEqual(["a.js", "b.js"]);
  });
});

describe("formatSarif", () => {
  it("returns SARIF 2.1.0 with one result per entry", () => {
    const entries = [{ rel: "a.js" }, { rel: "b.js" }];
    const parsed = JSON.parse(formatSarif(entries));
    expect(parsed.version).toBe("2.1.0");
    expect(parsed.runs[0].tool.driver.name).toBe("orphan-files");
    expect(parsed.runs[0].results).toHaveLength(2);
    expect(parsed.runs[0].results[0].ruleId).toBe("unused-file");
    expect(
      parsed.runs[0].results[0].locations[0].physicalLocation.artifactLocation
        .uri,
    ).toBe("a.js");
  });
});

describe("formatPdfMarkdown", () => {
  const meta = {
    projectDir: "/home/user/my-project",
    totalFiles: 10,
    dateString: "2026-06-09",
  };

  it("reports no unused files when entries are empty", () => {
    const out = formatPdfMarkdown([], meta);
    expect(out).toContain("# orphan-files report");
    expect(out).toContain("**Project:** my-project");
    expect(out).toContain("**Total files:** 10");
    expect(out).toContain("No unused files found.");
  });

  it("lists unused files when entries are present", () => {
    const entries = [
      { rel: "a.js", size: 100 },
      { rel: "b.js", size: 2048 },
    ];
    const out = formatPdfMarkdown(entries, meta);
    expect(out).toContain("## Unused files (2)");
    expect(out).toContain("- `a.js` (100 B)");
    expect(out).toContain("- `b.js` (2.0 KB)");
  });
});

describe("formatGraph", () => {
  const fileA = "/abs/project/src/entry.js";
  const fileB = "/abs/project/src/unused.js";
  const fileC = "/abs/project/src/plain.js";
  const projectDir = "/abs/project";

  // fileA: entry, fileB: unused, fileC: neither (plain reachable node)
  function makeAnalysis() {
    return {
      graph: new Map([
        [fileA, [fileC]],
        [fileC, [fileB]],
        [fileB, []],
      ]),
      entries: new Set([fileA]),
      unused: [fileB],
    };
  }

  it("renders mermaid format by default", () => {
    const out = formatGraph(makeAnalysis(), { projectDir });
    expect(out.startsWith("graph LR")).toBe(true);
    expect(out).toContain("src/entry.js");
    expect(out).toContain("src/unused.js");
    expect(out).toContain("src/plain.js");
    expect(out).toContain("-->");
    // Node ids follow graph insertion order: A=n0, C=n1, B=n2.
    expect(out).toContain("class n2 unused;");
    expect(out).toContain("class n0 entry;");
    // fileC (n1) is neither unused nor entry, so it gets no class line.
    expect(out).not.toContain("class n1 ");
    expect(out).toContain("classDef unused");
    expect(out).toContain("classDef entry");
  });

  it("renders dot format", () => {
    const out = formatGraph(makeAnalysis(), { projectDir, format: "dot" });
    expect(out.startsWith("digraph orphan {")).toBe(true);
    expect(out).toContain('color="green"');
    expect(out).toContain('color="red"');
    // fileC (n1) is neither unused nor entry, so it has no color attribute.
    expect(out).toContain('n1 [label="src/plain.js"];');
    expect(out).toContain("->");
    expect(out.trim().endsWith("}")).toBe(true);
  });

  it("renders html format wrapping mermaid", () => {
    const out = formatGraph(makeAnalysis(), { projectDir, format: "html" });
    expect(out.startsWith("<!doctype html>")).toBe(true);
    expect(out).toContain('class="mermaid"');
    expect(out).toContain("graph LR");
    expect(out).toContain("class n2 unused;");
    expect(out).toContain("class n0 entry;");
    expect(out).toContain("</html>");
  });
});
