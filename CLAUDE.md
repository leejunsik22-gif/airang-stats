# airang-stats — 클로드 작업 규칙 (131B v02, 2026-11-14)

아이랑 대전의 **배포·관리자·운영 확인** 저장소. 앱 원본은 airang-cities 에 있다(규칙: airang-cities/CLAUDE.md).
작업 시작 전 프로젝트 문서 **「현재 상태판」 최신 판(131A…)**을 먼저 읽는다.

## 1. 이 저장소의 역할
| 워크플로 | 하는 일 | 주의 |
|---|---|---|
| `cf-apps.yml` | airang-cities **main** 을 그대로 빌드해 운영(airang-daejeon-all) 배포. 6시간마다 + 수동 | main 이 아닌 원본은 스스로 거부. **수동 실행 = 운영 배포 → 대표 "승인" 뒤에만** |
| `admin.yml` 등 | 관리자 화면(airang-daejeon-admin) 배포 | 관리자 변경도 운영 변경 |
| `cf-all.yml` | 이름은 "(시험)"이지만 **운영 사이트(airang-daejeon-all)에 올림** | 운영 배포 → 승인 필요. 지금은 cf-apps 를 씀, 실행하지 않는다 |
| `cf-move.yml` | 도시 주소·DNS 를 옮김 | 운영 주소 변경 → 승인 필요, 실행하지 않는다 |
| `hosp-preview.yml` (hosp-preview 가지) | 시험 주소 airang-hosp-preview 빌드 + 자동 확인. 원본 = airang-cities `fix-ime-hosp` | 시험용. 작업마다 확인 항목을 덧붙이고 이전 항목은 지우지 않는다 |
| `inquiry-live-check.yml` | 운영 문의 접수 1건 넣고 확인 뒤 삭제 | 운영 D1 을 건드리므로 필요할 때만 |
| `prod-check-<번호>` 가지 | 운영 반영 직후 운영 주소 확인(?nocount=1, 통계 차단) | 확인만, 변경 없음 |

## 2. 승인 없이는 하지 않는 것
- `main` 커밋·push, cf-apps·admin 수동 실행, Cloudflare·GitHub 설정·비밀값(secrets) 변경
- 비밀값·토큰·비밀번호를 보거나 출력하거나 채팅에 올리기 (관리자 비밀번호·GoatCounter 키는 대표가 직접 입력)
- 방문 통계에 시험 방문 섞기 — 확인은 `?nocount=1` + goatcounter 차단
- 기존 가지·기록(deployed/, approvals) 삭제·덮어쓰기

## 3. 실행 방법 메모
- gh: `env -u GH_TOKEN gh ...` (GH_TOKEN 환경변수가 무효라 빼고 실행)
- push: `git -c push.negotiate=true push`
- 시험 주소 되돌리기: hosp-preview.yml 의 원본 ref 를 이전 가지로.

## 4. 보고
- 운영 반영 보고에는: 백업 가지, 반영 커밋, cf-apps 실행 번호, 운영 주소 확인 결과(통과/실패 수)를 적는다.
- 상태는 완료 / 부분 완료 / 미완료 / 미확인. 작업 뒤 「현재 상태판」 새 판으로 갱신.
