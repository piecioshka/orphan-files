import { describe, it, expect } from "vitest";
import { scanProject, extractImports, findUnusedFiles } from "../index.js";

describe("index.js public API", () => {
  it("exports scanProject as a function", () => {
    expect(typeof scanProject).toBe("function");
  });

  it("exports extractImports as a function", () => {
    expect(typeof extractImports).toBe("function");
  });

  it("exports findUnusedFiles as a function", () => {
    expect(typeof findUnusedFiles).toBe("function");
  });
});
