function GM_addStyle(style) {
    let styleElement = document.createElement('style');
    styleElement.innerHTML = style;
    document.head.appendChild(styleElement);
}

function GM_xmlhttpRequest(param) {
    var xhr = new XMLHttpRequest();
    xhr.open(param.method, param.url, true);
    for (const key in param.headers) {
        if (param.headers.hasOwnProperty(key)) {
            xhr.setRequestHeader(key, param.headers[key]);
        }
    }
    xhr.onload = function () {
        param.onload(xhr);
    };
    xhr.send(param.data);
}