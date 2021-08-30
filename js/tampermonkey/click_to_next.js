// ==UserScript==
// @name         * 左右键翻页
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       onysakura
// @match        *
// @grant        none
// ==/UserScript==

(function () {
    if (window.top !== window.self) { //don't run on frames or iframes
        return;
    }
    let href = window.location.href;
    if (href) {
        if (href.indexOf('www.dushu369.com') !== -1) {
            clickBtn('LinkNextArticle', 'LinkPrevArticle');
        } else if (href.indexOf('www.appinn.com') !== -1) {
            clickBtn('prev', 'next');
        }
    }

    function clickBtn(prevClass, nextClass) {
        document.getElementsByTagName('body')[0].onkeyup = function (e) {
            if (e && e.key === 'ArrowLeft') {
                document.getElementsByClassName(prevClass)[0].click();
            }
            if (e && e.key === 'ArrowRight') {
                document.getElementsByClassName(nextClass)[0].click();
            }
        }
    }
})();
