// Config só para rodar as reproduções de tickets wayfinder (fora da suíte normal):
//   npx vitest run --config wayfinder/assets/vitest.repro.config.js
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    root: fileURLToPath(new URL('../../', import.meta.url)),
    test: {
        environment: 'jsdom',
        globals: true,
        include: ['wayfinder/assets/**/*.test.js']
    }
});
