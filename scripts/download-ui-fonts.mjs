import { mkdir, writeFile } from "node:fs/promises";
await mkdir("ui/fonts", { recursive: true });
const fonts = [
  { name: "Public+Sans:wght@400..800", file: "body.ttf", license: "publicsans" },
  { name: "IBM+Plex+Mono:wght@400", file: "mono.ttf", license: "ibmplexmono" },
];
for (const font of fonts) {
  const response = await fetch(`https://fonts.googleapis.com/css2?family=${font.name}&display=swap`, {
    headers: { "User-Agent": "Mozilla/5.0 Chrome/131.0.0.0 Safari/537.36" },
  });
  if (!response.ok) throw new Error(`Font CSS: ${response.status}`);
  const css = await response.text();
  const url = [...css.matchAll(/url\((https:[^)]+)\)/g)].at(-1)?.[1];
  if (!url) throw new Error("No font file found.");
  const asset = await fetch(url);
  if (!asset.ok) throw new Error(`Font file: ${asset.status}`);
  const bytes = Buffer.from(await asset.arrayBuffer());
  if (bytes.readUInt32BE(0) !== 0x00010000) throw new Error("Expected a TrueType font; update the asset format before saving.");
  await writeFile(`ui/fonts/${font.file}`, bytes);
  const license = await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${font.license}/OFL.txt`);
  if (!license.ok) throw new Error(`Font license: ${license.status}`);
  await writeFile(`ui/fonts/${font.license}-OFL.txt`, await license.text());
  console.log(`Saved ${font.file}`);
}
