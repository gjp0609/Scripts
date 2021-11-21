// ==UserScript==
// @name         * 超星
// @namespace    https://github.com/gjp0609/Scripts/
// @version      0.1
// @description  try to take over the world!
// @author       onysakura
// @match        https://mooc1.chaoxing.com/mycourse/studentstudy*
// ==/UserScript==

(function () {

    /**
     * 自动答题
     */
    let answer = 0;
    setInterval(() => {
        // 选项
        let answerList = $('.ans-videoquiz-opts .ans-videoquiz-opt label')
        if (answerList.length > 1) {
            answer++
            answer = answer % answerList.length
            // 选择
            answerList[answer].click()
            setTimeout(() => {
                // 提交
                $('.ans-videoquiz-submit').click()
            }, 5000)
        }
    }, 10000)


    /**
     * 视频自动切换
     */
    setInterval(() => {
        // 判断当前视频是否已完成
        if ($('.chapter ul .posCatalog_level ul .posCatalog_select.posCatalog_active .icon_Completed.prevTips .prevHoverTips').text().indexOf('已完成') >= 0) {
            let chapterList = $('.chapter ul .posCatalog_level ul .posCatalog_select');
            chapterList.each((index, item) => {
                // 获取当前章节
                if (item.className.indexOf('posCatalog_active') >= 0) {
                    // 点击下一章节
                    $(chapterList[index + 1]).find('span.posCatalog_name').click()
                    setTimeout(() => {
                        $('.prev_tab .prev_list .prev_ul li').each((index, item) => {
                            // 点击视频标签
                            if ($(item).prop('title').indexOf('视频') >= 0) {
                                $(item).click();
                                // 点击播放按钮
                                let parentIFrameJob = setInterval(() => {
                                    let parentIFrame = $('iframe');
                                    if (parentIFrame[0].contentDocument.readyState === 'complete') {
                                        clearInterval(parentIFrameJob)
                                        let secondIFrameJob = setInterval(() => {
                                            let secondIFrame = parentIFrame.contents().find('iframe');
                                            if (secondIFrame[0].contentDocument.readyState === 'complete') {
                                                clearInterval(secondIFrameJob)
                                                secondIFrame.contents().find('.vjs-big-play-button').click()
                                            }
                                        })
                                    }
                                }, 1000)
                            }
                        })
                    }, 1000)
                }
            })
        }
    }, 30000)
})();