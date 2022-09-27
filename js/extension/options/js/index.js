import { aside } from '../../common/js/options.js';
const { createApp, h } = Vue;
createApp({
    el: '#app',
    data() {
        return {
            a: 1,
            name: 'op'
        };
    },
    mounted() {},
    methods: {},
    render() {
        return [
            h('aside', aside('options')),
            h('article', [
                h('button', {
                    onClick: () => {
                        console.log(this.a++);
                    }
                })
            ]),
            h('aside')
        ];
    }
}).mount('#app');

export default null;
