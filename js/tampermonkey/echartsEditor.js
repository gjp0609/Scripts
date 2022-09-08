// ==UserScript==
// @name         * Echarts Editor
// @namespace    https://github.com/gjp0609/Scripts/
// @version      0.1
// @description  try to take over the world!
// @author       onysakura
// @include      *
// @require      https://cdn.jsdelivr.net/npm/jsoneditor@9.9.0/dist/jsoneditor.min.js
// ==/UserScript==

(function () {
    'use strict';
    if (typeof echarts !== 'undefined') {
        let cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.href = 'https://cdn.jsdelivr.net/npm/jsoneditor@9.9.0/dist/jsoneditor.min.css';
        document.head.appendChild(cssLink);

        let wrapper = document.createElement('div');
        wrapper.id = 'echarts_editor_json';
        wrapper.draggable = true;
        wrapper.style.display = 'none';
        wrapper.style.width = '25rem';
        wrapper.style.minHeight = '10rem';
        wrapper.style.height = '40rem';
        wrapper.style.position = 'fixed';
        wrapper.style.top = '1rem';
        wrapper.style.left = '1rem';
        wrapper.style.backgroundColor = '#ffffff';
        wrapper.style.padding = '0 0.5rem';
        wrapper.style.border = '0.01rem solid #666';
        wrapper.style.boxShadow = '#ccc 0 0 0.5rem 0.2rem';
        wrapper.style.zIndex = '99999999';
        wrapper.style.overflow = 'scroll';
        wrapper.style.resize = 'both';
        let headElement = document.createElement('div');
        wrapper.appendChild(headElement);
        headElement.outerHTML = `
            <div style="height: 2rem; line-height: 2rem; display: flex; justify-content: space-between; position: sticky; top: 0; background-color: white; z-index: 999999999">
                <span class="echarts_editor_title" style="flex: 1">Echarts Editor</span>
                <span style="flex: 1; display: flex; justify-content: end">
                    <span id="echarts_editor_save"  style="cursor: pointer;">✓应用</span>
                    <span id="echarts_editor_close" style="margin-left: 1rem; cursor: pointer;">×关闭</span>
                </span>
            </div>`;
        let jsonElement = document.createElement('div');
        wrapper.appendChild(jsonElement);
        document.body.appendChild(wrapper);
        let options = {
            mode: 'tree',
            modes: ['tree', 'code']
        };
        let editor = new JSONEditor(jsonElement, options);

        let currInstanceId = '';
        let currInstance;
        let currInstanceDiv;
        document.addEventListener('dblclick', (e) => {
            if (e.target.nodeName === 'CANVAS') {
                let echartsDiv = e.target?.parentElement?.parentElement;
                if (echartsDiv) {
                    currInstanceDiv = echartsDiv;
                    let instanceId = echartsDiv.getAttribute('_echarts_instance_');
                    console.log(instanceId);
                    document.querySelector('#echarts_editor_id').innerText = instanceId;
                    if (instanceId === currInstanceId) {
                        showEditor();
                    } else if (instanceId) {
                        currInstanceId = instanceId;
                        currInstance = echarts.getInstanceByDom(echartsDiv);
                        editor.set(currInstance.getOption());
                        showEditor();
                    }
                }
            }
        });

        function hideEditor() {
            document.querySelector('#echarts_editor_json').style.display = 'none';
        }
        function showEditor() {
            document.querySelector('#echarts_editor_json').style.display = 'block';
        }
        document.querySelector('#echarts_editor_json #echarts_editor_close').addEventListener('click', (e) => {
            hideEditor();
        });
        document.querySelector('#echarts_editor_json #echarts_editor_save').addEventListener('click', (e) => {
            currInstance.setOption(editor.get());
        });

        let offsetX, offsetY;
        wrapper.addEventListener('mousedown', (e) => {
            offsetX = e.offsetX;
            offsetY = e.offsetY;
        });
        wrapper.addEventListener('dragend', (e) => {
            wrapper.style.left = e.clientX - offsetX + 'px';
            wrapper.style.top = e.clientY - offsetY + 'px';
        });
    }
})();
