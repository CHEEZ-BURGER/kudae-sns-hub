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
    zip.file(relative(source, path).replaceAll('\\', '/'), await readFile(path));
  }));
}

await addDirectory(source);
await writeFile(output, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }));
console.log(`Packaged Chrome extension: ${relative(process.cwd(), output)}`);
