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

    const maxDistanceSq = maxDistance * maxDistance;
    const maxCatchDistanceSq = maxCatchDistance * maxCatchDistance;
    const maxCatchRSq = maxCatchR * maxCatchR;
    const lineStride = 6;
    const pointStride = 9;
    const lineVertexMax = (COUNT * (COUNT - 1) + COUNT) * 6;
    const pointVertexMax = COUNT * 6;
    const lineData = new Float32Array(lineVertexMax * lineStride);
    const shadowLineData = new Float32Array(lineVertexMax * lineStride);
    const pointData = new Float32Array(pointVertexMax * pointStride);
    const shadowPointData = new Float32Array(pointVertexMax * pointStride);
    const colorCache = {};
    const mousePoint = {
        x: 0,
        y: 0,
        color: '',
        rgb: [1, 1, 1]
    };

    let body = document.getElementsByTagName('body')[0];
    let background = document.createElement('div');
    let canvas = document.createElement('canvas');
    body.insertBefore(background, body.firstChild);
    background.appendChild(canvas);
    background.setAttribute('style', 'position:fixed;z-index:-1;left:0;top:0;width:100%;height:100%;pointer-events:none;');

    let gl = canvas.getContext('webgl', {
        alpha: true,
        antialias: true,
        depth: false,
        stencil: false,
        premultipliedAlpha: true
    });
    if (!gl) {
        console.warn('nodes.js: WebGL is not available.');
        return;
    }

    let width = 0;
    let height = 0;
    let dpr = 1;
    let canvasRect = canvas.getBoundingClientRect();
    let shadowTarget = null;
    let blurTarget = null;

    const lineProgram = createProgram(gl, `
        attribute vec2 a_position;
        attribute vec4 a_color;
        uniform vec2 u_resolution;
        varying vec4 v_color;

        void main() {
            vec2 zeroToOne = a_position / u_resolution;
            vec2 clipSpace = zeroToOne * 2.0 - 1.0;
            gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
            v_color = a_color;
        }
    `, `
        precision mediump float;
        varying vec4 v_color;

        void main() {
            gl_FragColor = vec4(v_color.rgb * v_color.a, v_color.a);
        }
    `);
    const pointProgram = createProgram(gl, `
        attribute vec2 a_position;
        attribute vec2 a_local;
        attribute float a_radius;
        attribute vec4 a_color;
        uniform vec2 u_resolution;
        varying vec2 v_local;
        varying float v_radius;
        varying vec4 v_color;

        void main() {
            vec2 zeroToOne = a_position / u_resolution;
            vec2 clipSpace = zeroToOne * 2.0 - 1.0;
            gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
            v_local = a_local;
            v_radius = a_radius;
            v_color = a_color;
        }
    `, `
        precision mediump float;
        varying vec2 v_local;
        varying float v_radius;
        varying vec4 v_color;

        void main() {
            float distance = length(v_local);
            float alpha = 1.0 - smoothstep(v_radius - 0.75, v_radius + 0.75, distance);
            float outputAlpha = v_color.a * alpha;
            if (outputAlpha <= 0.01) {
                discard;
            }
            gl_FragColor = vec4(v_color.rgb * outputAlpha, outputAlpha);
        }
    `);
    const textureProgram = createProgram(gl, `
        attribute vec2 a_position;
        attribute vec2 a_texCoord;
        varying vec2 v_texCoord;

        void main() {
            gl_Position = vec4(a_position, 0.0, 1.0);
            v_texCoord = a_texCoord;
        }
    `, `
        precision mediump float;
        uniform sampler2D u_texture;
        varying vec2 v_texCoord;

        void main() {
            gl_FragColor = texture2D(u_texture, v_texCoord);
        }
    `);
    const blurProgram = createProgram(gl, `
        attribute vec2 a_position;
        attribute vec2 a_texCoord;
        varying vec2 v_texCoord;

        void main() {
            gl_Position = vec4(a_position, 0.0, 1.0);
            v_texCoord = a_texCoord;
        }
    `, `
        precision mediump float;
        uniform sampler2D u_texture;
        uniform vec2 u_texelSize;
        uniform vec2 u_direction;
        uniform float u_radius;
        varying vec2 v_texCoord;

        void main() {
            vec4 color = vec4(0.0);
            float total = 0.0;
            float sigma = max(1.0, u_radius * 0.5);
            for (int i = -16; i <= 16; i++) {
                float x = float(i);
                if (abs(x) <= u_radius) {
                    float weight = exp(-(x * x) / (2.0 * sigma * sigma));
                    color += texture2D(u_texture, v_texCoord + u_direction * u_texelSize * x) * weight;
                    total += weight;
                }
            }
            gl_FragColor = color / total;
        }
    `);

    const lineBuffer = gl.createBuffer();
    const shadowLineBuffer = gl.createBuffer();
    const pointBuffer = gl.createBuffer();
    const shadowPointBuffer = gl.createBuffer();
    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
            -1, -1, 0, 0,
            1, -1, 1, 0,
            -1, 1, 0, 1,
            -1, 1, 0, 1,
            1, -1, 1, 0,
            1, 1, 1, 1
        ]),
        gl.STATIC_DRAW
    );

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);

    resizeCanvas();
    mouseColor = getRandomColor();
    mousePoint.color = mouseColor;
    mousePoint.rgb = parseColor(mouseColor);

    body.addEventListener('mouseover', updateMousePosition, true);
    body.addEventListener('mousemove', updateMousePosition, true);
    body.addEventListener(
        'mouseout',
        () => {
            mouseX = 0;
            mouseY = 0;
        },
        true
    );
    body.addEventListener(
        'dblclick',
        () => {
            color = style[~~(Math.random() * style.length)];
            for (let i = 0; i < arr.length; i++) {
                setPointColor(arr[i], getRandomColor());
                arr[i].x = width / 2;
                arr[i].y = height / 2;
            }
            mouseColor = getRandomColor();
            mousePoint.color = mouseColor;
            mousePoint.rgb = parseColor(mouseColor);
        },
        true
    );
    window.addEventListener('resize', resizeCanvas);

    for (let i = 0; i < COUNT; i++) {
        arr.push(createPoint());
    }

    window.requestAnimationFrame(render);

    function render() {
        let hasMouse = mouseX > 1 && mouseY > 1 && mouseX + 1 < width && mouseY + 1 < height;
        mousePoint.x = mouseX;
        mousePoint.y = mouseY;

        let counts = buildSceneData(hasMouse);
        renderShadowTexture(counts);
        drawMainScene(counts);
        updatePoints(hasMouse);

        window.requestAnimationFrame(render);
    }

    function renderShadowTexture(counts) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, shadowTarget.framebuffer);
        gl.viewport(0, 0, shadowTarget.width, shadowTarget.height);
        gl.clear(gl.COLOR_BUFFER_BIT);
        drawLines(shadowLineBuffer, shadowLineData, counts.shadowLines, lineProgram);
        drawPoints(shadowPointBuffer, shadowPointData, counts.shadowPoints, pointProgram);

        gl.bindFramebuffer(gl.FRAMEBUFFER, blurTarget.framebuffer);
        gl.viewport(0, 0, blurTarget.width, blurTarget.height);
        gl.clear(gl.COLOR_BUFFER_BIT);
        drawBlur(shadowTarget.texture, 1, 0);

        gl.bindFramebuffer(gl.FRAMEBUFFER, shadowTarget.framebuffer);
        gl.viewport(0, 0, shadowTarget.width, shadowTarget.height);
        gl.clear(gl.COLOR_BUFFER_BIT);
        drawBlur(blurTarget.texture, 0, 1);
    }

    function drawMainScene(counts) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT);
        drawTexture(shadowTarget.texture);
        drawLines(lineBuffer, lineData, counts.lines, lineProgram);
        drawPoints(pointBuffer, pointData, counts.points, pointProgram);
    }

    function buildSceneData(hasMouse) {
        let lineOffset = 0;
        let shadowLineOffset = 0;
        let pointOffset = 0;
        let shadowPointOffset = 0;

        for (let i = 0; i < arr.length; i++) {
            let point = arr[i];
            pointOffset = appendPoint(pointData, pointOffset, point, 0, 0, point.rgb, 1);
            shadowPointOffset = appendPoint(shadowPointData, shadowPointOffset, point, shadowOffsetX, shadowOffsetY, point.rgb, 1);

            for (let j = 0; j < arr.length; j++) {
                if (i !== j) {
                    let line = getLineInfo(point, arr[j]);
                    if (line) {
                        lineOffset = appendLine(lineData, lineOffset, point, arr[j], line.distance, point.rgb, arr[j].rgb, line.alpha, 0, 0);
                        shadowLineOffset = appendLine(shadowLineData, shadowLineOffset, point, arr[j], line.distance, point.rgb, point.rgb, line.alpha, shadowOffsetX, shadowOffsetY);
                    }
                }
            }

            if (hasMouse) {
                let line = getLineInfo(mousePoint, point);
                if (line) {
                    lineOffset = appendLine(lineData, lineOffset, mousePoint, point, line.distance, mousePoint.rgb, point.rgb, line.alpha, 0, 0);
                    shadowLineOffset = appendLine(shadowLineData, shadowLineOffset, mousePoint, point, line.distance, point.rgb, point.rgb, line.alpha, shadowOffsetX, shadowOffsetY);
                }
            }
        }

        return {
            lines: lineOffset / lineStride,
            shadowLines: shadowLineOffset / lineStride,
            points: pointOffset / pointStride,
            shadowPoints: shadowPointOffset / pointStride
        };
    }

    function getLineInfo(p1, p2) {
        let dx = p2.x - p1.x;
        let dy = p2.y - p1.y;
        let distanceSq = dx * dx + dy * dy;
        if (distanceSq > maxDistanceSq || distanceSq === 0) {
            return null;
        }
        let distance = Math.sqrt(distanceSq);
        return {
            distance: distance,
            alpha: 1 - distance / maxDistance
        };
    }

    function appendLine(data, offset, p1, p2, distance, c1, c2, alpha, offsetX, offsetY) {
        let halfWidth = lineWidth / 2;
        let nx = (-(p2.y - p1.y) / distance) * halfWidth;
        let ny = ((p2.x - p1.x) / distance) * halfWidth;
        let p1x = p1.x + offsetX;
        let p1y = p1.y + offsetY;
        let p2x = p2.x + offsetX;
        let p2y = p2.y + offsetY;

        offset = appendLineVertex(data, offset, p1x - nx, p1y - ny, c1, alpha);
        offset = appendLineVertex(data, offset, p1x + nx, p1y + ny, c1, alpha);
        offset = appendLineVertex(data, offset, p2x - nx, p2y - ny, c2, alpha);
        offset = appendLineVertex(data, offset, p2x - nx, p2y - ny, c2, alpha);
        offset = appendLineVertex(data, offset, p1x + nx, p1y + ny, c1, alpha);
        offset = appendLineVertex(data, offset, p2x + nx, p2y + ny, c2, alpha);
        return offset;
    }

    function appendLineVertex(data, offset, x, y, rgb, alpha) {
        data[offset++] = x;
        data[offset++] = y;
        data[offset++] = rgb[0];
        data[offset++] = rgb[1];
        data[offset++] = rgb[2];
        data[offset++] = alpha;
        return offset;
    }

    function appendPoint(data, offset, point, offsetX, offsetY, rgb, alpha) {
        let drawRadius = point.r + 1.5;
        offset = appendPointVertex(data, offset, point, -drawRadius, -drawRadius, offsetX, offsetY, rgb, alpha);
        offset = appendPointVertex(data, offset, point, drawRadius, -drawRadius, offsetX, offsetY, rgb, alpha);
        offset = appendPointVertex(data, offset, point, -drawRadius, drawRadius, offsetX, offsetY, rgb, alpha);
        offset = appendPointVertex(data, offset, point, -drawRadius, drawRadius, offsetX, offsetY, rgb, alpha);
        offset = appendPointVertex(data, offset, point, drawRadius, -drawRadius, offsetX, offsetY, rgb, alpha);
        offset = appendPointVertex(data, offset, point, drawRadius, drawRadius, offsetX, offsetY, rgb, alpha);
        return offset;
    }

    function appendPointVertex(data, offset, point, localX, localY, offsetX, offsetY, rgb, alpha) {
        data[offset++] = point.x + offsetX + localX;
        data[offset++] = point.y + offsetY + localY;
        data[offset++] = localX;
        data[offset++] = localY;
        data[offset++] = point.r;
        data[offset++] = rgb[0];
        data[offset++] = rgb[1];
        data[offset++] = rgb[2];
        data[offset++] = alpha;
        return offset;
    }

    function drawLines(buffer, data, vertexCount, programInfo) {
        if (vertexCount <= 0) {
            return;
        }
        gl.useProgram(programInfo.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, vertexCount * lineStride), gl.STREAM_DRAW);
        gl.uniform2f(programInfo.uniforms.u_resolution, width, height);
        gl.enableVertexAttribArray(programInfo.attributes.a_position);
        gl.enableVertexAttribArray(programInfo.attributes.a_color);
        gl.vertexAttribPointer(programInfo.attributes.a_position, 2, gl.FLOAT, false, lineStride * 4, 0);
        gl.vertexAttribPointer(programInfo.attributes.a_color, 4, gl.FLOAT, false, lineStride * 4, 2 * 4);
        gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    }

    function drawPoints(buffer, data, vertexCount, programInfo) {
        if (vertexCount <= 0) {
            return;
        }
        gl.useProgram(programInfo.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, vertexCount * pointStride), gl.STREAM_DRAW);
        gl.uniform2f(programInfo.uniforms.u_resolution, width, height);
        gl.enableVertexAttribArray(programInfo.attributes.a_position);
        gl.enableVertexAttribArray(programInfo.attributes.a_local);
        gl.enableVertexAttribArray(programInfo.attributes.a_radius);
        gl.enableVertexAttribArray(programInfo.attributes.a_color);
        gl.vertexAttribPointer(programInfo.attributes.a_position, 2, gl.FLOAT, false, pointStride * 4, 0);
        gl.vertexAttribPointer(programInfo.attributes.a_local, 2, gl.FLOAT, false, pointStride * 4, 2 * 4);
        gl.vertexAttribPointer(programInfo.attributes.a_radius, 1, gl.FLOAT, false, pointStride * 4, 4 * 4);
        gl.vertexAttribPointer(programInfo.attributes.a_color, 4, gl.FLOAT, false, pointStride * 4, 5 * 4);
        gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    }

    function drawBlur(texture, directionX, directionY) {
        gl.useProgram(blurProgram.program);
        bindQuad(blurProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(blurProgram.uniforms.u_texture, 0);
        gl.uniform2f(blurProgram.uniforms.u_texelSize, 1 / canvas.width, 1 / canvas.height);
        gl.uniform2f(blurProgram.uniforms.u_direction, directionX, directionY);
        gl.uniform1f(blurProgram.uniforms.u_radius, shadowBlur * dpr);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function drawTexture(texture) {
        gl.useProgram(textureProgram.program);
        bindQuad(textureProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(textureProgram.uniforms.u_texture, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function bindQuad(programInfo) {
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.enableVertexAttribArray(programInfo.attributes.a_position);
        gl.enableVertexAttribArray(programInfo.attributes.a_texCoord);
        gl.vertexAttribPointer(programInfo.attributes.a_position, 2, gl.FLOAT, false, 4 * 4, 0);
        gl.vertexAttribPointer(programInfo.attributes.a_texCoord, 2, gl.FLOAT, false, 4 * 4, 2 * 4);
    }

    function updatePoints(hasMouse) {
        for (let i = 0; i < arr.length; i++) {
            let k = arr[i];
            if (hasMouse) {
                let dx = mouseX - k.x;
                let dy = mouseY - k.y;
                let mouseDistanceSq = dx * dx + dy * dy;
                if (mouseDistanceSq < maxCatchDistanceSq && mouseDistanceSq > maxCatchRSq) {
                    k.x += (dx / 600) * speed * 4;
                    k.y += (dy / 600) * speed * 4;
                }
            }

            let nextX = k.x + k.xsKew;
            let nextY = k.y + k.ysKew;
            if (nextX + k.r < width && nextX - k.r > 0) {
                k.x = nextX;
            } else {
                k.xsKew = -k.xsKew;
            }
            if (nextY + k.r < height && nextY - k.r > 0) {
                k.y = nextY;
            } else {
                k.ysKew = -k.ysKew;
            }
        }
    }

    function createPoint() {
        let r = ~~(minR + Math.random() * (maxR - minR));
        let pointColor = getRandomColor();
        return {
            x: ~~(Math.random() * (width - 3 * r)) + 3 * r,
            y: ~~(Math.random() * (height - 3 * r)) + 3 * r,
            xsKew: (Math.random() - 0.5) * speed, // x方向速度
            ysKew: (Math.random() - 0.5) * speed, // y方向速度
            r: r,
            color: pointColor,
            rgb: parseColor(pointColor)
        };
    }

    function setPointColor(point, pointColor) {
        point.color = pointColor;
        point.rgb = parseColor(pointColor);
    }

    function resizeCanvas() {
        dpr = window.devicePixelRatio || 1;
        width = background.clientWidth;
        height = background.clientHeight;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        canvas.width = Math.max(1, ~~(width * dpr));
        canvas.height = Math.max(1, ~~(height * dpr));
        gl.viewport(0, 0, canvas.width, canvas.height);
        canvasRect = canvas.getBoundingClientRect();
        shadowTarget = createRenderTarget(canvas.width, canvas.height);
        blurTarget = createRenderTarget(canvas.width, canvas.height);
    }

    function createRenderTarget(targetWidth, targetHeight) {
        let texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, targetWidth, targetHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        let framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        return {
            texture: texture,
            framebuffer: framebuffer,
            width: targetWidth,
            height: targetHeight
        };
    }

    function updateMousePosition(e) {
        mouseX = e.clientX - canvasRect.left;
        mouseY = e.clientY - canvasRect.top;
    }

    function getRandomColor() {
        return color[~~(Math.random() * color.length)];
    }

    function parseColor(value) {
        let cached = colorCache[value];
        if (cached) {
            return cached;
        }
        let colorValue = value.toLowerCase();
        if (colorValue.length === 4) {
            let expanded = '#';
            for (let i = 1; i < 4; i += 1) {
                expanded += colorValue.slice(i, i + 1).concat(colorValue.slice(i, i + 1));
            }
            colorValue = expanded;
        }

        cached = [
            parseInt(colorValue.slice(1, 3), 16) / 255,
            parseInt(colorValue.slice(3, 5), 16) / 255,
            parseInt(colorValue.slice(5, 7), 16) / 255
        ];
        colorCache[value] = cached;
        return cached;
    }

    function createProgram(gl, vertexSource, fragmentSource) {
        let vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
        let fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
        let program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            let info = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            throw new Error('WebGL program link failed: ' + info);
        }
        return {
            program: program,
            attributes: getAttributes(gl, program),
            uniforms: getUniforms(gl, program)
        };
    }

    function createShader(gl, type, source) {
        let shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            let info = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error('WebGL shader compile failed: ' + info);
        }
        return shader;
    }

    function getAttributes(gl, program) {
        let attributes = {};
        let count = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
        for (let i = 0; i < count; i++) {
            let info = gl.getActiveAttrib(program, i);
            attributes[info.name] = gl.getAttribLocation(program, info.name);
        }
        return attributes;
    }

    function getUniforms(gl, program) {
        let uniforms = {};
        let count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < count; i++) {
            let info = gl.getActiveUniform(program, i);
            uniforms[info.name] = gl.getUniformLocation(program, info.name);
        }
        return uniforms;
    }
})();
