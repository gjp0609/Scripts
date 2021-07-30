function GM_addStyle(style) {
    let styleElement = document.createElement('style');
    styleElement.textContent = style;
    document.head.appendChild(styleElement);
}

function GM_xmlhttpRequest(param) {
    // console.log('GM_xmlhttpRequest', 'request', param);
    var xhr = new XMLHttpRequest();
    xhr.open(param.method, param.url, true);
    for (const key in param.headers) {
        if (param.headers.hasOwnProperty(key)) {
            xhr.setRequestHeader(key, param.headers[key]);
        }
    }
    xhr.onload = function () {
        // console.log('GM_xmlhttpRequest', 'result', xhr);
        param.onload(xhr);
    };
    xhr.send(param.data);
}

function GM_getValue(key, defaultVal) {
    let value = localStorage.getItem(key);
    return value || defaultVal;
}

function GM_setValue(key, value) {
    localStorage.setItem(key, value);
}