import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { firstPreviewIssue, lastPreviewIssue, previewDays, previewForTitle, previewHtml, previewImageForTitle } from '../shared/share-preview.mjs';

const output = join(process.cwd(), 'dist');
const html = await readFile(join(output, 'index.html'), 'utf8');
const [owner = 'cheez-burger', repo = 'kudae-sns-hub'] = (process.env.GITHUB_REPOSITORY || 'cheez-burger/kudae-sns-hub').split('/');
const base = repo.endsWith('.github.io') ? '/' : `/${repo}/`;
const appUrl = `https://${owner.toLowerCase()}.github.io${base}`;
await mkdir(join(output, 'share'), { recursive: true });
await mkdir(join(output, 'share-images'), { recursive: true });

const regularFont = join(process.cwd(), 'scripts', 'assets', 'Pretendard-Regular.otf');
const boldFont = join(process.cwd(), 'scripts', 'assets', 'Pretendard-Bold.otf');
if (!GlobalFonts.registerFromPath(regularFont, 'Pretendard') || !GlobalFonts.registerFromPath(boldFont, 'Pretendard')) {
  throw new Error('Pretendard preview fonts could not be registered.');
}
const mark = await loadImage(join(process.cwd(), 'public', 'branding', 'ku-weekly-mark.png'));

function previewPng(label) {
  const canvas = createCanvas(800, 400);
  const context = canvas.getContext('2d');
  context.fillStyle = '#fffafb';
  context.fillRect(0, 0, 800, 400);

  context.fillStyle = '#1d1d1d';
  context.font = '700 50px Pretendard';
  context.fillText('고대신문 카드뉴스', 40, 128);
  context.fillText('업로드 링크', 40, 190);

  context.font = '400 28px Pretendard';
  context.fillText(label, 40, 326);
  context.drawImage(mark, 682, 266, 82, 82);
  return canvas.toBuffer('image/png');
}

let count = 0;
for (let issue = firstPreviewIssue; issue <= lastPreviewIssue; issue++) {
  await Promise.all(previewDays.map(async (day) => {
    const preview = previewForTitle(`${issue}호 카드뉴스${day ? ` (${day})` : ''}`);
    const previewImage = previewImageForTitle(preview.title);
    await writeFile(join(output, preview.path), previewHtml(html, preview.title, appUrl));
    await writeFile(join(output, previewImage.path), previewPng(previewImage.label));
    count++;
  }));
}
console.log(`Generated ${count} token-free Kakao preview pages and 800x400 images (${firstPreviewIssue}–${lastPreviewIssue}).`);
