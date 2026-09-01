import { isImageFile, isManuscriptFile } from './workflow';

export type ExpandedFiles = { files: File[]; warnings: string[] };

export async function expandFiles(input: File[]): Promise<ExpandedFiles> {
  const files: File[] = [];
  const warnings: string[] = [];

  for (const file of input) {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      files.push(file);
      continue;
    }
    try {
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter((entry) => !entry.dir && !entry.name.startsWith('__MACOSX/'));
      for (const entry of entries) {
        const blob = await entry.async('blob');
        const name = entry.name.split('/').pop() ?? entry.name;
        files.push(new File([blob], name, { type: guessMime(name) }));
      }
    } catch {
      warnings.push(`${file.name}: ZIP 파일을 열 수 없습니다.`);
    }
  }
  return { files, warnings };
}

export async function extractManuscript(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'txt') return file.text();
  const buffer = await file.arrayBuffer();
  if (extension === 'docx') {
    const { default: mammoth } = await import('mammoth/mammoth.browser');
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value;
  }
  if (extension === 'hwp' || extension === 'hwpx') {
    const { hwpToText } = await import('@ssabrojs/hwpxjs/browser');
    return hwpToText(new Uint8Array(buffer));
  }
  throw new Error('지원하지 않는 원고 형식입니다.');
}

export function partitionSupportedFiles(files: File[]) {
  return {
    images: files.filter((file) => isImageFile(file.name)),
    manuscripts: files.filter((file) => isManuscriptFile(file.name)),
    unsupported: files.filter((file) => !isImageFile(file.name) && !isManuscriptFile(file.name) && !file.name.toLowerCase().endsWith('.zip')),
  };
}

function guessMime(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', txt: 'text/plain' } as Record<string, string>)[ext ?? ''] ?? 'application/octet-stream';
}

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file: (callback: (file: File) => void, error?: (reason: unknown) => void) => void;
  createReader: () => { readEntries: (callback: (entries: FileSystemEntryLike[]) => void, error?: (reason: unknown) => void) => void };
};

async function readEntry(entry: FileSystemEntryLike): Promise<File[]> {
  if (entry.isFile) return new Promise((resolve, reject) => entry.file((file) => resolve([file]), reject));
  if (!entry.isDirectory) return [];
  const reader = entry.createReader();
  const all: FileSystemEntryLike[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    all.push(...batch);
  }
  return (await Promise.all(all.map(readEntry))).flat();
}

export async function filesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const entries = [...dataTransfer.items]
    .map((item) => {
      const entryItem = item as unknown as { webkitGetAsEntry?: () => FileSystemEntryLike | null };
      return entryItem.webkitGetAsEntry?.() ?? null;
    })
    .filter((entry): entry is FileSystemEntryLike => entry !== null);
  if (!entries.length) return [...dataTransfer.files];
  return (await Promise.all(entries.map(readEntry))).flat();
}
