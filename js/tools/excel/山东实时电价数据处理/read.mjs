import XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

const INPUT_DIR = 'C:/Users/Administrator/Downloads/实时电价/';
const OUTPUT_DIR = 'C:/Users/Administrator/Downloads/实时电价/out/';

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function convertWithCompression() {
    try {
        const files = fs.readdirSync(INPUT_DIR).filter(file => path.extname(file).toLowerCase() === '.xls');
        console.log(`🚀 开始处理 ${files.length} 个文件...`);

        for (const file of files) {
            const startTime = Date.now();
            const inputPath = path.join(INPUT_DIR, file);
            const outputPath = path.join(OUTPUT_DIR, file.replace(/\.xls$/i, '.xlsx'));

            // 1. 【XLSX】读取 .xls
            const fileBuffer = fs.readFileSync(inputPath);
            // cellNF: false, cellDates: true -> 让XLSX先把日期转好，但不要处理太复杂的数字格式，留给后面
            const xlsWorkbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });

            // 2. 【XLSX】在内存中转为 .xlsx Buffer (这是未压缩的巨型数据)
            const tempXlsxBuffer = XLSX.write(xlsWorkbook, { bookType: 'xlsx', type: 'buffer' });

            // 3. 【ExcelJS】读取这个 Buffer
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(tempXlsxBuffer);

     /*        // 4. 【数据清洗】(可选但强烈建议)
            // 此时数据已经在 ExcelJS 对象里了，我们循环一遍把“文本数字”转成“真数字”
            // 如果你不介意保留文本格式，可以把这一步删掉，代码会更短
            workbook.eachSheet(sheet => {
                sheet.eachRow((row) => {
                    row.eachCell((cell) => {
                        // 如果是文本类型
                        if (cell.type === ExcelJS.ValueType.String) {
                            const strVal = cell.value.trim();
                            // 尝试转数字（保留之前逻辑：0开头且无小数点的编号除外）
                            if (strVal !== '' && !isNaN(strVal)) {
                                const isID = strVal.startsWith('0') && strVal.length > 1 && !strVal.includes('.');
                                if (!isID) {
                                    cell.value = Number(strVal);
                                    // 自动补齐位数格式 (比如 1.2000)
                                    if (strVal.includes('.')) {
                                        const decimals = strVal.split('.')[1].length;
                                        cell.numFmt = '0.' + '0'.repeat(decimals);
                                    }
                                }
                            }
                        }
                    });
                });
            }); */

            // 5. 【ExcelJS】写入文件 (触发标准压缩)
            await workbook.xlsx.writeFile(outputPath);

            // 统计大小
            const oldSize = (fs.statSync(inputPath).size / 1024).toFixed(2);
            const newSize = (fs.statSync(outputPath).size / 1024).toFixed(2);
            console.log(`✅ ${file}: ${oldSize}KB -> ${newSize}KB (耗时 ${(Date.now() - startTime)}ms)`);
        }
    } catch (err) {
        console.error('❌ 错误:', err);
    }
}

convertWithCompression();
