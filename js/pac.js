// SwitchyOmega pac
var rules = [
    "||api.github.com",
    "||github.io",
    "||jquery.com",
    "||google.com",
];

var proxyAddress = "127.0.0.1:1080";

var Type = {
    direct: "DIRECT",
    proxy: "PROXY " + proxyAddress,
    socks: "SOCKS " + proxyAddress
};

function FindProxyForURL(url, host) {
    return Type.socks;
}