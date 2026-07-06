import {
  getLatestSearchSnapshot,
  getPageChunks,
  putSearchSnapshot
} from '../storage/database';
import type { SearchStorage } from './search-engine';

export function createIndexedDbSearchStorage(): SearchStorage {
  return {
    getPageChunks,
    putSearchSnapshot,
    getLatestSearchSnapshot
  };
}
