// SwitchyOmega pac
let gfwDomains = [
    'amazonaws.com',
    'archive.org',
    'blogspot.com',
    'bootstrapcdn.com',
    'chrome.com',
    'cloudflare.com',
    'dmhy.org',
    'duckduckgo.com',
    'ggpht.com', // youtube
    'github.com',
    'github.io',
    'golang.org',
    'gstatic.com',
    'imgur.com',
    'jquery.com',
    'jsdelivr.net',
    'jsfiddle.net',
    'jshell.net',
    'live.com', // microsoft
    'medium.com',
    'mega.co.nz',
    'mega.nz',
    'mozilla.net',
    'mozilla.org',
    'mozit.cloud',
    'naiko.cloud',
    'nodejs.org',
    'pages.onysakura.fun',
    'pixiv.net',
    'qiita.com',
    'redd.it',
    'sstatic.net', // stackoverflow
    'stackoverflow.com',
    't.me', // telegram
    'twitch.tv',
    'twitter.com',
    'v2ex.com',
    'wikimedia.org',
    'wikipedia.org',
    'xda-developers.com',
    'youtu.be',
    'youtube.com',
    'ytimg.com' // youtube
];
let gfwRegexps = [
    /\.?google$/, // blog.google
    /\.?google.co.jp$/,
    /\.?google.com.hk$/,
    /\.?google\w*.com$/,
    /\.?reddit\w*.com$/,
    /\.?github\w*.com$/
];

let proxies = [
    {
        name: 'gfw',
        host: '127.0.0.1',
        socksPort: '40081',
        domains: gfwDomains,
        regexps: gfwRegexps
    },
    {
        name: 'cloud',
        host: '127.0.0.1',
        socksPort: '41080',
        all: true
    }
];

function FindProxyForURL(url, host) {
    let proxy = check(url, host);
    if (proxy) {
        if (proxy.httpPort) {
            return 'PROXY ' + proxy.host + ':' + proxy.httpPort;
        }
        if (proxy.socksPort) {
            return 'SOCKS5 ' + proxy.host + ':' + proxy.socksPort;
        }
    }
    return 'DIRECT';
}

function check(url, host) {
    for (const proxy of proxies) {
        if (proxy.all) {
            return proxy;
        }
        if (proxy.domains) {
            for (let domain of proxy.domains) {
                if (host.endsWith(domain)) {
                    return proxy;
                }
            }
        }
        if (proxy.regexps) {
            for (let regexp of proxy.regexps) {
                if (regexp.test(host)) {
                    return proxy;
                }
            }
        }
    }
    return undefined;
}
