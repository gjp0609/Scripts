export const DATABASE_NAME = 'histories';
export const DATABASE_VERSION = 5;

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

export type PageInput = {
  url: string;
  normalizedUrl?: string;
  title?: string;
  visitCount?: number;
  lastVisitTime?: number;
};

export type PageChunkRecord = {
  id: string;
  firstPageId: number;
  count: number;
  urls: string[];
  normalizedUrls: string[];
  titles: string[];
  visitCounts: Uint32Array;
  lastVisitTimes: Float64Array;
};

export type VisitRecord = {
  id: IDBValidKey;
  pageId: number;
  visitTime: number;
  transition: string;
};

export type VisitInput = Omit<VisitRecord, 'id'> & {
  id?: IDBValidKey;
};

export type VisitChunkRecord = {
  id: string;
  minVisitTime: number;
  maxVisitTime: number;
  count: number;
  pageIds: Uint32Array;
  visitTimes: Float64Array;
  transitionCodes: Uint8Array;
  sourceIndexes: Uint32Array;
  titles?: string[];
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
