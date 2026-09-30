/**
 * CSS coverage check.
 *
 * Run:  node scripts/check-css-coverage.mjs
 *
 * Every class the components reference should have a rule in the stylesheet, and
 * every class the stylesheet defines should still be referenced (or knowingly
 * deported). This guards the visual refactor against silently dropping a class
 * that the UI depends on.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const SOURCE_DIRS = ["app", "components", "features"];
const CSS_FILES = ["app/globals.css", "app/glass.css"];

function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry.startsWith(".")) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, out);
        else out.push(full);
    }
    return out;
}

const sourceFiles = SOURCE_DIRS.flatMap((d) => {
    try {
        return walk(d);
    } catch {
        return [];
    }
}).filter((f) => [".tsx", ".ts", ".jsx"].includes(extname(f)));

// ---------------------------------------------------------------------------
// Classes referenced by components: pull every string literal in className
// position plus the class arrays, then keep plausible class tokens.
// ---------------------------------------------------------------------------

const used = new Set();
const IGNORE = new Set([
    "use", "client", "button", "input", "type", "checkbox", "text", "name",
    "presentation", "dialog", "status", "aria", "true", "false",
]);

for (const file of sourceFiles) {
    const text = readFileSync(file, "utf8");

    // className="a b c"  and  className={"a b c"}
    for (const m of text.matchAll(/className=(?:"([^"]*)"|\{"([^"]*)"\})/g)) {
        const value = m[1] ?? m[2] ?? "";
        for (const token of value.split(/\s+/)) if (token) used.add(token);
    }

    // class arrays: ["a", cond ? "b" : "", "c"].join(...)
    for (const m of text.matchAll(/\[([^[\]]*)\]\.filter\(Boolean\)\.join|\[([^[\]]*)\]\.join/g)) {
        const block = m[1] ?? m[2] ?? "";
        for (const s of block.matchAll(/"([^"]*)"/g)) {
            for (const token of s[1].split(/\s+/)) if (token) used.add(token);
        }
    }

    // conditional single-class props: className={x ? "a" : "b"}
    for (const m of text.matchAll(/className=\{[^}]*\?[^}]*\}/g)) {
        for (const s of m[0].matchAll(/"([^"]*)"/g)) {
            for (const token of s[1].split(/\s+/)) if (token) used.add(token);
        }
    }
}

for (const token of [...used]) {
    if (IGNORE.has(token)) used.delete(token);
}

// ---------------------------------------------------------------------------
// Classes defined by the stylesheet
// ---------------------------------------------------------------------------

const defined = new Set();
for (const cssFile of CSS_FILES) {
    let css;
    try {
        css = readFileSync(cssFile, "utf8");
    } catch {
        continue;
    }
    css = css.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) defined.add(m[1]);
}

// Classes emitted only by the engine / dynamic joins we cannot see statically.
const RUNTIME_OR_DYNAMIC = new Set([
    // toggled by React state via template joins
    "reduced-motion", "wide", "large", "final", "active", "active-turn",
    "player-turn", "opponent-turn", "opponent-choice", "face-up", "is-king",
    "chosen", "shattered", "faint", "settled", "roaming", "compact", "selected",
    "unavailable", "dealing", "danger", "victory", "tight",
]);

const missing = [...used].filter((c) => !defined.has(c) && !RUNTIME_OR_DYNAMIC.has(c)).sort();
const orphaned = [...defined].filter((c) => !used.has(c) && !RUNTIME_OR_DYNAMIC.has(c)).sort();

console.log(`scanned ${sourceFiles.length} source files`);
console.log(`referenced classes: ${used.size}`);
console.log(`defined classes:    ${defined.size}`);

console.log(`\nMISSING (referenced but no CSS rule) — ${missing.length}`);
for (const c of missing) console.log(`  ${c}`);

console.log(`\nORPHANED (CSS rule but never referenced) — ${orphaned.length}`);
for (const c of orphaned) console.log(`  ${c}`);
