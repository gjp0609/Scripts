// ==UserScript==
// @name         * v2ex
// @namespace    https://github.com/gjp0609/Scripts/
// @version      1.1
// @description  点击回复用户名跳转
// @author       noif
// @match        *://*.v2ex.com/*
// @grant        none
// @noframes
// @require      file:///R:/Files/Workspace/Mine/Scripts/js/tampermonkey/v2ex.js
// ==/UserScript==

(function () {
    setTimeout(() => {
        let allMap = new Map();
        document.querySelectorAll('#Main .box .cell strong a.dark').forEach((a) => {
            const username = a.textContent;
            if (!allMap.has(username)) {
                allMap.set(username, []);
            }
            allMap.get(username).push(a);
        });
        document.querySelectorAll('#Main .box .cell .reply_content a').forEach((a) => {
            if (a.previousSibling?.textContent === '@') {
                a.href = 'javascript:void(0);';
                a.style.textShadow = `0 0 10px #ffaa0099`;
                a.addEventListener('click', () => {
                    if (allMap.has(a.textContent)) {
                        let previous;
                        const list = allMap.get(a.textContent);
                        for (let i = 0; i < list.length; i++) {
                            const item = list[i];
                            if (previous && item.getBoundingClientRect().y > a.getBoundingClientRect().y) {
                                break;
                            }
                            previous = item;
                        }
                        if (previous) {
                            [...allMap.values()].forEach((it) => it.forEach((it) => (it.closest('.cell').style.backgroundColor = null)));
                            previous.scrollIntoView();
                            previous.closest('.cell').style.backgroundColor = '#66ccff11';
                            a.closest('.cell').style.backgroundColor = '#ffcc6611';
                        }
                    }
                });
            }
        });
    }, 500);
})();
