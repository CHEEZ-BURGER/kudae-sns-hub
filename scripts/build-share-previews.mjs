import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { firstPreviewIssue, lastPreviewIssue, previewDays, previewForTitle, previewHtml } from '../shared/share-preview.mjs';

const output = join(process.cwd(), 'dist');
const html = await readFile(join(output, 'index.html'), 'utf8');
const [owner = 'cheez-burger', repo = 'kudae-sns-hub'] = (process.env.GITHUB_REPOSITORY || 'cheez-burger/kudae-sns-hub').split('/');
const base = repo.endsWith('.github.io') ? '/' : `/${repo}/`;
const appUrl = `https://${owner.toLowerCase()}.github.io${base}`;
await mkdir(join(output, 'share'), { recursive: true });
let count = 0;
for (let issue = firstPreviewIssue; issue <= lastPreviewIssue; issue++) {
  await Promise.all(previewDays.map(async (day) => {
    const preview = previewForTitle(`${issue}호 카드뉴스${day ? ` (${day})` : ''}`);
    await writeFile(join(output, preview.path), previewHtml(html, preview.title, appUrl));
    count++;
  }));
}
console.log(`Generated ${count} token-free Kakao preview pages (${firstPreviewIssue}–${lastPreviewIssue}).`);
