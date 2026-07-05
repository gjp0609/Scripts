import './styles.css';
import { createRuntimeAdapter } from '../../src/runtime/browser-adapter';
import { getDatabaseSummary } from '../../src/storage/database';

const runtime = createRuntimeAdapter();

const runtimeStatus = document.querySelector<HTMLElement>('#runtimeStatus');
const storageStatus = document.querySelector<HTMLElement>('#storageStatus');
const snapshotStatus = document.querySelector<HTMLElement>('#snapshotStatus');
const resultSummary = document.querySelector<HTMLElement>('#resultSummary');
const searchButton = document.querySelector<HTMLButtonElement>('#searchButton');

async function boot() {
  try {
    const response = await runtime.sendMessage({ type: 'histories:ping' });
    if (runtimeStatus) {
      runtimeStatus.textContent = response?.version ? `Connected ${response.version}` : 'Connected';
    }
  } catch (error) {
    if (runtimeStatus) runtimeStatus.textContent = 'Unavailable';
    console.error('[histories] runtime ping failed', error);
  }

  try {
    const summary = await getDatabaseSummary();
    if (storageStatus) {
      storageStatus.textContent = `${summary.pages} pages / ${summary.visits} visits`;
    }
    if (snapshotStatus) {
      snapshotStatus.textContent = summary.hasSearchSnapshot ? 'Ready' : 'Missing';
    }
  } catch (error) {
    if (storageStatus) storageStatus.textContent = 'Unavailable';
    if (snapshotStatus) snapshotStatus.textContent = 'Unknown';
    console.error('[histories] database summary failed', error);
  }
}

searchButton?.addEventListener('click', () => {
  if (resultSummary) {
    resultSummary.textContent = 'Search module is not implemented yet';
  }
});

boot();
