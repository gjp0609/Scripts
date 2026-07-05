// ==UserScript==
// @name         * Yacd 代理供应商标签
// @namespace    https://github.com/gjp0609/Scripts/
// @version      0.1
// @description  在 Yacd 代理列表中显示 proxy-provider 来源
// @author       noif
// @match        https://yacd.metacubex.one/*
// @grant        GM_xmlhttpRequest
// @connect      *
// @connect      127.0.0.1
// @connect      localhost
// @noframes
// @run-at       document-idle
// @require      file:///R:/Files/Workspace/Mine/Scripts/js/tampermonkey/yacd-provider-label.js
// ==/UserScript==

(function () {
    if (window.__yacdProviderLabelLoaded) {
        return;
    }
    window.__yacdProviderLabelLoaded = true;

    const DEFAULT_CONTROLLER = 'http://127.0.0.1:9090';
    const DEFAULT_SECRET = '123456';
    const REFRESH_INTERVAL = 60 * 1000;

    const state = {
        proxyProviders: new Map(),
        controllerConfig: null,
        timer: null,
        annotating: false,
        observer: null,
    };

    addStyle(`
        .yacd-provider-label {
            position: absolute;
            bottom: 12px;
            left: 55px;
            display: flex;
            align-items: center;
            max-width: calc(100% - 24px);
            height: 13px;
            padding: 0 4px;
            border-radius: 4px;
            color: #fff;
            font-size: 28px;
            font-weight: 600;
            line-height: 13px;
            white-space: nowrap;
            text-overflow: ellipsis;
            opacity: 0.1;
            pointer-events: auto;
            transform: rotate(-12deg);
            transform-origin: left bottom;
        }
    `);

    init();

    function init() {
        refreshProviderMap();
        state.timer = window.setInterval(refreshProviderMap, REFRESH_INTERVAL);
        state.observer = new MutationObserver(scheduleAnnotate);
        state.observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('hashchange', scheduleAnnotate);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                refreshProviderMap();
            }
        });
    }

    async function refreshProviderMap() {
        const configs = getControllerConfigs();
        let data;
        let lastError;

        for (const config of configs) {
            try {
                data = await requestJson(`${config.controller}/providers/proxies`, config.secret);
                state.controllerConfig = config;
                break;
            } catch (e) {
                lastError = e;
            }
        }

        if (!data) {
            console.warn('[yacd-provider-label] 读取代理供应商失败', lastError);
            return;
        }

        try {
            const providers = data?.providers || {};
            const next = new Map();

            Object.values(providers).forEach((provider) => {
                const providerName = provider?.name;
                const proxies = Array.isArray(provider?.proxies) ? provider.proxies : [];
                if (!providerName || !proxies.length || provider?.vehicleType === 'Compatible') {
                    return;
                }

                proxies.forEach((proxy) => {
                    const proxyName = proxy?.name;
                    if (!proxyName) {
                        return;
                    }
                    if (!next.has(proxyName)) {
                        next.set(proxyName, []);
                    }
                    const sourceName = proxy?.['provider-name'] || providerName;
                    if (!next.get(proxyName).includes(sourceName)) {
                        next.get(proxyName).push(sourceName);
                    }
                });
            });

            state.proxyProviders = next;
            scheduleAnnotate();
        } catch (e) {
            console.warn('[yacd-provider-label] 解析代理供应商失败', e);
        }
    }

    function scheduleAnnotate() {
        if (state.annotating) {
            return;
        }
        state.annotating = true;
        window.requestAnimationFrame(() => {
            state.annotating = false;
            annotateProxyNames();
        });
    }

    function annotateProxyNames() {
        if (!location.hash.includes('/proxies') || !state.proxyProviders.size || !document.body) {
            return;
        }

        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode(textNode) {
                const name = textNode.nodeValue.trim();
                if (!name || !state.proxyProviders.has(name)) {
                    return NodeFilter.FILTER_REJECT;
                }

                const parent = textNode.parentElement;
                if (!parent || parent.closest('.yacd-provider-label, script, style, textarea, input')) {
                    return NodeFilter.FILTER_REJECT;
                }

                return NodeFilter.FILTER_ACCEPT;
            },
        });

        const textNodes = [];
        while (walker.nextNode()) {
            textNodes.push(walker.currentNode);
        }

        textNodes.forEach((textNode) => {
            const name = textNode.nodeValue.trim();
            const providerText = state.proxyProviders.get(name).join(' / ');
            const next = textNode.nextSibling;
            if (next?.nodeType === Node.ELEMENT_NODE && next.classList.contains('yacd-provider-label')) {
                updateLabel(next, providerText);
                return;
            }

            const host = findProxyCard(textNode);
            if (!host || host.querySelector(':scope > .yacd-provider-label')) {
                return;
            }

            const label = document.createElement('span');
            label.className = 'yacd-provider-label';
            updateLabel(label, providerText);
            host.classList.add('yacd-provider-label-host');
            host.appendChild(label);
        });
    }

    function findProxyCard(textNode) {
        let element = textNode.parentElement;
        for (let i = 0; element && i < 6; i++) {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            const looksLikeCard =
                rect.width >= 120 &&
                rect.height >= 44 &&
                rect.height <= 120 &&
                (style.borderRadius !== '0px' || style.boxShadow !== 'none' || style.borderStyle !== 'none');
            if (looksLikeCard) {
                return element;
            }
            element = element.parentElement;
        }
        return textNode.parentElement;
    }

    function updateLabel(label, providerText) {
        label.textContent = providerText;
        label.title = `供应商：${providerText}`;
        label.style.color = colorOf(providerText);
    }

    function getControllerConfigs() {
        const configs = [];

        if (state.controllerConfig) {
            configs.push(state.controllerConfig);
        }

        configs.push(...readControllerConfigsFromStorage());
        configs.push({ controller: DEFAULT_CONTROLLER, secret: DEFAULT_SECRET, source: 'default' });

        const seen = new Set();
        return configs.filter((config) => {
            if (!config?.controller) {
                return false;
            }
            const key = `${config.controller}\n${config.secret || ''}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    function readControllerConfigsFromStorage() {
        const candidates = [];
        collectStorageCandidates(localStorage, candidates);
        collectStorageCandidates(sessionStorage, candidates);

        return candidates
            .filter((candidate) => candidate.controller && !candidate.controller.includes('yacd.metacubex.one'))
            .sort((a, b) => b.score - a.score)
            .map((candidate) => ({
                controller: candidate.controller,
                secret: candidate.hasSecret ? candidate.secret : '',
                source: candidate.source,
            }));
    }

    function collectStorageCandidates(storage, candidates) {
        for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            const raw = storage.getItem(key);
            if (!raw) {
                continue;
            }

            collectCandidatesFromValue(parseStorageValue(raw), key, candidates);
            collectCandidatesFromText(`${key} ${raw}`, key, candidates);
        }
    }

    function collectCandidatesFromValue(value, source, candidates, depth = 0) {
        if (depth > 8 || value == null) {
            return;
        }

        if (typeof value === 'string') {
            collectCandidatesFromText(value, source, candidates);
            return;
        }

        if (Array.isArray(value)) {
            value.forEach((item) => collectCandidatesFromValue(item, source, candidates, depth + 1));
            return;
        }

        if (typeof value !== 'object') {
            return;
        }

        const secretEntry = Object.entries(value).find(([key]) => /secret|token|password|passwd/i.test(key));
        const secret = secretEntry ? String(secretEntry[1] ?? '') : '';
        const hasSecret = Boolean(secretEntry);
        const controller =
            normalizeControllerUrl(pickValue(value, /controller|base.*url|api.*url|url|endpoint/i)) ||
            buildControllerUrl(pickValue(value, /host|hostname|server|address|addr/i), pickValue(value, /port/i));

        if (controller) {
            candidates.push({
                controller,
                secret,
                hasSecret,
                source,
                score: 10 + (hasSecret ? 5 : 0) + (/selected|current|active|profile|config/i.test(source) ? 3 : 0),
            });
        }

        Object.entries(value).forEach(([key, child]) => {
            collectCandidatesFromValue(child, `${source}.${key}`, candidates, depth + 1);
        });
    }

    function collectCandidatesFromText(text, source, candidates) {
        const controller = normalizeControllerUrl(text.match(/https?:\/\/[^"'\s,}]+/i)?.[0]) || normalizeHostPort(text);
        if (!controller) {
            return;
        }

        const secret = text.match(/(?:secret|token|password|passwd)["'\s:=]+([^"',}\s]+)/i)?.[1] || '';
        candidates.push({
            controller,
            secret,
            hasSecret: Boolean(secret),
            source,
            score: 3 + (secret ? 2 : 0),
        });
    }

    function parseStorageValue(raw) {
        try {
            return JSON.parse(raw);
        } catch {
            return raw;
        }
    }

    function pickValue(object, pattern) {
        const entry = Object.entries(object).find(([key, value]) => pattern.test(key) && typeof value !== 'object');
        return entry?.[1];
    }

    function buildControllerUrl(host, port) {
        if (!host) {
            return '';
        }

        const hostText = String(host).trim();
        const portText = port == null ? '' : String(port).trim();
        if (!hostText || hostText.includes('yacd.metacubex.one')) {
            return '';
        }

        return normalizeControllerUrl(`${hostText}${portText ? `:${portText}` : ''}`);
    }

    function normalizeHostPort(text) {
        const match = text.match(/(?:^|["'\s])((?:localhost|127\.0\.0\.1|\d{1,3}(?:\.\d{1,3}){3}|\[[\da-f:]+\]|[a-z0-9.-]+)(?::\d{2,5}))(?:[/"'\s,}]|$)/i);
        return normalizeControllerUrl(match?.[1]);
    }

    function normalizeControllerUrl(value) {
        if (value == null) {
            return '';
        }

        let text = String(value).trim();
        if (!text || text.includes('yacd.metacubex.one')) {
            return '';
        }

        text = text.replace(/\/(?:providers|proxies|configs|traffic|connections|rules).*/, '');
        if (!/^https?:\/\//i.test(text)) {
            text = `http://${text}`;
        }

        try {
            const url = new URL(text);
            if (url.hostname === 'yacd.metacubex.one') {
                return '';
            }
            return url.origin;
        } catch {
            return '';
        }
    }

    function requestJson(url, secret) {
        const headers = secret ? { Authorization: `Bearer ${secret}` } : {};

        return fetch(url, { headers })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.json();
            })
            .catch((fetchError) => {
                if (typeof GM_xmlhttpRequest !== 'function') {
                    throw fetchError;
                }

                return new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url,
                        headers,
                        timeout: 10000,
                        onload(response) {
                            if (response.status >= 200 && response.status < 300) {
                                try {
                                    resolve(JSON.parse(response.responseText));
                                } catch (e) {
                                    reject(e);
                                }
                            } else {
                                reject(new Error(`HTTP ${response.status}`));
                            }
                        },
                        ontimeout() {
                            reject(new Error('request timeout'));
                        },
                        onerror(error) {
                            reject(error);
                        },
                    });
                });
            });
    }

    function colorOf(text) {
        const colors = [
            '#3b82f6',
            '#10b981',
            '#f97316',
            '#8b5cf6',
            '#ef4444',
            '#14b8a6',
            '#64748b',
            '#d946ef',
        ];
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
        }
        return colors[hash % colors.length];
    }

    function addStyle(css) {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }
})();
