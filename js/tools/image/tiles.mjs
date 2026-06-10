import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const imageDir = 'R:/Files/Workspace/Mine/pages/docs/single/nodes/src/'; // 替换为你的图像目录
const outputDir = 'R:/Files/Workspace/Mine/pages/docs/single/nodes/tiles/'; // 输出目录
const tileSize = 256;
const zoomLevels = [1, 2, 4, 8, 16]; // 缩放级别 (原图的 1/1, 1/2, 1/4)
const overwrite = false; // 是否覆盖已存在的瓦片 (true: 覆盖, false: 不覆盖)

generateTiles(imageDir, outputDir, tileSize, zoomLevels)
    .then(() => console.log('Tile generation completed!'))
    .catch(console.error);

/**
 * 切割图片为瓦片 (基于像素坐标系)
 */
async function generateTiles(imageDir, outputDir, tileSize, zoomLevels) {
    const tileInfo = {}; // 用于存储每个层级的信息

    for (let z = 0; z < zoomLevels.length; z++) {
        const zoom = zoomLevels[z];
        const imagePath = path.join(imageDir, `${zoom}x.png`);
        const metadata = await sharp(imagePath).metadata();
        const imageWidth = metadata.width;
        const imageHeight = metadata.height;

        console.log(`Image width: ${imageWidth}, height: ${imageHeight}`);

        const tilesX = Math.ceil(imageWidth / tileSize);
        const tilesY = Math.ceil(imageHeight / tileSize);

        console.log(`Processing zoom level ${z}...`);

        tileInfo[z] = {
            width: imageWidth,
            height: imageHeight,
            extent: [
                0, // minX - 左边界 (像素坐标)
                -imageHeight, // minY - 下边界 (像素坐标，向下为负)
                imageWidth, // maxX - 右边界 (像素坐标)
                0, // maxY - 上边界 (像素坐标)
            ],
            resolution: zoom, // resolution 与缩放级别相对应
        };
        for (let x = 0; x < tilesX; x++) {
            for (let y = 0; y < tilesY; y++) {
                const left = x * tileSize;
                const top = y * tileSize;
                const tileWidth = Math.min(tileSize, imageWidth - left);
                const tileHeight = Math.min(tileSize, imageHeight - top);

                const tileDir = path.join(outputDir, z.toString(), x.toString());
                const tilePath = path.join(tileDir, `${y}.png`);

                // 检查瓦片是否已存在
                if (!overwrite && fs.existsSync(tilePath)) {
                    console.log(`  Skipping existing tile: z=${z}, x=${x}, y=${y}`);
                    continue; // 如果瓦片已存在且不覆盖，则跳过
                }

                fs.mkdirSync(tileDir, { recursive: true });

                // 使用 extend 方法填充透明像素
                await sharp(imagePath)
                    .extract({ left, top, width: tileWidth, height: tileHeight })
                    .extend({
                        top: 0,
                        bottom: tileSize - tileHeight,
                        left: 0,
                        right: tileSize - tileWidth,
                        background: { r: 0, g: 0, b: 0, alpha: 0 }, // 透明背景
                    })
                    .toFile(tilePath);

                // 输出瓦片信息 (可选)
                console.log(`  Generated tile: z=${z}, x=${x}, y=${y}, left=${left}, top=${top}`);
            }
        }
        console.log(`Zoom level ${z} completed.`);
    }

    // 将层级信息写入 JSON 文件
    const tileInfoPath = path.join(outputDir, 'tileInfo.json');
    fs.writeFileSync(tileInfoPath, JSON.stringify(tileInfo, null, 2));
}
