import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Optional design tool: ImageMagick 7; no runtime or build dependency.
const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}public/social/rwc2027-card-v1.png`;
mkdirSync(`${root}public/social`, { recursive: true });
const referenceFonts = `${root}docs/design/reference/_ds/sunlit-matchday-design-system-347d00e7-60cf-4de5-975f-5d059faa1a3c/fonts/`;
const bodyFont = `${referenceFonts}SourceSans3-400-latin.woff2`;
const wordmarkFont = `${referenceFonts}SourceSans3-600-latin.woff2`;
const displayFont = `${root}src/assets/fonts/BarlowCondensed-700-latin.woff2`;
const paper = "#F7F3E8", ink = "#202A27", muted = "#5C665F", green = "#245C4A", clay = "#B84E32";
const args = ["-size", "1200x630", `xc:${paper}`, "-colorspace", "sRGB"];
const draw = (fill, stroke, width, shape) => args.push("-fill", fill, "-stroke", stroke, "-strokewidth", String(width), "-draw", shape);
const text = (font, size, fill, x, y, value) => args.push("-font", font, "-pointsize", String(size), "-fill", fill, "-stroke", "none", "-draw", `text ${x},${y} '${value}'`);

draw(green, "none", 0, "rectangle 0,0 1200,12");
text(wordmarkFont, 34, ink, 64, 88, "RWC / predictor");
text(displayFont, 34, clay, 910, 88, "AUSTRALIA 2027");
draw(clay, "none", 0, "rectangle 64,130 132,138");
text(displayFont, 108, ink, 60, 264, "YOUR PICKS.");
text(displayFont, 108, ink, 60, 390, "YOUR WORLD CUP.");
text(bodyFont, 34, muted, 64, 464, "Pick winners. Go deeper.");
text(bodyFont, 34, muted, 64, 509, "Share the link.");
text(bodyFont, 23, green, 64, 580, "rwc2027.myplaceforthings.com");

// An abstract bracket carries no invented teams, predictions or results.
draw("none", "#B9C9BD", 4, "path 'M 842,194 L 897,194 L 897,252 L 942,252 M 842,308 L 897,308 L 897,252 M 842,422 L 897,422 L 897,480 L 942,480 M 842,536 L 897,536 L 897,480'");
draw("none", green, 5, "path 'M 1022,252 L 1078,252 L 1078,366 L 1110,366 M 1022,480 L 1078,480 L 1078,366'");
for (const y of [174, 288, 402, 516]) {
  draw("#FFFFFF", "#D6D0C3", 2, `roundrectangle 792,${y} 842,${y + 40} 8,8`);
  draw("none", "#C4CBC3", 3, `line 805,${y + 20} 829,${y + 20}`);
}
for (const y of [224, 452]) {
  draw("#E6ECE3", green, 2, `roundrectangle 942,${y} 1022,${y + 56} 10,10`);
  draw("none", green, 3, `path 'M 962,${y + 29} L 971,${y + 37} L 1000,${y + 19}'`);
}
draw(green, "none", 0, "roundrectangle 1092,325 1162,407 13,13");
draw(paper, "none", 0, "ellipse 1127,366 16,29 0,360");
draw("none", green, 3, "path 'M 1127,349 L 1127,383 M 1120,357 L 1134,357 M 1120,366 L 1134,366 M 1120,375 L 1134,375'");
args.push("-depth", "8", "-strip", "-define", "png:color-type=2", output);
const rendered = spawnSync("magick", args, { stdio: "inherit" });
if (rendered.error) throw rendered.error;
if (rendered.status !== 0) throw new Error("Social card rendering failed.");
console.log(output);
