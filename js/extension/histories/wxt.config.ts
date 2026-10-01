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
        keepProfileChanges: true,
    },
    manifest: ({ browser }) => ({
        name: 'Histories',
        description: 'Chrome and Firefox compatible history search and HTU import/export.',
        version: '0.1.0',
        // favicon 权限仅 Chromium 支持（_favicon 内部接口）；Firefox 传入会被
        // web-ext 判为未知权限，故只在 chromium 构建中加入。
        permissions: [
            'history',
            'storage',
            'unlimitedStorage',
            'downloads',
            ...(browser === 'firefox' ? [] : ['favicon']),
        ],
        content_security_policy: {
            extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
        },
        browser_specific_settings:
            browser === 'firefox'
                ? {
                      gecko: {
                          id: 'histories@example.local',
                          data_collection_permissions: {
                              required: ['none'],
                          },
                      },
                  }
                : undefined,
        action: {
            default_title: 'Histories',
        },
        // options_ui.open_in_tab 由 WXT 从 options 入口 HTML 的
        // <meta name="manifest.open_in_tab"> 读取；写在这里会被 WXT 覆盖。
        //
        // 历史页入口刻意不叫 history.html：WXT 会把 entrypoints/history/index.html
        // 识别为内置 history 类型并写入 chrome_url_overrides.history，从而接管
        // 浏览器自带的 chrome://history。HTU 自身也没有这个覆盖，故改用 browse.html。
    }),
});
