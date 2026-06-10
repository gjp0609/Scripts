export default {
    printWidth: 120, // 一行最多 120 字符
    tabWidth: 4, // 使用 4 个空格缩进
    useTabs: false, // 不使用缩进符，而使用空格
    semi: true, // 行尾需要有分号
    singleQuote: true, // 使用单引号
    quoteProps: 'consistent', // 如果对象中至少有一个属性需要引号，则引用所有属性
    jsxSingleQuote: false, // 在 JSX 中使用双引号
    trailingComma: 'all', // 末尾逗号
    bracketSpacing: true, // 大括号内的首尾需要空格
    bracketSameLine: false, // 多行HTML标签的反尖括号换行
    arrowParens: 'always', // 箭头函数，只有一个参数的时候，也需要括号
    rangeStart: 0, // 每个文件格式化的范围是文件的全部内容
    rangeEnd: Infinity, // 每个文件格式化的范围是文件的全部内容
    requirePragma: false, // 不需要写文件开头的 @prettier
    insertPragma: false, // 不需要自动在文件开头插入 @prettier
    proseWrap: 'preserve', // 使用默认的折行标准
    htmlWhitespaceSensitivity: 'strict', // 根据显示样式决定 html 要不要折行
    vueIndentScriptAndStyle: true, // 根据显示样式决定 html 要不要折行
    endOfLine: 'lf', // 换行符使用 lf
    embeddedLanguageFormatting: 'auto', // 格式化文件中嵌入的引用代码
    singleAttributePerLine: false, // 不强制每行一个属性
}
