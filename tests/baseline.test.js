import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadBaseline, writeBaseline, applyBaseline } from '../lib/baseline.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

let tmpDir;

beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-files-baseline-'));
});

afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true });
});

function writeFixture(name, content) {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, content);
    return filePath;
}

describe('loadBaseline', () => {
    it('returns null for a non-existent path', () => {
        const missing = path.join(tmpDir, 'does-not-exist.json');
        expect(loadBaseline(missing)).toBeNull();
    });

    it('returns the unusedFiles array from valid JSON', () => {
        const file = writeFixture('valid.json', JSON.stringify({ unusedFiles: ['a.js', 'b.js'] }));
        expect(loadBaseline(file)).toEqual(['a.js', 'b.js']);
    });

    it('returns an empty array when JSON lacks unusedFiles', () => {
        const file = writeFixture('no-key.json', JSON.stringify({}));
        expect(loadBaseline(file)).toEqual([]);
    });

    it('returns an empty array for invalid JSON', () => {
        const file = writeFixture('invalid.json', '{ this is not json');
        expect(loadBaseline(file)).toEqual([]);
    });
});

describe('writeBaseline', () => {
    it('writes a sorted unusedFiles object ending with a newline', () => {
        const file = path.join(tmpDir, 'out.json');
        writeBaseline(file, ['c.js', 'a.js', 'b.js']);

        const raw = fs.readFileSync(file, 'utf-8');
        expect(raw.endsWith('\n')).toBe(true);
        expect(JSON.parse(raw)).toEqual({ unusedFiles: ['a.js', 'b.js', 'c.js'] });
    });
});

describe('applyBaseline', () => {
    it('removes baselined entries and keeps fresh ones', () => {
        const result = applyBaseline(['known.js', 'fresh.js'], ['known.js']);
        expect(result).toEqual(['fresh.js']);
    });

    it('returns all entries when baseline is empty', () => {
        const result = applyBaseline(['a.js', 'b.js'], []);
        expect(result).toEqual(['a.js', 'b.js']);
    });

    it('returns empty when every entry is baselined', () => {
        const result = applyBaseline(['a.js', 'b.js'], ['a.js', 'b.js']);
        expect(result).toEqual([]);
    });
});
