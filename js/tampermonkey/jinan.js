// ==UserScript==
// @name         * 济南
// @namespace    https://github.com/gjp0609/Scripts/
// @version      0.1
// @description  try to take over the world!
// @author       onysakura
// @match        http://221.214.69.254:9091/*
// ==/UserScript==

(function () {

    let answer = 0;
    setInterval(() => {
        if ($('.pv-ask-modal-wrap .pv-ask-modal .pv-ask-form label').length > 0) {
            let count = $('.pv-ask-modal-wrap .pv-ask-modal .pv-ask-form label').length;
            answer++
            answer = answer % count
            $('.pv-ask-modal-wrap .pv-ask-modal .pv-ask-form label')[answer].click()
            setTimeout(() => {
                $('.pv-ask-modal-wrap .pv-ask-modal .pv-ask-foot button.pv-ask-submit')[0].click()
            }, 1000)
        }
    }, 10000)

})();