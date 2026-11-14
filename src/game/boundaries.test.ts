// Boundary and scan test (task 1.3).
//
// Scans the non-test source files under src/game/** and the game scripts under scripts/ and fails
// on the module-boundary, determinism, information-isolation and network rules of design.md
// (Architecture, "Rules enforced by the boundary test").
//
// The scanner is a pure function (`scanSource`) so that it can be unit-tested with fixture strings.
// Comments, string literals, template text and regex literals are blanked before matching, except
// that import specifiers are extracted first from the string tokens, so documentation does not
// trigger the scan but import paths stay visible to the import rules.

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------------------------

export type RuleId =
  | "optical-import"
  | "node-import"
  | "dom-global"
  | "nondeterminism"
  | "ai-internal-import"
  | "network-api"
  | "score-table";

export interface Violation {
  readonly rule: RuleId;
  readonly file: string;
  readonly line: number;
  readonly match: string;
}

/** The only file that may import `src/optical` (a test file, so the scan never reads it anyway). */
const OPTICAL_ALLOW_LIST: readonly string[] = ["src/game/core/fragment-layout.parity.test.ts"];
/** The only file that may use network APIs. */
const NETWORK_ALLOWED_FILE = "src/game/ui/public/sw.js";
/** The only file that may hold a numeric score table. */
const SCORE_TABLE_OWNER = "src/game/core/score.ts";
/** Game scripts named in design.md (Folder Layout). Other scripts under scripts/ belong to src/optical. */
const GAME_SCRIPTS: readonly string[] = ["scripts/build-sw.ts", "scripts/simulate.ts"];

const NODE_IMPORT_AREAS = new Set(["core", "ai", "persistence", "ui"]);
const PURE_AREAS = new Set(["core", "ai"]);

interface Stripped {
  /** Same length as the source; comments, string contents, template text and regex literals blanked. */
  readonly code: string;
  readonly strings: readonly { readonly start: number; readonly value: string }[];
}

const KEYWORDS_BEFORE_REGEX = new Set([
  "return", "typeof", "case", "in", "of", "delete", "void", "throw", "new", "else", "do", "instanceof", "yield", "await",
]);

const isIdentChar = (c: string): boolean => /[\w$]/.test(c);
const blank = (c: string): string => (c === "\n" || c === "\r" ? c : " ");

