import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { extractImports } from "../lib/parser.js";
import fs from "fs";
import path from "path";
import os from "os";

let tmpDir;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-parser-extra-"));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

function write(name, content) {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe("extractImports — modern syntax", () => {
  it("parses files that use decorators without crashing", () => {
    const file = write(
      "decorated.ts",
      `
            import { Injectable } from './di.js';

            @Injectable()
            export class Service {
                constructor() {}
            }
        `,
    );
    expect(() => extractImports(file)).not.toThrow();
    expect(extractImports(file)).toContain("./di.js");
  });

  it("extracts vi.mock() calls", () => {
    const file = write("vimock.js", `vi.mock('./service.js');`);
    expect(extractImports(file)).toContain("./service.js");
  });

  it("extracts import.meta.glob() patterns", () => {
    const file = write(
      "glob.js",
      `const mods = import.meta.glob('./routes/*.js');`,
    );
    expect(extractImports(file)).toContain("./routes/*.js");
  });

  it("extracts import.meta.globEager() patterns", () => {
    const file = write(
      "globeager.js",
      `const mods = import.meta.globEager('./eager/*.js');`,
    );
    expect(extractImports(file)).toContain("./eager/*.js");
  });

  it("extracts an array of glob patterns and ignores non-string array elements", () => {
    const file = write(
      "globarray.js",
      `const m = import.meta.glob(['./a/*.js', './b/*.js', 123]);`,
    );
    const result = extractImports(file);
    expect(result).toContain("./a/*.js");
    expect(result).toContain("./b/*.js");
    expect(result).toHaveLength(2);
  });

  it("turns a dynamic import template literal into a glob", () => {
    const file = write(
      "dyn.js",
      `const load = (name) => import(\`./pages/\${name}.js\`);`,
    );
    expect(extractImports(file)).toContain("./pages/*.js");
  });

  it("ignores a dynamic import template with no static prefix", () => {
    const file = write("dyn-bare.js", `const load = (x) => import(\`\${x}\`);`);
    expect(extractImports(file)).toHaveLength(0);
  });

  it("ignores a dynamic import template with no interpolation", () => {
    const file = write(
      "dyn-static.js",
      `const load = () => import(\`./plain.js\`);`,
    );
    expect(extractImports(file)).toHaveLength(0);
  });

  it("supports require() with an array-less non-string argument", () => {
    const file = write("req-var.js", `const m = require(dynamicName);`);
    expect(extractImports(file)).toHaveLength(0);
  });

  it("ignores a dynamic import with a non-literal, non-template argument", () => {
    const file = write("dyn-var.js", `const load = (p) => import(p);`);
    expect(extractImports(file)).toHaveLength(0);
  });

  it("ignores holes in a glob array argument", () => {
    const file = write(
      "glob-hole.js",
      `const m = import.meta.glob([, './x/*.js']);`,
    );
    expect(extractImports(file)).toEqual(["./x/*.js"]);
  });

  it("handles require() with no arguments", () => {
    const file = write("req-empty.js", `const m = require();`);
    expect(extractImports(file)).toHaveLength(0);
  });
});
