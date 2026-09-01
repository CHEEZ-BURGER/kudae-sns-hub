export type SourceSection = {
  id: string;
  header: string;
  category: string;
  title: string;
  body: string;
  articleUrl: string;
  credits: string;
  raw: string;
};

export type DraftAsset = {
  id: string;
  file: File;
  previewUrl: string;
  order: number;
};

export type DraftPost = {
  id: string;
  groupName: string;
  sectionId: string;
  confidence: number;
  title: string;
  body: string;
  articleUrl: string;
  credits: string;
  assets: DraftAsset[];
};

export type DistributionAsset = {
  id: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  thumbUrl: string;
  originalUrl: string;
  optimizedUrl: string | null;
  position: number;
};

export type CompletionRecord = {
  postId: string;
  platform: string;
  assignee: string;
  completedAt: string;
};

export type DistributionPost = {
  id: string;
  title: string;
  body: string;
  articleUrl: string;
  credits: string;
  position: number;
  assets: DistributionAsset[];
};

export type Distribution = {
  id: string;
  issueNumber: string;
  title: string;
  publishedAt: string;
  expiresAt: string | null;
  posts: DistributionPost[];
  completions: CompletionRecord[];
};