export function strip(source: string): Stripped {
  const n = source.length;
  const code: string[] = [];
  const strings: { start: number; value: string }[] = [];
  const templateStack: number[] = [];
  let braceDepth = 0;
  let lastSig = "";
  let i = 0;

  const emitCode = (c: string): void => {
    code.push(c);
    if (!/\s/.test(c)) lastSig = c;
  };

  // Consumes template text from `start` up to a closing backtick or a `${`. Returns the next index.
  const scanTemplateText = (start: number): number => {
    let j = start;
    while (j < n) {
      const c = source[j] as string;
      if (c === "\\") {
        code.push(" ");
        if (j + 1 < n) code.push(blank(source[j + 1] as string));
        j += 2;
      } else if (c === "`") {
        code.push("`");
        lastSig = "`";
        return j + 1;
      } else if (c === "$" && source[j + 1] === "{") {
        code.push(" ", " ");
        templateStack.push(braceDepth);
        lastSig = "{";
        return j + 2;
      } else {
        code.push(blank(c));
        j++;
      }
    }
    return j;
  };

  const lastWord = (): string => {
    let end = code.length;
    while (end > 0 && /\s/.test(code[end - 1] as string)) end--;
    let begin = end;
    while (begin > 0 && isIdentChar(code[begin - 1] as string)) begin--;
    return code.slice(begin, end).join("");
  };

  const regexAllowed = (): boolean => {
    if (lastSig === "") return true;
    if (isIdentChar(lastSig)) return KEYWORDS_BEFORE_REGEX.has(lastWord());
    return "(,=:[!&|?{};+-*%<>~^".includes(lastSig);
  };

  while (i < n) {
    const c = source[i] as string;
    const next = source[i + 1];

    if (c === "/" && next === "/") {
      while (i < n && source[i] !== "\n") {
        code.push(" ");
        i++;
      }
    } else if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      for (; i < stop; i++) code.push(blank(source[i] as string));
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      let value = "";
      while (j < n && source[j] !== c && source[j] !== "\n") {
        if (source[j] === "\\" && j + 1 < n) {
          value += source[j + 1];
          j += 2;
        } else {
          value += source[j];
          j++;
        }
      }
      strings.push({ start: i, value });
      emitCode(c);
      for (let k = i + 1; k < j; k++) code.push(" ");
      if (j < n && source[j] === c) {
        emitCode(c);
        j++;
      }
      lastSig = c;
      i = j;
    } else if (c === "`") {
      emitCode("`");
      i = scanTemplateText(i + 1);
    } else if (c === "{") {
      braceDepth++;
      emitCode(c);
      i++;
    } else if (c === "}") {
      if (templateStack.length > 0 && templateStack[templateStack.length - 1] === braceDepth) {
        templateStack.pop();
        code.push(" ");
        i = scanTemplateText(i + 1);
      } else {
        braceDepth--;
        emitCode(c);
        i++;
      }
    } else if (c === "/" && regexAllowed()) {
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < n && source[j] !== "\n") {
        const d = source[j] as string;
        if (d === "\\") j += 2;
        else if (d === "[") { inClass = true; j++; }
        else if (d === "]") { inClass = false; j++; }
        else if (d === "/" && !inClass) { closed = true; j++; break; }
        else j++;
      }
      if (closed) {
        for (let k = i; k < j; k++) code.push(" ");
        lastSig = "v"; // a value: a following "/" is a division
        i = j;
      } else {
        emitCode(c);
        i++;
      }
    } else {
      emitCode(c);
      i++;
    }
  }
  return { code: code.join(""), strings };
}

