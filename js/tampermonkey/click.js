// ==UserScript==
// @name         *  点击星星特效
// @version      1.0
// @description  点击星星特效
// @author       onysakura
// @match        *://*/*
// ==/UserScript==

(function () {
    // 显示的图片或文本：仅支持 base64 编码图片，非 base64 内容以文本显示
    const imagesOrText = ['★', '♥'];
    // 图片宽度
    const width = 40;
    // 动画效果
    const animation = 'cubic-bezier(0.25, 1.09, 1, 1)';
    // 动画时长（毫秒）
    const animationDuration = 1500;
    // 左右偏差
    const floatWidth = 50;
    // 自定义标识符
    const identifier = 'noif_custom_image';
    const content = [];
    for (let i = 0; i < imagesOrText.length; i++) {
        if (imagesOrText[i].indexOf(';base64,') >= 0) {
            let img = `<img width="${width}" src="${imagesOrText[i]}" alt="star"/>`;
            content.push(img);
        } else {
            content.push(`<span>${imagesOrText[i]}</span>`);
        }
    }
    let a_idx = 0;
    document.body.addEventListener('click', (e) => {
        let div = document.createElement('div'),
            x = e.pageX,
            y = e.pageY;
        div.innerHTML = `<div class="${identifier}">${content[a_idx]}</div>`;
        div.className = identifier;
        div.style.scale = '0.3';
        div.style.userSelect = 'none';
        div.style.zIndex = '999999999999999';
        div.style.position = 'absolute';
        div.style.top = y + 'px';
        div.style.left = x + 'px';
        div.style.fontSize = 14 + 'px';
        div.style.fontWeight = 'bold';
        div.style.color = 'rgb(' + ~~(255 * Math.random()) + ',' + ~~(255 * Math.random()) + ',' + ~~(255 * Math.random()) + ')';
        div.style.opacity = '1';
        document.body.appendChild(div);
        setTimeout(() => {
            div.style.scale = '1';
            div.style.top = y - 180 + 'px';
            div.style.left = x + ((Math.random() * floatWidth) / 2 - floatWidth) + 'px';
            div.style.opacity = '0.7';
            div.style.transitionDuration = animationDuration + 'ms';
            div.style.transitionTimingFunction = animation;
            setTimeout(() => {
                div.remove();
            }, animationDuration);
        }, 0);
        a_idx = (a_idx + 1) % content.length;
    });
})();
