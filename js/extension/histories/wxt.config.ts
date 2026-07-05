import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: '.',
  entrypointsDir: 'entrypoints',
  outDir: '.output',
  manifestVersion: 3,
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
