// SwitchyOmega pac
let domains = [
    "api.github.com", // github api
    "githubusercontent.com", // github api
    "github.io",
    "golang.org",
    "jquery.com",
];
let regexps = [
    /\.?google$/,
    /\.?google.co.jp$/,
    /\.?google\w*.com$/,
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