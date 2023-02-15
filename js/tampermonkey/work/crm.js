// ==UserScript==
// @name         * 技术部日志填报
// @namespace    https://github.com/gjp0609/Scripts/
// @version      0.1
// @description  seeyon A8+ 自动打开填报页面并选择固定项目
// @author       noif
// @match        http://url/seeyon/*
// @icon         https://www.google.com/s2/favicons?domain=www.seeyon.com
// @grant        GM_addStyle
// ==/UserScript==

(async function () {
    const URL = '';
    const PROJ_CODE = '';
    let doc = document;
    console.log('href', location.href);
    const INTERVAL_TIMEOUT = 1000;
    if (location.href.indexOf(URL + '/seeyon/main.do?method=main') !== -1) {
        console.log('主页，新增工时按钮');
        let button = doc.createElement('div');
        button.innerHTML = `<button class="oa__button">工时</button>`;
        doc.body.append(button);
        button.addEventListener('click', (e) => {
            console.log('点击新建技术部日志');
            doc.querySelector('.topMenuNav .topNavContainer .lev1Li .lev3Title[title="新建技术部日志"]').click();
        });
        let date = null;
        let prefix = ' 技术部日志：';
        setTimeout(() => {
            doc.querySelectorAll('.sectionPanel .section-body .multiRowVariableColumn table tr td.col_first').forEach((item) => {
                let text = item.innerText;
                if (date === null && text.startsWith(prefix)) {
                    date = text.substring(prefix.length, prefix.length + 10);
                }
            });
            if (date !== null) {
                let lastDay = new Date(date);
                if (lastDay) {
                    let day = lastDay.getDay();
                    if (day === 5) {
                        lastDay.setDate(lastDay.getDate() + 3);
                    } else {
                        lastDay.setDate(lastDay.getDate() + 1);
                    }
                }
                sessionStorage.setItem('lastDay', lastDay.toUTCString());
            }
        }, 3000);
    } else if (location.href.indexOf(URL + '/seeyon/collaboration/collaboration.do?method=newColl') !== -1) {
        console.log('工时页面');
        let tableDoc = await waitIframe(doc, '#zwIframe');
        console.log('点击选择项目按钮');
        // 选择项目
        tableDoc.querySelector('table #field0002_span span:last-child').click();
        let projDoc = await waitIframe(doc, '#_main iframe');
        console.log('点击筛选条件', projDoc);
        let projCodeBtn = await waitDom(projDoc, 'ul .common_drop_list_content a[title="项目编码"]');
        projCodeBtn.click();
        let projCodeInput = await waitDom(projDoc, 'ul .common_search_input input[name="field0005"]');
        projCodeInput.value = PROJ_CODE;
        let searchBtn = await waitDom(projDoc, 'ul li.search_btn a.common_button');
        searchBtn.click();
        console.log('选择项目');
        let projCheckbox = await waitDom(projDoc, '#center .bDiv tbody tr:first-child td:first-child input');
        projCheckbox.click();
        // 睡眠两秒，等待项目信息加载完成
        await sleep(2);
        console.log('提交项目信息');
        let submitBtn = await waitDom(doc, '#layui-layer1 .layui-layer-btn a.common_button_emphasize');
        submitBtn.click();

        console.log('填充时间');
        let lastDay = sessionStorage.getItem('lastDay');
        let now;
        if (lastDay) {
            now = new Date(lastDay);
        } else {
            now = new Date();
            let day = now.getDay();
            // 工作日上午填前一天的
            if (day > 0 && day < 6 && now.getHours() < 15) {
                if (day === 1) {
                    now.setDate(now.getDate() - 3);
                } else {
                    now.setDate(now.getDate() - 1);
                }
            }
        }
        let padZero = (nNum, nPad) => ('' + (Math.pow(10, nPad) + nNum)).slice(1);
        let today = now.getFullYear() + '-' + padZero(now.getMonth() + 1, 2) + '-' + padZero(now.getDate(), 2);
        let dayInput = await waitDom(tableDoc, '#field0016');
        dayInput.value = today;
        let dayStartInput = await waitDom(tableDoc, '#field0003');
        dayStartInput.value = today + ' 09:40';
        let dayEndInput = await waitDom(tableDoc, '#field0004');
        dayEndInput.value = today + ' 18:50';
        let workContent = await waitDom(tableDoc, '#field0006');
        workContent.value = '';
    } else if (location.href.indexOf(URL + '/seeyon/collaboration/collaboration.do?method=tabOffice') !== -1) {
        console.log('项目页面');
    }

    /**
     * 等待获取 iframe 元素
     * @param doc 文档对象
     * @param selector 选择器
     */
    async function waitIframe(doc, selector) {
        return new Promise(async (resolve) => {
            let iframe = await waitDom(doc, selector);
            resolve(iframe.contentDocument);
        });
    }

    /**
     * 等待获取 dom 元素
     * @param doc 文档对象
     * @param selector 选择器
     */
    async function waitDom(doc, selector) {
        return new Promise((resolve) => {
            let task = setInterval(() => {
                let dom = doc.querySelector(selector);
                console.log('getDom', selector, doc, dom);
                if (dom !== null) {
                    clearInterval(task);
                    console.log('dom', dom);
                    resolve(dom);
                }
            }, INTERVAL_TIMEOUT);
        });
    }

    /**
     * 等待一段时间
     * @param second 秒数
     */
    async function sleep(second) {
        return new Promise((resolve) => {
            setTimeout(() => resolve(), 1000 * second);
        });
    }

    let style = `
        .oa__button {
            position: fixed;
            top: 10px;
            right: 350px;
            z-index: 9999999;
            opacity: 0.2;
            padding: 5px 16px;
            border-radius: 100px;
        }

        .oa__button:hover {
            opacity: 1;
        }
    `;

    GM_addStyle(style);
})();
