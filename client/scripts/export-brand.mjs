import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = join(workspaceRoot, 'public');
const brandRoot = join(publicRoot, 'brand');
const sourcePath = join(brandRoot, 'source', 'trainlead-source.png');
const exportRoot = join(brandRoot, 'exports');
const fullRoot = join(exportRoot, 'full');
const iconRoot = join(exportRoot, 'icon');
const wordmarkRoot = join(exportRoot, 'wordmark');
const fullWidths = [2048, 1600, 1200, 800, 600, 400, 200, 128, 64];
const iconSizes = [1024, 512, 256, 192, 180, 128, 96, 64, 48, 32, 24, 16];

await Promise.all([mkdir(fullRoot, { recursive: true }), mkdir(iconRoot, { recursive: true }), mkdir(wordmarkRoot, { recursive: true })]);

const sourceMeta = await sharp(sourcePath).metadata();
if (!sourceMeta.width || !sourceMeta.height || sourceMeta.width < 1900 || sourceMeta.height < 500) {
  throw new Error('Logo source dimensions are unexpected; check client/public/brand/source/trainlead-source.png.');
}

const source = await readFile(sourcePath);
const fullCrop = await sharp(source).trim({ background: '#ffffff', threshold: 10 }).png().toBuffer();
const iconCrop = await sharp(source)
  .extract({ left: 190, top: 145, width: 640, height: 480 })
  .png()
  .toBuffer();
const wordmarkCrop = await sharp(source)
  .extract({ left: 815, top: 265, width: 1180, height: 275 })
  .png()
  .toBuffer();

async function removeWhiteMatte(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const tealPixel = green > red;
    const baseChannel = tealPixel ? red : blue;
    const baseValue = tealPixel ? 8 : 31;
    let alpha = (255 - baseChannel) / (255 - baseValue);
    alpha = Math.max(0, Math.min(1, alpha));
    if (alpha < 0.02) {
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      data[offset + 3] = 0;
      continue;
    }
    const backgroundPart = 255 * (1 - alpha);
    data[offset] = Math.max(0, Math.min(255, Math.round((red - backgroundPart) / alpha)));
    data[offset + 1] = Math.max(0, Math.min(255, Math.round((green - backgroundPart) / alpha)));
    data[offset + 2] = Math.max(0, Math.min(255, Math.round((blue - backgroundPart) / alpha)));
    data[offset + 3] = Math.round(alpha * 255);
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

async function writeVariants(master, folder, prefix) {
  const png = await removeWhiteMatte(master);
  const metadata = await sharp(png).metadata();
  const sizes = prefix === 'trainlead-icon' ? iconSizes : fullWidths;
  const files = [];
  for (const size of sizes) {
    const resized = prefix === 'trainlead-icon'
      ? sharp(png).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      : sharp(png).resize({ width: size, withoutEnlargement: false });
    const pngPath = join(folder, `${prefix}-${size}.png`);
    const webpPath = join(folder, `${prefix}-${size}.webp`);
    await resized.clone().png().toFile(pngPath);
    await resized.clone().webp({ quality: 92, alphaQuality: 100 }).toFile(webpPath);
    files.push({ size, pngPath, webpPath });
    if (prefix !== 'trainlead-icon' && [2048, 1200, 800, 400].includes(size)) {
      await resized.clone().flatten({ background: '#ffffff' }).jpeg({ quality: 94, mozjpeg: true }).toFile(join(folder, `${prefix}-${size}.jpg`));
    }
  }

  const masterPath = join(folder, `${prefix}-master.png`);
  await sharp(png).png().toFile(masterPath);
  return { png, masterPath, metadata, files };
}

const full = await writeVariants(fullCrop, fullRoot, 'trainlead-full');
const icon = await writeVariants(iconCrop, iconRoot, 'trainlead-icon');
const wordmark = await writeVariants(wordmarkCrop, wordmarkRoot, 'trainlead-wordmark');

function svgRasterWrapper(name, imageBuffer, width, height) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title"><title id="title">${name}</title><image width="${width}" height="${height}" href="data:image/png;base64,${imageBuffer.toString('base64')}"/></svg>\n`;
}

await writeFile(join(brandRoot, 'trainlead-full.svg'), svgRasterWrapper('TrainLead', full.png, full.metadata.width, full.metadata.height));
await writeFile(join(brandRoot, 'trainlead-icon.svg'), svgRasterWrapper('TrainLead icon', icon.png, icon.metadata.width, icon.metadata.height));
await writeFile(join(brandRoot, 'trainlead-wordmark.svg'), svgRasterWrapper('TrainLead wordmark', wordmark.png, wordmark.metadata.width, wordmark.metadata.height));
await writeFile(join(publicRoot, 'favicon.ico'), await pngToIco(icon.files.filter((file) => [16, 32, 48].includes(file.size)).map((file) => file.pngPath)));
await writeFile(join(publicRoot, 'site.webmanifest'), JSON.stringify({
  name: 'TrainLead',
  short_name: 'TrainLead',
  icons: [
    { src: '/brand/exports/icon/trainlead-icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/brand/exports/icon/trainlead-icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
  theme_color: '#087a75',
  background_color: '#ffffff',
  display: 'standalone',
}, null, 2) + '\n');

console.log(JSON.stringify({
  source: { width: sourceMeta.width, height: sourceMeta.height },
  full: { width: full.metadata.width, height: full.metadata.height, variants: full.files.length },
  icon: { width: icon.metadata.width, height: icon.metadata.height, variants: icon.files.length },
  wordmark: { width: wordmark.metadata.width, height: wordmark.metadata.height, variants: wordmark.files.length },
  favicon: 'client/public/favicon.ico',
}, null, 2));
