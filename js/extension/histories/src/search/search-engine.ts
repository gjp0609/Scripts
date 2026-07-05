export type SearchQuery = {
  keyword: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
};

export type SearchResult = {
  pageId: number;
  url: string;
  title: string;
  visitCount: number;
  lastVisitTime: number;
};

export class SearchEngine {
  async loadSnapshot(): Promise<void> {
    throw new Error('SearchEngine.loadSnapshot is not implemented yet.');
  }

  async search(_query: SearchQuery): Promise<SearchResult[]> {
    throw new Error('SearchEngine.search is not implemented yet.');
  }
}
