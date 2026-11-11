// 111 운영 반영 사후 확인(학원 전체 보기) — 운영 주소를 휴대폰 크기 크롬으로 열어 영어 검색 → 전체 보기 → 뒤로 가기 → 조건 바꾸기 확인. 쓰기 동작 없음.
const { chromium } = require("playwright"); const fs = require("fs");
const BASE = "https://airang-daejeon-all.pages.dev/yuseong/"; fs.mkdirSync("evidence", { recursive: true });
(async () => {
  const b = await chromium.launch(); const out = {}; const errs = [];
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: "ko-KR" })).newPage();
  p.on("pageerror", e => errs.push(String(e).slice(0, 160)));
  await p.route(/goatcounter|gc\.zgo\.at/, r => r.abort());   // 방문 통계에 시험 방문이 잡히지 않게
  const shot = n => p.screenshot({ path: `evidence/${n}.png` });
  await p.goto(BASE + "#home", { waitUntil: "networkidle" }); await p.waitForTimeout(1500);
  out.시험띠 = await p.evaluate(() => /시험 주소/.test(document.body.innerText));
  out.acaFind코드 = await p.evaluate(() => typeof acaFind === "function");
  await p.goto(BASE + "#find/" + encodeURIComponent("영어"), { waitUntil: "networkidle" }); await p.waitForTimeout(1500);
  const btn = p.locator("button, a").filter({ hasText: "전체 보기" }).first();
  out.버튼 = (await btn.count()) ? (await btn.innerText()).replace(/\s+/g, " ") : null;
  out.홈결과수 = await p.evaluate(() => document.querySelectorAll("#view .aca, #view [onclick*='acaSheet'], #view [onclick*='aca']").length);
  if (out.버튼) { await btn.scrollIntoViewIfNeeded(); await shot("1_button"); await btn.tap(); await p.waitForTimeout(1500); }
  const card = () => p.evaluate(() => { const t = document.querySelector("#view").innerText; const m = t.match(/유성구[^\n]*\n?\s*([\d,]+)\s*곳/); return { 제목: /학원·수강료/.test(t), 검색어: (document.querySelector("#view input") || {}).value, 숫자: m ? m[1] : null, hash: location.hash }; });
  out.전체보기화면 = await card(); await shot("2_list");
  await p.goBack(); await p.waitForTimeout(1500);
  out.뒤로가기 = await p.evaluate(() => ({ hash: location.hash, 버튼있음: [...document.querySelectorAll("button,a")].some(x => /전체 보기/.test(x.textContent)) }));
  await shot("3_back");
  const btn2 = p.locator("button, a").filter({ hasText: "전체 보기" }).first(); await btn2.scrollIntoViewIfNeeded(); await btn2.tap(); await p.waitForTimeout(1500);
  const inp = p.locator("#view input").first(); await inp.fill("수학"); await inp.dispatchEvent("input"); await p.waitForTimeout(1200);
  out.수학검색 = await card();
  for (const chip of ["수학", "과학"]) { const c = p.locator("#view button").filter({ hasText: new RegExp("^" + chip + "$") }).first(); if (await c.count()) { await c.tap(); await p.waitForTimeout(900); out["수학+" + chip] = (await card()).숫자; } }
  await shot("4_filter");
  out.스크립트오류 = errs;
  fs.writeFileSync("evidence/result.json", JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1)); await b.close();
})();
