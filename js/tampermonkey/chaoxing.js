// ==UserScript==
// @name         * 超星
// @namespace    https://github.com/gjp0609/Scripts/
// @version      0.1
// @description  try to take over the world!
// @author       onysakura
// @match        https://mooc1.chaoxing.com/mycourse/studentstudy*
// ==/UserScript==

(function () {
    function getSecondFrame(callback) {
        try {
            let parentIFrame = $('iframe');
            let parentIFrameJob = setInterval(() => {
                try {
                    if (parentIFrame[0].contentDocument.readyState === 'complete') {
                        clearInterval(parentIFrameJob);
                        let secondIFrameJob = setInterval(() => {
                            try {
                                let secondIFrame = parentIFrame.contents().find('iframe');
                                if (secondIFrame[0].contentDocument.readyState === 'complete') {
                                    clearInterval(secondIFrameJob);
                                    callback(secondIFrame);
                                }
                            } catch (e) {}
                        }, 3000);
                    }
                } catch (e) {}
            }, 3000);
        } catch (e) {}
    }
    /**
     * 自动答题
     */
    let answer = 0;
    setInterval(() => {
        getSecondFrame((secondIFrame) => {
            let answerList = secondIFrame.context.querySelectorAll('.tkTopic .tkItem_ul .ans-videoquiz-opt label');
            console.log('检测题目，数量：', answerList.length);
            if (answerList.length > 1) {
                answer++;
                answer = answer % answerList.length;
                // 选择
                console.log('选择：', answer);
                console.log('To click', answerList[answer]);
                answerList[answer].click();
                setTimeout(() => {
                    // 提交
                    console.log('提交答案');
                    console.log('To click', secondIFrame.context.querySelector('.ans-videoquiz-submit'));
                    // secondIFrame.context.querySelector('.ans-videoquiz-submit').click();
                }, 5000);
            }
        });
    }, 10000);

    /**
     * 视频自动切换
     */
    setInterval(() => {
        console.log('判断当前视频是否已完成');
        if (
            $('.chapter ul .posCatalog_level ul .posCatalog_select.posCatalog_active .icon_Completed.prevTips .prevHoverTips')
                .text()
                .indexOf('已完成') >= 0
        ) {
            console.log('视频已完成');
            let chapterList = $('.chapter ul .posCatalog_level ul .posCatalog_select');
            console.log('获取当前章节');
            chapterList.each((index, item) => {
                if (item.className.indexOf('posCatalog_active') >= 0) {
                    console.log('点击下一章节');
                    console.log('To click', $(chapterList[index + 1]).find('span.posCatalog_name'));
                    // $(chapterList[index + 1]).find('span.posCatalog_name').click();
                    setTimeout(() => {
                        $('.prev_tab .prev_list .prev_ul li').each((index, item) => {
                            // 点击视频标签
                            if ($(item).prop('title').indexOf('视频') >= 0) {
                                console.log('To click', $(item));
                                // $(item).click();
                                console.log('点击播放');
                                getSecondFrame((secondIFrame) => {
                                    console.log('To click', secondIFrame.context.querySelector('.vjs-big-play-button'));
                                    // secondIFrame.context.querySelector('.vjs-big-play-button').click();
                                });
                            }
                        });
                    }, 1000);
                }
            });
        }
    }, 30000);
})();
