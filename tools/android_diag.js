// 082 후속 진단 v01 — 피트 확인 요청 3가지 중 가상기기 2가지(병원 화면, 스크롤, 글자 확대 원인)
const { _android } = require("playwright"); const fs = require("fs"); const { execSync } = require("child_process");
const B = "https://airang-hosp-preview.pages.dev"; const log = [];
const out = (s) => { console.log(s); log.push(s); };
const adb = (c) => execSync("adb shell " + c).toString().trim();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let dev, ctx, p;
async function openChrome() {
  try { if (ctx) await ctx.close(); } catch (_) {} ctx = p = undefined;
  for (let i = 1; i <= 3 && !p; i++) { try { await dev.shell("am force-stop com.android.chrome"); await wait(2000);
    ctx = await dev.launchBrowser({ args: ["--disable-fre", "--no-first-run", "--no-default-browser-check"] }); await wait(3000); p = ctx.pages()[0] || await ctx.newPage(); } catch (e) { out(`  크롬 열기 재시도 #${i}: ${e.message.split("\n")[0]}`); try { await ctx.close(); } catch (_) {} ctx = p = undefined; } }
  if (!p) throw new Error("크롬 열기 실패");
}
const TEST = "data:text/html;charset=utf-8," + encodeURIComponent('<meta name="viewport" content="width=device-width,initial-scale=1"><p id="px" style="font-size:14px">글자 14px</p><p id="rem" style="font-size:1rem">글자 1rem</p><p id="def">기본 글자</p>');
async function measure(tag) {
  await p.goto(TEST); await wait(800);
  const m = await p.evaluate(() => ({ px: getComputedStyle(px).fontSize, rem: getComputedStyle(rem).fontSize, def: getComputedStyle(def).fontSize, iw: innerWidth, dpr: devicePixelRatio, vvs: visualViewport.scale, pxH: Math.round(px.getBoundingClientRect().height) }));
  out(`[글자 측정 ${tag}] 안드로이드 설정 ${adb("settings get system font_scale")} · 14px글자 계산값 ${m.px} · 1rem ${m.rem} · 기본 ${m.def} · 14px글자 실제 높이 ${m.pxH}px · 화면폭 ${m.iw} · 배율 ${m.dpr} · 확대 ${m.vvs}`);
  await p.screenshot({ path: `evidence/diag_font_${tag}.png` });
}
(async () => {
  fs.mkdirSync("evidence", { recursive: true });
  [dev] = await _android.devices(); out("가상기기: " + dev.model() + " / 안드로이드 " + adb("getprop ro.build.version.release") + " / 크롬 " + (adb("dumpsys package com.android.chrome | grep versionName").split("\n")[0] || "").trim());
  adb("settings put system font_scale 1.0"); await wait(3000); await openChrome();
  // ① 병원(글자 설정 바꾸기 전에 먼저)
  await p.goto(B + "/yuseong/", { timeout: 60000 }); await p.waitForLoadState("networkidle"); await wait(1500);
  const chip = p.locator(".q-chips .q-chip").first(); out("병원 | 홈 첫 칸: " + (await chip.innerText()).trim());
  await chip.click(); await wait(2500); const hv = await p.locator("#view").innerText(); out("병원 | 목록 18곳 표시: " + hv.includes("18곳"));
  await p.screenshot({ path: "evidence/diag_hosp_list.png" });
  const idx = await p.evaluate(() => HOSP.clinics.findIndex((x) => x.p === "소아청소년과")); await p.evaluate((i) => hsDetail("clinics", i), idx); await wait(1200);
  const sh = p.locator("#sheet"); const tel = await sh.locator(".acts a[href^='tel:']").first().getAttribute("href"); const map = await sh.locator(".acts a", { hasText: "길찾기" }).first().getAttribute("href");
  const want = await p.evaluate((i) => ({ n: HOSP.clinics[i].n, t: HOSP.clinics[i].t }), idx);
  out(`병원 | 상세 ${want.n}: 전화 ${tel} (자료 ${want.t}) 일치 ${tel === "tel:" + want.t.replace(/[^\d-]/g, "")} · 길찾기 ${decodeURIComponent(map).slice(0, 70)} · '방문 전에 전화로 확인' ${await sh.getByText("방문 전에 전화로 확인").isVisible()}`);
  await p.screenshot({ path: "evidence/diag_hosp_detail.png" });
  // ② 스크롤 3회(페이지 다 그린 뒤 3초 기다리고 쓸기)
  for (let t = 1; t <= 3; t++) {
    await p.goto(B + "/yuseong/#find/" + encodeURIComponent("영어")); await p.waitForLoadState("networkidle"); await wait(1500);
    await p.locator("#view button", { hasText: "학원·교습소 전체 보기" }).click(); await wait(3000);
    const y0 = await p.evaluate(() => scrollY); const ys = [];
    for (let i = 0; i < 4; i++) { await dev.shell("input swipe 540 1800 540 600 400"); await wait(600); ys.push(Math.round(await p.evaluate(() => scrollY))); }
    out(`스크롤 시도 ${t} | 시작 ${y0} → 쓸기마다 ${ys.join(" → ")}`);
  }
  // ③ 글자 확대 원인 가르기
  await measure("1.0_같은크롬");
  adb("settings put system font_scale 1.5"); await wait(4000);
  let alive = true; try { await p.evaluate(() => 1); } catch (e) { alive = false; }
  out("글자 설정 1.5로 바꾼 직후 크롬 탭 살아 있음: " + alive);
  if (alive) await measure("1.5_같은크롬");
  await openChrome(); await measure("1.5_크롬다시열기");
  adb("settings put system font_scale 1.0");
  fs.writeFileSync("evidence/diag_result.txt", log.join("\n") + "\n"); process.exit(0);
})().catch((e) => { out("오류: " + e.message.split("\n")[0]); fs.writeFileSync("evidence/diag_result.txt", log.join("\n") + "\n"); process.exit(0); });
