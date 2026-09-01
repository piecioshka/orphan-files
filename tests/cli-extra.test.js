import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";

describe("cli - new features", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-cli-extra-"));
    vi.spyOn(process, "exit").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
    vi.restoreAllMocks();
  });

  async function cli(...args) {
    const { run } = await import("../lib/cli.js");
    return run(args);
  }

  const out = () => console.log.mock.calls.flat().join("\n");
  const write = (name, content) => {
    const p = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
    return p;
  };

  it("getVersion returns the package version", async () => {
    const { getVersion } = await import("../lib/cli.js");
    expect(getVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("prints version with --version and exits 0", async () => {
    await cli("--version");
    expect(out()).toMatch(/\d+\.\d+\.\d+/);
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  describe("--init", () => {
    it("creates a config file and exits 0", async () => {
      await cli(tmpDir, "--init");
      expect(fs.existsSync(path.join(tmpDir, "orphan-files.config.js"))).toBe(
        true,
      );
      expect(out()).toContain("Created");
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it("errors and exits 1 when a config already exists", async () => {
      write("orphan-files.config.js", "export default {};");
      await cli(tmpDir, "--init");
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("already exists"),
      );
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe("--why", () => {
    beforeEach(() => {
      write("index.js", `import './util.js';`);
      write("util.js", `export const x = 1;`);
      write("orphan.js", `console.log('o');`);
    });

    it("reports an entry point", async () => {
      await cli(tmpDir, "--why", "index.js", "--config", "nope.js");
      expect(out()).toContain("entry");
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it("traces a used file back to an entry point", async () => {
      await cli(tmpDir, "--why", "util.js", "--config", "nope.js");
      const text = out();
      expect(text).toContain("used");
      expect(text).toContain("chain");
    });

    it("reports an unused file", async () => {
      await cli(tmpDir, "--why", "orphan.js", "--config", "nope.js");
      expect(out()).toContain("unused");
    });
  });

  describe("--graph", () => {
    beforeEach(() => {
      write("index.js", `import './util.js';`);
      write("util.js", `export const x = 1;`);
      write("dead.js", `console.log('d');`);
    });

    it("prints a mermaid graph by default", async () => {
      await cli(tmpDir, "--graph", "--config", "nope.js");
      expect(out()).toContain("graph LR");
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it("prints a dot graph", async () => {
      await cli(tmpDir, "--graph", "dot", "--config", "nope.js");
      expect(out()).toContain("digraph");
    });

    it("prints an html graph", async () => {
      await cli(tmpDir, "--graph", "html", "--config", "nope.js");
      expect(out()).toContain("<!doctype html>");
    });
  });

  describe("--fix", () => {
    it("previews deletions and exits 1 without --force", async () => {
      write("a.js", "// nothing");
      await cli(tmpDir, "--fix", "--config", "nope.js");
      expect(out()).toContain("Would delete");
      expect(process.exit).toHaveBeenCalledWith(1);
      expect(fs.existsSync(path.join(tmpDir, "a.js"))).toBe(true);
    });

    it("deletes unused files with --force", async () => {
      write("a.js", "// nothing");
      await cli(tmpDir, "--fix", "--force", "--config", "nope.js");
      expect(out()).toContain("Deleted a.js");
      expect(fs.existsSync(path.join(tmpDir, "a.js"))).toBe(false);
    });

    it("reports nothing to delete when all files are used", async () => {
      write("index.js", `import './b.js';`);
      write("b.js", `export const x = 1;`);
      await cli(tmpDir, "--fix", "--config", "nope.js");
      expect(out()).toContain("No unused files to delete");
    });

    it("reports an error when a file cannot be deleted", async () => {
      write("a.js", "// nothing");
      const rmSpy = vi.spyOn(fs, "rmSync").mockImplementation(() => {
        throw new Error("EPERM");
      });
      await cli(tmpDir, "--fix", "--force", "--config", "nope.js");
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to delete"),
      );
      rmSpy.mockRestore();
    });
  });

  describe("--format sarif", () => {
    it("prints SARIF and exits 1 when unused files exist", async () => {
      write("a.js", "// nothing");
      await cli(tmpDir, "--format", "sarif", "--config", "nope.js");
      const jsonStr = console.log.mock.calls
        .map((c) => c[0])
        .find((s) => s?.startsWith("{"));
      const sarif = JSON.parse(jsonStr);
      expect(sarif.version).toBe("2.1.0");
      expect(sarif.runs[0].tool.driver.name).toBe("orphan-files");
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  describe("--baseline / --update-baseline", () => {
    it("writes a baseline and exits 0", async () => {
      write("a.js", "// nothing");
      await cli(tmpDir, "--update-baseline", "--config", "nope.js");
      const baselinePath = path.join(tmpDir, ".orphan-files-baseline.json");
      expect(fs.existsSync(baselinePath)).toBe(true);
      expect(
        JSON.parse(fs.readFileSync(baselinePath, "utf-8")).unusedFiles,
      ).toContain("a.js");
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it("writes a baseline to an explicit path", async () => {
      write("a.js", "// nothing");
      await cli(
        tmpDir,
        "--update-baseline",
        "mybase.json",
        "--config",
        "nope.js",
      );
      expect(fs.existsSync(path.join(tmpDir, "mybase.json"))).toBe(true);
    });

    it("ignores files recorded in the baseline", async () => {
      write("a.js", "// nothing");
      write("c.js", "// nothing");
      fs.writeFileSync(
        path.join(tmpDir, "bp.json"),
        JSON.stringify({ unusedFiles: ["a.js"] }),
      );
      await cli(
        tmpDir,
        "--baseline",
        "bp.json",
        "--format",
        "json",
        "--config",
        "nope.js",
      );
      const jsonStr = console.log.mock.calls
        .map((c) => c[0])
        .find((s) => s?.startsWith("{"));
      const result = JSON.parse(jsonStr);
      expect(result.unusedFiles).toEqual(["c.js"]);
    });

    it("treats every unused file as fresh when the baseline file is missing", async () => {
      write("a.js", "// nothing");
      await cli(
        tmpDir,
        "--baseline",
        "missing.json",
        "--format",
        "json",
        "--config",
        "nope.js",
      );
      const jsonStr = console.log.mock.calls
        .map((c) => c[0])
        .find((s) => s?.startsWith("{"));
      expect(JSON.parse(jsonStr).unusedFiles).toContain("a.js");
    });
  });

  it("honours custom entry patterns from the config file", async () => {
    write("custom-entry.js", `import './helper.js';`);
    write("helper.js", `export const x = 1;`);
    write(
      "orphan-files.config.js",
      `export default { entry: ['custom-entry.js'] };`,
    );
    await cli(tmpDir, "--format", "json");
    const jsonStr = console.log.mock.calls
      .map((c) => c[0])
      .find((s) => s?.startsWith("{"));
    // custom-entry.js is an entry, so helper.js (imported by it) is reachable too
    expect(JSON.parse(jsonStr).unusedFiles).toEqual([]);
  });

  describe("--max-unused", () => {
    it("does not exit 1 when unused count is within the limit", async () => {
      write("a.js", "// nothing");
      write("b.js", "// nothing");
      await cli(tmpDir, "--max-unused", "5", "--config", "nope.js");
      expect(process.exit).not.toHaveBeenCalledWith(1);
    });

    it("exits 1 when unused count exceeds the limit", async () => {
      write("a.js", "// nothing");
      write("b.js", "// nothing");
      await cli(tmpDir, "--max-unused", "1", "--config", "nope.js");
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  it("groups output by directory with --group and sorts by size", async () => {
    write("src/a.js", "// a");
    write("src/b.js", "// bb");
    write("root.js", "// r");
    await cli(tmpDir, "--group", "--sort", "size", "--config", "nope.js");
    expect(out()).toContain("src/");
  });

  it("reports gitignored files when --no-gitignore is set", async () => {
    write("index.js", `export const x = 1;`);
    write("dead.js", `console.log('d');`);
    fs.writeFileSync(path.join(tmpDir, ".gitignore"), "dead.js\n");
    await cli(
      tmpDir,
      "--no-gitignore",
      "--format",
      "json",
      "--config",
      "nope.js",
    );
    const jsonStr = console.log.mock.calls
      .map((c) => c[0])
      .find((s) => s?.startsWith("{"));
    expect(JSON.parse(jsonStr).unusedFiles).toContain("dead.js");
  });

  it("logs an error for an unsupported config extension", async () => {
    write("a.js", "// nothing");
    write("bad.ts", "export default {};");
    await cli(tmpDir, "--config", "bad.ts");
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Error loading config"),
    );
  });
});
