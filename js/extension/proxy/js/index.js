import { aside } from '../../common/js/options.js';

const { createApp, h } = Vue;
createApp({
    el: '#app',
    data() {
        return {};
    },
    mounted() {},
    methods: {},
    render() {
        return [h('aside', aside('proxy')), h('article', ['asd']), h('aside')];
    }
}).mount('#app');

export default null;
