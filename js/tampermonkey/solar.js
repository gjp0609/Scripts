// ==UserScript==
// @name         * solar system
// @namespace    https://www.onysakura.fun
// @version      0.1
// @description  solar system background
// @author       onysakura
// @include      *
// @grant        none
// ==/UserScript==

(function () {
    console.log(window.top);
    if (window.top !== window.self) {
        //don't run on frames or iframes
        return;
    }
    const real = true; // 距离真实比例
    const randomStatus = true; // 每次随机位置
    const planetWidth = 5; // 行星大小
    const speed = 5; // 地球 ${speed} 秒一圈
    const position = { x: 0.9, y: 0.1 }; // 位置偏移
    const sizeScale = 1.7; // 大小缩放

    let solarSystemHalfWidth = 7479.893533;
    solarSystemHalfWidth = real ? solarSystemHalfWidth : Math.log1p(solarSystemHalfWidth);

    let body = document.getElementsByTagName('body')[0];
    let background = document.createElement('div');
    let solar = document.createElement('canvas');
    let planet = document.createElement('canvas');
    background.appendChild(solar);
    background.appendChild(planet);
    background.setAttribute('style', 'position:fixed;z-index:-1;width: 100%;height: 100%;opacity: 0.4;');
    let width = solar.clientWidth;
    let height = solar.clientHeight;
    body.insertBefore(background, body.firstChild);
    solar.width = background.clientWidth;
    solar.height = background.clientHeight;
    solar.style.position = 'absolute';
    planet.width = background.clientWidth;
    planet.height = background.clientHeight;
    planet.style.position = 'absolute';

    let canvasWidth = solar.clientWidth;
    let maxWidth = (solarSystemHalfWidth * 2) / sizeScale;
    let scale = canvasWidth / maxWidth;
    let centerPoint = { x: maxWidth * scale * position.x, y: maxWidth * scale * position.y };
    solar.width = solar.clientWidth;
    solar.height = solar.clientHeight;
    const solarCtx = solar.getContext('2d');
    solarCtx.shadowOffsetX = 0; // 阴影x轴偏移
    solarCtx.shadowOffsetY = 0; // 阴影y轴偏移
    solarCtx.shadowBlur = 5; // 阴影虚化扩散量
    solarCtx.lineWidth = 1;

    let planets = [
        // { color: '#ffffff', type: 'other', half: 7479.893533, isNotPlanet: true }, // a 古柏断涯
        { color: '#8caaca', type: 'planet', half: 4503.443661, roundTime: 60327.624 }, // ♆ 海王星
        { color: '#addee3', type: 'planet', half: 2876.679082, roundTime: 30799.095 }, // ⛢ 天王星
        { color: '#dfc384', type: 'planet', half: 1433.44937, roundTime: 10759 }, // ♄ 土星
        { color: '#ceba9b', type: 'planet', half: 778.5472, roundTime: 4332.59 }, // ♃ 木星
        { color: '#fd906c', type: 'planet', half: 227.9366, roundTime: 686.98 }, // ♂ 火星
        { color: '#7fb5d7', type: 'planet', half: 149.598023, roundTime: 365.256363004 }, // ♁ 地球
        { color: '#d9c4a9', type: 'planet', half: 108.208, roundTime: 224.701 }, // ♀ 金星
        { color: '#b9b8b8', type: 'planet', half: 57.9091, roundTime: 87.9691 }, // ☿ 水星
        { color: 'rgba(247,161,69,0.08)', type: 'sun', half: 1.392, isNotPlanet: true } // ☉ Sun
    ];

    for (let planet of planets) {
        solarCtx.strokeStyle = planet.color;
        solarCtx.fillStyle = planet.color;
        solarCtx.shadowColor = planet.color;
        solarCtx.beginPath();
        let half = real ? planet.half : Math.log1p(planet.half);
        solarCtx.arc(centerPoint.x, centerPoint.y, half * scale, 0, Math.PI * 2, true); // 绘制
        if (planet.type === 'planet') {
            solarCtx.stroke();
        } else {
            solarCtx.fill();
        }
    }

    planet.width = planet.clientWidth;
    planet.height = planet.clientHeight;
    const planetCtx = planet.getContext('2d');
    planetCtx.shadowOffsetX = 0; // 阴影x轴偏移
    planetCtx.shadowOffsetY = 0; // 阴影y轴偏移
    planetCtx.shadowBlur = 5; // 阴影虚化扩散量
    planetCtx.lineWidth = 1;

    let startTime = new Date().getTime();
    let initTime = (randomStatus ? Math.random() : 1) * 10000000;
    window.requestAnimationFrame(drawPlanet);

    function drawPlanet() {
        let nowTime = new Date().getTime();
        let time = initTime + nowTime - startTime;

        planetCtx.clearRect(0, 0, planet.width, planet.height);
        for (let planet of planets) {
            if (planet.type === 'planet') {
                planetCtx.strokeStyle = planet.color;
                planetCtx.fillStyle = planet.color;
                planetCtx.shadowColor = planet.color;
                let round = ((time * Math.PI * 2) / speed / 1000 / (planet.roundTime / 365.256363004)) % (Math.PI * 2);
                let half = real ? planet.half : Math.log1p(planet.half);
                let x = centerPoint.x + half * scale * Math.cos(round);
                let y = centerPoint.y + half * scale * Math.sin(round);
                planetCtx.beginPath();
                planetCtx.arc(x, y, planetWidth, 0, Math.PI * 2, true); // 绘制
                planetCtx.fill();
            }
        }
        window.requestAnimationFrame(drawPlanet);
    }
})();
