import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const ENTRY = path.join(ROOT, 'js/extension/histories/src/ui/result-row.ts');
const ESBUILD = path.join(ROOT, 'node_modules/esbuild/bin/esbuild');

const context = { timeDisplay: '24', openLinksInNewTab: true, faviconUrl: undefined };

function result(overrides = {}) {
    return {
        pageId: 1,
        url: 'https://example.com/page',
        title: '示例标题',
        visitCount: 3,
        lastVisitTime: Date.UTC(2026, 8, 30, 1, 41, 7),
        ...overrides,
    };
}

test('结果行包含时间、图标、标题三列，顺序与 HTU 一致', async () => {
    const { renderResultRowHtml } = await loadModule();
    const html = renderResultRowHtml(result(), result().lastVisitTime, 0, context);

    const timeIndex = html.indexOf('class="timeColumn"');
    const faviconIndex = html.indexOf('class="faviconColumn"');
    const urlIndex = html.indexOf('class="urlColumn"');

    assert.ok(timeIndex >= 0, '应包含时间列');
    assert.ok(faviconIndex >= 0, '应包含图标列');
    assert.ok(urlIndex >= 0, '应包含标题列');
    assert.ok(timeIndex < faviconIndex && faviconIndex < urlIndex, '列顺序应为时间、图标、标题');
});

test('未声明 favicon 权限时图标列为空且不产生网络请求', async () => {
    const { renderResultRowHtml } = await loadModule();
    const html = renderResultRowHtml(result(), result().lastVisitTime, 0, context);
    assert.ok(!html.includes('<img'), '不应渲染 img');
    assert.ok(!html.includes('_favicon'), '不应引用 favicon 接口');
});

test('声明 favicon 权限时图标列引用本地 _favicon 接口', async () => {
    const { renderResultRowHtml } = await loadModule();
    const html = renderResultRowHtml(result(), result().lastVisitTime, 0, {
        ...context,
        faviconUrl: 'chrome-extension://abc/_favicon/?pageUrl=x&size=16',
    });
    assert.ok(html.includes('<img'), '应渲染 img');
    assert.ok(html.includes('/_favicon/'), '应使用本地图标接口');
});

test('不保留删除用复选框列', async () => {
    const { renderResultRowHtml } = await loadModule();
    const html = renderResultRowHtml(result(), result().lastVisitTime, 0, context);
    assert.ok(!html.includes('type="checkbox"'), '第一阶段不做删除，不应保留复选框占位');
    assert.ok(!html.includes('name="visits"'), '不应保留 HTU 的访问复选框');
});

test('标题与域名相同时不重复显示域名', async () => {
    const { renderResultRowHtml } = await loadModule();
    const same = renderResultRowHtml(
        result({ title: 'example.com', url: 'https://example.com/' }),
        result().lastVisitTime,
        0,
        context,
    );
    assert.ok(!same.includes('histdomain'), '标题即域名时不应重复显示');

    const different = renderResultRowHtml(result(), result().lastVisitTime, 0, context);
    assert.ok(different.includes('histdomain'), '标题与域名不同时应显示域名');
    assert.ok(different.includes('example.com'), '应显示域名文本');
});

test('标题为空时回退为网址', async () => {
    const { renderResultRowHtml } = await loadModule();
    const html = renderResultRowHtml(result({ title: '   ' }), result().lastVisitTime, 0, context);
    assert.ok(html.includes('https://example.com/page'), '空标题应回退为网址');
});

test('24 与 12 小时制按设置渲染', async () => {
    const { renderResultRowHtml } = await loadModule();
    const timestamp = Date.UTC(2026, 8, 30, 1, 41, 7);
    const h24 = renderResultRowHtml(result(), timestamp, 0, { ...context, timeDisplay: '24' });
    const h12 = renderResultRowHtml(result(), timestamp, 0, { ...context, timeDisplay: '12' });

    assert.notEqual(h24, h12, '两种制式应产生不同输出');
    assert.ok(/\d{2}:\d{2}:\d{2}/.test(h24), `24 小时制应形如 09:41:07，实际 ${h24}`);
});

