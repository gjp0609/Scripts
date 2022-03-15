const puppeteer = require('puppeteer');

let page;
let browser;

async function init() {
    browser = await puppeteer.launch({
        args: ['--disable-features=site-per-process'],
        // 开发调试阶段，设置为false,
        headless: false,
        devtools: true,
        defaultViewport: false,
        // 降低操作速度
        slowMo: 200,
        executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    });
    page = await browser.newPage();
    page.setViewport({
        width: 1366,
        height: 768
    });
}

async function getPage(url) {
    console.log('wait page', url);
    let pages = await browser.pages();
    for (let i = 0; i < pages.length; i++) {
        if (pages[i].url() && pages[i].url().indexOf(url) === 0) {
            console.log('wait page success');
            return pages[i];
        }
    }
    await page.waitForTimeout(1000);
    return await getPage(url);
}

(async () => {
    await init();
    try {
        console.log('跳转到主页');
        await page.goto('http://127.0.0.1/pages/single/bookmarks/', {
            waitUntil: 'load'
        });
        await page.waitForSelector('.types-wrapper .type');
        page.waitForSelector('.types-wrapper .type')
            .then((list) => {
                console.log(list.length);
                // page.evaluate(() => {
                //     console.log(list);
                // });
            })
            .catch((e) => {
                console.log(e);
            });
        // await page.click('.types-wrapper .type:nth-child(3) .bookmark');
        // let page2 = await getPage('https://oa.tydic.com/');
        // await page2.waitForSelector('.infos');
        // await page2.click('.infos a');
    } catch (e) {}
    await page.waitForTimeout(400000);
})();
