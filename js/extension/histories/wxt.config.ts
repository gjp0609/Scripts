import { defineConfig } from 'wxt';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = fileURLToPath(new URL('.', import.meta.url));
const devBrowserDataDir = path.join(projectDir, 'dev-browser-data');

for (const browser of ['chromium', 'firefox']) {
  mkdirSync(path.join(devBrowserDataDir, browser), { recursive: true });
}

export default defineConfig({
  srcDir: '.',
  entrypointsDir: 'entrypoints',
  outDir: '.output',
  manifestVersion: 3,
  webExt: {
    chromiumProfile: path.join(devBrowserDataDir, 'chromium'),
    firefoxProfile: path.join(devBrowserDataDir, 'firefox'),
    keepProfileChanges: true
  },
  manifest: ({ browser }) => ({
    name: 'Histories',
    description: 'Chrome and Firefox compatible history search and HTU import/export.',
    version: '0.1.0',
    permissions: ['history', 'storage', 'unlimitedStorage', 'downloads'],
    browser_specific_settings:
      browser === 'firefox'
        ? {
            gecko: {
              id: 'histories@example.local',
              data_collection_permissions: {
                required: ['none']
              }
            }
          }
        : undefined,
    action: {
      default_title: 'Histories'
    },
    options_ui: {
      open_in_tab: true
    }
  })
});
