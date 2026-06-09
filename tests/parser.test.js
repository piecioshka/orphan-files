import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { extractImports } from '../lib/parser.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

let tmpDir;

beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-files-test-'));
});

afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true });
});

function writeFixture(name, content) {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, content);
    return filePath;
}

describe('extractImports', () => {
    it('extracts static import declarations', () => {
        const file = writeFixture('static.js', `
            import './a.js';
            import foo from './b.js';
            import { bar } from './c.js';
        `);
        expect(extractImports(file)).toEqual(expect.arrayContaining(['./a.js', './b.js', './c.js']));
    });

    it('extracts require() calls', () => {
        const file = writeFixture('require.js', `
            const x = require('./utils.js');
        `);
        expect(extractImports(file)).toContain('./utils.js');
    });

    it('extracts dynamic import() calls', () => {
        const file = writeFixture('dynamic.js', `
            const mod = import('./lazy.js');
        `);
        expect(extractImports(file)).toContain('./lazy.js');
    });

    it('extracts jest.mock() calls', () => {
        const file = writeFixture('mock.js', `
            jest.mock('./service.js');
        `);
        expect(extractImports(file)).toContain('./service.js');
    });

    it('extracts export * from', () => {
        const file = writeFixture('reexport-all.js', `
            export * from './module.js';
        `);
        expect(extractImports(file)).toContain('./module.js');
    });

    it('extracts export { x } from', () => {
        const file = writeFixture('reexport-named.js', `
            export { foo } from './foo.js';
        `);
        expect(extractImports(file)).toContain('./foo.js');
    });

    it('deduplicates repeated imports', () => {
        const file = writeFixture('dedup.js', `
            import './shared.js';
            import './shared.js';
        `);
        const result = extractImports(file);
        expect(result.filter(x => x === './shared.js')).toHaveLength(1);
    });

    it('ignores non-string-literal require() arguments', () => {
        const file = writeFixture('dynamic-require.js', `
            const mod = require(someVar);
        `);
        expect(extractImports(file)).toHaveLength(0);
    });

    it('returns empty array for file with no imports', () => {
        const file = writeFixture('empty.js', `console.log('hello');`);
        expect(extractImports(file)).toHaveLength(0);
    });

    it('handles TypeScript syntax', () => {
        const file = writeFixture('typed.ts', `
            import type { Foo } from './types.js';
            import { bar } from './bar.js';
        `);
        expect(extractImports(file)).toContain('./bar.js');
    });

    it('does not add import for named export without source (export { x })', () => {
        const file = writeFixture('local-export.js', `
            const x = 1;
            export { x };
        `);
        expect(extractImports(file)).toHaveLength(0);
    });

    it('does not add import for export * without source (edge case via AST)', () => {
        const file = writeFixture('export-star-no-source.js', `
            export * from './other.js';
            const y = 2;
            export { y };
        `);
        const result = extractImports(file);
        expect(result).toContain('./other.js');
        expect(result).toHaveLength(1);
    });
});
