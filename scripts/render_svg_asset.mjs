import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const [inputArg, outputArg, sizeArg = '96'] = process.argv.slice(2);
if (!inputArg || !outputArg) {
  throw new Error('Usage: node scripts/render_svg_asset.mjs <input.svg> <output.png> [size]');
}

const size = Number(sizeArg);
if (!Number.isInteger(size) || size <= 0) throw new Error(`Invalid size: ${sizeArg}`);

const input = resolve(inputArg);
const output = resolve(outputArg);
await mkdir(dirname(output), { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.goto(pathToFileURL(input).href, { waitUntil: 'load' });
  await page.evaluate(
    ({ width, height }) => {
      const svg = document.querySelector('svg');
      if (!svg) throw new Error('Input did not render an SVG root');
      document.documentElement.style.cssText = `width:${width}px;height:${height}px;margin:0;background:transparent;overflow:hidden`;
      svg.style.width = `${width}px`;
      svg.style.height = `${height}px`;
      svg.style.display = 'block';
    },
    { width: size, height: size },
  );
  await page.screenshot({ path: output, omitBackground: true });
} finally {
  await browser.close();
}

console.log(`Rendered ${input} -> ${output} (${size}x${size})`);
