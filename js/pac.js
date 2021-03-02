// SwitchyOmega pac
let domains = [
    "github.io",
    "golang.org",
    "jquery.com",
    "wikipedia.org",
    "gstatic.com",
    "amazonaws.com",
    "redd.it",
    "blogspot.com",
    "imgur.com",
    "chrome.com",
    "dmhy.org"
];
let regexps = [
    /\.?google$/, // blog.google
    /\.?google.co.jp$/,
    /\.?google\w*.com$/,
    /\.?reddit\w*.com$/,
    /\.?github\w*.com$/,
];

let proxy = "127.0.0.1:1080";

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