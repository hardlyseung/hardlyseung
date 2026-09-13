// js/app.js 가 찾는 DOM id 가 index.html 에 실제로 있는지 대조한다. 의존성 없음.
//
//   node tests/dom-ids.js
//
// CLAUDE.md 와 README 둘 다 "js/app.js 가 참조하는 DOM id 가 index.html 에
// 모두 존재하는지 함께 본다"고 적어 뒀지만, 그동안 사람 눈에 맡겨져 있었다.
// 이 종류의 실수는 조용하다 — 없는 id 를 찾으면 getElementById 가 null 을
// 돌려주고, 그 기능 하나만 동작을 멈춘 채 배포까지 통과한다.
//
// 정적 분석이라 한계가 분명하다. 변수로 넘기는 호출은 문자열을 알 수 없으므로
// 세지 못한다. 못 본 자리를 조용히 넘기지 않고 아래에서 건수로 보고한다.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP = path.join(ROOT, "js", "app.js");
const HTML = path.join(ROOT, "index.html");

const app = fs.readFileSync(APP, "utf-8");
const html = fs.readFileSync(HTML, "utf-8");

/* ---------- index.html 이 가진 id ---------- */

const declared = new Set();
for (const m of html.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)) {
  declared.add(m[1]);
}

/* ---------- js/app.js 가 찾는 id ---------- */

// 참조 한 건: 어떤 id 를, 몇 번째 줄에서, 어떤 방식으로 찾는지.
const wanted = new Map();

function lineOf(index) {
  return app.slice(0, index).split("\n").length;
}

function want(id, index, how) {
  if (!wanted.has(id)) wanted.set(id, []);
  wanted.get(id).push({ line: lineOf(index), how });
}

// 1) 직접 호출
for (const m of app.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g)) {
  want(m[1], m.index, 'getElementById("…")');
}

// 2) querySelector("#id") — 클래스 선택자는 id 가 아니므로 제외한다.
for (const m of app.matchAll(/querySelector(?:All)?\(\s*["']#([A-Za-z][\w-]*)["']\s*\)/g)) {
  want(m[1], m.index, 'querySelector("#…")');
}

// 3) 간접 호출. app.js 에는 id 를 첫 인자로 받아 getElementById 로 넘기는
//    헬퍼가 둘 있다. 이름을 적어 두지 않으면 이쪽 id 는 통째로 검사에서 빠진다.
//    헬퍼가 늘면 여기에 추가한다 — 목록에 없으면 아래 "확인 못 한 호출"로
//    잡히므로, 빠뜨려도 조용히 지나가지는 않는다.
const IDIRECT = [
  { fn: "refocus", why: "칩을 다시 그린 뒤 포커스를 되돌린다" },
  { fn: "put", why: "히어로 통계 숫자를 채운다" },
];

for (const helper of IDIRECT) {
  const re = new RegExp(`(?<![\\w.])${helper.fn}\\(\\s*["']([^"']+)["']`, "g");
  for (const m of app.matchAll(re)) {
    want(m[1], m.index, `${helper.fn}("…")`);
  }
}

/* ---------- 문자열을 알 수 없는 호출 ---------- */

// 정의부(함수 선언)는 빼고, 변수를 넘기는 실제 호출만 센다.
const dynamic = [];
for (const m of app.matchAll(/getElementById\(\s*([^"')\s][^)]*)\)/g)) {
  dynamic.push({ line: lineOf(m.index), code: m[0].trim() });
}

/* ---------- 결과 ---------- */

const missing = [];
for (const [id, uses] of wanted) {
  if (!declared.has(id)) missing.push({ id, uses });
}

const ids = [...wanted.keys()].sort();
console.log("──────── DOM id 대조 ────────");
console.log(`index.html 선언 id   ${declared.size}개`);
console.log(`js/app.js 참조 id    ${ids.length}개`);

if (dynamic.length) {
  console.log(`\n확인 못 한 호출 ${dynamic.length}건 — 문자열이 아니라 변수를 넘긴다`);
  dynamic.forEach((d) => console.log(`  app.js:${d.line}  ${d.code}`));
  console.log("  (헬퍼를 통해 넘어온 문자열은 위 IDIRECT 목록으로 따라간다)");
}

if (missing.length) {
  console.log(`\n✗ index.html 에 없는 id ${missing.length}개`);
  missing.forEach((m) => {
    console.log(`  "${m.id}"`);
    m.uses.forEach((u) => console.log(`      app.js:${u.line}  ${u.how}`));
  });
  console.log("\nindex.html 에 해당 id 를 추가하거나, app.js 의 참조를 고치세요.");
  process.exit(1);
}

console.log("\n✓ 참조하는 id 가 모두 index.html 에 있습니다.");
