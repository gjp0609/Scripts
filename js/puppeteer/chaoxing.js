const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({
        args: ['--disable-features=site-per-process'],
        // 开发调试阶段，设置为false,
        headless: false,
        defaultViewport: false,
        // 降低操作速度
        slowMo: 200,
        executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    });
    const page = await browser.newPage();
    try {
        page.setViewport({
            width: 1366,
            height: 768
        });
        console.log('打开主页');
        await page.goto('http://mooc.chaoxing.com/', {
            waitUntil: 'load'
        });
        await page.waitForSelector('.ztop .zt_center .zt_login a.zt_l_loading', {
            timeout: 30000
        });
        console.log('点击登录，跳转登录页面');
        await page.click('.ztop .zt_center .zt_login a.zt_l_loading');
        await page.waitForSelector('.tab-body');
        await page.focus('.tab-body .ipt-tel');
        await page.type('.tab-body .ipt-tel', '15538307290');
        await page.focus('.tab-body .ipt-pwd');
        await page.type('.tab-body .ipt-pwd', '502117hautlah');
        await page.click('.tab-body .btns-box button');
        while ((await browser.pages()).length !== 3) {
            await page.waitForTimeout(1000);
        }
        console.log('检测到页面');
        let pages = await browser.pages();
        let page2 = pages[2];
        console.log(page2.url());
        while (page2.url().indexOf('https://mooc1.chaoxing.com/mycourse/studentstudy') !== 0) {
            await page.waitForTimeout(1000);
        }
        await page2.waitForSelector('iframe');
        console.log('find frame');
        await page2.frames()[0].waitForSelector('iframe');
        console.log('find iframe', page2.frames()[0].childFrames()[0]);
        let videoFrame = page2.frames()[0].childFrames()[0];
        console.log('find video');

        /**
         * 自动答题
         */
        let answer = 0;
        setInterval(() => {
            videoFrame.select('.tkTopic .tkItem_ul .ans-videoquiz-opt label').then((answerList) => {
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
                        videoFrame.select('.ans-videoquiz-submit').then((value) => {
                            console.log('To click');
                            // value.context.querySelector('.ans-videoquiz-submit').click();
                        });
                    }, 5000);
                }
            });
        }, 10000);
    } catch (e) {}
    await page.waitForTimeout(400000);
})();
