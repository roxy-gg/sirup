/**
 * Asserts the surface treatment compiles into real CSS.
 *
 * The border work is the kind that silently degrades: a typo in a token name
 * yields an empty custom property and the border just vanishes, with no build
 * error and nothing in the console. These checks read the built stylesheet and
 * confirm each piece is actually present.
 *
 * Usage: npm run check:surfaces
 */
import fs from "node:fs";
import path from "node:path";
import { Checks } from "./_harness.js";

const t = new Checks("Surface + border treatment");

const distDir = "dist/assets";
if (!fs.existsSync(distDir)) {
  console.log("No dist/. Run `npm run build` first.");
  process.exit(1);
}

const cssFile = fs
  .readdirSync(distDir)
  .find((file) => file.endsWith(".css"));
if (!cssFile) {
  console.log("No built stylesheet found.");
  process.exit(1);
}

const css = fs.readFileSync(path.join(distDir, cssFile), "utf8");
const source = fs.readFileSync("app/src/index.css", "utf8");

// --- the three utilities must exist in the output ---
for (const utility of [".surface{", ".surface-flat{", ".surface-overlay{"]) {
  t.check(`${utility.slice(0, -1)} is emitted`, css.includes(utility));
}

// --- every token the utilities reference must be defined ---
// A missing definition resolves to an empty value and the rule silently
// no-ops, which is exactly the failure this file exists to catch.
const referenced = [
  ...new Set(
    [...css.matchAll(/var\((--(?:border-hairline|edge-[a-z]+|surface-tint))\)/g)].map(
      (match) => match[1]!,
    ),
  ),
];
const undefinedTokens = referenced.filter(
  (token) => !new RegExp(`${token}\\s*:`).test(css),
);
t.check(
  "every edge token the utilities use is defined",
  undefinedTokens.length === 0,
  undefinedTokens.join(", ") || `${referenced.length} tokens`,
);

// --- both themes must define them, or one theme loses its borders ---
for (const token of ["--edge-highlight", "--edge-shade", "--surface-tint"]) {
  const count = [...css.matchAll(new RegExp(`${token}\\s*:`, "g"))].length;
  t.check(`${token} is defined for both themes`, count >= 2, `${count} definitions`);
}

// --- the hairline must downshift on retina ---
// 0.5px is spec'd behaviour (CSS Values 4 rounds up only *below* one device
// pixel), not a hack, but it only applies inside the media query.
t.check(
  "hairline is 1px by default",
  /--border-hairline:\s*1px/.test(css),
);
t.check(
  "hairline drops to 0.5px on 2x displays",
  /--border-hairline:\s*\.?0?\.5px/.test(css),
);
t.check(
  "the retina downshift is inside a resolution query",
  /min-resolution:\s*192dpi|-webkit-min-device-pixel-ratio:\s*2/.test(css),
);

// --- the inset highlight must be a top edge, and the shade a bottom edge ---
// Sign errors here are invisible in code review but obvious on screen: a
// negative Y on the highlight lights the wrong edge.
const surfaceRule = css.slice(css.indexOf(".surface{"), css.indexOf(".surface{") + 400);
t.check(
  "highlight is inset on the top edge (positive Y)",
  /inset 0 var\(--border-hairline\) 0 var\(--edge-highlight\)/.test(surfaceRule),
);
t.check(
  "shade is inset on the bottom edge (negative Y)",
  /inset 0 calc\(-1 \* var\(--border-hairline\)\) 0 var\(--edge-shade\)/.test(
    surfaceRule,
  ),
);

// --- borders must be translucent, so one token works at any surface depth ---
t.check(
  "border tokens are translucent, not solid grey",
  /--border-translucent-strong:\s*#(?:ffffff|000000)14/.test(css),
);

// --- drop shadows should be gone from everything except overlays ---
const shadowUtilities = [...source.matchAll(/shadow-(?:sm|md|lg|xl|2xl)\b/g)];
t.check(
  "no default Tailwind drop shadows remain in the theme",
  shadowUtilities.length === 0,
  shadowUtilities.map((m) => m[0]).join(", "),
);

t.finish();
