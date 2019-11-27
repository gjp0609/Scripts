// ==UserScript==
// @name         * 搜狗/百度/谷歌翻译
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       OnySakura
// @include      *
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    if (window.top !== window.self) {
        // iframe直接返回
        return;
    }
    let showAfterDone = false; // 全部翻译完成后再展示
    let translateText = ''; // 选中的文本
    let requestTimeout = 1000; // 请求超时时间
    const sogouTranslator = {
        enabled: true,
        status: false,
        COLOR: '#fd6853',
        CODE: 'sogou',
        URL: 'https://fanyi.sogou.com/reventondc/api/sogouTranslate',
        PID: '-',
        KEY: '-',
        displayText() {
            return `
                        <div class="translateResult" style="margin: 3px">
                            <span style="color: ${sogouTranslator.COLOR}">${sogouTranslator.CODE}: </span>
                            <span>{{result${sogouTranslator.CODE}}}</span>
                        </div>
                    `;
        },
        initParam: function () {
            translateText = translateText.trim().replace(/\n/g, ',');
            let salt = getSalt();
            let src = sogouTranslator.PID + translateText + salt + sogouTranslator.KEY;
            let sign = MD5(src).toLowerCase();
            let encodedTranslateText = encodeURI(translateText);
            return "q=" + encodedTranslateText + "&pid=" + sogouTranslator.PID + "&to=zh-CHS&from=auto&salt=" + salt + "&sign=" + sign;
        },
        parseResult(json) {
            if (json.query) {
                return json.translation;
            } else {
                let parse = '';
                try {
                    parse = JSON.parse(json);
                } catch (e) {
                }
                if (parse.query) {
                    return parse.translation;
                } else {
                    return JSON.stringify(json);
                }
            }
        },
        translate() {
            GM_xmlhttpRequest({
                method: "POST",
                url: sogouTranslator.URL,
                data: sogouTranslator.initParam(),
                timeout: requestTimeout,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded;",
                    "Accept": "application/json"
                },
                onload: function (xhr) {
                    let d = strToJson(xhr.responseText);
                    let innerHTML = translateDiv.innerHTML;
                    if (xhr.readyState === 4 && xhr.status === 200) {
                        let result = sogouTranslator.parseResult(d);
                        innerHTML = innerHTML.replace('{{result' + sogouTranslator.CODE + '}}', result);
                    } else if (xhr.status !== 200) {
                        innerHTML = innerHTML.replace('{{result' + sogouTranslator.CODE + '}}', 'ERROR: ' + JSON.stringify(xhr));
                    }
                    translateDiv.innerHTML = innerHTML;
                    sogouTranslator.status = true;
                    showTranslateResult();
                }
            });
        }
    };
    const baiduTranslator = {
        enabled: true,
        status: false,
        COLOR: '#398bfb',
        CODE: 'baidu',
        URL: 'https://fanyi-api.baidu.com/api/trans/vip/translate',
        PID: '-',
        KEY: '-',
        displayText() {
            return `
                        <div class="translateResult" style="margin: 3px">
                            <span style="color: ${baiduTranslator.COLOR}">${baiduTranslator.CODE}: </span>
                            <span>{{result${baiduTranslator.CODE}}}</span>
                        </div>
                    `;
        },
        initParam: function () {
            translateText = translateText.trim().replace(/\n/g, ',');
            let salt = getSalt();
            let src = baiduTranslator.PID + translateText + salt + baiduTranslator.KEY;
            let sign = MD5(src).toLowerCase();
            let encodedTranslateText = encodeURI(translateText);
            return `q=${encodedTranslateText}&appid=${baiduTranslator.PID}&to=zh&from=auto&salt=${salt}&sign=${sign}`;
        },
        parseResult(json) {
            if (json.trans_result) {
                if (json.trans_result[0].dst) {
                    let dst = '' + json.trans_result[0].dst;
                    return decodeURI(dst);
                }
            } else {
                try {
                    let parse = JSON.parse(json);
                    if (parse.trans_result) {
                        if (parse.trans_result[0].dst) {
                            let dst = '' + parse.trans_result[0].dst;
                            return decodeURI(dst);
                        }
                    }
                } catch (e) {
                }
            }
            return JSON.stringify(json);
        },
        translate() {
            GM_xmlhttpRequest({
                method: "POST",
                url: baiduTranslator.URL,
                data: baiduTranslator.initParam(),
                timeout: requestTimeout,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded;",
                    "Accept": "application/json"
                },
                onload: function (xhr) {
                    let d = strToJson(xhr.responseText);
                    let innerHTML = translateDiv.innerHTML;
                    if (xhr.readyState === 4 && xhr.status === 200) {
                        let result = baiduTranslator.parseResult(d);
                        innerHTML = innerHTML.replace('{{result' + baiduTranslator.CODE + '}}', result);
                    } else if (xhr.status !== 200) {
                        innerHTML = innerHTML.replace('{{result' + baiduTranslator.CODE + '}}', 'ERROR: ' + JSON.stringify(xhr));
                    }
                    translateDiv.innerHTML = innerHTML;
                    baiduTranslator.status = true;
                    showTranslateResult();
                }
            });
        }
    };
    const caiyunTranslator = {
        enabled: true,
        status: false,
        COLOR: '#ddc35d',
        CODE: 'caiyun',
        URL: 'http://api.interpreter.caiyunai.com/v1/translator',
        TOKEN: '3975l6lr5pcbvidl6jl2', // 官方提供测试 token，不稳定
        displayText() {
            return `
                        <div class="translateResult" style="margin: 3px">
                            <span style="color: ${caiyunTranslator.COLOR}">${caiyunTranslator.CODE}: </span>
                            <span>{{result${caiyunTranslator.CODE}}}</span>
                        </div>
                    `;
        },
        initParam: function () {
            translateText = translateText.trim().replace(/\n/g, ',');
            return JSON.stringify({
                source: translateText,
                trans_type: 'auto2zh',
                request_id: getSalt(),
                detect: true,
            });
        },
        parseResult(json) {
            let result, confidence = '';
            if (json.target) {
                result = json.target;
                confidence = json.confidence;
            } else {
                let parse = {};
                try {
                    parse = JSON.parse(json);
                } catch (e) {
                }
                if (parse.target) {
                    result = parse.target;
                    confidence = parse.confidence;
                } else {
                    result = JSON.stringify(json);
                }
            }
            return `<abbr title="${confidence}">${result}</abbr>`;
        },
        translate() {
            GM_xmlhttpRequest({
                method: "POST",
                url: caiyunTranslator.URL,
                data: caiyunTranslator.initParam(),
                timeout: requestTimeout,
                headers: {
                    "Content-Type": "application/json",
                    "x-authorization": 'token ' + caiyunTranslator.TOKEN
                },
                onload: function (xhr) {
                    let d = strToJson(xhr.responseText);
                    let innerHTML = translateDiv.innerHTML;
                    if (xhr.readyState === 4 && xhr.status === 200) {
                        let result = caiyunTranslator.parseResult(d);
                        innerHTML = innerHTML.replace('{{result' + caiyunTranslator.CODE + '}}', result);
                    } else if (xhr.status !== 200) {
                        innerHTML = innerHTML.replace('{{result' + caiyunTranslator.CODE + '}}', 'ERROR: ' + JSON.stringify(xhr));
                    }
                    translateDiv.innerHTML = innerHTML;
                    caiyunTranslator.status = true;
                    showTranslateResult();
                }
            });
        }
    };
    const googleTranslator = {
        enabled: true,
        status: false,
        COLOR: '#1fa463',
        CODE: 'google',
        URL: 'https://translate.google.cn/translate_a/single?client=gtx&dt=t&dt=bd&dj=1&source=input&hl=zh-CN&sl=auto&tl=zh-CN&',
        displayText() {
            return `
                        <div class="translateResult" style="margin: 3px">
                            <span style="color: ${googleTranslator.COLOR}">${googleTranslator.CODE}: </span>
                            <span>{{result${googleTranslator.CODE}}}</span>
                        </div>
                    `;
        },
        initParam: function () {
            translateText = translateText.trim().replace(/\n/g, ',');
            let encodedTranslateText = encodeURI(translateText);
            return "q=" + encodedTranslateText;
        },
        parseResult(json) {
            let result = '';
            if (json) {
                if (!json.sentences) {
                    json = JSON.parse(json);
                }
                for (let item of json.sentences) {
                    result += item.trans;
                }
                if (json.dict) {
                    for (let item of json.dict) {
                        let terms = '';
                        for (let term of item.entry) {
                            terms += `
                                <span class="term">${term.word}
                                    <span class="tooltiptext">score: ${term.score}<br/>reverse: ${term.reverse_translation}</span>
                                </span>&nbsp;
                            `;
                        }
                        result += `
                            <div class="google_dict">
                                <span class="base_form">${item.base_form}</span>
                                    <span class="pos pos_${item.pos_enum}">: ${item.pos}</span>
                                    <span class="terms">${terms}
                                </span>
                            </div>
                        `;
                    }
                }
            }
            return result;
        },
        translate() {
            GM_xmlhttpRequest({
                method: "POST",
                url: googleTranslator.URL,
                data: googleTranslator.initParam(),
                timeout: requestTimeout,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded;",
                    "Accept": "application/json"
                },
                onload: function (xhr) {
                    let d = strToJson(xhr.responseText);
                    let innerHTML = translateDiv.innerHTML;
                    if (xhr.readyState === 4 && xhr.status === 200) {
                        let result = googleTranslator.parseResult(d);
                        innerHTML = innerHTML.replace('{{result' + googleTranslator.CODE + '}}', result);
                    } else if (xhr.status !== 200) {
                        innerHTML = innerHTML.replace('{{result' + googleTranslator.CODE + '}}', 'ERROR: ' + JSON.stringify(xhr));
                    }
                    translateDiv.innerHTML = innerHTML;
                    googleTranslator.status = true;
                    showTranslateResult();
                }
            });
        }
    };
    let transList = [sogouTranslator, baiduTranslator, caiyunTranslator, googleTranslator];
    // 选择文本后展示的图标
    let showIcon = document.createElement("div");
    showIcon.id = "OnySakuraTranslateShowIcon";
    showIcon.innerHTML = "译";
    showIcon.style.display = 'none';
    document.body.appendChild(showIcon);
    // 翻译框
    let translateDiv = document.createElement("div");
    translateDiv.id = "OnySakuraTranslateDiv";
    document.body.appendChild(translateDiv);

    function selectText() {
        if (document.selection) {//For ie
            return document.selection.createRange().text;
        } else {
            return window.getSelection().toString();
        }
    }

    document.onmouseup = function (ev) {
        ev = ev || window.event;
        let left = ev.clientX, top = ev.clientY;
        setTimeout(function () {
            translateText = selectText();
            if (translateText.length > 0) {
                setTimeout(function () {
                    showIcon.style.display = 'block';
                    showIcon.style.left = left + 'px';
                    showIcon.style.top = top + 'px';
                }, 100);
            }
        }, 200);
    };

    function strToJson(str) {
        try {
            return (new Function("return " + str))();
        } catch (e) {
        }
        return str;
    }

    function showTranslateResult() {
        if (showAfterDone) {
            let allFinish = true;
            for (let item of transList) {
                allFinish = allFinish && item.status;
            }
            if (allFinish) {
                translateDiv.style.display = "block";
                for (let item of transList) {
                    item.status = false;
                }
            }
        } else {
            translateDiv.style.display = "block";
        }
    }

    showIcon.onclick = function (ev) {
        ev = ev || window.event;
        let left = ev.clientX, top = ev.clientY;
        let height = document.body.clientHeight, width = document.body.clientWidth;
        translateDiv.style.display = "block";
        if (left > parseInt(width) / 2) {
            // 右
            translateDiv.style.right = width - left + 'px';
            translateDiv.style.left = '';
        } else {
            // 左
            translateDiv.style.left = left + 'px';
            translateDiv.style.right = '';
        }
        if (top > parseInt(height) / 2) {
            // 下
            translateDiv.style.bottom = height - top + 'px';
            translateDiv.style.top = '';
        } else {
            // 上
            translateDiv.style.top = top + 'px';
            translateDiv.style.bottom = '';
        }
        let translateSource = `
                <div style="margin: 3px">
                    <span style="color: blueviolet">src: </span>
                    <span>${translateText}</span>
                </div>
            `;
        translateDiv.innerHTML += translateSource;
        let translateResult = '';
        for (let item of transList) {
            if (item.enabled) {
                translateResult += item.displayText();
            }
        }
        translateDiv.innerHTML = translateSource + translateResult;
        for (let item of transList) {
            if (item.enabled) {
                item.translate();
            }
        }
    };

    showIcon.onmouseup = function (ev) {
        ev = ev || window.event;
        ev.cancelBubble = true;
    };

    // 点击页面隐藏弹出框
    document.onclick = function (ev) {
        showIcon.style.display = 'none';
        translateDiv.style.display = 'none';
    };

    // 阻止事件冒泡，防止点击翻译框后隐藏
    translateDiv.onclick = function (ev) {
        event.stopPropagation();
    };

    // 获取随机数字字符串
    function getSalt() {
        let salt = "";
        for (let i = 0; i < 5; i++) salt += parseInt(Math.random() * 8);
        return salt;
    }

    // 样式
    let style = `
            #OnySakuraTranslateShowIcon {
                background-color: white;
                border: #fd6848 solid 2px;
                border-radius: 200px;
                color: #fd6848;
                box-sizing: border-box;
                width: 30px;
                height: 30px;
                text-align: center;
                line-height: 26px;
                cursor: pointer;
                position: fixed;
                z-index: 30000;
            }

            #OnySakuraTranslateShowIcon:hover {
                background-color: #fd6848;
                color: white;
                animation-duration: 1s;
            }

            #OnySakuraTranslateShowIcon:active {
                border-color: white;
            }

            #OnySakuraTranslateDiv {
                display: none;
                background-color: #FFFAF6;
                border: #fd6848 solid 2px;
                border-radius: 10px;
                padding: 5px;
                margin:auto;
                position: fixed;
                z-index: 100000001;
            }
            
            #OnySakuraTranslateDiv .translateResult {
                border-top: #ffc1c1 solid 1px;
            }
            .google_dict {
                margin-left: 20px;
                margin-top: 10px;
            }

            .google_dict .base_form {
                font-size: 20px !important;
                font-family: "Sarasa Term SC", mononoki, monospace;
            }

            .google_dict .term {
                position: relative;
                display: inline-block;
                border-bottom: 1px dotted black;
            }

            .google_dict .term .tooltiptext {
                visibility: hidden;
                background-color: #fdc;
                color: #555;
                text-align: left;
                padding: 5px;
                border-radius: 5px;
                position: absolute;
                z-index: 1;
                white-space: pre;
                top: 200%;
                left: 0%;

            }

            .google_dict .term:hover .tooltiptext {
                visibility: visible;
            }

            /*.google_dict .term .tooltiptext::after {
                content: " ";
                position: absolute;
                bottom: 100%;

                left: 50%;
                margin-left: -5px;
                border-width: 5px;
                border-style: solid;
                border-color: transparent transparent #fdc transparent;
            }
            */
            .google_dict .pos {
                font-size: 10px;
                font-style: italic;
            }

            .google_dict .pos_1 {
                color: #369;
            }

            .google_dict .pos_2 {
                color: #396;
            }

            .google_dict .pos_3 {
                color: #639;
            }

            .google_dict .pos_4 {
                color: #693;
            }

            .google_dict .pos_5 {
                color: #936;
            }

            .google_dict .pos_6 {
                color: #963;
            }
        `;
    GM_addStyle(style);

    /**
     * @return {string}
     */
    function MD5(string) {

        /**
         * @return {number}
         */
        function RotateLeft(lValue, iShiftBits) {
            return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
        }

        /**
         * @return {number}
         */
        function AddUnsigned(lX, lY) {
            let lX4, lY4, lX8, lY8, lResult;
            lX8 = (lX & 0x80000000);
            lY8 = (lY & 0x80000000);
            lX4 = (lX & 0x40000000);
            lY4 = (lY & 0x40000000);
            lResult = (lX & 0x3FFFFFFF) + (lY & 0x3FFFFFFF);
            if (lX4 & lY4) {
                return (lResult ^ 0x80000000 ^ lX8 ^ lY8);
            }
            if (lX4 | lY4) {
                if (lResult & 0x40000000) {
                    return (lResult ^ 0xC0000000 ^ lX8 ^ lY8);
                } else {
                    return (lResult ^ 0x40000000 ^ lX8 ^ lY8);
                }
            } else {
                return (lResult ^ lX8 ^ lY8);
            }
        }

        /**
         * @return {number}
         */
        function F(x, y, z) {
            return (x & y) | ((~x) & z);
        }

        /**
         * @return {number}
         */
        function G(x, y, z) {
            return (x & z) | (y & (~z));
        }

        /**
         * @return {number}
         */
        function H(x, y, z) {
            return (x ^ y ^ z);
        }

        /**
         * @return {number}
         */
        function I(x, y, z) {
            return (y ^ (x | (~z)));
        }

        /**
         * @return {number}
         */
        function FF(a, b, c, d, y, s, ac) {
            a = AddUnsigned(a, AddUnsigned(AddUnsigned(F(b, c, d), y), ac));
            return AddUnsigned(RotateLeft(a, s), b);
        }

        /**
         * @return {number}
         */
        function GG(a, b, c, d, y, s, ac) {
            a = AddUnsigned(a, AddUnsigned(AddUnsigned(G(b, c, d), y), ac));
            return AddUnsigned(RotateLeft(a, s), b);
        }

        /**
         * @return {number}
         */
        function HH(a, b, c, d, y, s, ac) {
            a = AddUnsigned(a, AddUnsigned(AddUnsigned(H(b, c, d), y), ac));
            return AddUnsigned(RotateLeft(a, s), b);
        }

        /**
         * @return {number}
         */
        function II(a, b, c, d, y, s, ac) {
            a = AddUnsigned(a, AddUnsigned(AddUnsigned(I(b, c, d), y), ac));
            return AddUnsigned(RotateLeft(a, s), b);
        }

        function ConvertToWordArray(string) {
            let lWordCount;
            let lMessageLength = string.length;
            let lNumberOfWords_temp1 = lMessageLength + 8;
            let lNumberOfWords_temp2 = (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64;
            let lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16;
            let lWordArray = Array(lNumberOfWords - 1);
            let lBytePosition = 0;
            let lByteCount = 0;
            while (lByteCount < lMessageLength) {
                lWordCount = (lByteCount - (lByteCount % 4)) / 4;
                lBytePosition = (lByteCount % 4) * 8;

                lWordArray[lWordCount] = (lWordArray[lWordCount] | ((string + '').charCodeAt(lByteCount) << lBytePosition));
                lByteCount++;
            }
            lWordCount = (lByteCount - (lByteCount % 4)) / 4;
            lBytePosition = (lByteCount % 4) * 8;
            lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
            lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
            lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
            return lWordArray;
        }

        /**
         * @return {string}
         */
        function WordToHex(lValue) {
            let WordToHexValue = "", WordToHexValue_temp = "", lByte, lCount;
            for (lCount = 0; lCount <= 3; lCount++) {
                lByte = (lValue >>> (lCount * 8)) & 255;
                WordToHexValue_temp = "0" + lByte.toString(16);
                WordToHexValue = WordToHexValue + WordToHexValue_temp.substr(WordToHexValue_temp.length - 2, 2);
            }
            return WordToHexValue;
        }

        /**
         * @return {string}
         */
        function Utf8Encode(string) {
            string = string.replace(/\r\n/g, "\n");
            let utfText = "";
            for (let n = 0; n < string.length; n++) {
                c = string.charCodeAt(n);
                if (c < 128) {
                    utfText += String.fromCharCode(c);
                } else if ((c > 127) && (c < 2048)) {
                    utfText += String.fromCharCode((c >> 6) | 192);
                    utfText += String.fromCharCode((c & 63) | 128);
                } else {
                    utfText += String.fromCharCode((c >> 12) | 224);
                    utfText += String.fromCharCode(((c >> 6) & 63) | 128);
                    utfText += String.fromCharCode((c & 63) | 128);
                }
            }
            return utfText;
        }

        let y;
        let k, AA, BB, CC, DD, a, b, c, d;
        let S11 = 7, S12 = 12, S13 = 17, S14 = 22;
        let S21 = 5, S22 = 9, S23 = 14, S24 = 20;
        let S31 = 4, S32 = 11, S33 = 16, S34 = 23;
        let S41 = 6, S42 = 10, S43 = 15, S44 = 21;

        string = Utf8Encode(string);

        y = ConvertToWordArray(string);

        a = 0x67452301;
        b = 0xEFCDAB89;
        c = 0x98BADCFE;
        d = 0x10325476;

        for (k = 0; k < y.length; k += 16) {
            AA = a;
            BB = b;
            CC = c;
            DD = d;
            a = FF(a, b, c, d, y[k], S11, 0xD76AA478);
            d = FF(d, a, b, c, y[k + 1], S12, 0xE8C7B756);
            c = FF(c, d, a, b, y[k + 2], S13, 0x242070DB);
            b = FF(b, c, d, a, y[k + 3], S14, 0xC1BDCEEE);
            a = FF(a, b, c, d, y[k + 4], S11, 0xF57C0FAF);
            d = FF(d, a, b, c, y[k + 5], S12, 0x4787C62A);
            c = FF(c, d, a, b, y[k + 6], S13, 0xA8304613);
            b = FF(b, c, d, a, y[k + 7], S14, 0xFD469501);
            a = FF(a, b, c, d, y[k + 8], S11, 0x698098D8);
            d = FF(d, a, b, c, y[k + 9], S12, 0x8B44F7AF);
            c = FF(c, d, a, b, y[k + 10], S13, 0xFFFF5BB1);
            b = FF(b, c, d, a, y[k + 11], S14, 0x895CD7BE);
            a = FF(a, b, c, d, y[k + 12], S11, 0x6B901122);
            d = FF(d, a, b, c, y[k + 13], S12, 0xFD987193);
            c = FF(c, d, a, b, y[k + 14], S13, 0xA679438E);
            b = FF(b, c, d, a, y[k + 15], S14, 0x49B40821);
            a = GG(a, b, c, d, y[k + 1], S21, 0xF61E2562);
            d = GG(d, a, b, c, y[k + 6], S22, 0xC040B340);
            c = GG(c, d, a, b, y[k + 11], S23, 0x265E5A51);
            b = GG(b, c, d, a, y[k], S24, 0xE9B6C7AA);
            a = GG(a, b, c, d, y[k + 5], S21, 0xD62F105D);
            d = GG(d, a, b, c, y[k + 10], S22, 0x2441453);
            c = GG(c, d, a, b, y[k + 15], S23, 0xD8A1E681);
            b = GG(b, c, d, a, y[k + 4], S24, 0xE7D3FBC8);
            a = GG(a, b, c, d, y[k + 9], S21, 0x21E1CDE6);
            d = GG(d, a, b, c, y[k + 14], S22, 0xC33707D6);
            c = GG(c, d, a, b, y[k + 3], S23, 0xF4D50D87);
            b = GG(b, c, d, a, y[k + 8], S24, 0x455A14ED);
            a = GG(a, b, c, d, y[k + 13], S21, 0xA9E3E905);
            d = GG(d, a, b, c, y[k + 2], S22, 0xFCEFA3F8);
            c = GG(c, d, a, b, y[k + 7], S23, 0x676F02D9);
            b = GG(b, c, d, a, y[k + 12], S24, 0x8D2A4C8A);
            a = HH(a, b, c, d, y[k + 5], S31, 0xFFFA3942);
            d = HH(d, a, b, c, y[k + 8], S32, 0x8771F681);
            c = HH(c, d, a, b, y[k + 11], S33, 0x6D9D6122);
            b = HH(b, c, d, a, y[k + 14], S34, 0xFDE5380C);
            a = HH(a, b, c, d, y[k + 1], S31, 0xA4BEEA44);
            d = HH(d, a, b, c, y[k + 4], S32, 0x4BDECFA9);
            c = HH(c, d, a, b, y[k + 7], S33, 0xF6BB4B60);
            b = HH(b, c, d, a, y[k + 10], S34, 0xBEBFBC70);
            a = HH(a, b, c, d, y[k + 13], S31, 0x289B7EC6);
            d = HH(d, a, b, c, y[k], S32, 0xEAA127FA);
            c = HH(c, d, a, b, y[k + 3], S33, 0xD4EF3085);
            b = HH(b, c, d, a, y[k + 6], S34, 0x4881D05);
            a = HH(a, b, c, d, y[k + 9], S31, 0xD9D4D039);
            d = HH(d, a, b, c, y[k + 12], S32, 0xE6DB99E5);
            c = HH(c, d, a, b, y[k + 15], S33, 0x1FA27CF8);
            b = HH(b, c, d, a, y[k + 2], S34, 0xC4AC5665);
            a = II(a, b, c, d, y[k], S41, 0xF4292244);
            d = II(d, a, b, c, y[k + 7], S42, 0x432AFF97);
            c = II(c, d, a, b, y[k + 14], S43, 0xAB9423A7);
            b = II(b, c, d, a, y[k + 5], S44, 0xFC93A039);
            a = II(a, b, c, d, y[k + 12], S41, 0x655B59C3);
            d = II(d, a, b, c, y[k + 3], S42, 0x8F0CCC92);
            c = II(c, d, a, b, y[k + 10], S43, 0xFFEFF47D);
            b = II(b, c, d, a, y[k + 1], S44, 0x85845DD1);
            a = II(a, b, c, d, y[k + 8], S41, 0x6FA87E4F);
            d = II(d, a, b, c, y[k + 15], S42, 0xFE2CE6E0);
            c = II(c, d, a, b, y[k + 6], S43, 0xA3014314);
            b = II(b, c, d, a, y[k + 13], S44, 0x4E0811A1);
            a = II(a, b, c, d, y[k + 4], S41, 0xF7537E82);
            d = II(d, a, b, c, y[k + 11], S42, 0xBD3AF235);
            c = II(c, d, a, b, y[k + 2], S43, 0x2AD7D2BB);
            b = II(b, c, d, a, y[k + 9], S44, 0xEB86D391);
            a = AddUnsigned(a, AA);
            b = AddUnsigned(b, BB);
            c = AddUnsigned(c, CC);
            d = AddUnsigned(d, DD);
        }
        let temp = WordToHex(a) + WordToHex(b) + WordToHex(c) + WordToHex(d);
        return temp.toUpperCase();
    }
})();
