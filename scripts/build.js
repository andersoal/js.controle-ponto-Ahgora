#!/usr/bin/env node
/**
 * Build script
 * Empacota os módulos ES em src/ em um único userscript Tampermonkey.
 */

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const outDir = join(rootDir, 'dist');
const outFile = join(outDir, 'ahgora-panel.user.js');
const metaFile = join(rootDir, 'src', 'meta.js');

async function main() {
    mkdirSync(outDir, { recursive: true });

    const meta = readFileSync(metaFile, 'utf-8');

    const result = await build({
        entryPoints: [join(rootDir, 'src', 'main.js')],
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: ['es2020'],
        write: false,
        minify: false,
        sourcemap: false,
        banner: {
            js: meta.trim() + '\n\n'
        }
    });

    if (result.errors.length > 0) {
        console.error('Build errors:', result.errors);
        process.exit(1);
    }

    if (result.warnings.length > 0) {
        console.warn('Build warnings:', result.warnings);
    }

    const bundleText = result.outputFiles[0].text;
    writeFileSync(outFile, bundleText, 'utf-8');

    const lines = bundleText.split('\n').length;
    const bytes = Buffer.byteLength(bundleText, 'utf-8');
    console.log(`Built ${outFile} (${lines} lines, ${bytes} bytes)`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
