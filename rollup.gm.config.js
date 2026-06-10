import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import postcss from 'rollup-plugin-postcss';
import polyfillNode from 'rollup-plugin-polyfill-node';
import fs from 'fs';
import postcssLess from 'postcss-less';
import path from 'path';

// 从环境变量中获取入口文件和输出文件
const input = process.env.INPUT; // 输入文件
const output = process.env.OUTPUT; // 输出文件

if (!input || !output) {
    throw new Error('请通过环境变量指定入口文件和输出文件');
}

const outputJsFilePath = path.resolve(output);
const outputCssFilePath = outputJsFilePath.replace('.js', '.css');

export default {
    input, // 动态入口文件
    output: {
        file: output,
        format: 'iife',
        name: `${input.split('/').pop().replace('.js', '')}Bundle`,
        inlineDynamicImports: true,
    },
    onwarn(warning, warn) {
        if (warning.code === 'CIRCULAR_DEPENDENCY' || warning.code === 'EVAL') {
            return;
        }
        warn(warning);
    },
    plugins: [
        nodeResolve({ browser: true }),
        commonjs(),
        postcss({
            extract: outputCssFilePath,
            minimize: true,
            parser: postcssLess,
        }),
        polyfillNode(),
        terser({
            format: {
                comments: false,
            },
        }),
        postBuildInject(),
    ],
};
function postBuildInject() {
    return {
        name: 'post-build-inject',
        // 使用 writeBundle 钩子，它在所有文件都写入磁盘后执行
        async writeBundle() {
            console.log(`[InjectPlugin] 开始进行构建后注入...`);
            try {
                // 读取 UserScript 头部
                const bannerHeader =
                    fs.readFileSync(input, 'utf-8').split('==/UserScript==')[0] + '==/UserScript==\n\n';

                // 尝试读取 CSS 文件
                let cssContent = '';
                try {
                    cssContent = fs.readFileSync(outputCssFilePath, 'utf-8');
                    console.log(`[InjectPlugin] 成功读取 CSS 文件。`);
                    fs.unlinkSync(outputCssFilePath);
                } catch (cssError) {
                    console.warn(`[InjectPlugin] 警告: 未找到 CSS 文件，将只注入头部。`);
                }

                // 读取刚刚由 Rollup 生成的 JS 文件内容
                const jsContent = fs.readFileSync(outputJsFilePath, 'utf-8');

                let finalContent = '';
                if (cssContent.trim()) {
                    const styleBlock = `GM_addStyle(\`${cssContent.trim()}\`);\n`;
                    // 组合：头部 + 样式 + 原JS内容
                    finalContent = bannerHeader + styleBlock + jsContent;
                } else {
                    // 组合：头部 + 原JS内容
                    finalContent = bannerHeader + jsContent;
                }

                // 将最终的内容覆盖写回 JS 文件
                fs.writeFileSync(outputJsFilePath, finalContent, 'utf-8');
                console.log(`[InjectPlugin] 注入完成，最终 JS 文件已更新。`);
            } catch (e) {
                console.error(`[InjectPlugin] 在注入过程中发生致命错误:`, e);
            }
        },
    };
}