const IMPORT_PREFIX = /(?:\bfrom|\bimport\s*\(|\bimport|\brequire\s*\()\s*$/;

/** Import specifiers: string tokens that follow `from`, `import`, `import(` or `require(`. */
function importSpecifiers(stripped: Stripped): { value: string; index: number }[] {
  const out: { value: string; index: number }[] = [];
  for (const s of stripped.strings) {
    const before = stripped.code.slice(Math.max(0, s.start - 40), s.start);
    if (IMPORT_PREFIX.test(before)) out.push({ value: s.value, index: s.start });
  }
  return out;
}

const normalizePath = (path: string): string => path.replace(/\\/g, "/").replace(/^\.\//, "");

function areaOf(path: string): string | undefined {
  const m = /^src\/game\/([^/]+)\//.exec(path);
  return m ? m[1] : undefined;
}

/** Name of the global itself, or the same name reached through globalThis, window or self. */
function globalRef(nameSource: string): RegExp {
  return new RegExp(`(?<![\\w$.])${nameSource}\\b|\\b(?:globalThis|window|self)\\s*\\.\\s*${nameSource}\\b`, "g");
}

const DOM_GLOBALS = globalRef("(?:window|document|localStorage|navigator)");
const NONDETERMINISM: readonly RegExp[] = [
  /\bMath\s*\.\s*random\b/g,
  globalRef("Date"),
  globalRef("performance\\s*\\.\\s*now"),
  globalRef("crypto"),
];
const NETWORK: readonly RegExp[] = [
  globalRef("fetch"),
  globalRef("XMLHttpRequest"),
  globalRef("WebSocket"),
  /\bsendBeacon\b/g,
];
const SCORE_TABLE = /\brewardByError\s*[:=]\s*\[/g;
const SCORE_TABLE_QUOTED_KEY = /["']rewardByError["']\s*:\s*\[/g;
const AI_INTERNAL_IMPORT = /(?:^|\/)core\/(?:state|engine|deck|replay|rules)(?:\.[cm]?[jt]sx?)?$/;

/** Scans one file. `path` is relative to the repository root, e.g. `src/game/core/engine.ts`. */
export function scanSource(path: string, source: string): Violation[] {
  const file = normalizePath(path);
  const area = areaOf(file);
  const stripped = strip(source);
  const code = stripped.code;
  const violations: Violation[] = [];

  const lineAt = (index: number): number => {
    let line = 1;
    for (let k = 0; k < index; k++) if (code[k] === "\n") line++;
    return line;
  };
  const add = (rule: RuleId, index: number, match: string): void => {
    violations.push({ rule, file, line: lineAt(index), match });
  };
  // `{ document: 1 }` and `, window: x` are property names, not uses of the global.
  const isPropertyKey = (start: number, end: number): boolean => {
    let a = start - 1;
    while (a >= 0 && /\s/.test(code[a] as string)) a--;
    let b = end;
    while (b < code.length && /\s/.test(code[b] as string)) b++;
    return code[b] === ":" && (code[a] === "{" || code[a] === ",");
  };
  const scan = (rule: RuleId, patterns: readonly RegExp[]): void => {
    for (const pattern of patterns) {
      for (const m of code.matchAll(pattern)) {
        const index = m.index ?? 0;
        if (isPropertyKey(index, index + m[0].length)) continue;
        add(rule, index, m[0]);
      }
    }
  };

  // Import rules (specifiers come from the string tokens).
  for (const spec of importSpecifiers(stripped)) {
    if (spec.value.toLowerCase().includes("optical") && !OPTICAL_ALLOW_LIST.includes(file)) {
      add("optical-import", spec.index, spec.value);
    }
    if (area !== undefined && NODE_IMPORT_AREAS.has(area) && spec.value.startsWith("node:")) {
      add("node-import", spec.index, spec.value);
    }
    if (area === "ai" && AI_INTERNAL_IMPORT.test(spec.value)) {
      add("ai-internal-import", spec.index, spec.value);
    }
  }

  // Determinism and DOM isolation in core/ and ai/.
  if (area !== undefined && PURE_AREAS.has(area)) {
    scan("dom-global", [DOM_GLOBALS]);
    scan("nondeterminism", NONDETERMINISM);
  }

  // Network APIs everywhere except the service worker.
  if (file !== NETWORK_ALLOWED_FILE) scan("network-api", NETWORK);

  // Numeric score tables outside core/score.ts.
  if (file !== SCORE_TABLE_OWNER) {
    scan("score-table", [SCORE_TABLE]);
    // A quoted key keeps its text only in the raw source (string contents are blanked in `code`).
    for (const m of source.matchAll(SCORE_TABLE_QUOTED_KEY)) {
      const index = m.index ?? 0;
      if (code[index] === '"' || code[index] === "'") add("score-table", index, m[0]);
    }
  }

  return violations.sort((x, y) => x.line - y.line);
}

const SCANNED_EXTENSIONS = /\.(?:[cm]?[jt]sx?)$/;
const TEST_FILE = /\.(?:test|spec)(?:-d)?\.[cm]?[jt]sx?$/; // includes type tests such as types.test-d.ts

function walk(root: string, dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(join(root, dir));
  } catch {
    return; // folder does not exist yet: nothing to scan
  }
  for (const name of entries.sort()) {
    if (name === "node_modules" || name === "dist") continue;
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) walk(root, rel, out);
    else if (SCANNED_EXTENSIONS.test(name) && !TEST_FILE.test(name)) out.push(rel);
  }
}

/** Files scanned for a repository root: non-test files under src/game and the game scripts that exist. */
export function listScannedFiles(root: string): string[] {
  const files: string[] = [];
  walk(root, "src/game", files);
  for (const script of GAME_SCRIPTS) {
    try {
      if (statSync(join(root, script)).isFile()) files.push(script);
    } catch {
      // script not created yet
    }
  }
  return files;
}

export function scanTree(root: string): Violation[] {
  return listScannedFiles(root).flatMap((file) => scanSource(file, readFileSync(join(root, file), "utf8")));
}

const format = (vs: readonly Violation[]): string => vs.map((v) => `${v.file}:${v.line} [${v.rule}] ${v.match}`).join("\n");

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const rules = (path: string, source: string): RuleId[] => scanSource(path, source).map((v) => v.rule);

describe("boundary scan of the real tree", () => {
  it("has no violations (vacuous while the folders are empty)", () => {
    expect(format(scanTree(REPO_ROOT))).toBe("");
  });

  it("does not scan test files", () => {
    expect(listScannedFiles(REPO_ROOT).filter((f) => TEST_FILE.test(f))).toEqual([]);
  });

  it("returns no files and no violations for a root without src/game", () => {
    const root = mkdtempSync(join(tmpdir(), "boundary-empty-"));
    try {
      expect(listScannedFiles(root)).toEqual([]);
      expect(scanTree(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails on a planted violation in a temporary file", () => {
    const root = mkdtempSync(join(tmpdir(), "boundary-plant-"));
    try {
      mkdirSync(join(root, "src/game/core"), { recursive: true });
      writeFileSync(join(root, "src/game/core/planted.ts"), "export const r = Math.random();\n");
      writeFileSync(join(root, "src/game/core/planted.test.ts"), "export const r = Math.random();\n");
      writeFileSync(join(root, "src/game/core/planted.test-d.ts"), "export const r = Math.random();\n");
      const found = scanTree(root);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ rule: "nondeterminism", file: "src/game/core/planted.ts", line: 1 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("rule: no import path containing 'optical'", () => {
  it("flags static, type, side-effect, re-export, dynamic and require forms", () => {
    const path = "src/game/sim/x.ts";
    expect(rules(path, `import { a } from "../../optical/codec";`)).toEqual(["optical-import"]);
    expect(rules(path, `import type { A } from '../../optical/types';`)).toEqual(["optical-import"]);
    expect(rules(path, `import "../../optical/side";`)).toEqual(["optical-import"]);
    expect(rules(path, `export { a } from "../../optical/codec";`)).toEqual(["optical-import"]);
    expect(rules(path, `const m = await import("../../optical/codec");`)).toEqual(["optical-import"]);
    expect(rules(path, `const m = require("../../optical/codec");`)).toEqual(["optical-import"]);
  });
  it("applies to the game scripts too", () => {
    expect(rules("scripts/simulate.ts", `import { a } from "../src/optical/fragments";`)).toEqual(["optical-import"]);
    expect(rules("scripts/build-sw.ts", `import { a } from "../src/optical/fragments";`)).toEqual(["optical-import"]);
  });
  it("allows only the parity test", () => {
    const src = `import { a } from "../../../optical/fragments";`;
    expect(rules("src/game/core/fragment-layout.parity.test.ts", src)).toEqual([]);
    expect(rules("src/game/core/other.parity.test.ts", src)).toEqual(["optical-import"]);
  });
  it("passes clean imports, comments and string mentions", () => {
    const path = "src/game/sim/x.ts";
    expect(rules(path, `import { a } from "../core/cards";`)).toEqual([]);
    expect(rules(path, `// import { a } from "../../optical/codec";\n/* optical */ const x = 1;`)).toEqual([]);
    expect(rules(path, `const label = "see src/optical for the optical module";`)).toEqual([]);
    expect(rules(path, `const o = { from: "optical" };`)).toEqual([]);
  });
});

describe("rule: no node: import in core/, ai/, persistence/, ui/", () => {
  it("flags node: imports in the four folders", () => {
    for (const area of ["core", "ai", "persistence", "ui"]) {
      expect(rules(`src/game/${area}/x.ts`, `import { readFileSync } from "node:fs";`)).toEqual(["node-import"]);
    }
    expect(rules("src/game/core/x.ts", `const fs = await import("node:fs");`)).toEqual(["node-import"]);
  });
  it("does not apply to sim/ or the game scripts", () => {
    expect(rules("src/game/sim/x.ts", `import { readFileSync } from "node:fs";`)).toEqual([]);
    expect(rules("scripts/build-sw.ts", `import { readFileSync } from "node:fs";`)).toEqual([]);
  });
  it("passes clean imports, comments and string mentions", () => {
    expect(rules("src/game/core/x.ts", `import { a } from "./cards";`)).toEqual([]);
    expect(rules("src/game/core/x.ts", `// import fs from "node:fs";\nconst s = "node:fs";`)).toEqual([]);
  });
});

describe("rule: no DOM globals in core/ and ai/", () => {
  const globals = ["window", "document", "localStorage", "navigator"];
  it("flags each global in core/ and ai/", () => {
    for (const g of globals) {
      expect(rules("src/game/core/x.ts", `const v = ${g};`)).toEqual(["dom-global"]);
      expect(rules("src/game/ai/x.ts", `const v = ${g}.x;`)).toEqual(["dom-global"]);
    }
    expect(rules("src/game/core/x.ts", `const v = globalThis.document;`)).toEqual(["dom-global"]);
  });
  it("does not apply to other folders", () => {
    for (const area of ["ui", "persistence", "sim", "i18n"]) {
      expect(rules(`src/game/${area}/x.ts`, `const v = window.localStorage;`)).toEqual([]);
    }
  });
  it("passes clean code, property names, comments and string mentions", () => {
    const path = "src/game/core/x.ts";
    expect(rules(path, `const v = 1; // uses window and document\n/* navigator */`)).toEqual([]);
    expect(rules(path, `const s = "localStorage"; const t = \`window \${1}\`;`)).toEqual([]);
    expect(rules(path, `const o = { window: 3, document: 4 }; const w = o.window;`)).toEqual([]);
    expect(rules(path, `const myWindow = 1; const documents = 2;`)).toEqual([]);
  });
});

describe("rule: no Math.random, Date, performance.now, crypto in core/ and ai/", () => {
  const fixtures: Record<string, string> = {
    "Math.random": `const r = Math.random();`,
    "new Date": `const d = new Date();`,
    "Date.now": `const t = Date.now();`,
    "performance.now": `const t = performance.now();`,
    crypto: `const a = crypto.getRandomValues(new Uint8Array(1));`,
    "globalThis.crypto": `const a = globalThis.crypto;`,
  };
  it("flags each construct in core/ and ai/", () => {
    for (const [name, src] of Object.entries(fixtures)) {
      expect(rules("src/game/core/x.ts", src), name).toEqual(["nondeterminism"]);
      expect(rules("src/game/ai/x.ts", src), name).toEqual(["nondeterminism"]);
    }
  });
  it("does not apply to sim/, ui/ or scripts", () => {
    expect(rules("src/game/sim/x.ts", `const t = Date.now() + performance.now();`)).toEqual([]);
    expect(rules("src/game/ui/x.ts", `const r = Math.random();`)).toEqual([]);
    expect(rules("scripts/simulate.ts", `const t = performance.now();`)).toEqual([]);
  });
  it("passes clean code, comments and string mentions", () => {
    const path = "src/game/core/x.ts";
    expect(rules(path, `const next = mulberry32(seed)();`)).toEqual([]);
    expect(rules(path, `// never call Math.random or Date.now here\n/** crypto */`)).toEqual([]);
    expect(rules(path, `const s = "Math.random, Date, performance.now, crypto";`)).toEqual([]);
    expect(rules(path, `const validate = 1; const updated = 2; const o = { Date: 1 };`)).toEqual([]);
  });
});

describe("rule: ai/ must not import core/state, engine, deck, replay, rules", () => {
  it("flags each internal module, with or without extension and for type imports", () => {
    for (const m of ["state", "engine", "deck", "replay", "rules"]) {
      expect(rules("src/game/ai/x.ts", `import { a } from "../core/${m}";`), m).toEqual(["ai-internal-import"]);
      expect(rules("src/game/ai/x.ts", `import type { A } from "../core/${m}.js";`), m).toEqual(["ai-internal-import"]);
      expect(rules("src/game/ai/x.ts", `import { a } from "../core/${m}.ts";`), m).toEqual(["ai-internal-import"]);
    }
  });
  it("does not apply outside ai/", () => {
    expect(rules("src/game/sim/x.ts", `import { a } from "../core/engine";`)).toEqual([]);
    expect(rules("src/game/core/x.ts", `import { a } from "./state";`)).toEqual([]);
  });
  it("passes the allowed core modules, comments and string mentions", () => {
    const path = "src/game/ai/x.ts";
    for (const m of ["types", "cards", "geometry", "fragment-layout", "board", "score", "prng", "view", "statehelper"]) {
      expect(rules(path, `import { a } from "../core/${m}";`), m).toEqual([]);
    }
    expect(rules(path, `// import { a } from "../core/engine";\nconst s = "../core/state";`)).toEqual([]);
  });
});

describe("rule: no fetch, XMLHttpRequest, WebSocket, sendBeacon outside ui/public/sw.js", () => {
  const fixtures: Record<string, string> = {
    fetch: `const r = await fetch("/x");`,
    "window.fetch": `const r = window.fetch("/x");`,
    XMLHttpRequest: `const x = new XMLHttpRequest();`,
    WebSocket: `const s = new WebSocket("ws://x");`,
    sendBeacon: `navigator.sendBeacon("/x");`,
  };
  it("flags each API in every other folder and in game scripts", () => {
    for (const [name, src] of Object.entries(fixtures)) {
      expect(rules("src/game/ui/controller.ts", src), name).toContain("network-api");
      expect(rules("src/game/persistence/x.ts", src), name).toContain("network-api");
      expect(rules("src/game/sim/x.ts", src), name).toContain("network-api");
      expect(rules("scripts/simulate.ts", src), name).toContain("network-api");
    }
  });
  it("allows the service worker file only", () => {
    const sw = `self.addEventListener("fetch", (e) => e.respondWith(fetch(e.request)));`;
    expect(rules("src/game/ui/public/sw.js", sw)).toEqual([]);
    expect(rules("src/game/ui/public/other.js", sw)).toEqual(["network-api"]);
    expect(rules("src/game/ui/pwa-register.ts", `fetch("./sw.js");`)).toEqual(["network-api"]);
  });
  it("passes clean code, property names, comments and string mentions", () => {
    const path = "src/game/ui/x.ts";
    expect(rules(path, `// no fetch, XMLHttpRequest, WebSocket or sendBeacon here`)).toEqual([]);
    expect(rules(path, `const s = "fetch"; addEventListener("fetch", f);`)).toEqual([]);
    expect(rules(path, `const o = { fetch: 1 }; const prefetch = 2; const fetched = 3;`)).toEqual([]);
  });
});

describe("rule: numeric score tables only in core/score.ts", () => {
  it("flags array literals assigned to rewardByError", () => {
    expect(rules("src/game/core/engine.ts", `const c = { rewardByError: [6, 4, 3], handEmptyBonus: 3 };`)).toEqual(["score-table"]);
    expect(rules("src/game/ai/x.ts", `let rewardByError = [1, 2];`)).toEqual(["score-table"]);
    expect(rules("src/game/persistence/x.ts", `const c = { "rewardByError": [6, 4] };`)).toEqual(["score-table"]);
    expect(rules("scripts/simulate.ts", `const c = { rewardByError : [6] };`)).toEqual(["score-table"]);
  });
  it("allows core/score.ts as the only owner", () => {
    expect(rules("src/game/core/score.ts", `const c = { rewardByError: [6, 4, 3, 2, 1] };`)).toEqual([]);
  });
  it("passes type declarations, reads, comments and string mentions", () => {
    const path = "src/game/core/types.ts";
    expect(rules(path, `export interface ScoreConfig { readonly rewardByError: readonly number[] }`)).toEqual([]);
    expect(rules(path, `const v = config.rewardByError[0]; const n = cfg.rewardByError.length;`)).toEqual([]);
    expect(rules(path, `// rewardByError: [6, 4, 3, 2, 1]\n/* rewardByError = [1] */`)).toEqual([]);
    expect(rules(path, `const s = "rewardByError: [6, 4]";`)).toEqual([]);
  });
});

describe("comment and string stripping", () => {
  it("ignores line, block and doc comments", () => {
    const src = `/**\n * Math.random Date window fetch\n */\n// import x from "optical"\nconst a = 1; /* crypto */`;
    expect(rules("src/game/core/x.ts", src)).toEqual([]);
  });
  it("ignores single, double and template strings, including escapes and substitutions", () => {
    const src = [
      `const a = 'it\\'s Math.random';`,
      `const b = "say \\"Date\\" window";`,
      "const c = `Date ${1 + 1} document`;",
    ].join("\n");
    expect(rules("src/game/core/x.ts", src)).toEqual([]);
  });
  it("still scans code inside template substitutions", () => {
    expect(rules("src/game/core/x.ts", "const a = `n ${Math.random()} n`;")).toEqual(["nondeterminism"]);
    expect(rules("src/game/core/x.ts", "const a = `${ {a: 1}.a } ${Date.now()}`;")).toEqual(["nondeterminism"]);
  });
  it("ignores regex literals and still handles division", () => {
    expect(rules("src/game/core/x.ts", `const re = /Math\\.random|Date|window/g; const q = 4 / 2;`)).toEqual([]);
    expect(rules("src/game/core/x.ts", `const r = a / b; const t = Date.now() / 2;`)).toEqual(["nondeterminism"]);
    expect(rules("src/game/core/x.ts", `const q = x.split(/[/]/); const d = Date.now();`)).toEqual(["nondeterminism"]);
  });
  it("keeps import specifiers visible although strings are stripped", () => {
    expect(rules("src/game/core/x.ts", `import { a } from "node:fs"; const s = "node:fs";`)).toEqual(["node-import"]);
  });
  it("reports file, line and match", () => {
    const found = scanSource("src\\game\\core\\x.ts", `const a = 1;\n\nconst r = Math.random();`);
    expect(found).toEqual([{ rule: "nondeterminism", file: "src/game/core/x.ts", line: 3, match: "Math.random" }]);
  });
});

describe("planted violations (evidence that the scan can fail)", () => {
  it("reports one violation per planted rule", () => {
    const planted: [string, string, RuleId][] = [
      ["src/game/core/x.ts", `import { a } from "../../optical/codec";`, "optical-import"],
      ["src/game/ui/x.ts", `import { a } from "node:path";`, "node-import"],
      ["src/game/ai/x.ts", `const w = window.innerWidth;`, "dom-global"],
      ["src/game/core/x.ts", `const r = Math.random();`, "nondeterminism"],
      ["src/game/ai/x.ts", `import { reduce } from "../core/engine";`, "ai-internal-import"],
      ["src/game/sim/x.ts", `fetch("/leak");`, "network-api"],
      ["src/game/core/rules.ts", `const t = { rewardByError: [9, 9] };`, "score-table"],
    ];
    for (const [path, src, rule] of planted) {
      expect(rules(path, src), `${path}: ${src}`).toEqual([rule]);
    }
  });
});
