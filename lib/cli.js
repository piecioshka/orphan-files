import minimist from "minimist";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { scanProject } from "./scanner.js";
import { extractImports } from "./parser.js";
import { analyze, explainFile } from "./analyzer.js";
import {
  DEFAULT_CONFIG,
  DEFAULT_CONFIG_BASENAME,
  findDefaultConfig,
  loadUserConfig,
} from "./config.js";
import {
  buildUnusedEntries,
  formatCli,
  formatJson,
  formatSarif,
  formatPdfMarkdown,
  formatGraph,
} from "./report.js";
import { loadBaseline, writeBaseline, applyBaseline } from "./baseline.js";

const CONFIG_TEMPLATE = `export default {
    include: ['**/*.{js,jsx,ts,tsx,mjs,cjs}'],
    exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.next/**',
        '**/coverage/**',
    ],
    // Entry points (kept, and everything they import is kept too).
    entry: [],
    exceptions: [
        'index.{js,ts}',
        '*.config.{js,ts,mjs,cjs}',
        '**/*.test.{js,ts,tsx}',
        '**/*.spec.{js,ts,tsx}',
        'bin/**',
        'scripts/**',
    ],
};
`;

export function showHelp() {
  console.log(`Usage: orphan-files [dir] [options]

Find unused files in your JavaScript/TypeScript project by analysing the import
graph and reporting files that are unreachable from any entry point.

Arguments:
  dir                      Project directory to scan (default: ".")

Options:
  -c, --config <path>      Config file (default: orphan-files.config.{js,mjs,cjs,json})
  -f, --format <type>      Output: cli, json, sarif, pdf (default: "cli")
  --sort <key>             Sort unused files: path, name, size (default: "path")
  --group                  Group unused files by directory
  --why <file>             Explain why a file is kept or unused, then exit
  --graph <type>           Print the dependency graph: mermaid, dot, html
  --fix                    Preview files that would be deleted (dry-run)
  --force                  With --fix, actually delete the files
  --baseline <path>        Ignore unused files recorded in a baseline file
  --update-baseline [path] Write current unused files as the baseline, then exit
  --max-unused <n>         Exit 0 when unused count is at most <n>
  --no-gitignore           Do not honour .gitignore
  --init                   Write a starter config file, then exit
  -v, --version            Print version
  -h, --help               Show this help message`);
}

export function getVersion() {
  const pkgPath = new URL("../package.json", import.meta.url);
  return JSON.parse(fs.readFileSync(pkgPath, "utf-8")).version;
}

function initConfig(cwd) {
  // Any supported extension counts as an existing config; writing a second
  // one would silently shadow it.
  const existing = findDefaultConfig(cwd);
  if (existing) {
    console.error(`Config already exists: ${existing}`);
    return 1;
  }
  const name = `${DEFAULT_CONFIG_BASENAME}.js`;
  fs.writeFileSync(path.join(cwd, name), CONFIG_TEMPLATE);
  console.log(`Created ${name}`);
  return 0;
}

async function gatherFiles(cwd, config, respectGitignore) {
  const all = [];
  for (const pattern of config.include) {
    const files = await scanProject(cwd, pattern, config.exclude, {
      respectGitignore,
    });
    all.push(...files);
  }
  return [...new Set(all)];
}

function parseAll(files, quiet) {
  const fileImports = {};
  for (const file of files) {
    try {
      fileImports[file] = extractImports(file);
    } catch (err) {
      if (!quiet) console.warn(`Failed to parse ${file}: ${err.message}`);
      fileImports[file] = [];
    }
  }
  return fileImports;
}

function generatePdf(markdown, cwd, hasUnused) {
  const mdPath = path.join(cwd, `orphan-files-report.md`);
  fs.writeFileSync(mdPath, markdown);
  try {
    execSync(`npx md-to-pdf "${mdPath}"`, { stdio: "inherit" });
    fs.unlinkSync(mdPath);
  } catch {
    console.error(
      "PDF generation failed. Make sure md-to-pdf is available (npx md-to-pdf).",
    );
    if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath);
    process.exit(1);
    return;
  }
  if (hasUnused) process.exit(1);
}

