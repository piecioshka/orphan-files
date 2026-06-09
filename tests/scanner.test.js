import { describe, it, expect } from 'vitest';
import { scanProject } from '../lib/scanner.js';
import path from 'path';

const FIXTURE_DIR = path.resolve(import.meta.dirname, 'fixtures/project');

describe('scanProject', () => {
    it('finds all JS files in a directory', async () => {
        const files = await scanProject(FIXTURE_DIR, '**/*.js');
        expect(files.length).toBeGreaterThan(0);
        expect(files.every(f => f.endsWith('.js'))).toBe(true);
    });

    it('returns absolute paths', async () => {
        const files = await scanProject(FIXTURE_DIR, '**/*.js');
        expect(files.every(f => path.isAbsolute(f))).toBe(true);
    });

    it('respects ignore patterns', async () => {
        const files = await scanProject(FIXTURE_DIR, '**/*.js', ['**/unused.js']);
        expect(files.some(f => f.endsWith('unused.js'))).toBe(false);
    });

    it('returns empty array when no files match', async () => {
        const files = await scanProject(FIXTURE_DIR, '**/*.coffee');
        expect(files).toEqual([]);
    });

    it('finds specific files by name pattern', async () => {
        const files = await scanProject(FIXTURE_DIR, '**/index.js');
        expect(files).toHaveLength(1);
        expect(files[0]).toMatch(/index\.js$/);
    });
});
