// ==UserScript==
// @name         * Deepseek
// @namespace    https://github.com/gjp0609/Scripts/
// @version      1.3
// @description  添加自定义prompt
// @author       noif
// @match        https://chat.deepseek.com/*
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @noframes
// @run-at       document-start
// @require      file:///R:/Files/Workspace/Mine/Scripts/js/tampermonkey/deepseek.js
// ==/UserScript==

(function () {
    'use strict';

    setTimeout(async () => {
        let moreButton = document.createElement('div');
        let execFunction;
        const myPrompts = [
            {
                act: '翻译',
                prompt: '把下面的文本内容翻译为中文，如果输入为单词、短语或缩写，要详细解释\n文本：\n',
            },
            {
                act: '简要回答',
                prompt: '下面是问题内容，请用中文回复，并且只回答问题所问的内容，不需要太详细的解释。\n文本：\n',
            },
            {
                act: '详细一点',
                prompt: '详细解释一下',
            },
            {
                act: '头脑风暴',
                prompt: [
                    '步骤1：',
                    'Prompt: 我有一个问题，请头脑风暴三个不同的解决方案。请考虑多种因素',
                    '步骤2：',
                    'Prompt: 评估三个解决方案中每一个的潜力。考虑它们的优缺点、所需的初始工作、实施难度、潜在挑战和预期结果。根据这些因素为每个方案分配成功概率和置信水平',
                    '步骤3：',
                    'Prompt: 对于每个解决方案，请深化思维过程。生成潜在的情景、实施策略、任何必要的伙伴关系或资源，以及如何克服潜在的障碍。此外，请考虑任何潜在的意外结果以及如何处理它们。',
                    '步骤4：',
                    'Prompt: 根据评估和情景，按照最可能的顺序对解决方案进行排名。为每个排名提供理由，并对每个解决方案提供任何最终的想法或考虑',
                    '问题：\n',
                ].join('\n'),
            },
            {
                act: '更多...',
                prompt: 'more',
                dom: moreButton,
            },
        ];

        if (location.href.startsWith('https://chat.deepseek.com/')) {
            function insertCustomDOM() {
                const chatInput = document.querySelector('#chat-input');

                let tipDom = document.evaluate(
                    `//*[@id="root"]/div/div[2]/div[2]/div/div[2]/div/div[4]/div[2]`,
                    document,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null,
                ).singleNodeValue;
                if (!tipDom) {
                    let searchDom = document.evaluate(
                        `//*[@id="root"]/div/div[2]/div[2]/div[2]/div[2]`,
                        document,
                        null,
                        XPathResult.FIRST_ORDERED_NODE_TYPE,
                        null,
                    ).singleNodeValue;
                    if (searchDom) {
                        tipDom = document.createElement('div');
                        searchDom.appendChild(tipDom);
                    }
                }
                if (!chatInput || !tipDom) {
                    return;
                }
                tipDom.innerText = '';
                const wrapper = document.createElement('div');
                Object.assign(wrapper.style, {
                    display: 'flex',
                    flexWrap: 'wrap',
                    lineHeight: '20px',
                    gap: '10px',
                    padding: '10px',
                });
                myPrompts.forEach(({ act, prompt, dom }) => {
                    const li = dom || document.createElement('div');
                    li.textContent = act;
                    Object.assign(li.style, {
                        backgroundColor: '#66ccff22',
                        padding: '0.2rem 0.8rem',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        transition: 'background-color 0.3s',
                    });
                    li.addEventListener('mouseover', () => (li.style.backgroundColor = '#66ccff66'));
                    li.addEventListener('mouseout', () => (li.style.backgroundColor = '#66ccff22'));
                    wrapper.appendChild(li);
                    if (!dom) {
                        li.addEventListener('click', () => {
                            execFunction({ prompt });
                        });
                    }
                });
                tipDom.appendChild(wrapper);
                execFunction = ({ prompt }) => {
                    chatInput.focus();
                    chatInput.setSelectionRange(0, 0);
                    document.execCommand('insertText', false, prompt);
                    const keyboardEvent = new KeyboardEvent('keydown', {
                        bubbles: true,
                        cancelable: true,
                        key: 'Enter',
                        code: 'Enter',
                        view: unsafeWindow,
                    });
                    chatInput.dispatchEvent(keyboardEvent);
                };
            }
            insertCustomDOM();

            let isInserting = false; // 标志变量，控制插入操作
            // 创建MutationObserver来监视DOM变化
            const observer = new MutationObserver(() => {
                // 当DOM发生变化时，重新插入自定义DOM元素
                if (!isInserting) {
                    console.log('change');
                    isInserting = true;
                    insertCustomDOM();
                    isInserting = false;
                }
            });

            // 选择要监视的父节点
            const targetNode = document.evaluate(
                `//*[@id="root"]/div/div[2]`,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null,
            ).singleNodeValue;

            console.log('targetNode', targetNode);
            if (targetNode) {
                // 配置观察选项
                const config = { childList: true, subtree: false };
                // 开始监视
                observer.observe(targetNode, config);
            }
        }

        const shadowHost = document.createElement('div');
        shadowHost.style.position = 'fixed';
        shadowHost.style.bottom = '20px';
        shadowHost.style.right = '20px';
        shadowHost.style.zIndex = '999999';
        const shadowRoot = shadowHost.attachShadow({ mode: 'closed' });
        document.body.appendChild(shadowHost);
        // 创建样式
        const style = document.createElement('style');
        style.textContent = `
            :host {
                all: initial;
            }
            .container {
                display: none;
                position: fixed;
                bottom: 15%;
                left: 10%;
                width: 80%;
                max-height: 80%;
                border-radius: 6px;
                overflow-y: auto;
                background-color: #ffffff;
                box-shadow: 2px 2px 6px 3px #00000033;
            }
            .wrapper {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
                padding: 10px;
            }
            .prompt-item {
                padding: 4px 6px;
                border-radius: 5px;
                background-color: #00000009;
                cursor: pointer;
            }
            .prompt-item:hover {
                background-color: #66ccff66;
                box-shadow: 1px 1px 3px 1px #00000022;
            }
            * {
                scrollbar-color: #66ccff66 #00000000;
                scrollbar-width: thin;
            }
        `;
        shadowRoot.appendChild(style);
        const container = document.createElement('div');
        container.className = 'container';
        shadowRoot.append(container);
        const wrapper = document.createElement('div');
        wrapper.className = 'wrapper';
        container.appendChild(wrapper);
        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://gitee.com/plexpt/awesome-chatgpt-prompts-zh/raw/main/prompts-zh.json',
            onload: function (resp) {
                const array = JSON.parse(resp.responseText);
                array.forEach((item) => {
                    const element = document.createElement('div');
                    element.className = 'prompt-item';
                    element.textContent = item.act;
                    element.title = item.prompt;
                    element.addEventListener('click', () => execFunction(item));
                    wrapper.appendChild(element);
                });
            },
        });
        moreButton.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            container.style.display = container.style.display === 'block' ? 'none' : 'block';
        });
        document.body.addEventListener('click', () => {
            container.style.display = 'none';
        });
    }, 1000);
})();
