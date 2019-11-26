// ==UserScript==
// @name         【Google】结果跳转新标签
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       OnySakura
// @include      *google.*
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