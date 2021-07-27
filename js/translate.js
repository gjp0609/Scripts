// ==UserScript==
// @name         * 多源翻译
// @namespace    https://github.com/gjp0609/Scripts/
// @version      0.2
// @description  搜狗/百度/彩云/谷歌/必应翻译
// @author       OnySakura
// @require      https://cdn.staticfile.org/jquery/3.6.0/jquery.min.js
// @require      https://cdn.staticfile.org/crypto-js/3.1.2/rollups/hmac-sha256.js
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
    let requestTimeout = 2000; // 请求超时时间

    const sogouTranslator = {
        enabled: false,
        status: false,
        COLOR: '#fd6853',
        CODE: '搜狗',
        URL: 'https://fanyi.sogou.com/reventondc/api/sogouTranslate',
        PID: '-',
        KEY: '-',
        initParam: function () {
            let salt = getSalt();
            let src = this.PID + translateText + salt + this.KEY;
            let sign = MD5(src).toLowerCase();
            let encodedTranslateText = encodeURI(translateText);
            return "q=" + encodedTranslateText + "&pid=" + this.PID + "&to=zh-CHS&from=auto&salt=" + salt + "&sign=" + sign;
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
        startTranslate() {
            let that = this;
            GM_xmlhttpRequest({
                method: "POST",
                url: this.URL,
                data: this.initParam(),
                timeout: requestTimeout,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded;",
                    "Accept": "application/json"
                },
                onload: function (xhr) {
                    let d = strToJson(xhr.responseText);
                    showResult(that, xhr, d);
                }
            });
        }
    };
    const baiduTranslator = {
        enabled: false,
        status: false,
        COLOR: '#398bfb',
        CODE: '百度',
        URL: 'https://fanyi-api.baidu.com/api/trans/vip/translate',
        PID: '-',
        KEY: '-',
        initParam: function () {
            let salt = getSalt();
            let src = this.PID + translateText + salt + this.KEY;
            let sign = MD5(src).toLowerCase();
            let encodedTranslateText = encodeURI(translateText);
            return `q=${encodedTranslateText}&appid=${this.PID}&to=zh&from=auto&salt=${salt}&sign=${sign}`;
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
        startTranslate() {
            let that = this;
            GM_xmlhttpRequest({
                method: "POST",
                url: this.URL,
                data: this.initParam(),
                timeout: requestTimeout,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded;",
                    "Accept": "application/json"
                },
                onload: function (xhr) {
                    let d = strToJson(xhr.responseText);
                    showResult(that, xhr, d);
                }
            });
        }
    };
    const tencentTranslator = {
        enabled: false,
        status: false,
        COLOR: '#00a4ff',
        CODE: '腾讯',
        URL: 'https://tmt.tencentcloudapi.com',
        PID: '-',
        KEY: '-',
        initParam: function () {
            const endpoint = "tmt.tencentcloudapi.com";
            const service = "tmt";
            const region = "ap-beijing";
            const action = "TextTranslate";
            const version = "2018-03-21";
            const timestamp = parseInt(new Date().getTime() / 1000);
            // const timestamp = 1551113065
            //时间处理, 获取世界时间日期
            const date = getDate(timestamp);

            // ************* 步骤 1：拼接规范请求串 *************
            const signedHeaders = "content-type;host";

            const payload = JSON.stringify({
                SourceText: translateText,
                Source: 'auto',
                Target: 'zh',
                ProjectId: 0
            });

            const hashedRequestPayload = getHash(payload);
            const httpRequestMethod = "POST";
            const canonicalUri = "/";
            const canonicalQueryString = "";
            const canonicalHeaders = "content-type:application/json; charset=utf-8\n" + "host:" + endpoint + "\n";

            const canonicalRequest = httpRequestMethod + "\n"
                + canonicalUri + "\n"
                + canonicalQueryString + "\n"
                + canonicalHeaders + "\n"
                + signedHeaders + "\n"
                + hashedRequestPayload;

            // ************* 步骤 2：拼接待签名字符串 *************
            const algorithm = "TC3-HMAC-SHA256";
            const hashedCanonicalRequest = getHash(canonicalRequest);
            const credentialScope = date + "/" + service + "/" + "tc3_request";
            const stringToSign = algorithm + "\n" +
                timestamp + "\n" +
                credentialScope + "\n" +
                hashedCanonicalRequest;

            // ************* 步骤 3：计算签名 *************
            const kDate = sha256(date, 'TC3' + this.KEY);
            const kService = sha256(service, kDate);
            const kSigning = sha256('tc3_request', kService);
            const signature = sha256(stringToSign, kSigning, 'hex');

            // ************* 步骤 4：拼接 Authorization *************
            const authorization = algorithm + " " +
                "Credential=" + this.PID + "/" + credentialScope + ", " +
                "SignedHeaders=" + signedHeaders + ", " +
                "Signature=" + signature;

            return {
                authorization: authorization,
                contentType: 'application/json; charset=utf-8',
                host: endpoint,
                tcAction: action,
                tcTimestamp: timestamp.toString(),
                tcVersion: version,
                tcRegion: region,
                data: payload
            };
        },
        parseResult(json) {
            if (json.Response) {
                if (json.Response.TargetText) {
                    return decodeURIComponent(json.Response.TargetText);
                }
            }
            return JSON.stringify(json);
        },
        startTranslate() {
            let that = this;
            let params = this.initParam();
            GM_xmlhttpRequest({
                method: "POST",
                url: this.URL,
                data: params.data,
                timeout: requestTimeout,
                headers: {
                    "Content-Type": params.contentType,
                    "Host": params.host,
                    "X-TC-Action": params.tcAction,
                    "X-TC-Region": params.tcRegion,
                    "X-TC-Timestamp": params.tcTimestamp,
                    "X-TC-Version": params.tcVersion,
                    "Authorization": params.authorization,
                    "Accept": "application/json"
                },
                onload: function (xhr) {
                    let d = strToJson(xhr.responseText);
                    showResult(that, xhr, d);
                }
            });
        }
    };
    const caiyunTranslator = {
        enabled: true,
        status: false,
        COLOR: '#ddc35d',
        CODE: '彩云',
        URL: 'http://api.interpreter.caiyunai.com/v1/translator',
        TOKEN: '3975l6lr5pcbvidl6jl2', // 官方提供测试 token，不稳定
        initParam: function () {
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
        startTranslate() {
            let that = this;
            GM_xmlhttpRequest({
                method: "POST",
                url: this.URL,
                data: this.initParam(),
                timeout: requestTimeout,
                headers: {
                    "Content-Type": "application/json",
                    "x-authorization": 'token ' + this.TOKEN
                },
                onload: function (xhr) {
                    let d = strToJson(xhr.responseText);
                    showResult(that, xhr, d);
                }
            });
        }
    };
    const googleTranslator = {
        enabled: true,
        status: false,
        COLOR: '#1fa463',
        CODE: '谷歌',
        URL: 'https://translate.google.cn/translate_a/single?client=gtx&dt=t&dt=bd&dj=1&source=input&hl=zh-CN&sl=auto&tl=zh-CN&',
        initParam: function () {
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
                            <div class="OnySakuraTranslate_dict">
                                <span class="pos pos_${item.pos_enum}">${item.pos}</span>
                                <span class="base_form">${translateText === item.base_form ? '' : (' [' + item.base_form + '] ')}</span>
                                <span class="terms">${terms}</span>
                            </div>
                        `;
                    }
                }
            }
            return result;
        },
        startTranslate() {
            let that = this;
            GM_xmlhttpRequest({
                method: "POST",
                url: this.URL,
                data: this.initParam(),
                timeout: requestTimeout,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded;",
                    "Accept": "application/json"
                },
                onload: function (xhr) {
                    let d = strToJson(xhr.responseText);
                    showResult(that, xhr, d);
                }
            });
        }
    };
    const bingTranslator = {
        enabled: true,
        status: false,
        COLOR: '#008474',
        CODE: '必应',
        URL: 'https://cn.bing.com/dict/search',
        initParam: function () {
            let encodedTranslateText = encodeURI(translateText);
            return "?q=" + encodedTranslateText;
        },
        parseResult(html) {
            let result = '';
            let dom = $.parseHTML(html);
            let lis = $(dom).find('.lf_area>div>ul>li');
            if (lis.length > 0) {
                for (const li of lis) {
                    let pos = $(li).find('.pos').text();
                    let index = this.getPosIndex(pos);
                    let def = $(li).find('.def>span').text();
                    result += `
                        <div class="OnySakuraTranslate_dict">
                            <span class="pos pos_${index}">${pos}</span>
                            <span class="terms">${def}</span>
                        </div>
                        `;
                }
            } else {
                let div = $(dom).find('.lf_area>div');
                if (div.length > 0) {
                    result += div.children().eq(2).text();
                }
            }
            return result;
        },
        getPosIndex(pos) {
            switch (pos) {
                case "n.":
                    return 1;
                case "v.":
                    return 2;
                case "pron.":
                    return 3;
                case "adj.":
                    return 4;
                case "adv.":
                    return 5;
                default:
                    return 6;
            }
        },
        startTranslate() {
            let that = this;
            GM_xmlhttpRequest({
                method: "GET",
                url: this.URL + this.initParam(),
                timeout: requestTimeout,
                headers: {
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9"
                },
                onload: function (xhr) {
                    let d = xhr.responseText;
                    showResult(that, xhr, d);
                }
            });
        }
    };

    let transList = [sogouTranslator, baiduTranslator, tencentTranslator, caiyunTranslator, googleTranslator, bingTranslator];
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

    document.onmouseup = function (ev) {
        ev = ev || window.event;
        let left = ev.clientX, top = ev.clientY;
        setTimeout(function () {
            translateText = selectText();
            translateText = translateText ? translateText.trim() : '';
            translateText = translateText.replace(/\n/g, ',');
            if (translateText.length > 0) {
                setTimeout(function () {
                    showIcon.style.display = 'block';
                    showIcon.style.left = left + 'px';
                    showIcon.style.top = top + 'px';
                }, 100);
            }
        }, 200);
    };

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
                    <span style="color: blueviolet">原句：</span>
                    <span>${translateText}</span>
                </div>
            `;
        translateDiv.innerHTML += translateSource;
        let translateResult = '';
        for (let item of transList) {
            if (item.enabled) {
                translateResult += displayText(item);
            }
        }
        translateDiv.innerHTML = translateSource + translateResult;
        for (let item of transList) {
            if (item.enabled) {
                item.startTranslate();
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

    // 样式
    let style = '#OnySakuraTranslateShowIcon{background-color:white;border:#fd6848 solid 2px;border-radius:200px;color:#fd6848;box-sizing:border-box;width:30px;height:30px;text-align:center;line-height:26px;cursor:pointer;position:fixed;z-index:30000}#OnySakuraTranslateShowIcon:hover{background-color:#fd6848;color:white;animation-duration:1s}#OnySakuraTranslateShowIcon:active{border-color:white}#OnySakuraTranslateDiv{display:none;background-color:#fffaf6;border:#fd6848 solid 2px;border-radius:10px;padding:5px;margin:auto;position:fixed;z-index:100000001}#OnySakuraTranslateDiv .translateResult{border-top:#ffc1c1 solid 1px}.OnySakuraTranslate_dict{margin-top:10px}.OnySakuraTranslate_dict .base_form{font-size:14px!important;font-family:"Sarasa Term SC",mononoki,monospace}.OnySakuraTranslate_dict .terms{margin-left:10px}.OnySakuraTranslate_dict .term{position:relative;display:inline-block;border-bottom:1px dotted black}.OnySakuraTranslate_dict .term{position:relative;display:inline-block;border-bottom:1px dotted black}.OnySakuraTranslate_dict .term .tooltiptext{visibility:hidden;background-color:#fdc;color:#555;text-align:left;padding:5px;border-radius:5px;position:absolute;z-index:1;white-space:pre;top:200%;left:0}.OnySakuraTranslate_dict .term:hover .tooltiptext{visibility:visible}.OnySakuraTranslate_dict .pos{width:50px;font-size:10px;font-style:italic;display:inline-block;text-align:right}.OnySakuraTranslate_dict .pos_1{color:#369}.OnySakuraTranslate_dict .pos_2{color:#396}.OnySakuraTranslate_dict .pos_3{color:#639}.OnySakuraTranslate_dict .pos_4{color:#693}.OnySakuraTranslate_dict .pos_5{color:#936}.OnySakuraTranslate_dict .pos_6{color:#963}';
    GM_addStyle(style);

    function selectText() {
        if (document.selection) {//For ie
            return document.selection.createRange().text;
        } else {
            return window.getSelection().toString();
        }
    }

    function strToJson(str) {
        try {
            return (new Function("return " + str))();
        } catch (e) {
        }
        return str;
    }

    function showResult(translator, xhr, d) {
        let innerHTML = translateDiv.innerHTML;
        if (xhr.readyState === 4 && xhr.status === 200) {
            let result = translator.parseResult(d);
            innerHTML = innerHTML.replace('{{result' + translator.CODE + '}}', result);
        } else if (xhr.status !== 200) {
            innerHTML = innerHTML.replace('{{result' + translator.CODE + '}}', 'ERROR!');
            console.log(JSON.stringify(xhr));
        }
        translateDiv.innerHTML = innerHTML;
        translator.status = true;
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

    function displayText(translator) {
        return `
            <div class="translateResult" style="margin: 3px">
                <span style="color: ${translator.COLOR}">${translator.CODE}：</span>
                <span>{{result${translator.CODE}}}</span>
            </div>
        `;
    }

    // 获取随机数字字符串
    function getSalt() {
        let salt = "";
        for (let i = 0; i < 5; i++) salt += parseInt(Math.random() * 8);
        return salt;
    }

    function sha256(message, secret = '', encoding) {
        return CryptoJS.HmacSHA256(message, secret);
    }

    function getHash(message, encoding = 'hex') {
        return CryptoJS.SHA256(message);
    }

    function getDate(timestamp) {
        const date = new Date(timestamp * 1000)
        const year = date.getUTCFullYear()
        const month = ('0' + (date.getUTCMonth() + 1)).slice(-2)
        const day = ('0' + date.getUTCDate()).slice(-2)
        return `${year}-${month}-${day}`
    }

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
