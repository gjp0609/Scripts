import ImportWorker from './import-worker?worker';
import ExportWorker from './export-worker?worker';

export function createImportWorker(): Worker {
  return new ImportWorker();
}

export function createExportWorker(): Worker {
  return new ExportWorker();
}
