import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const size = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url)).byteLength;

describe('Chrome extension package contract', () => {
  it('uses Chrome 148 structured clone with a narrowly scoped side panel', () => {
    const manifest = JSON.parse(read('extension/manifest.json'));
    expect(manifest.minimum_chrome_version).toBe('148');
    expect(manifest.message_serialization).toBe('structured_clone');
    expect(manifest.version).toBe('2.2.2');
    expect(manifest.icons['128']).toBe('branding/ku-weekly-mark.png');
    expect(manifest.action.default_icon['32']).toBe('branding/ku-weekly-mark.png');
    expect(manifest.permissions).toEqual(['storage', 'sidePanel', 'clipboardWrite']);
    expect(manifest.side_panel.default_path).toBe('sidepanel/index.html');
    expect(manifest.host_permissions).toContain('https://bcqqokdehkfaiuquktag.supabase.co/*');
    expect(manifest.host_permissions).toContain('https://www.facebook.com/*');
    expect(manifest.host_permissions).toContain('https://www.koreapas.com/*');
    expect(manifest.host_permissions).toContain('https://everytime.kr/*');
    expect(manifest.host_permissions).toContain('https://x.com/*');
    expect(manifest.host_permissions).toContain('https://studio.youtube.com/*');
    expect(JSON.stringify(manifest)).not.toMatch(/<all_urls>|downloads|cookies|history|webRequest/);
    const appScripts = manifest.content_scripts.find((entry: { matches: string[] }) => entry.matches.some((match: string) => match.includes('kudae-sns-hub'))).js;
    expect(appScripts).toEqual(['shared/constants.js', 'shared/validators.js', 'shared/protocol.js', 'content/app-bridge.js']);
  });

  it('packages the KU Weekly mark as the extension and side-panel identity', () => {
    const packager = read('scripts/package-extension.mjs');
    const panel = read('extension/sidepanel/index.html');
    expect(packager).toContain("zip.file('branding/ku-weekly-mark.png'");
    expect(packager).toContain("'public', 'branding', 'ku-weekly-mark.png'");
    expect(panel).toContain('/branding/ku-weekly-mark.png');
    expect(panel).not.toContain('<div class="mark">KU</div>');
  });

  it('loads a pasted distribution link in session-only panel state', () => {
    const panel = read('extension/sidepanel/sidepanel.js');
    expect(panel).toContain("url.origin !== 'https://cheez-burger.github.io'");
    expect(panel).toContain('chrome.storage.session');
    expect(panel).toContain("type: 'PANEL_UPLOAD_REQUEST'");
    expect(panel).toContain('navigator.clipboard.write');
    expect(panel).not.toContain('chrome.storage.local');
    expect(panel).toContain("import { postBody } from '../shared/post-content.mjs'");
    expect(read('extension/sidepanel/index.html')).toContain('<script type="module" src="sidepanel.js">');
    expect(read('extension/sidepanel/index.html')).not.toContain('id="toast"');
    expect(read('extension/sidepanel/index.html').indexOf('class="pager"')).toBeGreaterThan(read('extension/sidepanel/index.html').indexOf('class="post-card"'));
    expect(read('extension/sidepanel/index.html')).toContain('The Korea University Weekly');
    expect(read('extension/sidepanel/style.css')).toMatch(/\.pager \{ position: fixed;/);
    expect(read('extension/sidepanel/style.css')).toContain('bottom: 12px');
    expect(read('extension/sidepanel/style.css')).toContain("url('../fonts/PretendardVariable.woff2')");
    expect(size('extension/fonts/PretendardVariable.woff2')).toBeGreaterThan(1_000_000);
    expect(read('extension/fonts/OFL.txt')).toContain('SIL OPEN FONT LICENSE');
    expect(read('extension/sidepanel/index.html')).toContain('href="https://cheez-burger.github.io/kudae-sns-hub/#/admin"');
    expect(read('extension/sidepanel/index.html')).toContain('id="refresh-gate"');
    expect(read('extension/sidepanel/index.html')).toContain('id="copy-body-only"');
    expect(read('extension/sidepanel/sidepanel.js')).toContain("el('copy-body-only')");
  });

  it('injects FileList on supported non-Instagram sites without private framework hooks', () => {
    const adapter = read('extension/content/site-upload.js');
    expect(adapter).toContain('new DataTransfer()');
    expect(adapter).toContain("HTMLInputElement.prototype, 'files'");
    expect(adapter).toContain("new Event('input', { bubbles: true, composed: true })");
    expect(adapter).toContain("new Event('change', { bubbles: true, composed: true })");
    expect(adapter).toContain('new MutationObserver');
    expect(adapter).not.toMatch(/__reactFiber\$|__reactProps\$/);
  });

  it('injects a complete FileList and emits both input and change events', () => {
    const instagram = read('extension/content/instagram.js');
    expect(instagram).toContain('new DataTransfer()');
    expect(instagram).toContain("HTMLInputElement.prototype, 'files'");
    expect(instagram).toContain("new Event('input', { bubbles: true, composed: true })");
    expect(instagram).toContain("new Event('change', { bubbles: true, composed: true })");
    expect(instagram).toContain('new MutationObserver');
    expect(instagram).toContain('selectOriginalAspectRatio');
    expect(instagram).toMatch(/원본\|original/);
    expect(instagram).not.toMatch(/__reactFiber\$|__reactProps\$/);
  });

  it('keeps image binaries out of storage and disk download APIs', () => {
    const worker = read('extension/background/service-worker.js');
    expect(worker).toContain('new File([blob]');
    expect(worker).toContain('chrome.storage.session');
    expect(worker).not.toContain('chrome.downloads');
    expect(worker).not.toMatch(/base64|FileSystemAccess|showSaveFilePicker/);
  });

  it('keeps all status feedback in the panel without popup overlays or shadows', () => {
    expect(read('extension/content/overlay.js')).not.toContain('document.createElement');
    expect(read('extension/sidepanel/sidepanel.js')).not.toContain("el('toast')");
    expect(read('extension/sidepanel/style.css')).not.toContain('box-shadow');
    expect(read('src/styles.css')).not.toContain('box-shadow');
    expect(read('src/components/DistributionPage.tsx')).not.toContain('className="toast"');
    expect(read('src/components/AdminStudio.tsx')).not.toContain('window.confirm');
    expect(read('extension/sidepanel/sidepanel.js')).toContain('showRefreshGate');
    expect(read('extension/content/overlay.js')).toContain('KUDAE_CONTEXT_PING');
    expect(read('extension/shared/validators.js')).toContain('YouTube 게시물에는 이미지를 최대 10장');
    expect(read('extension/sidepanel/sidepanel.js')).toContain('YouTube 게시물에 이미지');
  });

  it('uses no heavier than Pretendard Bold and keeps default letter spacing', () => {
    const styles = `${read('src/styles.css')}\n${read('extension/sidepanel/style.css')}`;
    const components = ['src/components/AdminStudio.tsx', 'src/components/AdminUsersPanel.tsx', 'src/components/DistributionPage.tsx', 'src/components/LoginPage.tsx'].map(read).join('\n');
    expect(styles).not.toMatch(/font-weight:\s*(?:7[1-9]\d|[89]\d\d|1000)/);
    expect(styles).not.toContain('letter-spacing');
    expect(components).not.toMatch(/font-(?:black|extrabold)|tracking-/);
    expect(read('extension/sidepanel/style.css')).not.toContain('rotate(-3deg)');
  });
});
