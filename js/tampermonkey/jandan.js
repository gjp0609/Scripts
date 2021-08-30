// ==UserScript==
// @name         【煎蛋】点击正文展开吐槽
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  点击正文展开吐槽
// @author       onysakura
// @match        http://jandan.net/*
// @icon         https://www.google.com/s2/favicons?domain=jandan.net
// @grant        none
// ==/UserScript==

(function () {
    $(".text")
        .css("cursor", "url(https://www.mokeyjay.com/wp-content/themes/minty/img/cursor/default.cur), default")
        .click(function () {
            $(this).parent(".row").find(".tucao-btn").click();
        });
})();
