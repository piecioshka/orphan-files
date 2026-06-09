import fs from 'fs';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

const traverse = _traverse?.default ?? _traverse;

// Plugins enabled for every file. `decorators-legacy` covers the
// `experimentalDecorators` syntax used by Angular / NestJS / TypeORM / MobX,
// which previously crashed the parser. The remaining plugins cover modern
// syntax (import attributes, `export v from`, top-level await, etc.).
const BABEL_PLUGINS = [
    'jsx',
    'typescript',
    'decorators-legacy',
    'importAttributes',
    'exportDefaultFrom',
    'exportNamespaceFrom',
    'topLevelAwait',
];

function isImportMetaGlob(callee) {
    return (
        callee.type === 'MemberExpression' &&
        callee.object.type === 'MetaProperty' &&
        callee.object.meta?.name === 'import' &&
        callee.object.property?.name === 'meta' &&
        callee.property.type === 'Identifier' &&
        (callee.property.name === 'glob' || callee.property.name === 'globEager')
    );
}

// Turns a template literal like `./pages/${name}.js` into the glob `./pages/*.js`
// so dynamically-imported routes are not reported as unused.
function templateToGlob(node) {
    if (node.expressions.length === 0) return null;
    let out = '';
    node.quasis.forEach((q, i) => {
        /* v8 ignore next -- cooked is only null for invalid escapes, which never appear in import paths */
        out += q.value.cooked ?? q.value.raw;
        if (i < node.expressions.length) out += '*';
    });
    // Only meaningful when there is a static, relative-ish prefix to anchor on.
    return /[./]/.test(out) ? out : null;
}

function collectStringArgs(arg, sink) {
    if (!arg) return;
    if (arg.type === 'StringLiteral') {
        sink.add(arg.value);
    } else if (arg.type === 'ArrayExpression') {
        for (const el of arg.elements) {
            if (el?.type === 'StringLiteral') sink.add(el.value);
        }
    }
}

/**
 * Extracts every import/require/export-from specifier from a source file.
 * Glob specifiers (containing `*`, e.g. from `import.meta.glob`) are returned
 * verbatim and resolved against the file list later.
 */
export function extractImports(filePath) {
    const code = fs.readFileSync(filePath, 'utf-8');
    const ast = parse(code, {
        sourceType: 'unambiguous',
        plugins: BABEL_PLUGINS,
    });

    const imports = new Set();

    traverse(ast, {
        ImportDeclaration({ node }) {
            imports.add(node.source.value);
        },
        ExportAllDeclaration({ node }) {
            imports.add(node.source.value);
        },
        ExportNamedDeclaration({ node }) {
            if (node.source) imports.add(node.source.value);
        },
        CallExpression({ node }) {
            const callee = node.callee;
            const firstArg = node.arguments[0];

            if (callee.type === 'Identifier' && callee.name === 'require') {
                collectStringArgs(firstArg, imports);
            }

            if (callee.type === 'Import') {
                if (firstArg?.type === 'StringLiteral') {
                    imports.add(firstArg.value);
                } else if (firstArg?.type === 'TemplateLiteral') {
                    const glob = templateToGlob(firstArg);
                    if (glob) imports.add(glob);
                }
            }

            // jest.mock('...') / vi.mock('...')
            if (
                callee.type === 'MemberExpression' &&
                (callee.object.name === 'jest' || callee.object.name === 'vi') &&
                callee.property.name === 'mock'
            ) {
                collectStringArgs(firstArg, imports);
            }

            // Vite: import.meta.glob('./dir/*.js')
            if (isImportMetaGlob(callee)) {
                collectStringArgs(firstArg, imports);
            }
        },
    });

    return Array.from(imports);
}
