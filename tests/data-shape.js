// data/*.json 이 파싱만 되는 게 아니라 화면이 기대하는 모양인지 본다. 의존성 없음.
//
//   node tests/data-shape.js
//
// JSON.parse 통과가 안전을 뜻하지 않는다. 웹 편집기로 data/places.json 을
// 고치다 거점 배열을 통째로 날려도 문법은 멀쩡하고, 배포는 성공하고,
// 화면만 텅 빈다. 그 상태를 배포 전에 잡는 게 이 파일의 일이다.
//
// 반대로 "값이 비어 있는 게 정상"인 자리는 실패로 보지 않는다.
// exhibitions 는 CSV 변환 전에는 빈 배열이고, 그때는 해당 영역이 숨는 게
// 설계된 동작이다.

const places = require("../data/places.json");
const exhibitions = require("../data/exhibitions.json");

const problems = [];
const notes = [];

function fail(msg) {
  problems.push(msg);
}

/* ---------- 거점 ---------- */

if (!Array.isArray(places.spots) || places.spots.length === 0) {
  fail("places.json 의 spots 가 비어 있습니다 — 지도·목록·AI 해설이 전부 빈 화면이 됩니다.");
} else {
  const seen = new Set();
  places.spots.forEach((spot, i) => {
    const where = `spots[${i}]${spot && spot.name ? ` (${spot.name})` : ""}`;
    if (!spot || typeof spot !== "object") return fail(`${where} 가 객체가 아닙니다.`);
    if (spot.id === undefined || spot.id === null) fail(`${where} 에 id 가 없습니다.`);
    else if (seen.has(spot.id)) fail(`${where} 의 id ${spot.id} 가 중복입니다 — 선택·마커가 엉킵니다.`);
    else seen.add(spot.id);

    ["name", "district", "theme"].forEach((k) => {
      if (typeof spot[k] !== "string" || !spot[k].trim()) {
        fail(`${where} 에 ${k} 가 없습니다.`);
      }
    });
  });

  // 테마는 선언과 실제 값이 맞아야 필터가 동작한다.
  if (!Array.isArray(places.themes) || places.themes.length === 0) {
    fail("places.json 의 themes 가 비어 있습니다 — 테마 필터가 사라집니다.");
  } else {
    const declared = new Set(places.themes);
    const orphan = [...new Set(places.spots.map((s) => s && s.theme).filter(Boolean))]
      .filter((t) => !declared.has(t));
    if (orphan.length) {
      fail(`themes 에 없는 테마를 쓰는 거점이 있습니다: ${orphan.join(", ")} — 그 거점은 어떤 필터로도 안 잡힙니다.`);
    }
  }
}

/* ---------- 데이터셋 선언 ---------- */

if (!Array.isArray(places.datasets) || places.datasets.length === 0) {
  fail("places.json 의 datasets 가 비어 있습니다 — '활용한 공공데이터'가 빈 칸이 됩니다.");
} else {
  const collections = { spots: places.spots, exhibitions: exhibitions.exhibitions };
  places.datasets.forEach((ds, i) => {
    const where = `datasets[${i}]${ds && ds.name ? ` (${ds.name})` : ""}`;
    if (typeof ds.name !== "string" || !ds.name.trim()) fail(`${where} 에 name 이 없습니다.`);
    if (!ds.record_key) return fail(`${where} 에 record_key 가 없습니다 — 건수를 셀 수 없습니다.`);
    if (!Array.isArray(collections[ds.record_key])) {
      fail(`${where} 의 record_key "${ds.record_key}" 에 해당하는 배열이 없습니다.`);
    }
    // url 이 비거나 TODO 인 것은 실패가 아니다. 화면은 isFilled 로 걸러
    // 링크를 안 걸 뿐이다. 다만 눈에 띄게 남겨 둔다.
    if (!ds.url || String(ds.url).trim().startsWith("TODO")) {
      notes.push(`${where} 의 출처 URL 이 아직 비어 있습니다 (링크는 표시되지 않습니다).`);
    }
  });
}

/* ---------- 전시·행사 ---------- */

if (!Array.isArray(exhibitions.exhibitions)) {
  fail("exhibitions.json 의 exhibitions 가 배열이 아닙니다.");
} else if (exhibitions.exhibitions.length === 0) {
  notes.push("exhibitions 가 비어 있습니다 — CSV 변환 전 상태이고, 해당 영역은 자동으로 숨습니다.");
} else {
  exhibitions.exhibitions.forEach((ex, i) => {
    const where = `exhibitions[${i}]${ex && ex.name ? ` (${ex.name})` : ""}`;
    if (typeof ex.name !== "string" || !ex.name.trim()) fail(`${where} 에 name 이 없습니다.`);
    // 시작일로 월별 집계를 하므로 형식이 어긋나면 그 건이 통계에서 빠진다.
    if (ex.start_date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(ex.start_date))) {
      fail(`${where} 의 start_date "${ex.start_date}" 가 YYYY-MM-DD 형식이 아닙니다.`);
    }
  });
}

/* ---------- 결과 ---------- */

console.log("──────── 데이터 내용 점검 ────────");
console.log(`거점            ${Array.isArray(places.spots) ? places.spots.length : 0}곳`);
console.log(`테마            ${Array.isArray(places.themes) ? places.themes.length : 0}종`);
console.log(`데이터셋 선언   ${Array.isArray(places.datasets) ? places.datasets.length : 0}종`);
console.log(`전시·행사       ${Array.isArray(exhibitions.exhibitions) ? exhibitions.exhibitions.length : 0}건`);

if (notes.length) {
  console.log("\n알림 (실패 아님)");
  notes.forEach((n) => console.log(`  · ${n}`));
}

if (problems.length) {
  console.log(`\n✗ 문제 ${problems.length}건`);
  problems.forEach((p) => console.log(`  · ${p}`));
  process.exit(1);
}

console.log("\n✓ 데이터가 화면이 기대하는 모양입니다.");
