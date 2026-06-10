// ==UserScript==
// @name         去暗色主题
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  将暗色主题网站转换为亮色主题
// @author       您的名字
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
    'use strict';

    // 初始化
    const isBrightMode = GM_getValue(location.host, false);

    // 添加菜单项
    GM_registerMenuCommand(
        isBrightMode ? "关闭亮色模式" : "开启亮色模式",
        toggleBrightMode
    );

    // 切换亮色模式
    function toggleBrightMode() {
        const newState = !GM_getValue(location.host, false);
        GM_setValue(location.host, newState);
        location.reload();
    }

    // 如果亮色模式开启，应用亮色转换
    if (isBrightMode) {
        applyBrightMode();
    }

    function applyBrightMode() {
        // 插入全局样式
        const style = document.createElement('style');
        style.innerHTML = `
            * {
                color: black !important;
                background-color: white !important;
                border-color: black !important;
            }
            *::before,
            *::after {
                color: black !important;
                background-color: transparent !important;
            }
        `;
        document.head.appendChild(style);

        // 处理动态加载内容
        const observer = new MutationObserver(() => {
            const allElements = document.querySelectorAll('*');
            allElements.forEach(element => {
                adjustElementColors(element);
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // 初始应用
        const allElements = document.querySelectorAll('*');
        allElements.forEach(element => {
            adjustElementColors(element);
        });
    }

    function adjustElementColors(element) {
        const computedStyle = window.getComputedStyle(element);

        // 背景色调整为浅色
        const bgColor = computedStyle.backgroundColor;
        if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)') {
            const invertedBg = invertDarkColor(bgColor);
            element.style.setProperty('background-color', invertedBg, 'important');
        }

        // 文本颜色调整为深色
        const textColor = computedStyle.color;
        if (textColor) {
            const invertedText = invertLightColor(textColor);
            element.style.setProperty('color', invertedText, 'important');
        }
    }

    function invertDarkColor(color) {
        const [r, g, b] = color.match(/\d+/g).map(Number);
        if (r + g + b < 384) { // 深色判断
            return `rgb(${255 - r}, ${255 - g}, ${255 - b})`;
        }
        return color; // 浅色不变
    }

    function invertLightColor(color) {
        const [r, g, b] = color.match(/\d+/g).map(Number);
        if (r + g + b > 384) { // 浅色判断
            return `rgb(${255 - r}, ${255 - g}, ${255 - b})`;
        }
        return color; // 深色不变
    }
})();
