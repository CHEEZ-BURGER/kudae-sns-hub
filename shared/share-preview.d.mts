export const firstPreviewIssue: number;
export const lastPreviewIssue: number;
export const previewDays: string[];
export function titleFromManuscript(filename?: string, text?: string, fallbackIssue?: string): string;
export function previewForTitle(title: string): { title: string; path: string } | null;
export function distributionShareUrl(appUrl: string, token: string, title: string): string;
export function previewHtml(appHtml: string, title: string, appUrl: string): string;
