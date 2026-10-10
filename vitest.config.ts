import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        passWithNoTests: true,
        environment: 'happy-dom',
        include: ['packages/*/src/**/*.test.{ts,tsx}'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov', 'html'],
            include: ['packages/*/src/**/*.ts'],
            exclude: ['packages/*/src/**/*.test.{ts,tsx}', 'packages/*/src/index.ts'],
        },
    },
});
