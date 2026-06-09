export default {
    exceptions: [
        'index.{js,ts}',
        '*.config.{js,ts,mjs,cjs}',
        '**/*.test.{js,ts,tsx}',
        '**/*.spec.{js,ts,tsx}',
        'bin/**',
        'scripts/**',
        // Test fixtures are intentionally not imported anywhere.
        'tests/fixtures/**',
    ],
};
