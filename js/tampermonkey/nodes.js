// ==UserScript==
// @name         * nodes show
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  网页背景node连线
// @author       onysakura
// @include      *
// @grant        none
// @noframes
// ==/UserScript==

(function () {
    let COUNT = 30, // 圆点数量
        mouseX = 0,
        mouseY = 0,
        mouseColor = '',
        maxR = 6, // 圆点最大半径
        minR = 2, // 圆点最小半径
        lineWidth = 1.5, // 线条宽度
        maxDistance = 150, // 两点连线最远距离
        maxCatchDistance = 200, // 鼠标最大捕获范围
        maxCatchR = 100, // 鼠标捕获后最远距离
        speed = 2, // 移动速度
        shadowColor = '#fd8', // 阴影颜色
        shadowOffsetX = 5, // 阴影x轴偏移
        shadowOffsetY = 5, // 阴影y轴偏移
        shadowBlur = 10, // 阴影虚化扩散量
        arr = [],
        style = [
            ['#feb', '#fca', '#fcc', '#fac', '#fbe'],
            ['#bef', '#bfe', '#afc', '#cfa', '#cfc'],
            ['#efb', '#feb', '#fca', '#fcc'],
            ['#fbe', '#ebf', '#caf', '#ccf', '#acf'],
            ['#eee', '#ddd', '#ccc', '#bbb', '#aaa', '#999', '#888']
        ],
        color = style[0];
    let body = document.getElementsByTagName('body')[0];
    let background = document.createElement('div');
    let canvas = document.createElement('canvas');
    let ctx = canvas.getContext('2d');
    body.insertBefore(background, body.firstChild);
    background.appendChild(canvas);
    background.setAttribute('style', 'position:fixed;z-index:-1;width: 100%;height: 100%');
    canvas.width = background.clientWidth;
    canvas.height = background.clientHeight;
    let width = canvas.clientWidth;
    let height = canvas.clientHeight;
    mouseColor = getRandomColor();
    // 鼠标事件
    body.addEventListener(
        'mouseover',
        (e) => {
            mouseX = e.x - getElementLeft(canvas);
            mouseY = e.y - getElementTop(canvas);
        },
        true
    );
    body.addEventListener(
        'mousemove',
        (e) => {
            mouseX = e.x - getElementLeft(canvas);
            mouseY = e.y - getElementTop(canvas);
        },
        true
    );
    body.addEventListener(
        'mouseout',
        (e) => {
            mouseX = 0;
            mouseY = 0;
        },
        true
    );
    body.addEventListener(
        'dblclick',
        (e) => {
            color = style[~~(Math.random() * style.length)];
            for (let i = 0; i < arr.length; i++) {
                arr[i].color = getRandomColor();
                arr[i].x = width / 2;
                arr[i].y = height / 2;
            }
            mouseColor = getRandomColor();
        },
        true
    );

    // 初始化点
    for (let i = 0; i < COUNT; i++) {
        arr.push(createPoint());
    }

    // let fps=0;
    // let fpsTotal=0;
    // setInterval(function(){console.log(fpsTotal-fps);fps=fpsTotal;},1000);
    // 初始化渲染
    render();

    function render() {
        // fpsTotal++;
        ctx.clearRect(0, 0, width, height);
        ctx.shadowOffsetX = shadowOffsetX;
        ctx.shadowOffsetY = shadowOffsetY;
        ctx.shadowBlur = shadowBlur;
        for (let i = 0; i < arr.length; i++) {
            let k = arr[i];
            ctx.beginPath();
            ctx.arc(k.x, k.y, k.r, 0, 2 * Math.PI);
            ctx.shadowColor = k.color;
            ctx.fillStyle = k.color;
            ctx.fill();
            for (let j = 0; j < arr.length; j++) {
                if (i !== j) {
                    drawLine(k, arr[j]);
                }
            }
            if (mouseX > 1 && mouseY > 1 && mouseX + 1 < width && mouseY + 1 < height) {
                //ctx.beginPath();
                //ctx.arc(mouseX, mouseY, 2, 0, 2 * Math.PI);
                //ctx.fillStyle = mouseColor;
                //ctx.fill();
                drawLine(
                    {
                        x: mouseX,
                        y: mouseY,
                        xsKew: 0,
                        ysKew: 0,
                        r: 2,
                        color: mouseColor
                    },
                    k
                );
                // 鼠标捕获
                let d = calcDistance(mouseX, mouseY, k.x, k.y);
                if (d < maxCatchDistance && d > maxCatchR) {
                    k.x += ((mouseX - k.x) / 600) * speed * 4;
                    k.y += ((mouseY - k.y) / 600) * speed * 4;
                }
            }
            if (k.x + k.xsKew + k.r < width && k.x + k.xsKew - k.r > 0) {
                k.x += k.xsKew;
            } else {
                k.xsKew = -k.xsKew;
            }
            if (k.y + k.ysKew + k.r < height && k.y + k.ysKew - k.r > 0) {
                k.y += k.ysKew;
            } else {
                k.ysKew = -k.ysKew;
            }
        }
        window.requestAnimationFrame(render.bind(this));
    }

    function createPoint() {
        let r = ~~(minR + Math.random() * (maxR - minR));
        return {
            x: ~~(Math.random() * (width - 3 * r)) + 3 * r,
            y: ~~(Math.random() * (height - 3 * r)) + 3 * r,
            xsKew: (Math.random() - 0.5) * speed, // x方向速度
            ysKew: (Math.random() - 0.5) * speed, // y方向速度
            r: r,
            color: getRandomColor()
        };
    }

    function drawLine(p1, p2) {
        let distance = calcDistance(p1.x, p1.y, p2.x, p2.y);
        if (distance <= maxDistance) {
            ctx.lineWidth = lineWidth;
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            let grd = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y); //线性渐变的起止坐标
            grd.addColorStop(0, toRGBA(p1.color, 1 - distance / maxDistance));
            grd.addColorStop(1, toRGBA(p2.color, 1 - distance / maxDistance));
            ctx.strokeStyle = grd;
            ctx.stroke();
            ctx.restore();
        }
    }

    function calcDistance(p1x, p1y, p2x, p2y) {
        let xDistance = Math.abs(p1x - p2x); //计算两点间的x距离
        let yDistance = Math.abs(p1y - p2y); //计算两点间的y距离
        return Math.sqrt(xDistance * xDistance + yDistance * yDistance);
    }

    function getElementLeft(element) {
        let actualLeft = element.offsetLeft;
        let current = element.offsetParent;
        while (current !== null) {
            actualLeft += current.offsetLeft;
            current = current.offsetParent;
        }
        return actualLeft;
    }

    function getElementTop(element) {
        let actualTop = element.offsetTop;
        let current = element.offsetParent;
        while (current !== null) {
            actualTop += current.offsetTop;
            current = current.offsetParent;
        }
        return actualTop;
    }

    function getRandomColor() {
        return color[~~(Math.random() * color.length)];
    }

    function toRGBA(color, alpha) {
        color = color.toLowerCase();
        //十六进制颜色值的正则表达式
        if (color.length === 4) {
            let colorNew = '#';
            for (let i = 1; i < 4; i += 1) {
                colorNew += color.slice(i, i + 1).concat(color.slice(i, i + 1));
            }
            color = colorNew;
        }
        //处理六位的颜色值
        let colorChange = [];
        for (let i = 1; i < 7; i += 2) {
            colorChange.push(parseInt('0x' + color.slice(i, i + 2)));
        }
        return 'rgba(' + colorChange.join(',') + ',' + alpha + ')';
    }
})();
