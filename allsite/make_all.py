"""도시별 앱 폴더(build.py 결과)를 사이트 하나로 묶는다: <out>/<도시>/… + _worker.js + 404.html
  python3 make_all.py <build.py 결과 폴더> <cities.json> <worker.js>
"""
import json, os, sys
out, cfg, wjs = sys.argv[1:4]
c = json.load(open(cfg, encoding="utf-8"))
hosts = {v["domain"]: k for k, v in c["cities"].items()}
hosts[c["entry"]["domain"]] = "entry"
TEST = {}   # 시험용 주소 없음 (pages.dev 에서는 /yuseong/ 처럼 경로로 확인)
hosts.update(TEST)
missing = [k for k in hosts.values() if not os.path.isdir(os.path.join(out, k))]
assert not missing, f"앱 폴더 없음: {missing}"
nf = '<!doctype html><meta charset="utf-8"><title>없는 페이지</title><p>없는 페이지예요. <a href="/">처음으로</a></p>'
for k in hosts.values():   # 도시마다 404 (없는 파일에 첫 화면 대신 404)
    p = os.path.join(out, k, "404.html")
    if not os.path.exists(p): open(p, "w", encoding="utf-8").write(nf)
open(os.path.join(out, "404.html"), "w", encoding="utf-8").write(nf)   # 맨 위 404: 없으면 Pages가 모든 길을 첫 화면으로 돌림
src = open(wjs, encoding="utf-8").read()
assert "/*HOSTS*/{}" in src
open(os.path.join(out, "_worker.js"), "w", encoding="utf-8").write(src.replace("/*HOSTS*/{}", json.dumps(hosts, ensure_ascii=False)))
print(f"묶음: 주소 {len(hosts)}개 →", out)
