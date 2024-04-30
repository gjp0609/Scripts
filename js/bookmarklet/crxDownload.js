// javascript:(async()=>{let[e,c]=location.href.split("/").slice(-2),r=navigator.userAgent.match(/Chrom(?:e|ium)\/[0-9]+\.[0-9]+/)[0].split("/")[1],s="https://clients2.google.com/service/update2/crx?"+Object.entries({response:"redirect",prodversion:r,acceptformat:"crx2,crx3",x:"id="+c+"&uc"}).map(e=>e[0]+"="+encodeURIComponent(e[1])).join("&");document.body.appendChild(Object.assign(document.createElement("a"),{href:s,download:e+".crx",style:{display:"none"}})).click()})();
// noinspection UnnecessaryLabelJS
javascript: (async () => {
    // 插件 ID
    let [name, id] = location.href.split('/').slice(-2);
    // 当前 Chrome 版本 xxx.x
    const version = navigator.userAgent.match(/Chrom(?:e|ium)\/[0-9]+\.[0-9]+/)[0].split('/')[1];
    let params = {
        response: 'redirect',
        prodversion: version,
        acceptformat: 'crx2,crx3',
        x: 'id=' + id + '&uc'
    };
    let url =
        'https://clients2.google.com/service/update2/crx?' +
        Object.entries(params)
            .map((item) => item[0] + '=' + encodeURIComponent(item[1]))
            .join('&');
    document.body
        .appendChild(
            Object.assign(document.createElement('a'), {
                href: url,
                download: name + '.crx',
                style: {
                    display: 'none'
                }
            })
        )
        .click();
})();
