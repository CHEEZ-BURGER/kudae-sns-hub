type ContentInput = { body?: string; articleUrl?: string; credits?: string };
export function extractArticleUrl(body?: string): string;
export function postContentParts(post: ContentInput): { body: string; articleUrl: string; credits: string };
export function postBody(post: ContentInput): string;
