// ==UserScript==
// @name         * 金山文档 防闲置超时 - 低频有效版
// @namespace    https://github.com/gjp0609/Scripts/
// @version      0.4
// @description  每段时间轻微抖动鼠标 + 派发事件，防止金山文档闲置重载。影响最小，频率低。
// @author       Grok
// @match        https://*.kdocs.cn/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const INTERVAL_MINUTES = 5;  // 5分钟一次，够低频
    const INTERVAL_MS = INTERVAL_MINUTES * 60 * 1000;

    let lastX = window.innerWidth / 2;
    let lastY = window.innerHeight / 2;

    function simulateLightActivity() {
        // 轻微抖动鼠标：从当前位置 ±1~2像素随机移动
        const offsetX = Math.random() * 4 - 2;  // -2 到 +2
        const offsetY = Math.random() * 4 - 2;

        lastX += offsetX;
        lastY += offsetY;

        // 限制在屏幕内（防溢出）
        lastX = Math.max(10, Math.min(window.innerWidth - 10, lastX));
        lastY = Math.max(10, Math.min(window.innerHeight - 10, lastY));

        // 模拟 mousemove
        const moveEvent = new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: lastX,
            clientY: lastY,
            movementX: offsetX,
            movementY: offsetY,
            screenX: lastX + window.screenX,
            screenY: lastY + window.screenY
        });

        document.dispatchEvent(moveEvent);
        document.body.dispatchEvent(moveEvent);
        window.dispatchEvent(moveEvent);

        // 额外派发 pointermove（现代浏览器更常用）
        const pointerEvent = new PointerEvent('pointermove', {
            bubbles: true,
            cancelable: true,
            pointerType: 'mouse',
            clientX: lastX,
            clientY: lastY,
            movementX: offsetX,
            movementY: offsetY
        });
        document.dispatchEvent(pointerEvent);

        console.log(`[KDocs防闲置] 已轻微抖动鼠标 @ ${new Date().toLocaleTimeString()}`);
    }

    // 页面加载后先执行一次
    setTimeout(simulateLightActivity, 5000);  // 延迟5秒，避免刚打开就动

    // 定时执行
    setInterval(simulateLightActivity, INTERVAL_MS);

    // 标签页可见时额外触发一次（防切回后立即超时）
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            setTimeout(simulateLightActivity, 2000);
        }
    });
})();
