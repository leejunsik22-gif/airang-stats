// 안드로이드 가상기기(에뮬레이터) 시범 v01 — 2026-11-10 082 지시(제한적 시범)
// 가상기기 안의 실제 크롬으로 시험 주소(airang-hosp-preview)를 열어 079 확인 항목을 자동으로 본다.
// 결과는 '가상기기 시험'이며 실제 갤럭시 검수를 대신하지 않는다.
const { _android } = require("playwright");
const fs = require("fs"); const { execSync } = require("child_process");
const B = "https://airang-hosp-preview.pages.dev"; let bad = 0; const log = [];
const ok = (n, c, v) => { const L = (c ? "통과" : "실패") + " | " + n + (v !== undefined ? " (" + v + ")" : ""); console.log(L); log.push(L); if (!c) bad++; };
const adb = (c) => execSync("adb shell " + c).toString().trim();
(async () => {
  fs.mkdirSync("evidence", { recursive: true });
  ok("크롬 설치됨", /com\.android\.chrome/.test(adb("pm list packages com.android.chrome")));
  ok("안드로이드 버전", true, adb("getprop ro.build.version.release"));
  const [dev] = await _android.devices(); ok("가상기기 연결", !!dev, dev && dev.model());
  await dev.shell("am force-stop com.android.chrome");
  const ctx = await dev.launchBrowser({ args: ["--disable-fre", "--no-first-run", "--no-default-browser-check"] });
  const p = await ctx.newPage(); ok("크롬 실행", true, await ctx.browser ? "ok" : "ok");
  const shot = async (n) => { await p.screenshot({ path: `evidence/${n}.png` }); };
  for (const fs_ of ["1.0", "1.3", "1.5"]) {
    adb(`settings put system font_scale ${fs_}`); await p.waitForTimeout(1500);
    await p.goto(B + "/yuseong/#find/" + encodeURIComponent("영어"), { timeout: 60000 }); await p.waitForLoadState("networkidle"); await p.waitForTimeout(1500);
    const btn = p.locator("#view button", { hasText: "학원·교습소 전체 보기" });
    const has = await btn.count(); const t = has ? await btn.innerText() : "";
    ok(`[글자 ${fs_}배] 전체 보기 버튼`, /\(223곳\)/.test(t), t.replace(/\s+/g, " "));
    if (has) {
      await btn.scrollIntoViewIfNeeded();
      const m = await btn.evaluate((e) => { const r = e.getBoundingClientRect(); return { h: Math.round(r.height), r: Math.round(r.right), vw: innerWidth, cut: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1, dpr: devicePixelRatio, fs: getComputedStyle(e).fontSize }; });
      ok(`[글자 ${fs_}배] 버튼 잘림 없음·폭 안·44px↑`, !m.cut && m.r <= m.vw && m.h >= 44, JSON.stringify(m));
      await shot(`find_영어_x${fs_}`);
      if (fs_ === "1.0") {
        await btn.click(); await p.waitForTimeout(1500);
        ok("터치 → 학원 메뉴", /#acas$/.test(p.url()), p.url().split("#")[1]);
        ok("학원 메뉴 223곳", (await p.locator("#view").innerText()).includes("223곳"));
        ok("검색어 '영어' 전달", (await p.locator("#acaq").inputValue()) === "영어");
        await shot("acas_영어");
        // 목록 스크롤(손가락 쓸어 올리기)
        const y0 = await p.evaluate(() => scrollY); for (let i = 0; i < 6; i++) { await dev.shell("input swipe 540 1600 540 500 300"); await p.waitForTimeout(400); }
        const y1 = await p.evaluate(() => scrollY); ok("목록 스크롤", y1 > y0 + 500, `${y0}→${y1}`); await shot("acas_scrolled");
        await p.fill("#acaq", "수학"); await p.waitForTimeout(1200);
        ok("검색어 바꾸기(수학)", /\d+곳/.test(await p.locator("#view").innerText()));
        await p.goBack(); await p.waitForTimeout(1200); ok("뒤로 가기 → 검색 결과", /#find\//.test(p.url()));
      }
    }
  }
  adb("settings put system font_scale 1.0");
  // 병원: 홈 → 동네 소아과 → 상세 → 전화·길찾기
  await p.goto(B + "/yuseong/", { timeout: 60000 }); await p.waitForLoadState("networkidle"); await p.waitForTimeout(1200);
  const chip = p.locator(".q-chips .q-chip").first(); ok("홈 첫 칸 '동네 소아과'", (await chip.innerText()).includes("동네 소아과")); await shot("home");
  await chip.click(); await p.waitForTimeout(2500);
  ok("동네 소아과 18곳", (await p.locator("#view").innerText()).includes("18곳")); await shot("hosp_list");
  const first = p.locator("#view .lift, #view button.school").filter({ hasText: "소아" }).first();
  if (await first.count()) { await first.click(); await p.waitForTimeout(1200); }
  const sheet = p.locator("#sheet");
  if (await sheet.count()) {
    const tel = await sheet.locator(".acts a[href^='tel:']").first().getAttribute("href").catch(() => null);
    const map = await sheet.locator(".acts a", { hasText: "길찾기" }).first().getAttribute("href").catch(() => null);
    ok("상세 전화 버튼", !!tel, tel); ok("상세 길찾기", !!map, map && decodeURIComponent(map).slice(0, 60));
    ok("'방문 전에 전화로 확인' 표시", await sheet.getByText("방문 전에 전화로 확인").isVisible().catch(() => false));
    await shot("hosp_detail");
  } else ok("상세 열림", false, "목록 항목을 찾지 못함");
  await ctx.close();
  fs.writeFileSync("evidence/result.txt", log.join("\n") + `\n실패 ${bad}\n`);
  console.log("가상기기 시험 실패 " + bad); process.exit(0);
})().catch((e) => { console.log("오류: " + e.message); fs.writeFileSync("evidence/result.txt", log.join("\n") + "\n오류: " + e.message + "\n"); process.exit(0); });
