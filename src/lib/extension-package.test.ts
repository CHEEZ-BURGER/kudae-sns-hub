import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('Chrome extension package contract', () => {
  it('uses Chrome 148 structured clone with minimal permissions', () => {
    const manifest = JSON.parse(read('extension/manifest.json'));
    expect(manifest.minimum_chrome_version).toBe('148');
    expect(manifest.message_serialization).toBe('structured_clone');
    expect(manifest.permissions).toEqual(['storage']);
    expect(manifest.host_permissions).toEqual(['https://bcqqokdehkfaiuquktag.supabase.co/*']);
    expect(JSON.stringify(manifest)).not.toMatch(/<all_urls>|downloads|cookies|history|webRequest/);
  });

  it('injects a complete FileList and emits both input and change events', () => {
    const instagram = read('extension/content/instagram.js');
    expect(instagram).toContain('new DataTransfer()');
    expect(instagram).toContain("HTMLInputElement.prototype, 'files'");
    expect(instagram).toContain("new Event('input', { bubbles: true, composed: true })");
    expect(instagram).toContain("new Event('change', { bubbles: true, composed: true })");
    expect(instagram).toContain('new MutationObserver');
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
