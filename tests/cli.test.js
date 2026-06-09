import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

vi.mock('child_process', () => ({
    execSync: vi.fn(),
}));

const { execSync } = await import('child_process');

describe('showHelp', () => {
    it('prints help text to stdout', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { showHelp } = await import('../lib/cli.js');
        showHelp();
        expect(logSpy.mock.calls.flat().join(' ')).toContain('orphan-files');
        logSpy.mockRestore();
    });
});

describe('run', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-cli-'));
        vi.spyOn(process, 'exit').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.mocked(execSync).mockReset();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true });
        vi.restoreAllMocks();
    });

    async function cli(...args) {
        const { run } = await import('../lib/cli.js');
        return run(args);
    }

    it('exits 0 with --help', async () => {
        await cli('--help');
        expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('exits 0 with -h', async () => {
        await cli('-h');
        expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('uses "." as cwd when no positional dir argument given', async () => {
        const orig = process.cwd();
        try {
            process.chdir(tmpDir);
            await cli('--format', 'cli', '--config', 'nonexistent.js');
            const output = console.log.mock.calls.flat().join('\n');
            expect(output).toContain('No unused files found!');
        } finally {
            process.chdir(orig);
        }
    });

    it('uses process.argv when called without rawArgv argument', async () => {
        const { run } = await import('../lib/cli.js');
        const orig = process.argv;
        process.argv = ['node', 'orphan-files', '--help'];
        try {
            await run();
            expect(process.exit).toHaveBeenCalledWith(0);
        } finally {
            process.argv = orig;
        }
    });

    describe('cli format (default)', () => {
        it('reports "No unused files found!" when all files are used', async () => {
            // index.js is in default exceptions; b.js is imported → nothing unused
            fs.writeFileSync(path.join(tmpDir, 'index.js'), `import './b.js';`);
            fs.writeFileSync(path.join(tmpDir, 'b.js'), `export const x = 1;`);
            await cli(tmpDir, '--config', 'nonexistent.js');
            const output = console.log.mock.calls.flat().join('\n');
            expect(output).toContain('No unused files found!');
        });

        it('reports unused files and exits 1', async () => {
            fs.writeFileSync(path.join(tmpDir, 'a.js'), '// nothing');
            fs.writeFileSync(path.join(tmpDir, 'b.js'), '// nothing');
            await cli(tmpDir, '--config', 'nonexistent.js');
            expect(process.exit).toHaveBeenCalledWith(1);
            const output = console.log.mock.calls.flat().join('\n');
            expect(output).toContain('unused files');
        });

        it('logs "Scanning files..." progress messages', async () => {
            fs.writeFileSync(path.join(tmpDir, 'a.js'), '// nothing');
            await cli(tmpDir, '--config', 'nonexistent.js');
            const output = console.log.mock.calls.flat().join('\n');
            expect(output).toContain('Scanning files...');
            expect(output).toContain('Parsing imports...');
            expect(output).toContain('Analyzing usage...');
        });

        it('logs parse warnings for unparseable files', async () => {
            fs.writeFileSync(path.join(tmpDir, 'bad.js'), '<invalid> js syntax <<<');
            await cli(tmpDir, '--config', 'nonexistent.js');
            expect(console.warn).toHaveBeenCalled();
        });

        it('loads user config and logs confirmation', async () => {
            const cfgPath = path.join(tmpDir, 'orphan-files.config.js');
            fs.writeFileSync(cfgPath, `export default { exceptions: ['**/*.js'] };`);
            fs.writeFileSync(path.join(tmpDir, 'a.js'), '// nothing');
            await cli(tmpDir);
            const output = console.log.mock.calls.flat().join('\n');
            expect(output).toContain('Loaded config from orphan-files.config.js');
        });

        it('logs error and continues when config file is invalid', async () => {
            const cfgPath = path.join(tmpDir, 'orphan-files.config.js');
            fs.writeFileSync(cfgPath, `export default INVALID_SYNTAX_HERE;`);
            fs.writeFileSync(path.join(tmpDir, 'a.js'), '// nothing');
            await cli(tmpDir);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error loading config'));
        });

        it('does not log "Loaded config" in json format even when config exists', async () => {
            const cfgPath = path.join(tmpDir, 'orphan-files.config.js');
            fs.writeFileSync(cfgPath, `export default { exceptions: ['**/*.js'] };`);
            fs.writeFileSync(path.join(tmpDir, 'a.js'), '// nothing');
            await cli(tmpDir, '--format', 'json');
            const nonJsonOutput = console.log.mock.calls.map(c => c[0]).filter(s => !s?.startsWith('{'));
            expect(nonJsonOutput).toHaveLength(0);
        });

        it('does not log parse warnings in json format', async () => {
            fs.writeFileSync(path.join(tmpDir, 'bad.js'), '<invalid> js syntax <<<');
            await cli(tmpDir, '--format', 'json', '--config', 'nonexistent.js');
            expect(console.warn).not.toHaveBeenCalled();
        });
    });

    describe('json format', () => {
        it('outputs valid JSON when no unused files', async () => {
            fs.writeFileSync(path.join(tmpDir, 'index.js'), `import './b.js';`);
            fs.writeFileSync(path.join(tmpDir, 'b.js'), `export const x = 1;`);
            await cli(tmpDir, '--format', 'json', '--config', 'nonexistent.js');
            const jsonStr = console.log.mock.calls.map(c => c[0]).find(s => s?.startsWith('{'));
            const result = JSON.parse(jsonStr);
            expect(result).toMatchObject({ totalFiles: expect.any(Number), unusedCount: 0, unusedFiles: [] });
            expect(process.exit).not.toHaveBeenCalledWith(1);
        });

        it('outputs valid JSON and exits 1 when unused files exist', async () => {
            fs.writeFileSync(path.join(tmpDir, 'a.js'), '// nothing');
            await cli(tmpDir, '--format', 'json', '--config', 'nonexistent.js');
            const jsonStr = console.log.mock.calls.map(c => c[0]).find(s => s?.startsWith('{'));
            const result = JSON.parse(jsonStr);
            expect(result.unusedCount).toBeGreaterThan(0);
            expect(process.exit).toHaveBeenCalledWith(1);
        });

        it('does not print progress messages in json format', async () => {
            fs.writeFileSync(path.join(tmpDir, 'a.js'), '// nothing');
            await cli(tmpDir, '--format', 'json', '--config', 'nonexistent.js');
            const output = console.log.mock.calls.map(c => c[0]).filter(s => !s?.startsWith('{'));
            expect(output).toHaveLength(0);
        });
    });

    describe('pdf format', () => {
        it('calls execSync to generate PDF when no unused files', async () => {
            vi.mocked(execSync).mockImplementation(() => {});
            fs.writeFileSync(path.join(tmpDir, 'index.js'), `import './b.js';`);
            fs.writeFileSync(path.join(tmpDir, 'b.js'), `export const x = 1;`);
            await cli(tmpDir, '--format', 'pdf', '--config', 'nonexistent.js');
            expect(execSync).toHaveBeenCalledWith(expect.stringContaining('md-to-pdf'), expect.any(Object));
            expect(process.exit).not.toHaveBeenCalledWith(1);
        });

        it('calls execSync and exits 1 when unused files found', async () => {
            vi.mocked(execSync).mockImplementation(() => {});
            fs.writeFileSync(path.join(tmpDir, 'a.js'), '// nothing');
            await cli(tmpDir, '--format', 'pdf', '--config', 'nonexistent.js');
            expect(execSync).toHaveBeenCalled();
            expect(process.exit).toHaveBeenCalledWith(1);
        });

        it('prints error and exits 1 when PDF generation fails', async () => {
            vi.mocked(execSync).mockImplementation(() => { throw new Error('npx not found'); });
            fs.writeFileSync(path.join(tmpDir, 'a.js'), '// nothing');
            await cli(tmpDir, '--format', 'pdf', '--config', 'nonexistent.js');
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('PDF generation failed'));
            expect(process.exit).toHaveBeenCalledWith(1);
        });

        it('skips md unlink when file was never written (writeFileSync mocked)', async () => {
            vi.mocked(execSync).mockImplementation(() => { throw new Error('fail'); });
            fs.writeFileSync(path.join(tmpDir, 'a.js'), '// nothing');
            // mock writeFileSync so the md file is never created on disk
            const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {});
            await cli(tmpDir, '--format', 'pdf', '--config', 'nonexistent.js');
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('PDF generation failed'));
            expect(process.exit).toHaveBeenCalledWith(1);
            writeSpy.mockRestore();
        });
    });
});
