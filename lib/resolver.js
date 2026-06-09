import path from 'path';
import fs from 'fs';
import { minimatch } from 'minimatch';

const RESOLVE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json', '.d.ts'];

// Strips // and /* */ comments and trailing commas from JSONC, ignoring
// anything inside string literals.
function parseJsonc(raw) {
    try {
        return JSON.parse(raw);
    } catch {
        const cleaned = raw
            .replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str ?? '')
            .replace(/,(\s*[}\]])/g, '$1');
        return JSON.parse(cleaned);
    }
}

function resolveExtends(extendsValue, fromDir) {
    // Relative path → resolve from the current config's directory.
    if (extendsValue.startsWith('.')) {
        const p = path.resolve(fromDir, extendsValue);
        return p.endsWith('.json') ? p : `${p}.json`;
    }
    // Bare specifier → look it up in node_modules.
    const candidate = path.resolve(fromDir, 'node_modules', extendsValue);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    return candidate.endsWith('.json') ? candidate : `${candidate}.json`;
}

// Reads a tsconfig, following `extends` (string or array) so monorepo path
// aliases declared in a base config are honoured. Returns merged
// compilerOptions plus the directory each option should resolve against.
function readTsConfigChain(configPath, depth, seen) {
    if (depth > 10 || seen.has(configPath)) return null;
    if (!fs.existsSync(configPath)) return null;
    seen.add(configPath);

    let config;
    try {
        config = parseJsonc(fs.readFileSync(configPath, 'utf-8'));
    } catch {
        return null;
    }

    const dir = path.dirname(configPath);
    let merged = { paths: {}, baseUrl: undefined, baseDir: dir };

    const extendsList = Array.isArray(config.extends)
        ? config.extends
        : config.extends
            ? [config.extends]
            : [];
    for (const ext of extendsList) {
        const parent = readTsConfigChain(resolveExtends(ext, dir), depth + 1, seen);
        if (parent) merged = { ...merged, ...parent };
    }

    const co = config.compilerOptions ?? {};
    if (co.paths) merged.paths = { ...merged.paths, ...co.paths };
    if (co.baseUrl !== undefined) {
        merged.baseUrl = co.baseUrl;
        merged.baseDir = path.resolve(dir, co.baseUrl);
    }
    return merged;
}

export function loadTsPathAliases(projectDir) {
    const tsconfigPath = path.join(projectDir, 'tsconfig.json');
    const merged = readTsConfigChain(tsconfigPath, 0, new Set());
    if (!merged) return {};
    return {
        paths: merged.paths,
        // `paths` targets resolve against baseUrl, or the config dir when baseUrl is absent.
        pathsBaseDir: merged.baseDir,
        // Bare-specifier (`import 'utils/foo'`) resolution only applies when baseUrl is set explicitly.
        baseUrlDir: merged.baseUrl !== undefined ? merged.baseDir : undefined,
    };
}

export function tryResolveFile(resolved) {
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        return resolved;
    }
    for (const ext of RESOLVE_EXTENSIONS) {
        if (fs.existsSync(resolved + ext)) return resolved + ext;
    }
    for (const ext of RESOLVE_EXTENSIONS) {
        const indexFile = path.join(resolved, `index${ext}`);
        if (fs.existsSync(indexFile)) return indexFile;
    }
    return null;
}

function resolveAliasedImport(importPath, tsAliases) {
    const { paths = {}, pathsBaseDir } = tsAliases;
    for (const [alias, targets] of Object.entries(paths)) {
        const isWildcard = alias.endsWith('/*');
        const aliasPrefix = isWildcard ? alias.slice(0, -2) : alias;

        if (isWildcard && importPath.startsWith(aliasPrefix + '/')) {
            const suffix = importPath.slice(aliasPrefix.length + 1);
            for (const target of targets) {
                const targetBase = target.endsWith('/*') ? target.slice(0, -2) : target;
                const found = tryResolveFile(path.resolve(pathsBaseDir, targetBase, suffix));
                if (found) return found;
            }
        } else if (!isWildcard && importPath === aliasPrefix) {
            for (const target of targets) {
                const found = tryResolveFile(path.resolve(pathsBaseDir, target));
                if (found) return found;
            }
        }
    }
    return null;
}

// Resolves a glob specifier (e.g. from `import.meta.glob` or a dynamic
// `import(`./pages/${x}`)`) to every matching file in the project.
function resolveGlob(specifier, sourceFile, tsAliases, allFiles) {
    let absPattern;
    if (specifier.startsWith('.')) {
        absPattern = path.resolve(path.dirname(sourceFile), specifier);
    } else if (tsAliases.baseUrlDir) {
        absPattern = path.resolve(tsAliases.baseUrlDir, specifier);
    } else {
        return [];
    }
    const opts = { dot: true };
    return allFiles.filter(f => minimatch(f, absPattern, opts));
}

/**
 * Resolves a single import specifier to zero or more project files.
 * @param {Set<string>} allFilesSet
 * @param {string[]} allFiles
 */
export function resolveImportToFiles(specifier, sourceFile, tsAliases, allFilesSet, allFiles) {
    if (specifier.includes('*')) {
        return resolveGlob(specifier, sourceFile, tsAliases, allFiles).filter(f => allFilesSet.has(f));
    }

    let resolved = null;
    if (specifier.startsWith('.')) {
        resolved = tryResolveFile(path.resolve(path.dirname(sourceFile), specifier));
    } else if (Object.keys(tsAliases?.paths ?? {}).length > 0 && (resolved = resolveAliasedImport(specifier, tsAliases))) {
        // resolved via path alias
    } else if (tsAliases?.baseUrlDir) {
        // tsconfig `baseUrl` allows bare specifiers relative to baseUrlDir.
        resolved = tryResolveFile(path.resolve(tsAliases.baseUrlDir, specifier));
    }

    if (resolved && allFilesSet.has(resolved)) return [resolved];
    return [];
}
