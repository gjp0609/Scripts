// ==UserScript==
// @name         * 工时填报
// @namespace    https://github.com/gjp0609/Scripts/
// @version      0.1
// @description  try to take over the world!
// @author       onysakura
// @match        https://oa.tydic.com/jsp/index.jsp
// @icon         https://www.google.com/s2/favicons?domain=oa.tydic.com
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    const INTERVAL_TIMEOUT = 300;

    let button = document.createElement('div');
    button.innerHTML = `<button class="oa__button">工时</button>`;
    document.body.append(button);
    button.addEventListener('click', (e) => {
        workingHour();
    });

    /**
     * 点击工时填报侧边按钮
     */
    function workingHour() {
        let button = document.getElementById('WF_M001_12_05');
        button.click();
        let iframeLoadInterval = setInterval((_) => {
            let elms = document.querySelectorAll("[id='WF_M001_12_05']");
            if (elms.length === 2) {
                let whIframe = elms[1];
                let whIframeDoc = whIframe.contentDocument || whIframe.contentWindow.document;
                if (whIframeDoc.readyState === 'complete') {
                    clearInterval(iframeLoadInterval);
                    let getButtonInterval = setInterval((_) => {
                        let whAddButton = whIframeDoc.querySelector('[id="WF_M001_12_05_01_02"]>a');
                        if (whAddButton) {
                            clearInterval(getButtonInterval);
                            whAddButton.click();
                            addWorkingHour();
                        }
                    }, INTERVAL_TIMEOUT);
                }
            }
        }, INTERVAL_TIMEOUT);
    }

    function addWorkingHour() {
        let iframeLoadInterval = setInterval((_) => {
            let addWhIframe = document.querySelector("[id='whCreate']");
            if (addWhIframe) {
                let addWhIframeDoc = addWhIframe.contentDocument || addWhIframe.contentWindow.document;
                if (addWhIframeDoc.readyState === 'complete') {
                    clearInterval(iframeLoadInterval);
                    let getDivInterval = setInterval((_) => {
                        let trs = addWhIframeDoc.querySelectorAll('table[name="tab1"]>tbody>tr');
                        if (trs.length > 0) {
                            clearInterval(getDivInterval);
                        }
                    }, INTERVAL_TIMEOUT);
                }
            }
        }, INTERVAL_TIMEOUT);
    }

    function GM_addStyle(style) {
        let styleElement = document.createElement('style');
        styleElement.innerText = style;
        document.getElementsByTagName('head').item(0).appendChild(styleElement);
    }

    let style = `
        .oa__button {
            position: fixed;
            top: 22px;
            right: 580px;
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
