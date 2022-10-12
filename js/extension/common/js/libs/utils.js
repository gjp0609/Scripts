const cache = {
    expireKey: ':expire',
    saveLocal: (key, value, expire) => {
        const defaultExpire = 60 * 60 * 2; // 默认 2 小时
        expire = expire ?? defaultExpire;
        if (expire > 0) {
            const now = Date.now() / 1000;
            expire = expire + now;
            localStorage.setItem(key + ':expire', String(expire));
        }
        localStorage.setItem(key, value);
    },
    getLocal: (key) => {
        const value = localStorage.getItem(key);
        const expireTime = localStorage.getItem(key + cache.expireKey);
        if (expireTime === null) {
            return value;
        } else {
            if (cache.isExpire(expireTime)) {
                localStorage.removeItem(key);
                localStorage.removeItem(key + cache.expireKey);
            } else {
                return value;
            }
        }
        return null;
    },
    clearExpired: () => {
        let count = 0;
        const keys = Object.keys(localStorage);
        keys.forEach((key) => {
            if (key.indexOf(cache.expireKey) > 0) {
                if (cache.isExpire(localStorage.getItem(key) ?? '0')) {
                    count++;
                    localStorage.removeItem(key);
                    localStorage.removeItem(key.replace(cache.expireKey, ''));
                }
            }
        });
        console.log(`cleaned ${count} expired cache`);
    },
    isExpire: (expireTime) => {
        return Date.now() / 1000 > parseInt(expireTime);
    }
};
const cachedFetch = function (url, options, debugMode) {
    if (debugMode) {
        return fetch(url, options);
    }
    let expiry = 60 * 60 * 24 * 2; // 缓存 2 天
    if (typeof options === 'number') {
        expiry = options;
        options = undefined;
    } else if (typeof options === 'object') {
        // I hope you didn't set it to 0 seconds
        expiry = options.seconds ?? expiry;
    }
    // 将 URL 作为 localStorage 的 key
    const cached = cache.getLocal(url);
    if (cached !== null) {
        const response = new Response(new Blob([cached]));
        response.headers.set('Is-Cached-Fetch', 'true');
        return Promise.resolve(response);
    }
    return fetch(url, options).then((response) => {
        if (response.status === 200) {
            const ct = response.headers.get('Content-Type');
            if (ct && (ct.match(/application\/json/i) || ct.match(/text\//i))) {
                // If we don't clone the response, it will be consumed by the time it's returned.
                // This way we're being un-intrusive.
                response
                    .clone()
                    .text()
                    .then((content) => {
                        cache.saveLocal(url, content, expiry);
                    });
            } else if (ct && ct.match(/image/i)) {
                response
                    .clone()
                    .blob()
                    .then((blob) => {
                        const reader = new FileReader();
                        reader.readAsDataURL(blob);
                        reader.onloadend = () => {
                            const base64Data = reader.result;
                            cache.saveLocal(url, typeof base64Data === 'string' ? base64Data : '', expiry);
                        };
                    });
            }
        }
        return response;
    });
};
(() => {
    setTimeout(() => {
        cache.clearExpired();
    }, 1000 * 30);
})();
export { cache, cachedFetch };
