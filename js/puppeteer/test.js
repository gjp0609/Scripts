const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({
        // 开发调试阶段，设置为false,
        headless: false,
        defaultViewport: false,
        // 降低操作速度
        slowMo: 200,
        executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    });
    const page = await browser.newPage();
    try {
        page.setViewport({
            width: 1366,
            height: 768
        });
        console.log('跳转到主页');
        await page.goto('http://127.0.0.1/pages/single/bookmarks/', {
            waitUntil: 'load'
        });
        await page.click('.types-wrapper .type:nth-child(2) .bookmark');
        await page.waitForTimeout(3000);
        let pages = await browser.pages();
        let page2 = pages[2];
        await page2.waitForSelector('.infos');
        await page2.click('.infos a');
    } catch (e) {}
    await page.waitForTimeout(400000);
})();
