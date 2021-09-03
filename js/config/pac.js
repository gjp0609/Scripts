// SwitchyOmega pac
let domains = [
    "amazonaws.com",
    "blogspot.com",
    "chrome.com",
    "dmhy.org",
    "ggpht.com", // youtube
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
    "xda-developers.com",
    "youtu.be",
    "ytimg.com", // youtube
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

let ip = "127.0.0.1";
let httpPort = "11081";
let socksPort = "11080";

let Type = {
    direct: "DIRECT",
    http: "PROXY " + ip + ':' + httpPort,
    socks: "SOCKS " + ip + ':' + socksPort
};

function FindProxyForURL(url, host) {
    if (check(url, host)) {
        return Type.http;
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
