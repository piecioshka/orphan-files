import { describe, it, expect } from 'vitest';
import { analyze, explainFile } from '../lib/analyzer.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

function setup(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-analyze-'));
    const abs = {};
    for (const [name, content] of Object.entries(files)) {
        const p = path.join(dir, name);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, content);
        abs[name] = p;
    }
    return { dir, abs, cleanup: () => fs.rmSync(dir, { recursive: true }) };
}

describe('analyze — reachability', () => {
    it('reports an island of mutually-importing dead files as unused', () => {
        const { dir, abs, cleanup } = setup({
            'index.js': `import './used.js';`,
            'used.js': `export const x = 1;`,
            'dead-a.js': `import './dead-b.js';`,
            'dead-b.js': `import './dead-a.js';`,
            'lonely.js': `console.log('lonely');`,
        });
        try {
            const files = Object.values(abs);
            const imports = {
                [abs['index.js']]: ['./used.js'],
                [abs['used.js']]: [],
                [abs['dead-a.js']]: ['./dead-b.js'],
                [abs['dead-b.js']]: ['./dead-a.js'],
                [abs['lonely.js']]: [],
            };
            const { unused } = analyze(files, imports, { projectDir: dir });
            const names = unused.map(f => path.basename(f)).sort();
            expect(names).toEqual(['dead-a.js', 'dead-b.js', 'lonely.js']);
        } finally {
            cleanup();
        }
    });

    it('skips fileImports entries that are not part of allFiles', () => {
        const { dir, abs, cleanup } = setup({ 'index.js': `export const x = 1;` });
        try {
            const files = [abs['index.js']];
            const imports = {
                [abs['index.js']]: [],
                ['/not/scanned/ghost.js']: ['./whatever.js'],
            };
            expect(() => analyze(files, imports, { projectDir: dir })).not.toThrow();
        } finally {
            cleanup();
        }
    });

    it('accepts explicit tsAliases and entryPatterns options', () => {
        const { dir, abs, cleanup } = setup({
            'root.js': `import './leaf.js';`,
            'leaf.js': `export const y = 2;`,
        });
        try {
            const files = Object.values(abs);
            const imports = { [abs['root.js']]: ['./leaf.js'], [abs['leaf.js']]: [] };
            const result = analyze(files, imports, {
                projectDir: dir,
                tsAliases: { paths: {}, pathsBaseDir: dir, baseUrlDir: undefined },
                entryPatterns: ['root.js'],
            });
            expect(result.unused).toHaveLength(0);
        } finally {
            cleanup();
        }
    });

    it('uses process.cwd() and default aliases when options are omitted', () => {
        expect(() => analyze([], {})).not.toThrow();
        expect(analyze([], {}).unused).toEqual([]);
    });

    it('handles one entry point importing another entry point', () => {
        const { dir, abs, cleanup } = setup({
            'index.js': `export const x = 1;`,
            'main.js': `import './index.js';`,
        });
        try {
            const files = Object.values(abs);
            const imports = { [abs['index.js']]: [], [abs['main.js']]: ['./index.js'] };
            const result = analyze(files, imports, { projectDir: dir });
            // index.js gets enqueued both as an entry and as main.js's import.
            expect(result.unused).toHaveLength(0);
        } finally {
            cleanup();
        }
    });

    it('handles a diamond graph where a file is reached by multiple paths', () => {
        const { dir, abs, cleanup } = setup({
            'index.js': `import './a.js'; import './b.js';`,
            'a.js': `import './shared.js';`,
            'b.js': `import './shared.js';`,
            'shared.js': `export const x = 1;`,
        });
        try {
            const files = Object.values(abs);
            const imports = {
                [abs['index.js']]: ['./a.js', './b.js'],
                [abs['a.js']]: ['./shared.js'],
                [abs['b.js']]: ['./shared.js'],
                [abs['shared.js']]: [],
            };
            const result = analyze(files, imports, { projectDir: dir });
            expect(result.unused).toHaveLength(0);
            // shared.js is reached via both a.js and b.js; the reverse trace must
            // still terminate at the entry point.
            const info = explainFile(abs['shared.js'], result, dir);
            expect(info.status).toBe('used');
            expect(info.path[0]).toBe('index.js');
        } finally {
            cleanup();
        }
    });
});

describe('explainFile', () => {
    function build() {
        const { dir, abs, cleanup } = setup({
            'index.js': `import './util.js';`,
            'util.js': `export const x = 1;`,
            'orphan.js': `console.log('orphan');`,
        });
        const files = Object.values(abs);
        const imports = {
            [abs['index.js']]: ['./util.js'],
            [abs['util.js']]: [],
            [abs['orphan.js']]: [],
        };
        const result = analyze(files, imports, { projectDir: dir });
        return { dir, abs, result, cleanup };
    }

    it('marks an entry point as "entry"', () => {
        const { dir, abs, result, cleanup } = build();
        try {
            const info = explainFile(abs['index.js'], result, dir);
            expect(info.status).toBe('entry');
        } finally {
            cleanup();
        }
    });

    it('marks an unreachable file as "unused"', () => {
        const { dir, abs, result, cleanup } = build();
        try {
            const info = explainFile(abs['orphan.js'], result, dir);
            expect(info.status).toBe('unused');
        } finally {
            cleanup();
        }
    });

    it('traces a used file back to its entry point', () => {
        const { dir, abs, result, cleanup } = build();
        try {
            const info = explainFile(abs['util.js'], result, dir);
            expect(info.status).toBe('used');
            expect(info.path[0]).toBe('index.js');
            expect(info.path[info.path.length - 1]).toBe('util.js');
        } finally {
            cleanup();
        }
    });

    it('returns "unknown" for a file that was not scanned', () => {
        const { dir, result, cleanup } = build();
        try {
            const info = explainFile('/nowhere/ghost.js', result, dir);
            expect(info.status).toBe('unknown');
        } finally {
            cleanup();
        }
    });
});
