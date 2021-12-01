/* eslint-disable @typescript-eslint/no-unused-vars,no-unused-vars */

const $utils = {
    debugMode: false,
    cachedFetch: (url, options) => {
        if ($utils.debugMode) {
            return fetch(url, options);
        }
        let expiry = 60 * 60 * 24 * 2; // 缓存 2 天
        if (typeof options === 'number') {
            expiry = options;
            options = undefined;
        } else if (typeof options === 'object') {
            // I hope you didn't set it to 0 seconds
            expiry = options.seconds || expiry;
        }
        // 将 URL 作为 localStorage 的 key
        let cached = $utils.cache.getLocal(url);
        if (cached !== null) {
            let response = new Response(new Blob([cached]));
            response.headers.set('Is-Cached-Fetch', 'true');
            return Promise.resolve(response);
        }
        return fetch(url, options).then((response) => {
            if (response.status === 200) {
                let ct = response.headers.get('Content-Type');
                if (ct && (ct.match(/application\/json/i) || ct.match(/text\//i))) {
                    // If we don't clone the response, it will be consumed by the time it's returned.
                    // This way we're being un-intrusive.
                    response
                        .clone()
                        .text()
                        .then((content) => {
                            $utils.cache.saveLocal(url, content, expiry);
                        });
                } else if (ct && ct.match(/image/i)) {
                    response
                        .clone()
                        .blob()
                        .then((blob) => {
                            let reader = new FileReader();
                            reader.readAsDataURL(blob);
                            reader.onloadend = () => {
                                let base64Data = reader.result;
                                $utils.cache.saveLocal(url, base64Data, expiry);
                            };
                        });
                }
            }
            return response;
        });
    },
    cache: {
        expireKey: ':expire',
        saveLocal: (key, value, expire) => {
            let defaultExpire = 60 * 60 * 2; // 默认 2 小时
            expire = expire || defaultExpire;
            if (expire > 0) {
                let now = Date.now() / 1000;
                expire = expire + now;
                localStorage.setItem(key + ':expire', expire);
            }
            localStorage.setItem(key, value);
        },
        getLocal: (key) => {
            let value = localStorage.getItem(key);
            let expireTime = localStorage.getItem(key + $utils.cache.expireKey);
            if (expireTime === null) {
                return value;
            } else {
                if ($utils.cache.isExpire(expireTime)) {
                    localStorage.removeItem(key);
                    localStorage.removeItem(key + $utils.cache.expireKey);
                } else {
                    return value;
                }
            }
            return null;
        },
        clearExpired: () => {
            let count = 0;
            let keys = Object.keys(localStorage);
            keys.forEach((key) => {
                if (key.indexOf($utils.cache.expireKey) > 0) {
                    if ($utils.cache.isExpire(localStorage.getItem(key))) {
                        count++;
                        localStorage.removeItem(key);
                        localStorage.removeItem(key.replace($utils.cache.expireKey, ''));
                    }
                }
            });
            console.log(`cleaned ${count} expired cache`);
        },
        isExpire: (expireTime) => {
            return Date.now() / 1000 > expireTime;
        }
    }
};

(() => {
    setTimeout(() => {
        $utils.cache.clearExpired();
    }, 1000 * 30);
})();
