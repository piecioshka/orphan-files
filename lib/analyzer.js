import path from 'path';
import { minimatch } from 'minimatch';
import { loadTsPathAliases, resolveImportToFiles } from './resolver.js';
import {
    BASELINE_ENTRY_PATTERNS,
    detectFrameworkEntries,
    collectPackageEntryFiles,
} from './config.js';

function toPosix(p) {
    return p.split(path.sep).join('/');
}

function matchesAny(relPath, patterns) {
    return patterns.some(pattern => minimatch(relPath, pattern, { matchBase: true }));
}

/**
 * Builds the resolved import graph, determines entry points, and computes the
 * set of files reachable from those entry points. Files that are NOT reachable
 * are unused — including whole islands of files that only import each other.
 *
 * @returns {{
 *   graph: Map<string, string[]>,
 *   reverseGraph: Map<string, string[]>,
 *   entries: Set<string>,
 *   reachable: Set<string>,
 *   unused: string[],
 * }}
 */
export function analyze(allFiles, fileImports, options = {}) {
    const projectDir = options.projectDir ?? process.cwd();
    const tsAliases = options.tsAliases ?? loadTsPathAliases(projectDir);
    const allFilesSet = new Set(allFiles);

    const graph = new Map();
    const reverseGraph = new Map();
    for (const file of allFiles) {
        graph.set(file, []);
        reverseGraph.set(file, []);
    }

    for (const [file, specifiers] of Object.entries(fileImports)) {
        if (!graph.has(file)) continue;
        const edges = graph.get(file);
        for (const specifier of specifiers) {
            const targets = resolveImportToFiles(specifier, file, tsAliases, allFilesSet, allFiles);
            for (const target of targets) {
                edges.push(target);
                reverseGraph.get(target).push(file);
            }
        }
    }

    const entryPatterns = [
        ...(options.entryPatterns ?? []),
        ...BASELINE_ENTRY_PATTERNS,
        ...detectFrameworkEntries(projectDir),
    ];

    const entries = new Set(collectPackageEntryFiles(projectDir, allFiles, allFilesSet));
    for (const file of allFiles) {
        if (matchesAny(toPosix(path.relative(projectDir, file)), entryPatterns)) {
            entries.add(file);
        }
    }

    const reachable = new Set();
    const queue = [...entries];
    while (queue.length > 0) {
        const file = queue.pop();
        if (reachable.has(file)) continue;
        reachable.add(file);
        for (const target of graph.get(file)) {
            if (!reachable.has(target)) queue.push(target);
        }
    }

    const unused = allFiles.filter(file => !reachable.has(file));
    return { graph, reverseGraph, entries, reachable, unused, tsAliases };
}

/**
 * Backward-compatible helper: returns the files that are not reachable from any
 * entry point. `exceptionPatterns` are treated as additional entry points (they
 * are kept and seed traversal of everything they import).
 */
export function findUnusedFiles(allFiles, fileImports, exceptionPatterns = [], projectDir = process.cwd()) {
    return analyze(allFiles, fileImports, { projectDir, entryPatterns: exceptionPatterns }).unused;
}

/**
 * Explains why a file is kept or unused: the chain of importers leading back to
 * an entry point, used by the CLI `--why` mode.
 */
export function explainFile(targetFile, result, projectDir = process.cwd()) {
    const { reverseGraph, entries, reachable } = result;
    if (!reverseGraph.has(targetFile)) {
        return { file: targetFile, status: 'unknown', reason: 'file was not scanned', path: [] };
    }
    if (entries.has(targetFile)) {
        return { file: targetFile, status: 'entry', reason: 'declared/detected as an entry point', path: [targetFile] };
    }
    if (!reachable.has(targetFile)) {
        return { file: targetFile, status: 'unused', reason: 'not reachable from any entry point', path: [] };
    }

    // BFS backwards to the nearest entry point.
    const visited = new Set([targetFile]);
    const queue = [[targetFile]];
    while (queue.length > 0) {
        const trail = queue.shift();
        const head = trail[trail.length - 1];
        if (entries.has(head)) {
            return {
                file: targetFile,
                status: 'used',
                reason: 'reachable from an entry point',
                path: [...trail].reverse().map(f => toPosix(path.relative(projectDir, f))),
            };
        }
        for (const importer of reverseGraph.get(head)) {
            if (!visited.has(importer)) {
                visited.add(importer);
                queue.push([...trail, importer]);
            }
        }
    }
    /* v8 ignore next 2 -- a reachable file always has a reverse path to an entry */
    return { file: targetFile, status: 'used', reason: 'reachable from an entry point', path: [] };
}
