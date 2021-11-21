// ==UserScript==
// @name         * 济南 视频切换
// @namespace    https://github.com/gjp0609/Scripts/
// @version      0.1
// @description  try to take over the world!
// @author       onysakura
// @match        http://221.214.69.254:9091/*
// ==/UserScript==

(function () {

    setInterval(() => {
        let list = $('.playPage .body .tab-content .tab-content li.clearfix.videoLi')
        list.each((key, value) => {
            if (value.className.indexOf('active') > 0) {
                console.log(value)
                // if ($(value).find('.progress.video-progress').find('span').text().trim() !== '100%') {
                    $('.pv-controls .pv-controls-left button.pv-icon-btn-play').click()
                // }
            }
        })
    }, 10000)

})();