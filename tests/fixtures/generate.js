import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'project');

if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
}

const files = {
    'index.js': "import './a.js';\nimport './b.js';",
    'a.js': "console.log('a');",
    'b.js': "import './c.js';",
    'c.js': "console.log('c');",
    'unused.js': "console.log('unused');",
    'test.spec.js': "console.log('test');",
    'orphan-files.config.js': `
    export default {
      include: ['**/*.js'],
      exclude: [],
      exceptions: ['index.js', '*.spec.js', 'orphan-files.config.js']
    };
  `
};

for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(fixturesDir, name), content);
}

console.log('Fixtures generated in', fixturesDir);
