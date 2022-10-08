import { aside } from '../../common/js/aside.js';

const { createApp, h } = Vue;
createApp({
    el: '#app',
    data() {
        return {};
    },
    mounted() {},
    methods: {},
    render() {
        return [h('aside', aside('test')), h('article', [h('div', { class: 'title' }, [chrome.i18n.getMessage('test_title')]), 'asd']), h('aside')];
    }
}).mount('#app');

export default null;
