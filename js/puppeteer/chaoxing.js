const puppeteer = require('puppeteer');

let indexPage;
let browser;
async function init() {
    browser = await puppeteer.launch({
        args: ['--disable-features=site-per-process'],
        // 开发调试阶段，设置为false,
        headless: false,
        defaultViewport: false,
        // 降低操作速度
        slowMo: 50,
        executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    });
    indexPage = await browser.newPage();
    await indexPage.setViewport({
        width: 1366,
        height: 768
    });
}

async function waitPage(url) {
    console.log('wait page', url);
    let pages = await browser.pages();
    for (let i = 0; i < pages.length; i++) {
        if (pages[i].url() && pages[i].url().indexOf(url) === 0) {
            console.log('wait page success', url);
            return pages[i];
        }
    }
    await indexPage.waitForTimeout(1000);
    return await waitPage(url);
}

async function login() {
    try {
        console.log('打开主页');
        await indexPage.goto('http://mooc.chaoxing.com/', {
            waitUntil: 'load'
        });
        await indexPage.waitForSelector('.ztop .zt_center .zt_login a.zt_l_loading', {
            timeout: 30000
        });
        console.log('点击登录，跳转登录页面');
        await indexPage.click('.ztop .zt_center .zt_login a.zt_l_loading');
        await waitPage('http://passport2.chaoxing.com/login');
        await indexPage.waitForSelector('.tab-body');
        await indexPage.focus('.tab-body .ipt-tel');
        await indexPage.type('.tab-body .ipt-tel', '15538307290');
        await indexPage.focus('.tab-body .ipt-pwd');
        await indexPage.type('.tab-body .ipt-pwd', '502117hautlah');
        await indexPage.click('.tab-body .btns-box button');
        await waitPage('http://i.mooc.chaoxing.com/space/index');
        console.log('登录成功');
    } catch (e) {}
}

(async () => {
    try {
        await init();
        await login();
        let studyPage = await waitPage('https://mooc1.chaoxing.com/mycourse/studentstudy');
        console.log('检测到学习页面');
        await studyPage.waitForSelector('iframe');
        console.log('find frame');
        await studyPage.frames()[0].waitForSelector('iframe');
        console.log('find iframe');
        let videoFrame = studyPage.frames()[0].childFrames()[0];
        console.log('find video');

        /**
         * 自动答题
         */
        let answer = 0;
        setInterval(async () => {
            console.log('答题检测');
            try {
                let f1 = await studyPage.frames().find((frame) => {
                    console.log(JSON.stringify(frame));
                    return true;
                });

                const f2 = (await f1.childFrames())[0];
                let arr = await f2.$('div');
                for (let arrElement of arr) {
                    console.log(JSON.stringify(arrElement));
                }
                let videoFrame = studyPage.frames()[0].childFrames()[0];
                try {
                    console.log('iframe', await studyPage.$('iframe iframe'));
                } catch (e) {
                    console.log(e.message);
                }
                let answerList = await studyPage.$('iframe iframe .tkTopic .tkItem_ul .ans-videoquiz-opt label');
                console.log('检测题目，数量：', answerList);
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
                        // videoFrame.select('.ans-videoquiz-submit').then((value) => {
                        //     console.log('To click');
                        //     // value.context.querySelector('.ans-videoquiz-submit').click();
                        // });
                    }, 5000);
                }
            } catch (e) {
                console.log(e.message);
            }
        }, 10000);

        /**
         * 视频自动切换
         */
        setInterval(() => {
            console.log('判断当前视频是否已完成');
            videoFrame
                .select('.chapter ul .posCatalog_level ul .posCatalog_select.posCatalog_active .icon_Completed.prevTips .prevHoverTips')
                .then((tips) => {
                    if (tips.innerText === '已完成') {
                        console.log('视频已完成');
                        videoFrame
                            .select('.chapter ul .posCatalog_level ul .posCatalog_select')
                            .then((chapterList) => {
                                console.log('获取当前章节');
                                for (let i = 0; i < chapterList.length; i++) {
                                    if (chapterList[i].className.indexOf('posCatalog_active') >= 0) {
                                        console.log('当前章节:', chapterList[i].innerText);
                                        console.log('点击下一章节:To click', $(chapterList[index + 1]).find('span.posCatalog_name'));
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
                                }
                            })
                            .catch((e) => {});
                    }
                })
                .catch((e) => {});
        }, 30000);
    } catch (e) {}
    await indexPage.waitForTimeout(40000000);
})();