export async function run(rawArgv = process.argv.slice(2)) {
  const argv = minimist(rawArgv, {
    boolean: [
      "help",
      "version",
      "init",
      "fix",
      "force",
      "dry-run",
      "group",
      "gitignore",
    ],
    alias: { c: "config", f: "format", h: "help", v: "version" },
    default: {
      format: "cli",
      sort: "path",
      gitignore: true,
    },
  });

  if (argv.help) {
    showHelp();
    process.exit(0);
    return;
  }
  if (argv.version) {
    console.log(getVersion());
    process.exit(0);
    return;
  }

  const cwd = path.resolve(argv._[0] ?? ".");

  if (argv.init) {
    process.exit(initConfig(cwd));
    return;
  }

  // Output is "quiet" (machine-readable / single artifact) for everything but
  // the default human CLI format.
  const quiet =
    argv.format !== "cli" || Boolean(argv.why) || Boolean(argv.graph);

  let config = { ...DEFAULT_CONFIG };
  // An explicit --config is used as given; otherwise look for the default
  // basename with any supported extension.
  const configName = argv.config ?? findDefaultConfig(cwd);
  if (configName) {
    try {
      const userConfig = await loadUserConfig(path.resolve(cwd, configName));
      if (userConfig) {
        config = { ...config, ...userConfig };
        if (!quiet) console.log(`Loaded config from ${configName}`);
      }
    } catch (error) {
      console.error(`Error loading config: ${error.message}`);
    }
  }

  if (!quiet) console.log("Scanning files...");
  const files = await gatherFiles(cwd, config, argv.gitignore);
  if (!quiet) console.log(`Found ${files.length} files.`);

  if (!quiet) console.log("Parsing imports...");
  const fileImports = parseAll(files, quiet);

  if (!quiet) console.log("Analyzing usage...");
  const entryPatterns = [...config.exceptions, ...(config.entry ?? [])];
  const analysis = analyze(files, fileImports, {
    projectDir: cwd,
    entryPatterns,
  });

  // ---- Modes that short-circuit normal reporting ----
  if (argv.why) {
    const target = path.resolve(cwd, argv.why);
    const info = explainFile(target, analysis, cwd);
    console.log(`${argv.why}: ${info.status} - ${info.reason}`);
    if (info.path.length > 0) console.log(`  chain: ${info.path.join(" → ")}`);
    process.exit(0);
    return;
  }

  if (argv.graph) {
    const format = argv.graph === true ? "mermaid" : argv.graph;
    console.log(formatGraph(analysis, { projectDir: cwd, format }));
    process.exit(0);
    return;
  }

  let entries = buildUnusedEntries(analysis.unused, cwd, argv.sort);
  let unusedRelative = entries.map((e) => e.rel);

  if (argv["update-baseline"]) {
    const baselinePath = path.resolve(
      cwd,
      typeof argv["update-baseline"] === "string"
        ? argv["update-baseline"]
        : argv.baseline || ".orphan-files-baseline.json",
    );
    writeBaseline(baselinePath, unusedRelative);
    console.log(`Baseline written with ${unusedRelative.length} files.`);
    process.exit(0);
    return;
  }

  if (argv.baseline) {
    const baselineList = loadBaseline(path.resolve(cwd, argv.baseline)) ?? [];
    const fresh = new Set(applyBaseline(unusedRelative, baselineList));
    entries = entries.filter((e) => fresh.has(e.rel));
    unusedRelative = entries.map((e) => e.rel);
  }

  if (argv.fix) {
    return runFix(entries, cwd, Boolean(argv.force));
  }

  if (argv.format === "json") {
    console.log(formatJson(entries, files.length));
    finish(entries.length, argv);
    return;
  }

  if (argv.format === "sarif") {
    console.log(formatSarif(entries));
    finish(entries.length, argv);
    return;
  }

  if (argv.format === "pdf") {
    const markdown = formatPdfMarkdown(entries, {
      projectDir: cwd,
      totalFiles: files.length,
      dateString: new Date().toISOString().slice(0, 10),
    });
    generatePdf(markdown, cwd, entries.length > 0);
    return;
  }

  // Default human-readable CLI format.
  console.log(formatCli(entries, { group: argv.group }));
  finish(entries.length, argv);
}

function runFix(entries, cwd, force) {
  if (entries.length === 0) {
    console.log("No unused files to delete.");
    return;
  }
  if (!force) {
    console.log(
      `Would delete ${entries.length} files (re-run with --force to delete):`,
    );
    entries.forEach((e) => console.log(`  ${e.rel}`));
    process.exit(1);
    return;
  }
  let deleted = 0;
  for (const e of entries) {
    try {
      fs.rmSync(e.abs);
      console.log(`Deleted ${e.rel}`);
      deleted++;
    } catch (err) {
      console.error(`Failed to delete ${e.rel}: ${err.message}`);
    }
  }
  console.log(`Deleted ${deleted} of ${entries.length} files.`);
}

// Applies the exit code: respects --max-unused, otherwise fails when unused > 0.
function finish(unusedCount, argv) {
  const max = argv["max-unused"] !== undefined ? Number(argv["max-unused"]) : 0;
  if (unusedCount > max) process.exit(1);
}
