// SwitchyOmega pac
let domains = [
    "amazonaws.com",
    "blogspot.com",
    "chrome.com",
    "dmhy.org",
    "github.io",
    "golang.org",
    "gstatic.com",
    "imgur.com",
    "jquery.com",
    "medium.com",
    "pixiv.net",
    "redd.it",
    "twitch.tv",
    "twitter.com",
    "v2ex.com",
    "wikimedia.org",
    "wikipedia.org",
    "youtu.be",
    "youtube.com",
];
let regexps = [
    /\.?google$/, // blog.google
    /\.?google.co.jp$/,
    /\.?google.com.hk$/,
    /\.?google\w*.com$/,
    /\.?reddit\w*.com$/,
    /\.?github\w*.com$/,
];

let proxy = "127.0.0.1:11081";

let Type = {
    direct: "DIRECT",
    proxy: "PROXY " + proxy,
    socks: "SOCKS " + proxy
};

function FindProxyForURL(url, host) {
    if (check(url, host)) {
        return Type.proxy;
    } else {
        return Type.direct;
    }
}

function check(url, host) {
    for (let domain of domains) {
        if (host.endsWith(domain)) {
            return true;
        }
    }
    for (let regexp of regexps) {
        if (regexp.test(host)) {
            return true;
        }
    }
    return false;
}
