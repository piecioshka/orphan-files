import { glob } from 'glob';
import fs from 'fs';
import path from 'path';

// Converts .gitignore lines into glob ignore patterns. Approximate but covers
// the common cases (dir names, rooted paths, extensions). Negations are skipped.
export function gitignoreToGlobs(content) {
    const globs = [];
    for (const raw of content.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#') || line.startsWith('!')) continue;

        let p = line;
        const rooted = p.startsWith('/');
        if (rooted) p = p.slice(1);
        const dirOnly = p.endsWith('/');
        if (dirOnly) p = p.slice(0, -1);

        const base = rooted ? p : `**/${p}`;
        globs.push(`${base}/**`);
        if (!dirOnly) globs.push(base);
    }
    return globs;
}

export function readGitignore(cwd) {
    const file = path.join(cwd, '.gitignore');
    if (!fs.existsSync(file)) return [];
    return gitignoreToGlobs(fs.readFileSync(file, 'utf-8'));
}

export async function scanProject(
    cwd,
    pattern = '**/*.{js,jsx,ts,tsx,mjs,cjs}',
    ignore = ['**/node_modules/**'],
    options = {},
) {
    const ignores = [...ignore];
    if (options.respectGitignore) ignores.push(...readGitignore(cwd));
    const files = await glob(pattern, { cwd, ignore: ignores, absolute: true });
    return files;
}
