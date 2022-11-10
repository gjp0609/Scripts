// ==UserScript==
// @name         * Google 移除重定向，结果跳转新标签 | 屏蔽特定网站
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  点击谷歌搜索结果时开启一个新的标签页、屏蔽特定网站
// @author       onysakura
// @include      https://www.google.com/search*
// @include      https://www.google.co.jp/search*
// @icon         https://www.google.com/s2/favicons?domain=google.com
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    const BLOCK_WORDS = ['csdn.net', 'cmsblogs.com'];
    let hidden = true;
    try {
        let searchDiv = document.querySelector('#search');
        let as = searchDiv.querySelectorAll('div > a');
        for (const a of as) {
            // new tab
            setTimeout(() => {
                let newA = document.createElement('a');
                a.parentElement.appendChild(newA);
                newA.href = a.href;
                newA.target = '_blank';
                newA.appendChild(document.createElement('br'));
                let h3 = a.querySelector('h3');
                if (h3) {
                    newA.appendChild(a.querySelector('h3'));
                    newA.appendChild(a.querySelector('div'));
                } else {
                    newA.innerText = a.innerText;
                }
                a.parentElement.removeChild(a);
            }, 1);
            // block
            let cites = a.getElementsByTagName('cite');
            if (cites && cites[0]) {
                let cite = cites[0];
                for (let blockWord of BLOCK_WORDS) {
                    if (cite.innerText && cite.innerText.indexOf(blockWord) >= 0) {
                        let parent = cite.parentNode;
                        for (let i = 0; i < 10; i++) {
                            if (parent) {
                                for (let classListElement of parent.classList) {
                                    if (classListElement === 'g') {
                                        parent.className += ' hide_element';
                                        break;
                                    }
                                }
                            }
                            parent = parent.parentNode;
                        }
                        break;
                    }
                }
            }
        }
    } catch (e) {
        alert('out of date');
        throw e;
    }
    let style = `
    .hide_block_div {
        position: fixed;
        top: 10px;
        right: 300px;
        z-index: 9999999;
        display: flex;
        width: 110px;
        justify-content: space-between;
        opacity: 0.2;
    }
    
    .hide_block_div:hover {
        opacity: 1;
    }
    .hide_block_label {
        line-height: 34px;
    }
    
    .hide_block_switch {
      position: relative;
      display: inline-block;
      width: 60px;
      height: 34px;
    }
    
    .hide_block_switch input {display:none;}
    
    .hide_block_slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #ccc;
      -webkit-transition: .4s;
      transition: .4s;
    }
    
    .hide_block_slider:before {
      position: absolute;
      content: "";
      height: 26px;
      width: 26px;
      left: 4px;
      bottom: 4px;
      background-color: white;
      -webkit-transition: .4s;
      transition: .4s;
    }
    
    input:checked + .hide_block_slider {
      background-color: #2196F3;
    }
    
    input:focus + .hide_block_slider {
      box-shadow: 0 0 1px #2196F3;
    }
    
    input:checked + .hide_block_slider:before {
      -webkit-transform: translateX(26px);
      -ms-transform: translateX(26px);
      transform: translateX(26px);
    }
    
    /* Rounded sliders */
    .hide_block_slider.hide_block_round {
      border-radius: 34px;
    }
    
    .hide_block_slider.hide_block_round:before {
      border-radius: 50%;
    }
`;
    GM_addStyle(style);
    let div = document.createElement('div');
    div.innerHTML = `<div class="hide_block_div">
            <div class="hide_block_label">Hide:</div>
            <label class="hide_block_switch">
                <input id="hide_block_input" type="checkbox" checked>
                <div class="hide_block_slider hide_block_round"></div>
            </label>
        </div>`;
    document.body.append(div);
    let hideInput = document.getElementById('hide_block_input');
    hideInput.addEventListener('change', (e) => {
        hide();
    });

    hide();

    function hide() {
        hidden = !hidden;
        let hideElements = document.getElementsByClassName('hide_element');
        for (let hideElement of hideElements) {
            hideElement.style.display = hidden ? 'block' : 'none';
        }
    }
})();
