import fs from "fs";
import path from "path";

function toPosix(p) {
  return p.split(path.sep).join("/");
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileStats(absFile) {
  let size = 0;
  let loc = 0;
  try {
    size = fs.statSync(absFile).size;
    const content = fs.readFileSync(absFile, "utf-8");
    loc = content.length === 0 ? 0 : content.split("\n").length;
  } catch {
    // file may have been deleted between scan and report
  }
  return { size, loc };
}

// Builds an enriched list of unused entries with size/loc, sorted as requested.
export function buildUnusedEntries(unusedAbs, projectDir, sort = "path") {
  const entries = unusedAbs.map((abs) => {
    const rel = toPosix(path.relative(projectDir, abs));
    return { abs, rel, ...fileStats(abs) };
  });
  const sorters = {
    path: (a, b) => a.rel.localeCompare(b.rel),
    name: (a, b) => path.basename(a.rel).localeCompare(path.basename(b.rel)),
    size: (a, b) => b.size - a.size,
  };
  entries.sort(sorters[sort] ?? sorters.path);
  return entries;
}

function groupByDir(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const slash = entry.rel.indexOf("/");
    const dir = slash === -1 ? "." : entry.rel.slice(0, slash);
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir).push(entry);
  }
  return groups;
}

export function formatCli(entries, { group = false } = {}) {
  if (entries.length === 0) return "No unused files found!";

  const totalSize = entries.reduce((sum, e) => sum + e.size, 0);
  const totalLoc = entries.reduce((sum, e) => sum + e.loc, 0);
  const lines = [
    `Found ${entries.length} unused files (${formatBytes(totalSize)}, ${totalLoc} LOC reclaimable):`,
    "",
  ];

  const pad = Math.min(60, Math.max(...entries.map((e) => e.rel.length)));

  if (group) {
    for (const [dir, groupEntries] of groupByDir(entries)) {
      lines.push(`  ${dir}/ (${groupEntries.length})`);
      for (const e of groupEntries) {
        lines.push(`    ${e.rel.padEnd(pad)}  ${formatBytes(e.size)}`);
      }
    }
  } else {
    for (const e of entries) {
      lines.push(`${e.rel.padEnd(pad)}  ${formatBytes(e.size)}`);
    }
  }
  return lines.join("\n");
}

export function formatJson(entries, totalFiles) {
  return JSON.stringify(
    {
      totalFiles,
      unusedCount: entries.length,
      reclaimableBytes: entries.reduce((sum, e) => sum + e.size, 0),
      unusedFiles: entries.map((e) => e.rel),
    },
    null,
    2,
  );
}

export function formatSarif(entries) {
  return JSON.stringify(
    {
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      version: "2.1.0",
      runs: [
        {
          tool: {
            driver: {
              name: "orphan-files",
              informationUri: "https://github.com/piecioshka/orphan-files",
              rules: [
                {
                  id: "unused-file",
                  name: "UnusedFile",
                  shortDescription: {
                    text: "File is not reachable from any entry point",
                  },
                },
              ],
            },
          },
          results: entries.map((e) => ({
            ruleId: "unused-file",
            level: "warning",
            message: {
              text: `'${e.rel}' is not reachable from any entry point.`,
            },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: e.rel },
                },
              },
            ],
          })),
        },
      ],
    },
    null,
    2,
  );
}

export function formatPdfMarkdown(
  entries,
  { projectDir, totalFiles, dateString },
) {
  const lines = [
    "# orphan-files report",
    "",
    `**Date:** ${dateString}`,
    `**Project:** ${path.basename(projectDir)}`,
    `**Total files:** ${totalFiles}`,
    "",
  ];
  if (entries.length === 0) {
    lines.push("No unused files found.");
  } else {
    const totalSize = entries.reduce((sum, e) => sum + e.size, 0);
    lines.push(
      `## Unused files (${entries.length}) — ${formatBytes(totalSize)} reclaimable`,
      "",
    );
    entries.forEach((e) =>
      lines.push(`- \`${e.rel}\` (${formatBytes(e.size)})`),
    );
  }
  return lines.join("\n");
}

// ---- Dependency graph visualisation ----

function graphNodes(analysis, projectDir) {
  const ids = new Map();
  let i = 0;
  for (const file of analysis.graph.keys()) {
    ids.set(file, `n${i++}`);
  }
  const label = (file) => toPosix(path.relative(projectDir, file));
  return { ids, label };
}

export function formatGraph(analysis, { projectDir, format = "mermaid" }) {
  const { ids, label } = graphNodes(analysis, projectDir);
  const unused = new Set(analysis.unused);

  if (format === "dot") {
    const lines = ["digraph orphan {", "  rankdir=LR;", "  node [shape=box];"];
    for (const [file, id] of ids) {
      const color = unused.has(file)
        ? ' color="red"'
        : analysis.entries.has(file)
          ? ' color="green"'
          : "";
      lines.push(`  ${id} [label="${label(file)}"${color}];`);
    }
    for (const [file, targets] of analysis.graph) {
      for (const target of targets)
        lines.push(`  ${ids.get(file)} -> ${ids.get(target)};`);
    }
    lines.push("}");
    return lines.join("\n");
  }

  const mermaidLines = ["graph LR"];
  for (const [file, id] of ids) {
    mermaidLines.push(`  ${id}["${label(file)}"]`);
  }
  for (const [file, targets] of analysis.graph) {
    for (const target of targets)
      mermaidLines.push(`  ${ids.get(file)} --> ${ids.get(target)}`);
  }
  for (const [file, id] of ids) {
    if (unused.has(file)) mermaidLines.push(`  class ${id} unused;`);
    else if (analysis.entries.has(file))
      mermaidLines.push(`  class ${id} entry;`);
  }
  mermaidLines.push("  classDef unused fill:#fdd,stroke:#c00;");
  mermaidLines.push("  classDef entry fill:#dfd,stroke:#0a0;");
  const mermaid = mermaidLines.join("\n");

  if (format === "html") {
    return [
      "<!doctype html>",
      '<html><head><meta charset="utf-8"><title>orphan-files graph</title>',
      '<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>',
      "</head><body>",
      '<pre class="mermaid">',
      mermaid,
      "</pre>",
      "<script>mermaid.initialize({ startOnLoad: true, maxTextSize: 1000000 });</script>",
      "</body></html>",
    ].join("\n");
  }
  return mermaid;
}
