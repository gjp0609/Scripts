// ==UserScript==
// @name         * 多源翻译
// @namespace    https://github.com/gjp0609/Scripts/
// @version      1.0
// @description  搜狗/百度/腾讯/彩云/谷歌/必应翻译
// @author       OnySakura
// @require      https://cdn.staticfile.org/jquery/3.6.0/jquery.min.js
// @require      https://cdn.staticfile.org/crypto-js/3.1.2/rollups/hmac-sha256.js
// @require      https://cdn.staticfile.org/vue/2.6.9/vue.min.js
// @include      *
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
    if (isIframe()) {
        // iframe直接返回
        return;
    }

    const REQUEST_TIMEOUT = 2000; // 请求超时时间

    let resultDiv = document.createElement('div');
    resultDiv.innerHTML = `
        <div id="OnySakuraTranslatorParent">
            <transition name="icon">
                <div id="OnySakuraTranslatorShowIcon" v-if="showIcon" :style="'top: ' + mouseY + 'px; left: ' + (mouseX + 10) + 'px;'"
                     @mousedown="stopPropagation" @mouseup="stopPropagation" @click="showResultModal">译
                </div>
            </transition>
            <transition name="result">
                <div id="OnySakuraTranslatorResult"
                     v-if="showResult"
                     :style="(resultPos.top ? 'top: ' + resultPos.top : '') + ';' + (resultPos.right ? 'right: ' + resultPos.right : '') + ';' + (resultPos.bottom ? 'bottom: ' + resultPos.bottom : '') + ';' + (resultPos.left ? 'left: ' + resultPos.left : '') + ';'"
                     @mousedown="stopPropagation">
                    <template v-for="translator in translatorList" v-if="translator.enabled">
                        <div class="translateResult">
                            <span :style="{color: translator.color}" class="translatorName" @click="showConfigModal">{{translator.name}}</span>：
                            <template v-if="translator.result.confidence">
                                <abbr :title="translator.result.confidence">{{translator.result.text}}</abbr>
                            </template>
                            <template v-else>
                                <span>{{translator.result.text}}</span>
                            </template>
                            <template v-if="translator.code === 'google'" v-for="item in translator.result.dict">
                                <div class="OnySakuraTranslator_dict">
                                    <span :class="'pos pos_'+item.pos_enum">{{item.pos}}</span>
                                    <span class="base_form">{{translatorList[0].result === item.base_form ? '' : (' [' + item.base_form + '] ')}}</span>
                                    <span class="terms">
                                <template v-for="term in item.entry">
                                     <span class="term">
                                         {{term.word}}
                                         <span class="tooltiptext">score: {{term.score}}<br/>reverse: {{term.reverse_translation}}</span>
                                     </span>&nbsp;
                                </template>
                            </span>
                                </div>
                            </template>
                            <template v-if="translator.code === 'bing'" v-for="item in translator.result.dict">
                                <div class="OnySakuraTranslator_dict">
                                    <span :class="'pos pos_'+item.index">{{item.pos}}</span>
                                    <span class="terms">{{item.def}}</span>
                                </div>
                            </template>
                        </div>
                    </template>
                </div>
            </transition>
            <transition>
                <div id="OnySakuraTranslatorConfig" v-if="showConfig" @mousedown="stopPropagation" @mouseup="stopPropagation">
                    <form action="javascript:void(0);">
                        <div class="configItem title">
                            <span>修改配置</span>
                        </div>
                        <div class="configItem translator">
                            <span>开关：</span>
                            <template v-for="translator in translatorList">
                                <label><input type="checkbox" name="{{translator.code}}" v-model="translator.enabled" :disabled="translator.code === 'source'"/>{{translator.name}}</label>
                            </template>
                        </div>
                        <div class="configItem pos">
                            <span>固定位置：</span>
                            <label><input type="checkbox" name="fixPos" v-model="fixPos"/></label>
                            <div class="posValue"><label><span>Top: </span><input type="text" name="top" v-model="resultPos.top" :readonly="!fixPos"/></label></div>
                            <div class="posValue"><label><span>Right: </span><input type="text" name="right" v-model="resultPos.right" :readonly="!fixPos"/></label></div>
                            <div class="posValue"><label><span>Bottom: </span><input type="text" name="bottom" v-model="resultPos.bottom" :readonly="!fixPos"/></label></div>
                            <div class="posValue"><label><span>Left: </span><input type="text" name="left" v-model="resultPos.left" :readonly="!fixPos"/></label></div>
                        </div>
                    </form>
                </div>
            </transition>
        </div>
    `;
    let style = document.createElement('style');
    style.textContent = `#OnySakuraTranslatorShowIcon{background-color:#fff;border:#fd6848 solid 2px;border-radius:200px;box-shadow:3px 3px 5px gray;color:#fd6848;box-sizing:border-box;width:30px;height:30px;text-align:center;line-height:26px;cursor:pointer;position:fixed;opacity:1;z-index:30000}#OnySakuraTranslatorShowIcon.icon-enter{transform:scale(.3,.3)}#OnySakuraTranslatorShowIcon.icon-enter-active{transition:all 0.1s ease-in}#OnySakuraTranslatorShowIcon.icon-leave-to{transform:scale(0,0)}#OnySakuraTranslatorShowIcon.icon-leave-active{transition:all 0.1s ease-out}#OnySakuraTranslatorResult.result-enter{transform:scale(1,0)}#OnySakuraTranslatorResult.result-enter-active{transition:all 0.1s ease-in}#OnySakuraTranslatorResult.result-leave-to{transform:scale(1,0)}#OnySakuraTranslatorResult.result-leave-active{transition:all 0.1s ease-out}#OnySakuraTranslatorShowIcon:hover{background-color:#fd6848;color:#fff}#OnySakuraTranslatorShowIcon:active{margin-top:2px}#OnySakuraTranslatorResult{background-color:#FFFAF6;border:#fd6848 solid 2px;border-radius:10px;padding:5px;margin:auto;position:fixed;z-index:100000001}#OnySakuraTranslatorResult .translateResult{margin:8px;padding-top:8px;border-top:#ffc1c1 solid 1px}#OnySakuraTranslatorResult .translateResult:first-of-type{border-top:0}#OnySakuraTranslatorResult .translateResult .translatorName{cursor:pointer}.OnySakuraTranslator_dict{margin-top:10px}.OnySakuraTranslator_dict .base_form{font-size:14px!important;font-family:"Sarasa Term SC",mononoki,monospace}.OnySakuraTranslator_dict .terms{margin-left:10px}.OnySakuraTranslator_dict .term{position:relative;display:inline-block;border-bottom:1px dotted #000}.OnySakuraTranslator_dict .term{position:relative;display:inline-block;border-bottom:1px dotted #000}.OnySakuraTranslator_dict .term .tooltiptext{visibility:hidden;background-color:#fdc;color:#555;text-align:left;padding:5px;border-radius:5px;position:absolute;z-index:1;white-space:pre;top:200%;left:0}.OnySakuraTranslator_dict .term:hover .tooltiptext{visibility:visible}.OnySakuraTranslator_dict .pos{width:50px;font-size:10px;font-style:italic;display:inline-block;text-align:right}.OnySakuraTranslator_dict .pos_1{color:#369}.OnySakuraTranslator_dict .pos_2{color:#396}.OnySakuraTranslator_dict .pos_3{color:#639}.OnySakuraTranslator_dict .pos_4{color:#693}.OnySakuraTranslator_dict .pos_5{color:#936}.OnySakuraTranslator_dict .pos_6{color:#963}#OnySakuraTranslatorConfig{background-color:#fff;border:#fd6848 solid 2px;border-radius:5px;box-shadow:5px 5px 10px gray;color:#fd6848;box-sizing:border-box;width:800px;height:360px;padding:30px;text-align:left;line-height:30px;cursor:pointer;position:fixed;top:50%;left:50%;z-index:100000005}#OnySakuraTranslatorConfig .configItem.title{font-size:20px;font-weight:700;text-align:center}#OnySakuraTranslatorConfig .configItem{margin-bottom:20px;margin-left:20px}#OnySakuraTranslatorConfig .configItem.translator label,#OnySakuraTranslatorConfig .configItem.pos label{padding:10px 30px 10px 0}#OnySakuraTranslatorConfig .configItem.translator>span,#OnySakuraTranslatorConfig .configItem.pos>span,#OnySakuraTranslatorConfig .configItem.pos>div>label>span{display:inline-block;width:100px;padding:3px 30px 3px 0}#OnySakuraTranslatorConfig .configItem.pos .posValue{margin-left:34px}#OnySakuraTranslatorConfig .configItem.pos .posValue>label>span{width:75px}#OnySakuraTranslatorConfig .configItem.pos .posValue input{width:50px}`;
    let shadowRoot = document.createElement('div');
    shadowRoot.id = 'OnySakuraTranslatorShadow';
    document.body.appendChild(shadowRoot);
    let shadow = shadowRoot.attachShadow({mode: 'open'});
    shadow.appendChild(resultDiv);
    shadow.appendChild(style);
    let translatorParent = document.querySelector('#OnySakuraTranslatorShadow').shadowRoot.querySelector('#OnySakuraTranslatorParent')
    new Vue({
        el: translatorParent,
        data() {
            return {
                translateText: '', // 选中的文本
                showIcon: false,
                showResult: false,
                showConfig: false,
                fixPos: true,
                resultPos: {
                    top: '30%',
                    right: '30%',
                    bottom: '',
                    left: '',
                },
                mouseX: 0,
                mouseY: 0,
                translatorList: [
                    {
                        enabled: true,
                        color: '#8A2BE2FF',
                        code: 'source',
                        name: '原句',
                        result: {
                            text: '',
                            dict: []
                        },
                        url: '',
                        appid: '',
                        secret: ''
                    },
                    {
                        enabled: true,
                        color: '#fd6853',
                        code: 'sogou',
                        name: '搜狗',
                        result: {
                            text: '',
                            dict: []
                        },
                        url: 'https://fanyi.sogou.com/reventondc/api/sogouTranslate',
                        appid: '-',
                        secret: '-'
                    },
                    {
                        enabled: true,
                        color: '#398bfb',
                        code: 'baidu',
                        name: '百度',
                        result: {
                            text: '',
                            dict: []
                        },
                        url: 'https://fanyi-api.baidu.com/api/trans/vip/translate',
                        appid: '-',
                        secret: '-'
                    },
                    {
                        enabled: true,
                        color: '#00a4ff',
                        code: 'tencent',
                        name: '腾讯',
                        result: {
                            text: '',
                            dict: []
                        },
                        url: 'https://tmt.tencentcloudapi.com',
                        appid: '-',
                        secret: '-'
                    },
                    {
                        enabled: true,
                        color: '#ddc35d',
                        code: 'caiyun',
                        name: '彩云',
                        result: {
                            text: '',
                            dict: []
                        },
                        url: 'http://api.interpreter.caiyunai.com/v1/translator',
                        appid: '3975l6lr5pcbvidl6jl2', // 官方提供测试 token，不稳定
                        secret: ''
                    },
                    {
                        enabled: true,
                        color: '#1fa463',
                        code: 'google',
                        name: '谷歌',
                        result: {
                            text: '',
                            dict: []
                        },
                        url: 'https://translate.google.cn/translate_a/single?client=gtx&dt=t&dt=bd&dj=1&source=input&hl=zh-CN&sl=auto&tl=zh-CN&',
                        appid: '',
                        secret: ''
                    },
                    {
                        enabled: true,
                        color: '#008474',
                        code: 'bing',
                        name: '必应',
                        result: {
                            text: '',
                            dict: []
                        },
                        url: 'https://cn.bing.com/dict/search',
                        appid: '',
                        secret: ''
                    }
                ]
            }
        },
        mounted() {
            let vue = this;
            { // source
                vue.translatorList[0].parseResult = function (data) {
                    let translator = vue.translatorList[0];
                    translator.result.text = vue.translateText;
                };
                vue.translatorList[0].startTranslate = function () {
                    let translator = vue.translatorList[0];
                    let xhr = {
                        readyState: 4,
                        status: 200
                    };
                    vue.getResult(translator, xhr, null);
                };
            }
            { // sogou
                vue.translatorList[1].initParam = function () {
                    let translator = vue.translatorList[1];
                    let translateText = vue.translateText;
                    let salt = vue.getSalt();
                    let src = translator.appid + translateText + salt + translator.secret;
                    let sign = MD5(src).toLowerCase();
                    let encodedTranslateText = encodeURI(translateText);
                    return "q=" + encodedTranslateText + "&pid=" + translator.appid + "&to=zh-CHS&from=auto&salt=" + salt + "&sign=" + sign;
                };
                vue.translatorList[1].parseResult = function (json) {
                    let translator = vue.translatorList[1];
                    if (json.query) {
                        translator.result.text = json.translation;
                    } else {
                        let parse = '';
                        try {
                            parse = JSON.parse(json);
                        } catch (e) {
                        }
                        if (parse.query) {
                            translator.result.text = parse.translation;
                        } else {
                            translator.result.text = JSON.stringify(json);
                        }
                    }
                };
                vue.translatorList[1].startTranslate = function () {
                    let translator = vue.translatorList[1];
                    GM_xmlhttpRequest({
                        method: "POST",
                        url: translator.url,
                        data: translator.initParam(),
                        timeout: REQUEST_TIMEOUT,
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded;",
                            "Accept": "application/json"
                        },
                        onload: function (xhr) {
                            vue.getResult(translator, xhr, vue.strToJson(xhr.responseText));
                        }
                    });
                };
            }
            { // baidu
                vue.translatorList[2].initParam = function () {
                    let translator = vue.translatorList[2];
                    let translateText = vue.translateText;
                    let salt = vue.getSalt();
                    let src = translator.appid + translateText + salt + translator.secret;
                    let sign = MD5(src).toLowerCase();
                    let encodedTranslateText = encodeURI(translateText);
                    return `q=${encodedTranslateText}&appid=${translator.appid}&to=zh&from=auto&salt=${salt}&sign=${sign}`;
                };
                vue.translatorList[2].parseResult = function (json) {
                    let translator = vue.translatorList[2];
                    if (json.trans_result) {
                        if (json.trans_result[0].dst) {
                            let dst = '' + json.trans_result[0].dst;
                            translator.result.text = decodeURI(dst);
                            return;
                        }
                    } else {
                        try {
                            let parse = JSON.parse(json);
                            if (parse.trans_result) {
                                if (parse.trans_result[0].dst) {
                                    let dst = '' + parse.trans_result[0].dst;
                                    translator.result.text = decodeURI(dst);
                                    return;
                                }
                            }
                        } catch (e) {
                        }
                    }
                    translator.result.text = JSON.stringify(json);
                };
                vue.translatorList[2].startTranslate = function () {
                    let translator = vue.translatorList[2];
                    GM_xmlhttpRequest({
                        method: "POST",
                        url: translator.url,
                        data: translator.initParam(),
                        timeout: REQUEST_TIMEOUT,
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded;",
                            "Accept": "application/json"
                        },
                        onload: function (xhr) {
                            let d = vue.strToJson(xhr.responseText);
                            vue.getResult(translator, xhr, d);
                        }
                    });
                };
            }
            { // tencent
                vue.translatorList[3].initParam = function () {
                    let translator = vue.translatorList[3];
                    let translateText = vue.translateText;
                    const endpoint = "tmt.tencentcloudapi.com";
                    const service = "tmt";
                    const region = "ap-beijing";
                    const action = "TextTranslate";
                    const version = "2018-03-21";
                    const timestamp = parseInt(new Date().getTime() / 1000);
                    // const timestamp = 1551113065
                    //时间处理, 获取世界时间日期
                    const date = vue.getDate(timestamp);

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
                    const kDate = sha256(date, 'TC3' + translator.secret);
                    const kService = sha256(service, kDate);
                    const kSigning = sha256('tc3_request', kService);
                    const signature = sha256(stringToSign, kSigning, 'hex');

                    // ************* 步骤 4：拼接 Authorization *************
                    const authorization = algorithm + " " +
                        "Credential=" + translator.appid + "/" + credentialScope + ", " +
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
                };
                vue.translatorList[3].parseResult = function (json) {
                    let translator = vue.translatorList[3];
                    if (json.Response) {
                        if (json.Response.TargetText) {
                            translator.result.text = decodeURIComponent(json.Response.TargetText);
                            return;
                        }
                    }
                    translator.result.text = JSON.stringify(json);
                };
                vue.translatorList[3].startTranslate = function () {
                    let translator = vue.translatorList[3];
                    let params = translator.initParam();
                    GM_xmlhttpRequest({
                        method: "POST",
                        url: translator.url,
                        data: params.data,
                        timeout: REQUEST_TIMEOUT,
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
                            let d = vue.strToJson(xhr.responseText);
                            vue.getResult(translator, xhr, d);
                        }
                    });
                };
            }
            { // caiyun
                vue.translatorList[4].initParam = function () {
                    let translateText = vue.translateText;
                    return JSON.stringify({
                        source: translateText,
                        trans_type: 'auto2zh',
                        request_id: vue.getSalt(),
                        detect: true,
                    });
                };
                vue.translatorList[4].parseResult = function (json) {
                    let translator = vue.translatorList[4];
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
                    translator.result.text = result;
                    translator.result.confidence = confidence;
                };
                vue.translatorList[4].startTranslate = function () {
                    let translator = vue.translatorList[4];
                    GM_xmlhttpRequest({
                        method: "POST",
                        url: translator.url,
                        data: translator.initParam(),
                        timeout: REQUEST_TIMEOUT,
                        headers: {
                            "Content-Type": "application/json",
                            "x-authorization": 'token ' + translator.appid
                        },
                        onload: function (xhr) {
                            let d = vue.strToJson(xhr.responseText);
                            vue.getResult(translator, xhr, d);
                        }
                    });
                };
            }
            { // google
                vue.translatorList[5].initParam = function () {
                    let translateText = vue.translateText;
                    let encodedTranslateText = encodeURI(translateText);
                    return "q=" + encodedTranslateText;
                };
                vue.translatorList[5].parseResult = function (json) {
                    let translator = vue.translatorList[5];
                    if (json) {
                        if (!json.sentences) {
                            json = JSON.parse(json);
                        }
                        for (let item of json.sentences) {
                            translator.result.text = item.trans;
                        }
                        if (json.dict) {
                            for (let item of json.dict) {
                                translator.result.dict.push({
                                    pos_enum: item.pos_enum,
                                    pos: item.pos,
                                    base_form: item.base_form,
                                    entry: item.entry
                                });
                            }
                        }
                    }
                };
                vue.translatorList[5].startTranslate = function () {
                    let translator = vue.translatorList[5];
                    GM_xmlhttpRequest({
                        method: "POST",
                        url: translator.url,
                        data: translator.initParam(),
                        timeout: REQUEST_TIMEOUT,
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded;",
                            "Accept": "application/json"
                        },
                        onload: function (xhr) {
                            let d = vue.strToJson(xhr.responseText);
                            vue.getResult(translator, xhr, d);
                        }
                    });
                };
            }
            { // bing
                vue.translatorList[6].getPosIndex = function (pos) {
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
                };
                vue.translatorList[6].initParam = function () {
                    let translateText = vue.translateText;
                    let encodedTranslateText = encodeURI(translateText);
                    return "?q=" + encodedTranslateText;
                };
                vue.translatorList[6].parseResult = function (html) {
                    let translator = vue.translatorList[6];
                    let dom = $.parseHTML(html);
                    let lis = $(dom).find('.lf_area>div>ul>li');
                    if (lis.length > 0) {
                        for (const li of lis) {
                            let pos = $(li).find('.pos').text();
                            let index = translator.getPosIndex(pos);
                            let def = $(li).find('.def>span').text();
                            translator.result.dict.push({
                                index: index,
                                pos: pos,
                                def: def
                            });
                        }
                    } else {
                        let div = $(dom).find('.lf_area>div');
                        if (div.length > 0) {
                            translator.result.text = div.children().eq(2).text();
                        }
                    }
                };
                vue.translatorList[6].startTranslate = function () {
                    let translator = vue.translatorList[6];
                    GM_xmlhttpRequest({
                        method: "GET",
                        url: translator.url + translator.initParam(),
                        timeout: REQUEST_TIMEOUT,
                        headers: {
                            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9"
                        },
                        onload: function (xhr) {
                            let d = xhr.responseText;
                            vue.getResult(translator, xhr, d);
                        }
                    });
                };
            }

            // 点击页面隐藏弹出框
            document.onmousedown = function (ev) {
                vue.showIcon = false;
                vue.showResult = false;
                vue.showConfig = false;
                let enabled = {};
                for (const translator of vue.translatorList) {
                    enabled[translator.code] = translator.enabled;
                    translator.result.text = '';
                    translator.result.dict = [];
                }
                // save config
                GM_setValue('OnySakuraTranslatorConfig', JSON.stringify({
                    enabled: enabled,
                    fixPos: vue.fixPos,
                    resultPos: {
                        top: vue.resultPos.top,
                        right: vue.resultPos.right,
                        bottom: vue.resultPos.bottom,
                        left: vue.resultPos.left
                    }
                }));
            };

            document.onmouseup = function (ev) {
                ev = ev || window.event;
                vue.translateText = vue.getSelection();
                if (vue.translateText.length > 0) {
                    // console.log('onysakuraTranslator', '显示按钮', vue.translateText);
                    vue.mouseX = ev.clientX;
                    vue.mouseY = ev.clientY;
                    vue.showIcon = true;
                }
            };

            // 恢复配置
            let config = GM_getValue('OnySakuraTranslatorConfig', false);
            if (config) {
                config = JSON.parse(config);
                // console.log(config);
                vue.fixPos = config.fixPos || false;
                for (const translator of vue.translatorList) {
                    translator.enabled = config.enabled[translator.code];
                }
                vue.resultPos.top = config.resultPos.top || '';
                vue.resultPos.right = config.resultPos.right || '';
                vue.resultPos.bottom = config.resultPos.bottom || '';
                vue.resultPos.left = config.resultPos.left || '';
            }
        },
        methods: {
            stopPropagation(ev) {
                // 阻止事件冒泡，防止点击翻译框后隐藏
                ev.stopPropagation();
            },
            showResultModal() {
                // console.log('onysakuraTranslator', '显示翻译', this.translateText);
                this.showIcon = false;
                if (this.translateText) {
                    if (!this.fixPos) {
                        let height = document.body.clientHeight
                        let width = document.body.clientWidth;
                        let left = this.mouseX;
                        let top = this.mouseY;
                        this.resultPos.top = '';
                        this.resultPos.right = '';
                        this.resultPos.bottom = '';
                        this.resultPos.left = '';
                        if (left > parseInt(width) / 2) {
                            // 右
                            this.resultPos.right = (width - left + 10) + 'px';
                        } else {
                            // 左
                            this.resultPos.left = (left + 10) + 'px';
                        }
                        if (top > parseInt(height) / 2) {
                            // 下
                            this.resultPos.bottom = (height - top + 15) + 'px';
                        } else {
                            // 上
                            this.resultPos.top = (top + 15) + 'px';
                        }
                    }
                    this.showResult = true;
                    for (const translator of this.translatorList) {
                        if (translator.enabled) {
                            try {
                                translator.startTranslate();
                            } catch (e) {
                                console.warn(e);
                                translator.result = 'Error';
                            }
                        }
                    }
                }
            },
            showConfigModal() {
                this.showConfig = true;
            },
            getResult(translator, xhr, data) {
                if (xhr.readyState === 4 && xhr.status === 200) {
                    translator.parseResult(data);
                } else if (xhr.status !== 200) {
                    translator.result = 'ERROR!';
                    console.log('onysakuraTranslator', 'error', JSON.stringify(data));
                }
            },
            getSelection() {
                let selection = window.getSelection();
                let selectionText = selection ? selection.toString() : '';
                selectionText = selectionText.trim().replace(/\n/g, '');
                return selectionText;
            },
            strToJson(str) {
                try {
                    return (new Function("return " + str))();
                } catch (e) {
                }
                return str;
            },
            getSalt() {
                let salt = "";
                for (let i = 0; i < 5; i++) salt += parseInt(Math.random() * 8);
                return salt;
            },
            getDate(timestamp) {
                const date = new Date(timestamp * 1000)
                const year = date.getUTCFullYear()
                const month = ('0' + (date.getUTCMonth() + 1)).slice(-2)
                const day = ('0' + date.getUTCDate()).slice(-2)
                return `${year}-${month}-${day}`
            }
        }
    });

    function isIframe() {
        return window.top !== window.self;
    }

    function sha256(message, secret = '', encoding) {
        return CryptoJS.HmacSHA256(message, secret);
    }

    function getHash(message, encoding = 'hex') {
        return CryptoJS.SHA256(message);
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