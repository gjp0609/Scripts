/**
 * 缓存 fetch 请求
 * https://www.sitepoint.com/cache-fetched-ajax-requests/
 * @param url 请求地址
 * @param options 参数
 * @returns {Promise<Response>}
 */
function cachedFetch(url, options) {
    let expiry = 30 * 60; // 默认 30 min
    if (typeof options === 'number') {
        expiry = options;
        options = undefined;
    } else if (typeof options === 'object') {
        // I hope you didn't set it to 0 seconds
        expiry = options.seconds || expiry;
    }
    // 将 URL 作为 localStorage 的 key
    let cacheKey = url;
    let cached = localStorage.getItem(cacheKey);
    let whenCached = localStorage.getItem(cacheKey + ':ts');
    if (cached !== null && whenCached !== null) {
        // Even though 'whenCached' is a string,
        // this operation works because the minus sign converts the string to an integer and it will work.
        let age = (Date.now() - whenCached) / 1000;
        if (age < expiry) {
            let response = new Response(new Blob([cached]));
            return Promise.resolve(response);
        } else {
            // 清除旧值
            localStorage.removeItem(cacheKey);
            localStorage.removeItem(cacheKey + ':ts');
        }
    }

    return fetch(url, options).then((response) => {
        // let's only store in cache if the content-type is JSON or something non-binary
        if (response.status === 200) {
            let ct = response.headers.get('Content-Type');
            if (ct && (ct.match(/application\/json/i) || ct.match(/text\//i))) {
                // If we don't clone the response, it will be consumed by the time it's returned.
                // This way we're being un-intrusive.
                response
                    .clone()
                    .text()
                    .then((content) => {
                        localStorage.setItem(cacheKey, content);
                        localStorage.setItem(cacheKey + ':ts', Date.now());
                    });
            }
        }
        return response;
    });
}
