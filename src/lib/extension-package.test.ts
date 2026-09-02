import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('Chrome extension package contract', () => {
  it('uses Chrome 148 structured clone with a narrowly scoped side panel', () => {
    const manifest = JSON.parse(read('extension/manifest.json'));
    expect(manifest.minimum_chrome_version).toBe('148');
    expect(manifest.message_serialization).toBe('structured_clone');
    expect(manifest.version).toBe('2.1.0');
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
});
