export const DATABASE_NAME = 'histories';
export const DATABASE_VERSION = 1;

export type PageRecord = {
  id: number;
  url: string;
  normalizedUrl: string;
  title: string;
  host: string;
  domain: string;
  visitCount: number;
  lastVisitTime: number;
  createdAt: number;
  updatedAt: number;
};

export type VisitRecord = {
  id: string;
  pageId: number;
  visitTime: number;
  transition: string;
};

export type SearchSnapshotRecord = {
  key: 'latest';
  schemaVersion: number;
  sqliteVersion: string;
  createdAt: number;
  sourceRevision: string;
  bytes: Uint8Array;
  pageCount: number;
  snapshotSize: number;
};

export type JobRecord = {
  id: string;
  type: 'history-sync' | 'htu-import' | 'htu-export' | 'search-rebuild' | 'stats-build';
  status: 'queued' | 'running' | 'complete' | 'failed' | 'cancelled';
  startedAt?: number;
  updatedAt: number;
  cursor?: unknown;
  progress?: unknown;
  error?: string;
};
