// javascript:(()=>{let e=()=>Math.floor(255*Math.random()),o=l=>l.body.querySelectorAll("*").forEach(l=>"IFRAME"===l.nodeName?o(l.contentDocument):l.style.outline=l.style.outline?"":"1px solid rgb("+e()+","+e()+","+e()+")");o(document)})();
// noinspection UnnecessaryLabelJS
javascript: (() => {
    let color = () => Math.floor(Math.random() * 255);
    let outline = (doc) =>
        doc.body
            .querySelectorAll('*')
            .forEach((item) =>
                item.nodeName === 'IFRAME'
                    ? outline(item.contentDocument)
                    : (item.style.outline = item.style.outline ? '' : '1px solid rgb(' + color() + ',' + color() + ',' + color() + ')')
            );
    outline(document);
})();
