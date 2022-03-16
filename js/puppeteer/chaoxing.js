const puppeteer = require('puppeteer');

let indexPage;
let browser;
async function init() {
    browser = await puppeteer.launch({
        args: ['--disable-features=site-per-process'],
        // 开发调试阶段，设置为false,
        headless: false,
        defaultViewport: false,
        devtools: true,
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
    let page = await getPage(url);
    if (page) {
        return page;
    } else {
        await indexPage.waitForTimeout(1000);
        return await waitPage(url);
    }
}
async function getPage(url) {
    console.log(new Date(), 'get page', url);
    let pages = await browser.pages();
    for (let i = 0; i < pages.length; i++) {
        if (pages[i].url() && pages[i].url().indexOf(url) === 0) {
            console.log(new Date(), 'get page success', url);
            return pages[i];
        }
    }
}

async function login() {
    try {
        console.log(new Date(), '打开主页');
        await indexPage.goto('http://mooc.chaoxing.com/', {
            waitUntil: 'load'
        });
        await indexPage.waitForSelector('.ztop .zt_center .zt_login a.zt_l_loading', {
            timeout: 30000
        });
        console.log(new Date(), '点击登录，跳转登录页面');
        await indexPage.click('.ztop .zt_center .zt_login a.zt_l_loading');
        await waitPage('http://passport2.chaoxing.com/login');
        await indexPage.waitForSelector('.tab-body');
        await indexPage.focus('.tab-body .ipt-tel');
        await indexPage.type('.tab-body .ipt-tel', '15538307290');
        await indexPage.focus('.tab-body .ipt-pwd');
        await indexPage.type('.tab-body .ipt-pwd', '502117hautlah');
        await indexPage.click('.tab-body .btns-box button');
        await waitPage('http://i.mooc.chaoxing.com/space/index');
        console.log(new Date(), '登录成功');
    } catch (e) {}
}

(async () => {
    try {
        await init();
        await login();
        let answerIndex = 0;
        let lastOptionLength = 0;
        setInterval(async () => {
            console.log(new Date(), '----------- 检测题目 - start ---------------------------------');
            try {
                let studyPage = await getPage('https://mooc1.chaoxing.com/mycourse/studentstudy');
                if (studyPage) {
                    console.log(new Date(), '检测到学习页面');
                    let result = await studyPage.evaluate(
                        (answerIndex, lastOptionLength) => {
                            /**
                             * 获得指定数组的所有组合
                             */
                            function arrayCombine(targetArr = [], count = 1) {
                                if (!Array.isArray(targetArr)) return [];

                                const resultArrs = [];
                                // 所有组合的 01 排列
                                const flagArrs = getFlagArrs(targetArr.length, count);
                                while (flagArrs.length) {
                                    const flagArr = flagArrs.shift();
                                    resultArrs.push(targetArr.filter((_, idx) => flagArr[idx]));
                                }
                                return resultArrs;
                            }
                            /**
                             * 获得从 m 中取 n 的所有组合
                             * 思路如下：
                             * 生成一个长度为 m 的数组，
                             * 数组元素的值为 1 表示其下标代表的数被选中，为 0 则没选中。
                             *
                             * 1. 初始化数组，前 n 个元素置 1，表示第一个组合为前 n 个数；
                             * 2. 从左到右扫描数组元素值的 “10” 组合，找到第一个 “10” 组合后将其变为 “01” 组合；
                             * 3. 将其左边的所有 “1” 全部移动到数组的最左端
                             * 4. 当 n 个 “1” 全部移动到最右端时（没有 “10” 组合了），得到了最后一个组合。
                             */
                            function getFlagArrs(m, n = 1) {
                                if (n < 1 || m < n) return [];

                                // 先生成一个长度为 m 字符串，开头为 n 个 1， 例如“11100”
                                let str = '1'.repeat(n) + '0'.repeat(m - n);
                                let pos;
                                // 1
                                const resultArrs = [Array.from(str, (x) => Number(x))];
                                const keyStr = '10';

                                while (str.indexOf(keyStr) > -1) {
                                    pos = str.indexOf(keyStr);
                                    // 2
                                    str = str.replace(keyStr, '01');
                                    // 3
                                    str =
                                        Array.from(str.slice(0, pos))
                                            .sort((a, b) => b - a)
                                            .join('') + str.slice(pos);
                                    // 4
                                    resultArrs.push(Array.from(str, (x) => Number(x)));
                                }
                                return resultArrs;
                            }

                            function getAnswers(length) {
                                let arr = [];
                                for (let i = 0; i < length; i++) {
                                    arr.push(i);
                                }
                                let answers = [];
                                for (let i = 1; i <= length; i++) {
                                    answers.push(...arrayCombine(arr, i));
                                }
                                return answers;
                            }

                            let optionList = document
                                .querySelector('iframe')
                                .contentDocument.querySelector('iframe')
                                .contentDocument.querySelectorAll('.tkTopic .tkItem_ul .ans-videoquiz-opt label');
                            // document.querySelectorAll('.tkRadio input[type=checkbox]').forEach(item=>{item.checked=false})
                            let optionLength = optionList.length;
                            if (optionLength > 1) {
                                if (lastOptionLength !== optionLength) {
                                    answerIndex = 0;
                                    lastOptionLength = optionLength;
                                }
                                console.log('lastOptionLength', lastOptionLength);
                                let answers = getAnswers(lastOptionLength);
                                console.log('answers', answers);
                                let answer = answers[answerIndex];
                                console.log('选择：', answer);
                                for (let option of optionList) {
                                    option.querySelector('input[type=checkbox]').checked = false;
                                }
                                for (let option of answer) {
                                    optionList[option].click();
                                }
                                answerIndex++;
                                answerIndex = answerIndex % answers.length;
                                setTimeout(() => {
                                    console.log('提交答案');
                                    let submitButton = document
                                        .querySelector('iframe')
                                        .contentDocument.querySelector('iframe')
                                        .contentDocument.querySelector('.ans-videoquiz-submit');
                                    console.log('To click', submitButton);
                                    submitButton.click();
                                }, 2000);
                            }
                            return {
                                answerIndex,
                                lastOptionLength
                            };
                        },
                        answerIndex,
                        lastOptionLength
                    );
                    answerIndex = result.answerIndex;
                    lastOptionLength = result.lastOptionLength;
                    console.log(new Date(), 'find video', result);
                } else {
                }
            } catch (e) {
                console.log(e.message);
            }
            console.log(new Date(), '----------- 检测题目 - end -----------');
        }, 5000);
        /**
         * 视频自动切换
         */
        setInterval(async () => {
            console.log(new Date(), '--------------------------------- 判断当前视频是否已完成 - start -----------');
            try {
                let studyPage = await getPage('https://mooc1.chaoxing.com/mycourse/studentstudy');
                if (studyPage) {
                    console.log(new Date(), '检测到学习页面');
                    studyPage.waitForTimeout(5000);
                    let result = await studyPage.evaluateHandle(() => {
                        let tips = document.querySelector(
                            '.chapter ul .posCatalog_level ul .posCatalog_select.posCatalog_active .icon_Completed.prevTips .prevHoverTips'
                        );
                        console.log(new Date(), 'tips', tips);
                        if (tips) {
                            console.log(new Date(), '视频已完成');
                            // if (tips.textContent.indexOf('已完成') >= 0) {
                            // }
                            console.log(new Date(), '获取当前章节');
                            let chapterList = document.querySelectorAll('.chapter ul .posCatalog_level ul .posCatalog_select');
                            for (let i = 0; i < chapterList.length; i++) {
                                if (chapterList[i].className.indexOf('posCatalog_active') >= 0) {
                                    console.log(new Date(), '当前章节:', chapterList[i].innerText);
                                    let nextChapter = chapterList[i + 1].querySelector('span.posCatalog_name');
                                    if (nextChapter.title === '章节测验') {
                                        console.log(new Date(), '章节测验');
                                        nextChapter = chapterList[i + 2].querySelector('span.posCatalog_name');
                                    }
                                    console.log(new Date(), '点击下一章节', nextChapter);
                                    nextChapter.click();
                                    break;
                                }
                            }
                        } else {
                            setTimeout(() => {
                                // 点击视频标签
                                let playButton = document
                                    .querySelector('iframe')
                                    .contentDocument.querySelector('iframe')
                                    .contentDocument.querySelector('.vjs-big-play-button');
                                console.log('To click', playButton);
                                playButton.click();
                            }, 5000);
                        }
                    });
                }
            } catch (e) {
                console.log(e.message);
            }
            console.log(new Date(), '----------- 判断当前视频是否已完成 - end -----------');
        }, 30000);
    } catch (e) {}
    await indexPage.waitForTimeout(1000 * 60 * 60 * 10);
})();
