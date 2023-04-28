// ==UserScript==
// @name         * 多源翻译
// @namespace    https://github.com/gjp0609/Scripts/
// @version      1.0
// @description  支持 百度/必应/彩云/DeepL/谷歌/搜狗/腾讯/有道 翻译
// @author       onysakura
// @require      https://cdn.staticfile.org/jquery/3.6.4/jquery.slim.min.js
// @require      https://cdn.staticfile.org/crypto-js/4.1.1/core.min.js
// @require      https://cdn.staticfile.org/crypto-js/4.1.1/hmac.min.js
// @require      https://cdn.staticfile.org/crypto-js/4.1.1/sha256.min.js
// @require      https://cdn.staticfile.org/crypto-js/4.1.1/hmac-sha256.min.js
// @require      https://cdn.staticfile.org/crypto-js/4.1.1/md5.min.js
// @require      https://cdn.staticfile.org/vue/3.2.47/vue.global.prod.min.js
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @noframes
// ==/UserScript==

(function () {
    'use strict';
    GM_registerMenuCommand(
        '使用谷歌翻译此页面',
        () => window.open(`https://translate.google.com/translate?js=n&sl=auto&tl=zh-CN&u=${location.href}`, '_blank').focus(),
        't'
    );

    const REQUEST_TIMEOUT = 2000; // 请求超时时间
    const translatorMap = {
        source: {
            enabled: true,
            color: '#8A2BE2',
            name: '原文'
        },
        baidu: {
            enabled: false,
            color: '#398bfb',
            name: '百度',
            api: {
                // 免费调用量 5 万字符/月
                url: 'https://fanyi-api.baidu.com/api/trans/vip/translate',
                appid: '-',
                secret: '-',
                query: 'https://fanyi-api.baidu.com/api/trans/product/desktop?req=detail',
                doc: 'https://fanyi-api.baidu.com/doc/8'
            }
        },
        bing: {
            enabled: true,
            color: '#008474',
            name: '必应',
            url: 'https://cn.bing.com/dict'
        },
        caiyun: {
            enabled: true,
            color: '#ddc35d',
            name: '彩云',
            api: {
                // 免费调用量 100 万字符/月
                url: 'http://api.interpreter.caiyunai.com/v1/translator',
                appid: '3975l6lr5pcbvidl6jl2',
                query: 'https://dashboard.caiyunapp.com/v1/token/',
                doc: 'https://docs.caiyunapp.com/blog/2018/09/03/lingocloud-api/'
            }
        },
        deepl: {
            enabled: false,
            color: '#0f2b46',
            name: 'Deepl',
            api: {
                // 免费自建 docker
                url: 'http://deepl.noif.fun/translate'
            }
        },
        google: {
            enabled: true,
            color: '#1fa463',
            name: '谷歌',
            url: 'https://www.google.com/async/translate'
        },
        sogou: {
            enabled: true,
            color: '#fd6853',
            name: '搜狗',
            url: 'https://fanyi.sogou.com/text'
        },
        tencent: {
            enabled: false,
            color: '#00a4ff',
            name: '腾讯',
            api: {
                // 免费调用量 500 万字符/月
                url: 'https://tmt.tencentcloudapi.com',
                appid: '-',
                secret: '-',
                query: 'https://console.cloud.tencent.com/tmt',
                doc: 'https://cloud.tencent.com/document/product/551/35017'
            }
        },
        youdao: {
            enabled: true,
            color: '#0783fa',
            name: '有道',
            url: 'https://aidemo.youdao.com/trans'
        }
    };

    let shadowParent = document.createElement('div');
    shadowParent.id = 'OnySakuraTranslatorShadow';
    document.body.appendChild(shadowParent);
    let shadowRoot = shadowParent.attachShadow({ mode: 'open' });
    // style
    let style = document.createElement('style');
    style.textContent = `#OnySakuraTranslatorParent .icon-enter{transform:scale(.3,.3)}#OnySakuraTranslatorParent .config-enter-active,#OnySakuraTranslatorParent .icon-enter-active,#OnySakuraTranslatorParent .result-enter-active{transition:.1s ease-in}#OnySakuraTranslatorParent .icon-leave-to{transform:scale(0,0)}#OnySakuraTranslatorParent .config-leave-active,#OnySakuraTranslatorParent .icon-leave-active,#OnySakuraTranslatorParent .result-leave-active{transition:.1s ease-out}#OnySakuraTranslatorParent .config-enter,#OnySakuraTranslatorParent .config-leave-to,#OnySakuraTranslatorParent .result-enter,#OnySakuraTranslatorParent .result-leave-to{transform:scale(1,0)}#OnySakuraTranslatorParent #OnySakuraTranslatorShowIcon{background-color:#fff;border:2px solid #fd6848;border-radius:100%;box-shadow:3px 3px 5px gray;color:#fd6848;box-sizing:border-box;width:30px;height:30px;text-align:center;line-height:26px;font-size:17px;cursor:pointer;position:fixed;opacity:1;z-index:30000}#OnySakuraTranslatorParent #OnySakuraTranslatorShowIcon:hover{background-color:#fd6848;color:#fff}#OnySakuraTranslatorParent #OnySakuraTranslatorShowIcon:active{margin-top:2px}#OnySakuraTranslatorParent #OnySakuraTranslatorResult{font-size:15px;color:#000;line-height:25px;background-color:#fffaf6;border:2px solid #fd6848;border-radius:10px;padding:5px;margin:auto;position:fixed;z-index:100000001}#OnySakuraTranslatorParent #OnySakuraTranslatorResult .translateResult{margin:8px;padding-top:8px;border-top:1px solid #ffc1c1;text-align:left}#OnySakuraTranslatorParent #OnySakuraTranslatorResult .translateResult:first-of-type{border-top:0}#OnySakuraTranslatorParent #OnySakuraTranslatorResult .translateResult .translatorName{display:inline-block;width:38px;cursor:pointer}#OnySakuraTranslatorParent #OnySakuraTranslatorResult .translateResult .OnySakuraTranslator_dict{display:flex;margin-top:5px;min-height:15px;line-height:15px}#OnySakuraTranslatorParent #OnySakuraTranslatorResult .translateResult .OnySakuraTranslator_dict .pos{flex:0 0 50px;font-size:10px;font-style:italic;display:inline-block;text-align:right}#OnySakuraTranslatorParent #OnySakuraTranslatorResult .translateResult .OnySakuraTranslator_dict .pos.pos_1{color:#369}#OnySakuraTranslatorParent #OnySakuraTranslatorResult .translateResult .OnySakuraTranslator_dict .pos.pos_2{color:#396}#OnySakuraTranslatorParent #OnySakuraTranslatorResult .translateResult .OnySakuraTranslator_dict .pos.pos_3{color:#639}#OnySakuraTranslatorParent #OnySakuraTranslatorResult .translateResult .OnySakuraTranslator_dict .pos.pos_4{color:#693}#OnySakuraTranslatorParent #OnySakuraTranslatorResult .translateResult .OnySakuraTranslator_dict .pos.pos_5{color:#936}#OnySakuraTranslatorParent #OnySakuraTranslatorResult .translateResult .OnySakuraTranslator_dict .pos.pos_6{color:#963}#OnySakuraTranslatorParent #OnySakuraTranslatorResult .translateResult .OnySakuraTranslator_dict .terms{margin-left:10px;font-size:12px}#OnySakuraTranslatorParent #OnySakuraTranslatorConfig{background-color:#fff;border:2px solid #fd6848;border-radius:5px;box-shadow:5px 5px 10px gray;color:#fd6848;box-sizing:border-box;width:800px;height:360px;padding:30px;text-align:left;line-height:30px;font-size:15px;cursor:pointer;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:100000005}#OnySakuraTranslatorParent #OnySakuraTranslatorConfig .configItem{margin-bottom:20px;margin-left:20px}#OnySakuraTranslatorParent #OnySakuraTranslatorConfig .configItem.title{font-size:20px;font-weight:700;text-align:center}#OnySakuraTranslatorParent #OnySakuraTranslatorConfig .configItem.pos span,#OnySakuraTranslatorParent #OnySakuraTranslatorConfig .configItem.translator span{display:inline-block;width:100px;padding:3px 5px 3px 0}#OnySakuraTranslatorParent #OnySakuraTranslatorConfig .configItem.pos label,#OnySakuraTranslatorParent #OnySakuraTranslatorConfig .configItem.translator label{padding:10px 15px 10px 0}#OnySakuraTranslatorParent #OnySakuraTranslatorConfig .configItem.pos .posValue,#OnySakuraTranslatorParent #OnySakuraTranslatorConfig .configItem.translator .posValue{margin-left:34px}#OnySakuraTranslatorParent #OnySakuraTranslatorConfig .configItem.pos .posValue span,#OnySakuraTranslatorParent #OnySakuraTranslatorConfig .configItem.translator .posValue span{width:69px}#OnySakuraTranslatorParent #OnySakuraTranslatorConfig .configItem.pos .posValue input,#OnySakuraTranslatorParent #OnySakuraTranslatorConfig .configItem.translator .posValue input{width:50px}`;
    shadowRoot.appendChild(style);
    // html
    const rootDiv = document.createElement('div');
    rootDiv.id = 'OnySakuraTranslatorParent';
    shadowRoot.appendChild(rootDiv);

    // 某些网页会重置 document 而不重新加载网页
    setInterval(() => {
        if (!document.querySelector('#OnySakuraTranslatorShadow')) {
            document.body.appendChild(shadowRoot);
        }
    }, 2000);

    const ref = Vue.ref;
    const onMounted = Vue.onMounted;
    const h = Vue.h;
    Vue.createApp({
        render() {
            return [
                h(
                    'transition',
                    { name: 'icon' },
                    this.showIcon
                        ? [
                              h(
                                  'div',
                                  {
                                      id: 'OnySakuraTranslatorShowIcon',
                                      style: `top: ${this.mouseY}px; left: ${this.mouseX + 10}px;`,
                                      onMousedown: (e) => e.stopPropagation(),
                                      onMouseup: (e) => e.stopPropagation(),
                                      onClick: () => this.showResultModal()
                                  },
                                  ['译']
                              )
                          ]
                        : []
                ),
                h(
                    'transition',
                    { name: 'result' },
                    this.showResult
                        ? [
                              h(
                                  'div',
                                  {
                                      id: 'OnySakuraTranslatorResult',
                                      style: `
                                          ${this.resultPos.top ? 'top: ' + this.resultPos.top : ''};
                                          ${this.resultPos.right ? 'right: ' + this.resultPos.right : ''};
                                          ${this.resultPos.bottom ? 'bottom: ' + this.resultPos.bottom : ''};
                                          ${this.resultPos.left ? 'left: ' + this.resultPos.left : ''};
                                      `,
                                      onMousedown: (e) => e.stopPropagation()
                                  },
                                  Object.keys(this.translatorList)
                                      .map((key) => this.translatorList[key])
                                      .filter((it) => it.enabled)
                                      .map((translator) =>
                                          h(
                                              'div',
                                              {
                                                  class: 'translateResult'
                                              },
                                              [
                                                  h(
                                                      'span',
                                                      {
                                                          class: 'translatorName',
                                                          style: `color: ${translator.color};`,
                                                          onClick: () => this.showConfigModal()
                                                      },
                                                      [translator.name]
                                                  ),
                                                  '：',
                                                  translator.result.confidence
                                                      ? h('abbr', { title: translator.result.confidence }, [translator.result.text])
                                                      : h('span', {}, [translator.result.text]),
                                                  translator.result.dict?.map((it) =>
                                                      h('div', { class: 'OnySakuraTranslator_dict' }, [
                                                          h(
                                                              'span',
                                                              {
                                                                  class: 'pos pos_' + it.index
                                                              },
                                                              [it.pos]
                                                          ),
                                                          h('span', { class: 'terms' }, [it.def])
                                                      ])
                                                  )
                                              ]
                                          )
                                      )
                              )
                          ]
                        : []
                ),
                h(
                    'transition',
                    { name: 'config' },
                    this.showConfig
                        ? [
                              h(
                                  'div',
                                  {
                                      id: 'OnySakuraTranslatorConfig',
                                      onMousedown: (e) => e.stopPropagation(),
                                      onMouseup: (e) => e.stopPropagation()
                                  },
                                  [
                                      h(
                                          'form',
                                          {
                                              action: 'javascript:void(0);'
                                          },
                                          [
                                              h(
                                                  'div',
                                                  {
                                                      class: 'configItem title'
                                                  },
                                                  [h('span', {}, ['修改配置'])]
                                              ),
                                              h(
                                                  'div',
                                                  {
                                                      class: 'configItem translator'
                                                  },
                                                  [
                                                      h('span', {}, ['开关：']),
                                                      Object.keys(this.translatorList).map((key) =>
                                                          h('label', {}, [
                                                              h(
                                                                  'input',
                                                                  {
                                                                      type: 'checkbox',
                                                                      name: this.translatorList[key].name,
                                                                      checked: this.translatorList[key].enabled,
                                                                      disabled: key === 'source',
                                                                      onInput: (e) => {
                                                                          this.translatorList[key].enabled = e.target.checked;
                                                                          this.$emit('input', e.target.checked);
                                                                      }
                                                                  },
                                                                  []
                                                              ),
                                                              this.translatorList[key].name
                                                          ])
                                                      )
                                                  ]
                                              ),
                                              h(
                                                  'div',
                                                  {
                                                      class: 'configItem pos'
                                                  },
                                                  [
                                                      h('span', {}, ['固定位置：']),
                                                      h('label', {}, [
                                                          h(
                                                              'input',
                                                              {
                                                                  type: 'checkbox',
                                                                  name: 'fixPos',
                                                                  checked: this.fixPos,
                                                                  onInput: (e) => {
                                                                      this.fixPos = e.target.checked;
                                                                      this.$emit('input', e.target.checked);
                                                                  }
                                                              },
                                                              []
                                                          )
                                                      ]),
                                                      h('div', { class: 'posValue' }, [
                                                          h('span', {}, ['Top:']),
                                                          h(
                                                              'input',
                                                              {
                                                                  type: 'text',
                                                                  name: 'top',
                                                                  readonly: !this.fixPos,
                                                                  value: this.resultPos.top,
                                                                  onInput: (e) => {
                                                                      this.resultPos.top = e.target.value;
                                                                      this.$emit('input', e.target.value);
                                                                  }
                                                              },
                                                              []
                                                          )
                                                      ]),
                                                      h('div', { class: 'posValue' }, [
                                                          h('span', {}, ['Right:']),
                                                          h(
                                                              'input',
                                                              {
                                                                  type: 'text',
                                                                  name: 'right',
                                                                  readonly: !this.fixPos,
                                                                  value: this.resultPos.right,
                                                                  onInput: (e) => {
                                                                      this.resultPos.right = e.target.value;
                                                                      this.$emit('input', e.target.value);
                                                                  }
                                                              },
                                                              []
                                                          )
                                                      ]),
                                                      h('div', { class: 'posValue' }, [
                                                          h('span', {}, ['Bottom:']),
                                                          h(
                                                              'input',
                                                              {
                                                                  type: 'text',
                                                                  name: 'bottom',
                                                                  readonly: !this.fixPos,
                                                                  value: this.resultPos.bottom,
                                                                  onInput: (e) => {
                                                                      this.resultPos.bottom = e.target.value;
                                                                      this.$emit('input', e.target.value);
                                                                  }
                                                              },
                                                              []
                                                          )
                                                      ]),
                                                      h('div', { class: 'posValue' }, [
                                                          h('span', {}, ['Left:']),
                                                          h(
                                                              'input',
                                                              {
                                                                  type: 'text',
                                                                  name: 'left',
                                                                  readonly: !this.fixPos,
                                                                  value: this.resultPos.left,
                                                                  onInput: (e) => {
                                                                      this.resultPos.left = e.target.value;
                                                                      this.$emit('input', e.target.value);
                                                                  }
                                                              },
                                                              []
                                                          )
                                                      ])
                                                  ]
                                              )
                                          ]
                                      )
                                  ]
                              )
                          ]
                        : []
                )
            ];
        },
        setup() {
            const translateText = ref(''); // 选中的文本
            const showIcon = ref(false);
            const showResult = ref(false);
            const showConfig = ref(false);
            const fixPos = ref(true);
            const resultPos = ref({
                top: '30%',
                right: '30%',
                bottom: '',
                left: ''
            });
            const mouseX = ref(0);
            const mouseY = ref(0);
            const translatorList = ref(translatorMap);

            onMounted(() => {
                console.log('onMounted');
                showIcon.value = true;
                // 点击页面隐藏弹出框
                document.onmousedown = function () {
                    showIcon.value = false;
                    showResult.value = false;
                    showConfig.value = false;
                    let enabled = {};
                    for (let key in translatorList.value) {
                        let translator = translatorList.value[key];
                        enabled[key] = translator.enabled;
                        translator.result = {
                            text: '',
                            dict: []
                        };
                    }
                    // save config
                    GM_setValue(
                        'OnySakuraTranslatorConfig',
                        JSON.stringify({
                            enabled: enabled,
                            fixPos: fixPos.value,
                            resultPos: {
                                top: resultPos.value.top,
                                right: resultPos.value.right,
                                bottom: resultPos.value.bottom,
                                left: resultPos.value.left
                            }
                        })
                    );
                };

                document.onmouseup = function (ev) {
                    ev = ev || window.event;
                    translateText.value = getSelection();
                    if (translateText.value.length > 0) {
                        mouseX.value = ev.clientX;
                        mouseY.value = ev.clientY;
                        showIcon.value = true;
                    }
                };

                // 恢复配置
                let config = GM_getValue('OnySakuraTranslatorConfig', false);
                if (config) {
                    config = JSON.parse(config);
                    fixPos.value = config.fixPos || false;
                    for (let key in translatorList.value) {
                        let translator = translatorList.value[key];
                        translator.enabled = config.enabled[key];
                    }
                    translatorList.value.source.enabled = true;
                    resultPos.value.top = config.resultPos.top || '';
                    resultPos.value.right = config.resultPos.right || '';
                    resultPos.value.bottom = config.resultPos.bottom || '';
                    resultPos.value.left = config.resultPos.left || '';
                }
            });
            const showResultModal = () => {
                showIcon.value = false;
                if (translateText) {
                    if (!fixPos) {
                        let height = window.innerHeight;
                        let width = window.innerWidth;
                        let left = mouseX.value;
                        let top = mouseY.value;
                        resultPos.value.top = '';
                        resultPos.value.right = '';
                        resultPos.value.bottom = '';
                        resultPos.value.left = '';
                        if (left > width / 2) {
                            // 右
                            resultPos.value.right = width - left + 10 + 'px';
                        } else {
                            // 左
                            resultPos.value.left = left + 10 + 'px';
                        }
                        if (top > height / 2) {
                            // 下
                            resultPos.value.bottom = height - top + 15 + 'px';
                        } else {
                            // 上
                            resultPos.value.top = top + 15 + 'px';
                        }
                    }
                    showResult.value = true;
                    for (let key in translatorList.value) {
                        let translator = translatorList.value[key];
                        if (translator.enabled) {
                            try {
                                translator.result = {
                                    text: '',
                                    dict: []
                                };
                                translator.startTranslate(translateText.value);
                            } catch (e) {
                                console.log('%cOnySakuraTranslator ' + key + ' Error\n', 'font-size: 1rem; color: red;', e);
                                translator.result.text = 'Error: ' + e.message;
                            }
                        }
                    }
                }
            };

            const showConfigModal = () => {
                showConfig.value = true;
            };

            return {
                // data
                mouseX,
                mouseY,
                showIcon,
                showResult,
                showConfig,
                resultPos,
                fixPos,
                translatorList,
                // func
                showResultModal,
                showConfigModal
            };
        }
    }).mount(document.querySelector('#OnySakuraTranslatorShadow').shadowRoot.querySelector('#OnySakuraTranslatorParent'));

    // source
    translatorMap.source.startTranslate = function (translateText) {
        this.result.text = translateText;
    };

    // baidu
    translatorMap.baidu.startTranslate = function (translateText) {
        let salt = getSalt();
        let sign = CryptoJS.MD5(this.api.appid + translateText + salt + this.api.secret).toString();
        let params = `q=${encodeURI(translateText)}&appid=${this.api.appid}&to=zh&from=auto&salt=${salt}&sign=${sign}`;
        GM_xmlhttpRequest({
            method: 'POST',
            url: this.api.url,
            data: params,
            timeout: REQUEST_TIMEOUT,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;',
                'Accept': 'application/json'
            },
            onload: (xhr) => {
                if (isXhrSuccess(xhr)) {
                    let json = strToJson(xhr.responseText);
                    if (json.trans_result) {
                        if (json.trans_result[0].dst) {
                            this.result.text = decodeURI(json.trans_result[0].dst);
                            return;
                        }
                    } else {
                        try {
                            let parse = strToJson(json);
                            if (parse.trans_result) {
                                if (parse.trans_result[0].dst) {
                                    this.result.text = decodeURI(parse.trans_result[0].dst);
                                    return;
                                }
                            }
                        } catch (e) {}
                    }
                    this.result.text = JSON.stringify(json);
                }
            }
        });
    };

    // bing
    translatorMap.bing.getPosIndex = (pos) => {
        switch (pos) {
            case 'n.':
                return 1;
            case 'v.':
                return 2;
            case 'pron.':
                return 3;
            case 'adj.':
                return 4;
            case 'adv.':
                return 5;
            default:
                return 6;
        }
    };
    translatorMap.bing.startTranslate = function (translateText) {
        if (translateText.indexOf(' ') > 0) {
            throw new Error('not a word');
        }
        GM_xmlhttpRequest({
            method: 'GET',
            url: `${this.url}/${encodeURI(translateText)}`,
            timeout: REQUEST_TIMEOUT,
            headers: {
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9'
            },
            onload: (xhr) => {
                if (isXhrSuccess(xhr)) {
                    let dom = $.parseHTML(xhr.responseText);
                    let list = $(dom).find('.lf_area>div>ul>li');
                    if (list.length > 0) {
                        for (const li of list) {
                            let pos = $(li).find('.pos').text();
                            let index = this.getPosIndex(pos);
                            let def = $(li).find('.def>span').text();
                            this.result.dict.push({
                                index: index,
                                pos: pos,
                                def: def
                            });
                        }
                    } else {
                        let div = $(dom).find('.lf_area>div');
                        if (div.length > 0) {
                            this.result.text = div.children().eq(2).text();
                        }
                    }
                }
            }
        });
    };

    // caiyun
    translatorMap.caiyun.startTranslate = function (translateText) {
        GM_xmlhttpRequest({
            method: 'POST',
            url: this.api.url,
            data: JSON.stringify({
                source: translateText,
                trans_type: 'auto2zh',
                request_id: getSalt(),
                detect: true
            }),
            timeout: REQUEST_TIMEOUT,
            headers: {
                'Content-Type': 'application/json',
                'x-authorization': 'token ' + this.api.appid
            },
            onload: (xhr) => {
                if (isXhrSuccess(xhr)) {
                    let json = strToJson(xhr.responseText);
                    let result,
                        confidence = '';
                    if (json.target) {
                        result = json.target;
                        confidence = json.confidence;
                    } else {
                        let parse = {};
                        try {
                            parse = strToJson(json);
                        } catch (e) {}
                        if (parse.target) {
                            result = parse.target;
                            confidence = parse.confidence;
                        } else {
                            result = JSON.stringify(json);
                        }
                    }
                    this.result.text = result;
                    this.result.confidence = confidence;
                }
            }
        });
    };

    // deepl
    translatorMap.deepl.startTranslate = function (translateText) {
        GM_xmlhttpRequest({
            method: 'POST',
            url: this.api.url,
            data: JSON.stringify({
                text: translateText,
                source_lang: 'auto',
                target_lang: 'ZH'
            }),
            timeout: REQUEST_TIMEOUT,
            headers: {
                'Content-Type': 'application/json'
            },
            onload: (xhr) => {
                if (isXhrSuccess(xhr)) {
                    let json = strToJson(xhr.responseText);
                    if (json.code === 200) {
                        this.result.text = json.data;
                    } else {
                        throw Error(json.msg);
                    }
                }
            }
        });
    };

    // google
    translatorMap.google.getPosIndex = (pos) => {
        switch (pos) {
            case '名词':
                return 1;
            case '动词':
                return 2;
            case '代词':
                return 3;
            case '形容词':
                return 4;
            case '副词':
                return 5;
            default:
                return 6;
        }
    };
    translatorMap.google.startTranslate = function (translateText) {
        GM_xmlhttpRequest({
            method: 'POST',
            url: this.url,
            data: `async=translate,sl:auto,tl:zh-CN,st:${encodeURIComponent(
                translateText
            )},id:${new Date().getTime()},qc:true,ac:false,_id:tw-async-translate,_pms:s,_fmt:pc`,
            timeout: REQUEST_TIMEOUT,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
            },
            onload: (xhr) => {
                if (isXhrSuccess(xhr)) {
                    let div = document.createElement('div');
                    div.innerHTML = xhr.responseText.substring(xhr.responseText.indexOf('<'));
                    let dict = [];
                    try {
                        let words = [];
                        div.querySelectorAll('#tw-answ-bil-fd > div .tw-bilingual-entry span span').forEach((span) => words.push(span.innerText));
                        let pos = div.querySelector('#tw-answ-bil-fd > .tw-bilingual-pos').innerText;
                        dict.push({
                            index: this.getPosIndex(pos),
                            pos: pos,
                            def: words.join(', ')
                        });
                    } catch (e) {}
                    try {
                        let words = [];
                        div.querySelectorAll('g-expandable-content > span > div > div > span > span').forEach((span) => words.push(span.innerText));
                        let pos = div.querySelector('g-expandable-content > span .tw-bilingual-pos').innerText;
                        dict.push({
                            index: this.getPosIndex(pos),
                            pos: pos,
                            def: words.join(', ')
                        });
                    } catch (e) {}
                    this.result.text = div.querySelector('#tw-answ-target-text').innerText;
                    this.result.dict = dict;
                }
            }
        });
    };

    // sogou
    translatorMap.sogou.startTranslate = function (translateText) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: `${this.url}?transfrom=auto&transto=zh-CHS&model=general&keyword=${encodeURI(translateText)}`,
            timeout: REQUEST_TIMEOUT,
            headers: {
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9'
            },
            onload: (xhr) => {
                if (isXhrSuccess(xhr)) {
                    this.result.text = $($.parseHTML(xhr.responseText)).find('#trans-result').text();
                }
            }
        });
    };

    // tencent
    translatorMap.tencent.startTranslate = function (translateText) {
        const endpoint = 'tmt.tencentcloudapi.com';
        const service = 'tmt';
        const date = new Date();
        const year = date.getUTCFullYear();
        const month = ('0' + (date.getUTCMonth() + 1)).slice(-2);
        const day = ('0' + date.getUTCDate()).slice(-2);
        let dateStr = `${year}-${month}-${day}`;
        const signedHeaders = 'content-type;host';
        const payload = JSON.stringify({ SourceText: translateText, Source: 'auto', Target: 'zh', ProjectId: 0 });
        const algorithm = 'TC3-HMAC-SHA256';
        const hashedCanonicalRequest = CryptoJS.SHA256(
            `POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:${endpoint}\n\n${signedHeaders}\n${CryptoJS.SHA256(payload)}`
        );
        const credentialScope = `${dateStr}/${service}/tc3_request`;
        const stringToSign = `${algorithm}\n${Math.floor(date.getTime() / 1000)}\n${credentialScope}\n${hashedCanonicalRequest}`;
        const signature = CryptoJS.HmacSHA256(
            stringToSign,
            CryptoJS.HmacSHA256('tc3_request', CryptoJS.HmacSHA256(service, CryptoJS.HmacSHA256(dateStr, 'TC3' + this.api.secret)))
        );
        const authorization = `${algorithm} Credential=${this.api.appid}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

        GM_xmlhttpRequest({
            method: 'POST',
            url: this.api.url,
            data: payload,
            timeout: REQUEST_TIMEOUT,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Host': endpoint,
                'X-TC-Action': 'TextTranslate',
                'X-TC-Region': 'ap-beijing',
                'X-TC-Timestamp': Math.floor(date.getTime() / 1000).toString(),
                'X-TC-Version': '2018-03-21',
                'Authorization': authorization,
                'Accept': 'application/json'
            },
            onload: (xhr) => {
                if (isXhrSuccess(xhr)) {
                    let json = strToJson(xhr.responseText);
                    if (json.Response) {
                        if (json.Response.TargetText) {
                            this.result.text = decodeURIComponent(json.Response.TargetText);
                            return;
                        }
                    }
                    this.result.text = JSON.stringify(json);
                }
            }
        });
    };

    // youdao
    translatorMap.youdao.getPosIndex = function (pos) {
        switch (pos) {
            case 'n.':
                return 1;
            case 'v.':
                return 2;
            case 'pron.':
                return 3;
            case 'adj.':
                return 4;
            case 'adv.':
                return 5;
            default:
                return 6;
        }
    };
    translatorMap.youdao.startTranslate = function (translateText) {
        GM_xmlhttpRequest({
            method: 'POST',
            url: this.url,
            data: `from=Auto&to=Auto&q=${encodeURIComponent(translateText)}`,
            timeout: REQUEST_TIMEOUT,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'accept-language': 'zh-CN,zh;q=0.6'
            },
            onload: (xhr) => {
                if (isXhrSuccess(xhr)) {
                    let result = strToJson(xhr.responseText);
                    this.result.text = result.translation[0];
                    this.result.dict = result.basic?.explains?.map((item) => {
                        let pos = item.substring(0, item.indexOf(' '));
                        return {
                            index: this.getPosIndex(pos),
                            pos: pos,
                            def: item.substring(item.indexOf(' '))
                        };
                    });
                }
            }
        });
    };

    function getSelection() {
        let selection = window.getSelection();
        let selectionText = selection ? selection.toString() : '';
        selectionText = selectionText.trim().replace(/\n/g, '');
        return selectionText;
    }
    function getSalt() {
        let salt = '';
        for (let i = 0; i < 5; i++) salt += Math.floor(Math.random() * 8);
        return salt;
    }
    function isXhrSuccess(xhr) {
        return xhr.readyState === 4 && xhr.status === 200;
    }
    function strToJson(str) {
        try {
            return new Function('return ' + str)();
        } catch (e) {}
        return {};
    }
})();
