import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import JSZip from 'jszip';

const source = join(process.cwd(), 'extension');
const output = join(process.cwd(), 'dist', 'kudae-sns-upload-helper.zip');
const zip = new JSZip();

async function addDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return addDirectory(path);
    const zipPath = relative(source, path).replaceAll('\\', '/');
    if (zipPath === 'sidepanel/runtime-config.js') {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
      const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
      zip.file(zipPath, `globalThis.KudaeSNSConfig = ${JSON.stringify({ supabaseUrl, publishableKey })};\n`);
      return;
    }
    zip.file(zipPath, await readFile(path));
  }));
}

await addDirectory(source);
await writeFile(output, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }));
console.log(`Packaged Chrome extension: ${relative(process.cwd(), output)}`);
