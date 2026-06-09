import { describe, it, expect } from 'vitest';
import { loadTsPathAliases, tryResolveFile, resolveImportToFiles } from '../lib/resolver.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

function makeTmp(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('loadTsPathAliases', () => {
    it('returns {} when no tsconfig.json exists', () => {
        const dir = makeTmp('orphan-res-notsconfig-');
        try {
            expect(loadTsPathAliases(dir)).toEqual({});
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('returns {} when tsconfig is unparseable even after comment-stripping', () => {
        const dir = makeTmp('orphan-res-badtsconfig-');
        try {
            // Not valid JSON, and stripping comments/trailing commas cannot rescue it.
            fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{ this is : not @@ json ]');
            expect(loadTsPathAliases(dir)).toEqual({});
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('parses JSONC with comments and trailing commas', () => {
        const dir = makeTmp('orphan-res-jsonc-');
        try {
            fs.writeFileSync(path.join(dir, 'tsconfig.json'),
                `// root config
{
    "compilerOptions": {
        /* path aliases */
        "baseUrl": ".",
        "paths": {
            "@/*": ["./src/*"], // wildcard alias with a trailing comma
        },
    },
}`
            );
            const aliases = loadTsPathAliases(dir);
            expect(aliases.paths).toEqual({ '@/*': ['./src/*'] });
            expect(aliases.pathsBaseDir).toBe(dir);
            expect(aliases.baseUrlDir).toBe(dir);
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('defines baseUrlDir when baseUrl is set', () => {
        const dir = makeTmp('orphan-res-baseurl-');
        try {
            fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
                compilerOptions: { baseUrl: 'src', paths: { '@/*': ['./*'] } },
            }));
            const aliases = loadTsPathAliases(dir);
            expect(aliases.baseUrlDir).toBe(path.join(dir, 'src'));
            expect(aliases.pathsBaseDir).toBe(path.join(dir, 'src'));
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('leaves baseUrlDir undefined when paths exist but baseUrl is absent', () => {
        const dir = makeTmp('orphan-res-nobaseurl-');
        try {
            fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
                compilerOptions: { paths: { '@/*': ['./src/*'] } },
            }));
            const aliases = loadTsPathAliases(dir);
            expect(aliases.baseUrlDir).toBeUndefined();
            expect(aliases.pathsBaseDir).toBe(dir);
            expect(aliases.paths).toEqual({ '@/*': ['./src/*'] });
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('follows a relative `extends` string to a base tsconfig that defines paths and baseUrl', () => {
        const dir = makeTmp('orphan-res-extends-rel-');
        try {
            fs.writeFileSync(path.join(dir, 'tsconfig.base.json'), JSON.stringify({
                compilerOptions: { baseUrl: '.', paths: { '@base/*': ['./base/*'] } },
            }));
            fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
                extends: './tsconfig.base.json',
                compilerOptions: { paths: { '@child/*': ['./child/*'] } },
            }));
            const aliases = loadTsPathAliases(dir);
            // Base paths + baseUrl inherited; child paths merged on top.
            expect(aliases.paths).toEqual({
                '@base/*': ['./base/*'],
                '@child/*': ['./child/*'],
            });
            // baseUrl came from the base config (resolved against its own dir).
            expect(aliases.baseUrlDir).toBe(dir);
            expect(aliases.pathsBaseDir).toBe(dir);
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('supports `extends` as an array (later entries replace the merged object)', () => {
        const dir = makeTmp('orphan-res-extends-arr-');
        try {
            fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({
                compilerOptions: { baseUrl: '.', paths: { '@a/*': ['./a/*'] } },
            }));
            fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify({
                compilerOptions: { paths: { '@b/*': ['./b/*'] } },
            }));
            fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
                extends: ['./a.json', './b.json'],
            }));
            const aliases = loadTsPathAliases(dir);
            // Each parent result spreads over `merged`, so the LAST array entry's
            // paths/baseUrl win: b.json (no baseUrl, only @b/*) replaces a.json's.
            expect(aliases.paths).toEqual({ '@b/*': ['./b/*'] });
            expect(aliases.baseUrlDir).toBeUndefined();
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('merges paths from multiple array `extends` when later entries also carry baseUrl', () => {
        const dir = makeTmp('orphan-res-extends-arr2-');
        try {
            // Both parents set baseUrl, so the last one wins for baseUrl while its
            // own compilerOptions.paths still merges over the inherited merged.paths.
            fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({
                compilerOptions: { baseUrl: '.', paths: { '@a/*': ['./a/*'] } },
            }));
            fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify({
                compilerOptions: { baseUrl: '.', paths: { '@b/*': ['./b/*'] } },
            }));
            // Child extends both, then adds its own path on top.
            fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
                extends: ['./a.json', './b.json'],
                compilerOptions: { paths: { '@child/*': ['./child/*'] } },
            }));
            const aliases = loadTsPathAliases(dir);
            // b.json replaces merged with its own paths ({@b}), child merges @child on top.
            expect(aliases.paths).toEqual({
                '@b/*': ['./b/*'],
                '@child/*': ['./child/*'],
            });
            expect(aliases.baseUrlDir).toBe(dir);
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('ignores an `extends` pointing to a missing file', () => {
        const dir = makeTmp('orphan-res-extends-missing-');
        try {
            fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
                extends: './does-not-exist.json',
                compilerOptions: { paths: { '@/*': ['./src/*'] } },
            }));
            const aliases = loadTsPathAliases(dir);
            // Missing parent is skipped gracefully; own options still apply.
            expect(aliases.paths).toEqual({ '@/*': ['./src/*'] });
            expect(aliases.baseUrlDir).toBeUndefined();
            expect(aliases.pathsBaseDir).toBe(dir);
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('resolves a bare `extends` specifier via node_modules (existing file)', () => {
        const dir = makeTmp('orphan-res-extends-bare-file-');
        try {
            // A bare specifier whose resolved candidate is an existing FILE.
            const pkgDir = path.join(dir, 'node_modules', '@tsconfig', 'base');
            fs.mkdirSync(pkgDir, { recursive: true });
            const barePath = '@tsconfig/base/tsconfig.json';
            fs.writeFileSync(path.join(pkgDir, 'tsconfig.json'), JSON.stringify({
                compilerOptions: { baseUrl: '.', paths: { '@pkg/*': ['./pkg/*'] } },
            }));
            fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
                extends: barePath,
            }));
            const aliases = loadTsPathAliases(dir);
            expect(aliases.paths).toEqual({ '@pkg/*': ['./pkg/*'] });
            // baseUrl resolves against the base config's own directory.
            expect(aliases.baseUrlDir).toBe(pkgDir);
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('resolves a bare `extends` specifier by appending .json (no node_modules file)', () => {
        const dir = makeTmp('orphan-res-extends-bare-nojson-');
        try {
            // Candidate in node_modules does NOT exist as a file → falls through to candidate + '.json'.
            const nmDir = path.join(dir, 'node_modules');
            fs.mkdirSync(nmDir, { recursive: true });
            fs.writeFileSync(path.join(nmDir, 'shared-config.json'), JSON.stringify({
                compilerOptions: { paths: { '@shared/*': ['./shared/*'] } },
            }));
            fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
                extends: 'shared-config',
            }));
            const aliases = loadTsPathAliases(dir);
            expect(aliases.paths).toEqual({ '@shared/*': ['./shared/*'] });
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('resolves a bare `extends` specifier that already ends with .json (no node_modules file)', () => {
        const dir = makeTmp('orphan-res-extends-bare-dotjson-');
        try {
            // Bare specifier ending in `.json`; node_modules candidate does NOT exist as a file,
            // so resolveExtends returns the candidate unchanged (its `.endsWith('.json')` true branch).
            // The resolved path does not exist → parent is null → ignored gracefully.
            fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
                extends: 'missing-pkg/tsconfig.json',
                compilerOptions: { paths: { '@/*': ['./src/*'] } },
            }));
            const aliases = loadTsPathAliases(dir);
            expect(aliases.paths).toEqual({ '@/*': ['./src/*'] });
            expect(aliases.baseUrlDir).toBeUndefined();
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('resolves a relative `extends` that already ends with .json (no extra suffix)', () => {
        const dir = makeTmp('orphan-res-extends-dotjson-');
        try {
            fs.writeFileSync(path.join(dir, 'tsconfig.base.json'), JSON.stringify({
                compilerOptions: { paths: { '@x/*': ['./x/*'] } },
            }));
            // extends without an explicit .json on a relative path → resolver appends .json.
            fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
                extends: './tsconfig.base',
            }));
            const aliases = loadTsPathAliases(dir);
            expect(aliases.paths).toEqual({ '@x/*': ['./x/*'] });
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('breaks a cyclic `extends` chain via the seen set', () => {
        const dir = makeTmp('orphan-res-extends-cycle-');
        try {
            // a.json extends b.json, b.json extends a.json → cycle.
            fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({
                extends: './b.json',
                compilerOptions: { paths: { '@a/*': ['./a/*'] } },
            }));
            fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify({
                extends: './a.json',
                compilerOptions: { paths: { '@b/*': ['./b/*'] } },
            }));
            fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
                extends: './a.json',
            }));
            // Should not infinite-loop; resolves what it can.
            const aliases = loadTsPathAliases(dir);
            expect(aliases.paths).toEqual({
                '@a/*': ['./a/*'],
                '@b/*': ['./b/*'],
            });
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('returns null past the depth limit (deep extends chain)', () => {
        const dir = makeTmp('orphan-res-extends-depth-');
        try {
            // Build a chain longer than the depth limit (10): tsconfig -> c0 -> c1 -> ... -> c11
            const chainLen = 12;
            for (let i = 0; i < chainLen; i++) {
                const next = i < chainLen - 1 ? { extends: `./c${i + 1}.json` } : {};
                fs.writeFileSync(
                    path.join(dir, `c${i}.json`),
                    JSON.stringify({ ...next, compilerOptions: { paths: { [`@c${i}/*`]: [`./c${i}/*`] } } })
                );
            }
            fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({ extends: './c0.json' }));
            // Deepest configs exceed depth > 10 and return null (their paths are dropped),
            // but the call itself must succeed without throwing.
            const aliases = loadTsPathAliases(dir);
            expect(aliases).toHaveProperty('paths');
            // The very deepest alias (@c11) sits beyond the depth limit and is absent.
            expect(aliases.paths).not.toHaveProperty('@c11/*');
            // A shallow alias near the top of the chain is present.
            expect(aliases.paths).toHaveProperty('@c0/*');
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });
});

describe('tryResolveFile', () => {
    it('returns the path when the exact file exists', () => {
        const dir = makeTmp('orphan-res-exact-');
        try {
            const f = path.join(dir, 'a.js');
            fs.writeFileSync(f, 'export const x = 1;');
            expect(tryResolveFile(f)).toBe(f);
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('resolves by adding an extension', () => {
        const dir = makeTmp('orphan-res-ext-');
        try {
            const f = path.join(dir, 'b.ts');
            fs.writeFileSync(f, 'export const x = 1;');
            expect(tryResolveFile(path.join(dir, 'b'))).toBe(f);
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('resolves a directory to its index file', () => {
        const dir = makeTmp('orphan-res-index-');
        try {
            const sub = path.join(dir, 'utils');
            fs.mkdirSync(sub);
            const idx = path.join(sub, 'index.ts');
            fs.writeFileSync(idx, 'export const x = 1;');
            expect(tryResolveFile(sub)).toBe(idx);
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('returns null when nothing matches', () => {
        const dir = makeTmp('orphan-res-none-');
        try {
            expect(tryResolveFile(path.join(dir, 'nope'))).toBeNull();
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });
});

describe('resolveImportToFiles', () => {
    it('resolves a relative import to [file]', () => {
        const dir = makeTmp('orphan-res-rel-');
        try {
            const a = path.join(dir, 'a.js');
            const b = path.join(dir, 'b.js');
            fs.writeFileSync(a, `import './b.js';`);
            fs.writeFileSync(b, 'export const x = 1;');
            const allFiles = [a, b];
            const set = new Set(allFiles);
            expect(resolveImportToFiles('./b.js', a, {}, set, allFiles)).toEqual([b]);
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('returns [] for a relative import that does not exist', () => {
        const dir = makeTmp('orphan-res-rel-missing-');
        try {
            const a = path.join(dir, 'a.js');
            fs.writeFileSync(a, `import './nope.js';`);
            const allFiles = [a];
            const set = new Set(allFiles);
            expect(resolveImportToFiles('./nope.js', a, {}, set, allFiles)).toEqual([]);
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('returns [] for a bare import with no aliases and no baseUrl', () => {
        const dir = makeTmp('orphan-res-bare-');
        try {
            const a = path.join(dir, 'a.js');
            fs.writeFileSync(a, `import 'lodash';`);
            const allFiles = [a];
            const set = new Set(allFiles);
            expect(resolveImportToFiles('lodash', a, {}, set, allFiles)).toEqual([]);
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('resolves a wildcard alias `@/*`', () => {
        const dir = makeTmp('orphan-res-wild-');
        try {
            fs.mkdirSync(path.join(dir, 'src'));
            const utils = path.join(dir, 'src', 'utils.ts');
            const index = path.join(dir, 'src', 'index.ts');
            fs.writeFileSync(utils, 'export const x = 1;');
            fs.writeFileSync(index, `import { x } from '@/utils';`);
            const aliases = { paths: { '@/*': ['./src/*'] }, pathsBaseDir: dir, baseUrlDir: dir };
            const allFiles = [utils, index];
            const set = new Set(allFiles);
            expect(resolveImportToFiles('@/utils', index, aliases, set, allFiles)).toEqual([utils]);
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('resolves a wildcard alias whose target has no `/*` suffix', () => {
        const dir = makeTmp('orphan-res-wild-nostar-');
        try {
            fs.mkdirSync(path.join(dir, 'src'));
            const utils = path.join(dir, 'src', 'utils.ts');
            const index = path.join(dir, 'src', 'index.ts');
            fs.writeFileSync(utils, 'export const x = 1;');
            fs.writeFileSync(index, `import { x } from '@/utils';`);
            // Target './src' lacks a trailing '/*' → exercises the false branch of target.endsWith('/*').
            const aliases = { paths: { '@/*': ['./src'] }, pathsBaseDir: dir, baseUrlDir: dir };
            const allFiles = [utils, index];
            const set = new Set(allFiles);
            expect(resolveImportToFiles('@/utils', index, aliases, set, allFiles)).toEqual([utils]);
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('tries the next wildcard target when the first one does not resolve', () => {
        const dir = makeTmp('orphan-res-wild-fallback-');
        try {
            fs.mkdirSync(path.join(dir, 'src'));
            const utils = path.join(dir, 'src', 'utils.ts');
            const index = path.join(dir, 'src', 'index.ts');
            fs.writeFileSync(utils, 'export const x = 1;');
            fs.writeFileSync(index, `import { x } from '@/utils';`);
            // First target missing on disk, second resolves → exercises the false branch of if (found).
            const aliases = { paths: { '@/*': ['./missing/*', './src/*'] }, pathsBaseDir: dir, baseUrlDir: dir };
            const allFiles = [utils, index];
            const set = new Set(allFiles);
            expect(resolveImportToFiles('@/utils', index, aliases, set, allFiles)).toEqual([utils]);
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('tries the next exact-alias target when the first one does not resolve', () => {
        const dir = makeTmp('orphan-res-exact-fallback-');
        try {
            fs.mkdirSync(path.join(dir, 'src'));
            const utils = path.join(dir, 'src', 'utils.ts');
            const index = path.join(dir, 'src', 'index.ts');
            fs.writeFileSync(utils, 'export const x = 1;');
            fs.writeFileSync(index, `import { x } from '@utils';`);
            // First exact target missing, second resolves → false branch of if (found) on the exact path.
            const aliases = {
                paths: { '@utils': ['./src/missing.ts', './src/utils.ts'] },
                pathsBaseDir: dir,
                baseUrlDir: dir,
            };
            const allFiles = [utils, index];
            const set = new Set(allFiles);
            expect(resolveImportToFiles('@utils', index, aliases, set, allFiles)).toEqual([utils]);
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('resolves an exact alias `@utils`', () => {
        const dir = makeTmp('orphan-res-exact-alias-');
        try {
            fs.mkdirSync(path.join(dir, 'src'));
            const utils = path.join(dir, 'src', 'utils.ts');
            const index = path.join(dir, 'src', 'index.ts');
            fs.writeFileSync(utils, 'export const x = 1;');
            fs.writeFileSync(index, `import { x } from '@utils';`);
            const aliases = { paths: { '@utils': ['./src/utils.ts'] }, pathsBaseDir: dir, baseUrlDir: dir };
            const allFiles = [utils, index];
            const set = new Set(allFiles);
            expect(resolveImportToFiles('@utils', index, aliases, set, allFiles)).toEqual([utils]);
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('resolves a bare specifier via explicit baseUrl', () => {
        const dir = makeTmp('orphan-res-baseurl-bare-');
        try {
            const srcDir = path.join(dir, 'src');
            fs.mkdirSync(path.join(srcDir, 'services'), { recursive: true });
            const foo = path.join(srcDir, 'services', 'foo.ts');
            const entry = path.join(srcDir, 'index.ts');
            fs.writeFileSync(foo, 'export const x = 1;');
            fs.writeFileSync(entry, `import 'services/foo';`);
            // baseUrl 'src' set → bare specifiers resolve relative to baseUrlDir.
            const aliases = { paths: {}, pathsBaseDir: srcDir, baseUrlDir: srcDir };
            const allFiles = [foo, entry];
            const set = new Set(allFiles);
            expect(resolveImportToFiles('services/foo', entry, aliases, set, allFiles)).toEqual([foo]);
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('returns [] when an aliased import resolves to a file not in the set', () => {
        const dir = makeTmp('orphan-res-alias-notinset-');
        try {
            fs.mkdirSync(path.join(dir, 'src'));
            const utils = path.join(dir, 'src', 'utils.ts');
            const index = path.join(dir, 'src', 'index.ts');
            fs.writeFileSync(utils, 'export const x = 1;');
            fs.writeFileSync(index, `import { x } from '@/utils';`);
            const aliases = { paths: { '@/*': ['./src/*'] }, pathsBaseDir: dir, baseUrlDir: dir };
            // utils.ts exists on disk and resolves, but it is intentionally NOT in allFilesSet.
            const allFiles = [index];
            const set = new Set(allFiles);
            expect(resolveImportToFiles('@/utils', index, aliases, set, allFiles)).toEqual([]);
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('falls back to baseUrl when paths exist but none match', () => {
        const dir = makeTmp('orphan-res-alias-fallthrough-');
        try {
            const srcDir = path.join(dir, 'src');
            fs.mkdirSync(path.join(srcDir, 'services'), { recursive: true });
            const foo = path.join(srcDir, 'services', 'foo.ts');
            const entry = path.join(srcDir, 'index.ts');
            fs.writeFileSync(foo, 'export const x = 1;');
            fs.writeFileSync(entry, `import 'services/foo';`);
            // A path alias exists but does NOT match 'services/foo' → falls through to baseUrl.
            const aliases = { paths: { '@/*': ['./other/*'] }, pathsBaseDir: srcDir, baseUrlDir: srcDir };
            const allFiles = [foo, entry];
            const set = new Set(allFiles);
            expect(resolveImportToFiles('services/foo', entry, aliases, set, allFiles)).toEqual([foo]);
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('resolves a relative glob specifier to multiple matched files in the set', () => {
        const dir = makeTmp('orphan-res-glob-');
        try {
            const entry = path.join(dir, 'index.js');
            const one = path.join(dir, 'one.js');
            const two = path.join(dir, 'two.js');
            const nested = path.join(dir, 'sub', 'three.js');
            fs.mkdirSync(path.join(dir, 'sub'));
            fs.writeFileSync(entry, `const m = import.meta.glob('./*.js');`);
            fs.writeFileSync(one, 'export const a = 1;');
            fs.writeFileSync(two, 'export const b = 2;');
            fs.writeFileSync(nested, 'export const c = 3;');
            const allFiles = [entry, one, two, nested];
            const set = new Set(allFiles);
            const result = resolveImportToFiles('./*.js', entry, {}, set, allFiles).sort();
            // Matches entry, one, two (same dir) but NOT the nested file.
            expect(result).toEqual([entry, one, two].sort());
            expect(result).not.toContain(nested);
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('resolves a glob via baseUrl when not relative', () => {
        const dir = makeTmp('orphan-res-glob-baseurl-');
        try {
            const srcDir = path.join(dir, 'src');
            fs.mkdirSync(path.join(srcDir, 'pages'), { recursive: true });
            const a = path.join(srcDir, 'pages', 'a.js');
            const b = path.join(srcDir, 'pages', 'b.js');
            const entry = path.join(srcDir, 'index.js');
            fs.writeFileSync(a, 'export const a = 1;');
            fs.writeFileSync(b, 'export const b = 2;');
            fs.writeFileSync(entry, `const m = import.meta.glob('pages/*.js');`);
            const aliases = { paths: {}, pathsBaseDir: srcDir, baseUrlDir: srcDir };
            const allFiles = [a, b, entry];
            const set = new Set(allFiles);
            const result = resolveImportToFiles('pages/*.js', entry, aliases, set, allFiles).sort();
            expect(result).toEqual([a, b].sort());
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('returns [] for a non-relative glob with no baseUrl', () => {
        const dir = makeTmp('orphan-res-glob-nobaseurl-');
        try {
            const entry = path.join(dir, 'index.js');
            const a = path.join(dir, 'a.js');
            fs.writeFileSync(entry, `const m = import.meta.glob('pages/*.js');`);
            fs.writeFileSync(a, 'export const a = 1;');
            const allFiles = [entry, a];
            const set = new Set(allFiles);
            // Non-relative glob and no baseUrlDir → resolveGlob returns [].
            expect(resolveImportToFiles('pages/*.js', entry, {}, set, allFiles)).toEqual([]);
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });

    it('handles a missing tsAliases argument (optional chaining) for bare imports', () => {
        const dir = makeTmp('orphan-res-noaliases-');
        try {
            const a = path.join(dir, 'a.js');
            fs.writeFileSync(a, `import 'lodash';`);
            const allFiles = [a];
            const set = new Set(allFiles);
            // No tsAliases passed at all — exercises the `?.` guards.
            expect(resolveImportToFiles('lodash', a, undefined, set, allFiles)).toEqual([]);
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });
});