test('是否新标签打开由设置决定', async () => {
    const { renderResultRowHtml } = await loadModule();
    const blank = renderResultRowHtml(result(), result().lastVisitTime, 0, context);
    const self = renderResultRowHtml(result(), result().lastVisitTime, 0, {
        ...context,
        openLinksInNewTab: false,
    });

    assert.ok(blank.includes('target="_blank"'), '默认应在新标签页打开');
    assert.ok(self.includes('target="_self"'), '关闭后应在当前标签页打开');
    assert.ok(blank.includes('rel="noreferrer"'), '外部链接应带 noreferrer');
});

test('输出对 HTML 特殊字符做转义', async () => {
    const { renderResultRowHtml } = await loadModule();
    const html = renderResultRowHtml(
        result({ title: '<script>alert(1)</script>', url: 'https://example.com/?a=1&b="2"' }),
        result().lastVisitTime,
        0,
        context,
    );

    assert.ok(!html.includes('<script>'), '标题中的脚本标签必须被转义');
    assert.ok(html.includes('&lt;script&gt;'), '应输出转义后的文本');
    assert.ok(!html.includes('b="2"'), '属性中的引号必须被转义');
});

test('日期分隔行携带当日起止时间戳', async () => {
    const { renderDayDividerHtml } = await loadModule();
    const html = renderDayDividerHtml(result().lastVisitTime);
    assert.ok(html.includes('class="new_day"'), '应使用 new_day 类');
    assert.ok(/data-day-start="\d+"/.test(html), '应带起始时间戳');
    assert.ok(/data-day-end="\d+"/.test(html), '应带结束时间戳');
    assert.ok(html.includes('colspan="3"'), '分隔行应横跨三列');
});

test('同一日期只出现一次分隔行，跨日期时新增', async () => {
    const { renderResultsHtml } = await loadModule();
    const day1 = Date.UTC(2026, 8, 30, 1, 0, 0);
    const day2 = Date.UTC(2026, 8, 29, 1, 0, 0);
    const html = renderResultsHtml(
        [
            result({ pageId: 1, lastVisitTime: day1 }),
            result({ pageId: 2, lastVisitTime: day1 - 60_000 }),
            result({ pageId: 3, lastVisitTime: day2 }),
        ],
        context,
    );

    assert.equal((html.match(/class="new_day"/g) ?? []).length, 2, '两个日期应产生两个分隔行');
    assert.equal((html.match(/class="urlColumn"/g) ?? []).length, 3, '三行结果都应渲染');
});

test('结果为空时返回空字符串', async () => {
    const { renderResultsHtml } = await loadModule();
    assert.equal(renderResultsHtml([], context), '');
});

test('命中访问时间优先于最后访问时间', async () => {
    const { renderResultsHtml } = await loadModule();
    const matched = Date.UTC(2026, 8, 30, 5, 0, 0);
    const last = Date.UTC(2026, 7, 1, 0, 0, 0);
    const html = renderResultsHtml([result({ matchedVisitTime: matched, lastVisitTime: last })], context);

    assert.ok(html.includes('13:00:00'), `应按命中时间 05:00 UTC 渲染，实际 ${html}`);
});

let loadedModule;
let tempDir;

/** 与 search-engine.test.mjs 一致：先用 esbuild 打包 TS 源码，再导入产物。 */
async function loadModule() {
    if (loadedModule) return loadedModule;

    tempDir = await mkdtemp(path.join(tmpdir(), 'histories-ui-result-row-test-'));
    const outfile = path.join(tempDir, 'result-row.mjs');
    await bundle(outfile);
    loadedModule = await import(pathToFileURL(outfile));
    return loadedModule;
}

function bundle(outfile) {
    return new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            [ESBUILD, ENTRY, '--bundle', '--format=esm', '--platform=node', '--target=es2022', `--outfile=${outfile}`],
            { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
        );
        let stderr = '';
        child.stderr.on('data', (chunk) => {
            stderr += String(chunk);
        });
        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(stderr || `esbuild exited with ${code}`));
        });
    });
}

test.after(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
});
