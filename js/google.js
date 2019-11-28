// ==UserScript==
// @name         【Google】结果跳转新标签
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  点击谷歌搜索结果时开启一个新的标签页
// @author       OnySakura
// @include      *www.google.com*
// @include      *www.google.co.jp*
// ==/UserScript==

(function () {
    let divList = document.getElementsByClassName('r');
    for (let div of divList) {
        for (const child of div.children) {
            if (child.tagName === 'A') {
                child.setAttribute('target', '_blank');
            }
        }
    }
})();