# 그려던져! Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선을 그리면 그 모양·속도 그대로 공이 날아가는 3D 야구 게임 (AI 대전 + 1:1 온라인), Render 배포.

**Architecture:** Node.js 서버 하나(Express + Socket.IO)가 정적 클라이언트를 서빙하고 온라인 방을 관리한다. 규칙·궤적·판정은 `shared/` ES 모듈에 순수 함수로 두고 서버와 브라우저가 같이 import 한다. 온라인 판정은 서버가 `resolvePitch`로 하고, AI 대전은 브라우저가 같은 함수를 로컬에서 호출한다.

**Tech Stack:** Node ≥ 20 (ESM), express 5.x, socket.io 4.8.x, three 0.187.x (npm 설치 후 `/vendor/three/`로 서빙, import map), 테스트는 `node --test` + socket.io-client. 빌드 단계 없음.

**Spec:** `docs/design.md`

## Global Constraints

- UI 문구는 전부 한국어. 게임 이름 "그려던져!".
- 외부 CDN 없음: three는 `node_modules/three/build`·`examples/jsm`을 `/vendor/three/`로, socket.io 클라이언트는 `/socket.io/socket.io.esm.min.js`로 서빙.
- 좌표계(미터): 홈플레이트 판정면 z=0, 투수판 z=-18.44, y 위. 포수 쪽에서 투수를 볼 때 +x가 오른쪽.
- 입력은 Pointer Events만 사용(터치·마우스 공통). 게임 화면 전체 `touch-action: none`, `overscroll-behavior: none`, 핀치 확대 차단.
- 버튼 최소 44px. 세로·가로 모두 지원. `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`.
- 판정 난수는 전부 `shared/rng.js`의 시드 난수. `Math.random()`은 판정에 쓰지 않음(연출만 허용).
- Render: 무료 플랜, singapore, build `npm install`, start `npm start`, `PORT` 환경변수 사용, `/healthz` → 200 `ok`.

## Review Focus

1. **폰에서 그리기 시작하자마자 화면이 스크롤/확대됨** → 그리기 영역은 절대 움직이지 않아야 함. (Task 8: drawPad 브라우저 확인 단계)
2. **온라인에서 탭 숨김/화면 꺼짐 후 복귀, 혹은 새로고침** → 같은 방에 다시 붙고 현재 상태를 받아야 함. (Task 6: `rejoin restores state` 테스트)
3. **투수가 아무것도 안 그리고 탭 한 번만 함(점 1개, 0ms)** → 검증 실패가 아니라 "볼"로 처리돼 게임이 멈추지 않아야 함. (Task 2: `tap-only stroke` 테스트, Task 6: `invalid stroke counts as ball`)
4. **공이 아직 멀리 있을 때 성급하게 탭** → 헛스윙 1회로만 처리, 두 번째 탭은 무시. (Task 4: `early tap is a miss`, Task 9 컨트롤러 확인)
5. **화면 회전(세로↔가로) 중 그리기 박스 위치** → 회전 후 박스가 다시 계산되고 그린 좌표가 박스 기준으로 정확해야 함. (Task 8: resize 확인 단계)

---

## File Structure

```
package.json                 scripts: start=node server/index.js, test=node --test test/
server/index.js              Express 정적 서빙 + /vendor/three + /healthz + Socket.IO 부착
server/rooms.js              RoomManager: 코드 생성, 생성/참가/재참가/퇴장, 끊김 타이머
server/match.js              ServerMatch: 한 방의 경기 진행(페이즈·타이머·검증·브로드캐스트)
shared/constants.js          좌표·크기·제한·밸런스 수치 (아래 Task 1 표)
shared/rng.js                시드 난수
shared/rules.js              야구 규칙 엔진 (순수 함수)
shared/stroke.js             선 검증·정규화·지표·구종 이름·비행시간
shared/trajectory.js         선 → 3D 공 경로
shared/contact.js            사람 스윙 판정, AI 타자, 결과표, 타구 비행 파라미터
shared/aiPitcher.js          AI 투구 선 생성
shared/matchCore.js          resolvePitch: 한 투구의 전체 판정
public/index.html            import map, 캔버스, UI 레이어
public/css/style.css
public/js/main.js            부트스트랩, 화면 전환(lobby/room/game/result)
public/js/net.js             소켓 래퍼, 시계 동기화, 세션 ID
public/js/audio.js           WebAudio 합성 효과음
public/js/scene/stage.js     렌더러·씬·카메라 리그·리사이즈·카메라 전환
public/js/scene/field.js     경기장
public/js/scene/players.js   캐릭터 생성 + 절차적 애니메이션
public/js/scene/ball.js      공, 꼬리선, 타구 비행
public/js/scene/effects.js   폭죽·컨페티
public/js/input/drawPad.js   투구 그리기 오버레이
public/js/input/batInput.js  타격 탭 입력
public/js/game/controller.js 경기 화면 총괄 (매치 소스 이벤트 → 씬/HUD)
public/js/game/localMatch.js AI 대전 매치 소스
public/js/game/onlineMatch.js 온라인 매치 소스
public/js/ui/lobby.js        로비·방 대기실
public/js/ui/hud.js          전광판·카운트·주자·투구 정보·이모티콘 바
public/js/ui/overlays.js     큰 글자 배너, 결과 화면, 토스트, 확인창
test/*.test.js
```

---

### Task 1: 프로젝트 뼈대 + 상수 + 난수 + 규칙 엔진

**Files:**
- Create: `package.json`, `.gitignore`(node_modules), `shared/constants.js`, `shared/rng.js`, `shared/rules.js`
- Test: `test/rules.test.js`, `test/rng.test.js`

**Interfaces:**
- Produces:
  - `constants.js` 이름있는 export (값 고정):
    | 이름 | 값 |
    |---|---|
    | `RUBBER_Z` | -18.44 |
    | `RELEASE` | `{x:-0.35, y:1.75, z:-17.2}` |
    | `PITCH_CAM` | `{x:0, y:2.9, z:-23.5}` (target `{x:0,y:0.85,z:0}`) |
    | `BAT_CAM` | `{x:0, y:1.5, z:4.6}` (target `{x:0,y:1.0,z:-18}`) |
    | `ZONE` | `{xMin:-0.216, xMax:0.216, yMin:0.48, yMax:1.07}` |
    | `BALL_R` | 0.037 |
    | `BOX` | `{xMin:-1.1, xMax:1.1, yMin:-0.05, yMax:2.15}` (판정면 위 그리기 박스) |
    | `CATCHER_Z` | 0.85 |
    | `HIT_ZONE` | `{zMin:-1.15, zMax:0.45, ideal:-0.35}` |
    | `STROKE_LIMITS` | `{maxPoints:600, minDurationMs:60, maxDurationMs:6000, inkMax:14, clockMs:15000}` |
    | `FLIGHT` | `{factor:0.6, minMs:400, maxMs:3000, speedDistance:17.2, blendFrac:0.12}` |
    | `CONTACT` | `{dPerfect:0.06, dMax:0.30, timingHalf:0.8}` |
    | `RESULT_MS` | `{TAKE_STRIKE:2200, TAKE_BALL:2200, MISS:2200, FOUL:2600, GO:3600, FO:3800, '1B':4500, '2B':5000, '3B':5500, HR:7000}` |
    | `HALF_BANNER_MS` | 2200 |
    | `EXTRA_INNINGS_MAX` | 3 |
    | `DIFFICULTY` | `{easy:{...}, normal:{...}, hard:{...}}` — Task 4·5가 채움 |
  - `rng.js`: `createRng(seed: number) → () => number` (mulberry32, [0,1)), `hashSeed(...parts: (string|number)[]) → number` (32bit).
  - `rules.js`:
    - `createGame({innings}) → GameState`
      `GameState = {innings, inning:1, half:'top'|'bottom', outs:0, balls:0, strikes:0, bases:[bool,bool,bool], score:{away,home}, lines:{away:number[], home:number[]}, stats:{away:Stats, home:Stats}, status:'playing'|'final', winner:null|'away'|'home'|'tie', pitchNo:0}`
      `Stats = {runs, hits, strikeouts, walks, maxKmh:0, craziest:null|{name, craziness}}` (strikeouts·maxKmh·craziest는 그 팀이 **던질 때** 기록)
    - `battingTeam(g) → 'away'|'home'`, `fieldingTeam(g)`
    - `applyOutcome(g, outcome, rng, pitchInfo?) → {game: GameState, events: Event[]}` — g를 변경하지 않고 새 객체 반환
      `outcome ∈ 'TAKE_STRIKE','TAKE_BALL','MISS','FOUL','GO','FO','1B','2B','3B','HR','BALL_AUTO'`
      `Event.type ∈ 'strike','ball','foul','strikeout','walk','out','doublePlay','sacFly','hit','homeRun','run','halfOver','gameOver'` (+ `runs`, `team` 필드)
      `pitchInfo = {kmh, name, craziness}` 있으면 수비팀 stats 갱신

- [ ] **Step 1:** `git init`, `npm init` 대신 `package.json` 직접 작성(`"type":"module"`, `engines.node >=20`, deps express@^5.3.0 socket.io@^4.8.4 three@^0.187.0, devDeps socket.io-client@^4.8.4), `npm install`.
- [ ] **Step 2: 실패하는 테스트 작성** `test/rng.test.js`: 같은 시드 → 같은 수열 10개, 다른 시드 → 다른 수열, 값은 [0,1). `test/rules.test.js` 다음을 각각 테스트로:
  - `3 strikes is strikeout`: TAKE_STRIKE×2 + MISS → outs 1, count 0-0, stats.home.strikeouts 1 (top에 home이 수비)
  - `foul with 2 strikes keeps count`: 2스트라이크에서 FOUL → strikes 2
  - `4 balls walks and forces runners`: 만루에서 볼넷 → 1점, 만루 유지
  - `walk without force`: 2루 주자만 있을 때 볼넷 → bases [T,T,F]
  - `single advances one`: 1·3루 + 1B → 1점, bases [T,T,F]
  - `double advances two`, `triple clears bases`, `home run scores all`(만루 HR = 4점)
  - `ground out double play`: 1루 주자, 0아웃, GO, rng가 0.1을 반환하도록 스텁 → outs 2, bases 비움. rng 0.9 → outs 1, 주자 2루
  - `sac fly scores runner from third`: 3루 주자, 1아웃, FO → 1점, outs 2. 2아웃이면 득점 없음
  - `three outs switches half`: top 3아웃 → half 'bottom', bases 비움, count 리셋, `halfOver` 이벤트, lines.away[0]에 그 이닝 점수
  - `home leading after top of last inning ends game`: innings 3, 3회초 종료 시 home 리드 → status final, winner home, 3회말 없음
  - `walk-off ends immediately`: 3회말 동점, 1점 나는 순간 final
  - `tie goes to extra innings, max 3 extra then tie`: 6회말 종료 동점(innings 3) → final, winner 'tie'
  - `BALL_AUTO counts as ball`
- [ ] **Step 3:** 실행 `npm test` → 실패 확인.
- [ ] **Step 4:** `rng.js`, `constants.js`, `rules.js` 구현. 진루 규칙은 design.md §3 그대로(병살 40% = `rng() < 0.4`).
- [ ] **Step 5:** `npm test` → 전부 PASS.
- [ ] **Step 6:** 커밋 `feat: rules engine, rng, constants`.

### Task 2: 선 분석 (`shared/stroke.js`)

**Files:** Create `shared/stroke.js`, Test `test/stroke.test.js`

**Interfaces:**
- Consumes: `BOX`, `STROKE_LIMITS`, `FLIGHT`
- Produces:
  - `Stroke = {pts: [u, v, t][]}` — u,v ∈ [0,1] 박스 좌표(u=0 박스 왼쪽, v=0 박스 아래, **투수 화면 기준**), t ms(0부터 증가)
  - `sanitizeStroke(raw) → {ok:true, stroke} | {ok:false, reason}` — 숫자 아님/배열 아님/점 0개 → 실패. 좌표는 [0,1]로 clamp, t는 단조 증가로 보정, 점 개수 > maxPoints면 균등 다운샘플, 총 시간 > maxDurationMs면 자름, 잉크(판정면 미터 길이) > inkMax면 그 지점에서 자름. 점 1개면 같은 점을 t+minDurationMs로 복제해 2개로.
  - `boxToPlate(u, v) → {x, y}` — 판정면 좌표. **u=0 → x=BOX.xMax** (투수 화면 왼쪽 = 포수 기준 +x)
  - `strokeInk(stroke) → number` (미터)
  - `strokeMetrics(stroke) → {length, totalTurn, netTurn, loops, zigzags, craziness}` — 판정면 미터로 변환 후 0.03m 간격 재샘플, 3점 이동평균, 회전각 합. `loops = floor(|netTurn| / 2π)`, `zigzags` = 0.35m 창 안 누적 회전 > 60°인 급회전 중 부호가 직전과 반대인 횟수, `craziness = 1 - exp(-totalTurn / (6π))`
  - `flightMs(stroke) → number` = clamp(duration × factor, minMs, maxMs)
  - `kmh(ms) → number` = round(3.6 × speedDistance / (ms/1000))
  - `namePitch(metrics, ms) → string` — 위에서부터 첫 매치:
    1. craziness ≥ 0.85 → `정신나간 마구`
    2. loops ≥ 4 → `블랙홀볼`
    3. totalTurn ≥ 3.5π 이고 |netTurn| < π → `8자 마구`
    4. loops ≥ 1 → `회오리볼 ×{loops}`
    5. zigzags ≥ 6 → `번개볼`; zigzags ≥ 3 → `지그재그볼`
    6. totalTurn ≥ 0.3π → 끝 방향 변화가 아래쪽이면 `커브`, 옆이면 `슬라이더`
    7. ms ≥ 2200 → `아리랑볼`
    8. ms ≤ 520 → `강속구`, 그 외 `직구`

- [ ] **Step 1: 실패하는 테스트 작성** (`test/stroke.test.js`, 테스트용 선 생성 헬퍼 포함):
  - `straight line has ~0 craziness`: (0.5,0.9)→(0.5,0.5) 직선 300ms → craziness < 0.03, name `강속구`(ms=400 하한)
  - `three loops`: 반지름 0.12 원 3바퀴 → loops 3, name `회오리볼 ×3`
  - `zigzag`: 지그재그 꺾임 4번 → zigzags ≥ 3, name `지그재그볼`
  - `figure eight`: 8자 2번 → name `8자 마구`
  - `scribble is crazy`: 시드 난수로 만든 큰 낙서 → craziness ≥ 0.85
  - `flight clamps`: 100ms 선 → 400, 10000ms → 3000 (maxDuration 자르기 후)
  - `kmh(400)` = 155, `kmh(3000)` = 21
  - `tap-only stroke` (Review Focus 3): `{pts:[[0.5,0.5,0]]}` → ok, 점 2개, flightMs = 400
  - `rejects garbage`: `null`, `{pts:'x'}`, `{pts:[[NaN,0,0]]}` → ok false
  - `ink limit cuts stroke`: 잉크 30m 선 → strokeInk ≤ 14.01
  - `boxToPlate mirrors u`: (0,0) → {x:1.1, y:-0.05}, (1,1) → {x:-1.1, y:2.15}
- [ ] **Step 2:** `node --test test/stroke.test.js` → 실패 확인.
- [ ] **Step 3:** 구현.
- [ ] **Step 4:** PASS 확인.
- [ ] **Step 5:** 커밋 `feat: stroke analysis and pitch naming`.

### Task 3: 궤적 (`shared/trajectory.js`)

**Files:** Create `shared/trajectory.js`, Test `test/trajectory.test.js`

**Interfaces:**
- Consumes: `boxToPlate`, `flightMs`, `PITCH_CAM`, `RELEASE`, `CATCHER_Z`, `ZONE`, `BALL_R`, `FLIGHT.blendFrac`
- Produces:
  - `buildPath(stroke) → Path` — `Path = {T, durationStroke, end:{x,y}, inZone:boolean, positionAt(tMs) → {x,y,z}, samples(n) → {x,y,z}[]}`
  - 알고리즘 (핵심이므로 고정):
    ```
    s = clamp(t / T, 0, 1)
    τ = s × strokeDuration → 선 위 점 (u,v) 선형보간 → B = boxToPlate(u,v), B.z = 0
    z = lerp(RELEASE.z, 0, s)
    k = (z - PITCH_CAM.z) / (0 - PITCH_CAM.z)
    P = PITCH_CAM + (B - PITCH_CAM) × k          // 투수 카메라에서 보면 항상 그린 점 위
    s < blendFrac 이면 P = lerp(RELEASE, P, smoothstep(s / blendFrac))
    P.y = max(P.y, BALL_R)
    t > T 이면: 마지막 속도 방향으로 z = CATCHER_Z 까지 직선 연장 후 정지
    ```
  - `isStrike(end) → boolean` — end.x ∈ [ZONE.xMin−BALL_R, xMax+BALL_R], end.y ∈ [yMin−BALL_R, yMax+BALL_R]
  - `projectFrom(cam, P) → {dx, dy}` 테스트 헬퍼용 (카메라→P 방향 정규화)

- [ ] **Step 1: 실패하는 테스트 작성:**
  - `path starts at release`: positionAt(0) ≈ RELEASE (1e-6)
  - `path ends at drawn end on plate`: positionAt(T) = {boxToPlate(마지막점), z:0}
  - `pitcher view matches drawing`: blendFrac 이후 임의의 t 5개에서, PITCH_CAM→P 방향과 PITCH_CAM→boxToPlate(그 시점 점) 방향의 각도 차 < 1e-9
  - `fast segment moves faster`: 앞 절반을 100ms, 뒤 절반을 900ms에 그린 선 → T 절반 시점의 (u,v)가 선의 앞 절반 끝 근처를 이미 지남
  - `continues to catcher`: positionAt(T + 2000).z ≈ CATCHER_Z
  - `strike edges`: 존 모서리 + BALL_R 안쪽 → true, 바깥 0.01 → false
  - `never below ground`: 박스 맨 아래로 끝나는 선 → 모든 샘플 y ≥ BALL_R
- [ ] **Step 2:** 실패 확인 → **Step 3:** 구현 → **Step 4:** PASS → **Step 5:** 커밋 `feat: stroke-following 3D trajectory`.

### Task 4: 타격 판정 + AI 타자 + resolvePitch

**Files:** Create `shared/contact.js`, `shared/matchCore.js`; Modify `shared/constants.js`(DIFFICULTY 타자 값); Test `test/contact.test.js`, `test/matchCore.test.js`

**Interfaces:**
- Consumes: `buildPath`, `strokeMetrics`, `flightMs`, `kmh`, `namePitch`, `applyOutcome`, `createRng`, `BAT_CAM`, `HIT_ZONE`, `CONTACT`
- Produces:
  - `Swing = {type:'human', t:number, ray:{x,y,z}} | {type:'take'} | {type:'ai', difficulty:'easy'|'normal'|'hard'}` — ray는 BAT_CAM에서 탭 지점으로 가는 정규화 방향
  - `evalHumanSwing(path, swing) → {hit:false, reason:'early'|'late'|'off'} | {hit:true, quality, timing, dist}`
    - P = path.positionAt(swing.t). P.z ∉ [HIT_ZONE.zMin, zMax] → miss('early' 또는 'late')
    - dist = |(P − BAT_CAM) × ray| (광선과 공의 수직거리). dist > dMax → miss('off')
    - a = 1 − clamp((dist − dPerfect)/(dMax − dPerfect), 0, 1); b = 1 − clamp(|P.z − ideal| / timingHalf, 0, 1); quality = a×b; timing = clamp((P.z − ideal)/timingHalf, −1, 1) (음수=빠름=당겨침)
  - `outcomeFromQuality(q, rng) → outcome` — design의 표 (q≥0.8: HR .40/3B .08/2B .27/1B .20/FO .05; 0.55~0.8: HR .08/2B .17/1B .40/FO .17/FOUL .18; 0.3~0.55: 1B .22/GO .30/FO .20/FOUL .28; <0.3: FOUL .50/GO .28/FO .22)
  - `aiBatter(pathInfo, difficulty, rng) → {swing:boolean, contact:boolean, quality, swingT}` — pathInfo = {inZone, craziness, T}
    - DIFFICULTY 값: easy `{zoneSwing:.65, chase:.28, base:.45, qMax:.85}`, normal `{.78, .18, .58, .95}`, hard `{.85, .12, .70, 1.0}`
    - 스윙 확률: inZone ? zoneSwing : chase + 0.35×craziness
    - 컨택 확률: base × speedF × (1 − 0.9×craziness) × (inZone ? 1 : 0.5); speedF = clamp(0.55 + 0.35×(T/1000 − 0.4)/0.6, 0.55, 1.0)
    - quality = rng()^(1 + 1.5×craziness) × qMax
    - swingT = 공 z가 HIT_ZONE.ideal 이 되는 시각(contact 아니면 ±40ms 어긋나게)
  - `hitFlight(outcome, timing, rng) → {kind:'ground'|'line'|'fly'|'pop'|'foul'|'hr', spray, distance, apex, hangMs}` — spray: 도 단위, −45=3루선, +45=1루선, 파울은 |spray| 50~80. timing 음수면 spray 3루 쪽(우타자 당겨치기). 범위: GO distance 25~45 ground, FO 60~95 fly, 1B line 40~70, 2B 75~100, 3B 95~115, HR 110~140 apex 30~45.
  - `resolvePitch({game, stroke, swing, seed}) → PitchResult`
    `PitchResult = {pitch:{T, kmh, name, craziness, metrics, end, inZone}, outcome, contact:null|{quality, timing, dist}, swingT:null|number, flight:null|HitFlight, events, game}`
    - 스윙 없음/take → inZone ? TAKE_STRIKE : TAKE_BALL
    - stroke invalid → BALL_AUTO (Review Focus 3)
    - human miss → MISS (swingT = swing.t)

- [ ] **Step 1: 실패하는 테스트 작성:**
  - `perfect tap is solid contact`: 직선 공, ideal z 시각에 BAT_CAM→공 정확한 ray → hit, quality > 0.95
  - `early tap is a miss` (Review Focus 4): t = T×0.3 → hit false, reason 'early'
  - `late tap is a miss`: t = T + 400 → reason 'late'
  - `off target`: ideal 시각, ray를 0.5m 옆으로 → reason 'off'
  - `timing sign`: 공 z = −0.9인 시각 → timing < 0
  - `outcome table`: q=0.9에서 rng 순차 0.0,0.39,0.41,... 고정 스텁 → HR, HR, 3B 순서로 경계 확인
  - `crazy pitch is harder for AI`: 같은 시드 2000회 몬테카를로, craziness 0 vs 0.7 (T 동일 1000ms, inZone) → 컨택률 0.7 쪽이 절반 이하
  - `fast pitch is harder for AI`: T 400 vs 1500 → 400 쪽 컨택률 낮음
  - `resolvePitch is deterministic`: 같은 입력·시드 두 번 → deepEqual (positionAt 함수 제외한 필드)
  - `take on ball is TAKE_BALL`, `invalid stroke counts as ball` → BALL_AUTO
  - `hitFlight HR clears fence`: HR → distance ≥ 110, kind 'hr'
- [ ] **Step 2:** 실패 확인 → **Step 3:** 구현 → **Step 4:** PASS → **Step 5:** 커밋 `feat: contact, AI batter, resolvePitch`.

### Task 5: AI 투수 (`shared/aiPitcher.js`)

**Files:** Create `shared/aiPitcher.js`; Modify `shared/constants.js`(DIFFICULTY 투수 값); Test `test/aiPitcher.test.js`

**Interfaces:**
- Consumes: `sanitizeStroke`, `strokeMetrics`, `buildPath`, `ZONE`, `BOX`
- Produces: `generateAiStroke(difficulty, rng) → Stroke`
  - 템플릿 7종: straight, curve(2차 베지어), zigzag(3~7번), spiral(1~4바퀴), figure8, wave(사인), scribble(평활화된 랜덤워크). 난이도별 가중치·속도:
    easy `{zoneRate:.55, speed:[0.6,1.0], weights:{straight:3,curve:3,zigzag:2,spiral:1,figure8:0,wave:2,scribble:0}}`
    normal `{zoneRate:.65, speed:[0.8,1.3], weights:{straight:2,curve:2,zigzag:2,spiral:2,figure8:1,wave:2,scribble:1}}`
    hard `{zoneRate:.72, speed:[1.0,1.7], weights:{straight:1,curve:2,zigzag:2,spiral:2,figure8:2,wave:1,scribble:2}}`
  - 끝점: rng() < zoneRate면 존 안 무작위, 아니면 존 밖 0.05~0.35m. 시작점은 박스 위쪽 중앙 근처. 그리는 속도는 템플릿 길이 / (사람 기준 속도 × speed배수) 로 t 부여, 약간의 속도 흔들림.

- [ ] **Step 1: 실패하는 테스트:**
  - `always valid`: 난이도 3종 × 시드 300개 → sanitizeStroke ok, 모든 점 [0,1]
  - `zone rate roughly matches`: normal 1000개 → buildPath(...).inZone 비율 0.58~0.72
  - `variety`: normal 200개에서 namePitch 결과 종류 ≥ 6
  - `deterministic`: 같은 시드 → 같은 선
- [ ] **Step 2~4:** 실패 확인 → 구현 → PASS. **Step 5:** 커밋 `feat: AI pitcher stroke generator`.

### Task 6: 멀티 서버

**Files:** Create `server/index.js`, `server/rooms.js`, `server/match.js`; Test `test/server.test.js`

**Interfaces:**
- Consumes: `createGame`, `resolvePitch`, `sanitizeStroke`, `buildPath`, `hashSeed`, `RESULT_MS`, `HALF_BANNER_MS`, `STROKE_LIMITS`
- Produces:
  - `createServer({port}) → Promise<{httpServer, io, close()}>` (`server/index.js`가 export, 직접 실행 시 `PORT||3000`으로 listen). 테스트는 port 0.
  - Socket 이벤트 (모든 클→서 이벤트는 ack 콜백 `(res)=>{}`로 `{ok:true,...}|{ok:false,error:'한국어 메시지'}` 응답):
    | 클→서 | payload | 비고 |
    |---|---|---|
    | `room:create` | `{name, sessionId}` | ack `{ok, code}`; 코드 4글자 대문자(I,O,0,1 제외) |
    | `room:join` | `{code, name, sessionId}` | 2명 꽉 참 → `방이 가득 찼어요` |
    | `room:rejoin` | `{code, sessionId}` | 같은 sessionId면 자리 복구 |
    | `room:leave` | — | |
    | `game:start` | `{innings}` | 방장만, 2명일 때만, innings ∈ {1,3,5,9} |
    | `pitch:stroke` | `{pitchId, stroke}` | 현재 투수만, phase 'pitching'일 때만 |
    | `pitch:swing` | `{pitchId, t, ray}` | 현재 타자만, 1회만 |
    | `pitch:take` | `{pitchId}` | 타자 클라이언트가 공이 지나간 뒤 보냄 |
    | `emote` | `{id}` | id ∈ `['lol','shock','clap','angry','fire']`, 1초 1회 제한 |
    | `game:rematch` | — | 둘 다 누르면 같은 방에서 새 경기 |
    | `time:ping` | `{t0}` | ack `{t0, server: Date.now()}` |

    | 서→클 | payload |
    |---|---|
    | `room:state` | `{code, status:'waiting'|'ready'|'playing'|'final', players:[{name, team:'home'|'away', connected, host}], you:'home'|'away'}` |
    | `game:phase` | `{phase:'pitching'|'flight'|'result'|'final', game, pitcherTeam, pitchId, clockEndsAt?}` |
    | `pitch:start` | `{pitchId, stroke, startAt}` (서버 시각, 지금+900ms) |
    | `pitch:result` | `PitchResult`에서 `game`·`events`·`outcome`·`pitch`·`contact`·`swingT`·`flight`·`swing`(사람 스윙이면 t,ray) |
    | `emote` | `{team, id}` |
    | `room:closed` | `{reason}` |
  - 진행: 방장=home, 참가자=away. `game:start` → phase pitching(투수 = fieldingTeam, `clockEndsAt = now+clockMs`). 시간 초과 → BALL_AUTO 결과. stroke 수신 → sanitize(실패 시 BALL_AUTO) → `pitch:start` → phase flight → swing/take 수신 또는 `startAt + T + 3000`ms 초과 시 take → `resolvePitch(seed = hashSeed(roomSeed, pitchNo))` → `pitch:result` → `RESULT_MS[outcome]` (+halfOver면 `HALF_BANNER_MS`) 뒤 다음 phase 또는 final.
  - 끊김: 연결 끊기면 `connected:false` 브로드캐스트, 진행 타이머 일시정지, 60초 안에 `room:rejoin` 없으면 남은 사람 기권승(final, winner = 남은 팀). 둘 다 나가면 방 삭제. 빈 방/끝난 방 10분 후 정리.
  - 입력 제한: 이벤트별 초당 20회 넘으면 무시, stroke 페이로드 점 600개 초과 시 sanitize가 다운샘플.

- [ ] **Step 1: 실패하는 테스트** (`test/server.test.js`, socket.io-client 2개, port 0):
  - `healthz returns ok`
  - `create and join room`: 코드 형식 `/^[A-HJ-NP-Z2-9]{4}$/`, 두 명 room:state 수신, status 'ready'
  - `third player rejected`
  - `only host can start`
  - `full pitch flow`: start → home이 pitching 받음 → home이 직선 stroke 전송 → 둘 다 pitch:start → away가 take → 둘 다 같은 pitch:result(outcome TAKE_STRIKE 또는 TAKE_BALL, game 동일)
  - `wrong player cannot pitch`: away가 stroke 보내면 ok:false
  - `invalid stroke counts as ball`: `{pts:'x'}` → outcome BALL_AUTO
  - `swing only once`: 두 번째 swing ok:false
  - `rejoin restores state` (Review Focus 2): away 소켓 끊고 새 소켓으로 room:rejoin → ok, 현재 game:phase 즉시 수신
  - `forfeit after timeout`: 테스트용으로 `createServer({port:0, disconnectGraceMs:200})` → 끊고 300ms 후 final, winner home
  - `emote rate limit`
- [ ] **Step 2:** 실패 확인 → **Step 3:** 구현(`createServer` 옵션: `disconnectGraceMs`(기본 60000), `resultScale`(테스트에서 0.01로 연출 대기 단축)) → **Step 4:** PASS → **Step 5:** 커밋 `feat: multiplayer server`.

### Task 7: 3D 씬

**Files:** Create `public/index.html`, `public/css/style.css`(기본 레이아웃만), `public/js/scene/stage.js`, `field.js`, `players.js`, `ball.js`, `effects.js`, 임시 `public/js/main.js`(씬만 띄움)

**Interfaces:**
- Consumes: `PITCH_CAM`, `BAT_CAM`, `BOX`, `ZONE`, `RELEASE`, `Path`, `HitFlight`
- Produces:
  - `createStage(container) → Stage` — `Stage = {renderer, scene, camera, setView(name:'pitcher'|'batter'|'overview'|'follow', {instant?}), followTarget(obj3d|null), plateRayFromScreen(px, py) → {x,y}` (현재 카메라 기준 z=0 평면 교점), `screenRayDir(px,py) → {x,y,z}`(카메라 위치에서의 정규화 방향), `projectToScreen({x,y,z}) → {px,py}`, `onFrame(cb(dt, now))`, `onResize(cb)`}
    - pitcher 뷰 카메라 위치는 **정확히** PITCH_CAM, batter 뷰는 **정확히** BAT_CAM (판정 일치의 전제). 리사이즈 시 BOX 네 모서리가 화면 안 여백 6% 안에 들어오도록 fov 조정(세로 화면 대응).
    - 카메라 전환은 0.6초 보간, 단 투구 입력 중엔 전환 완료 상태여야 함.
  - `buildField(scene)` — 잔디(줄무늬 CanvasTexture), 내야 흙, 마운드(높이 0.25), 베이스·홈플레이트, 타석·파울라인 흰 선, 외야 펜스(반지름 ~120m 호, 높이 3m), 파울폴, 계단식 관중석 + InstancedMesh 관중(색 점), 조명탑, 하늘 그라데이션, 안개.
  - `createPlayers(scene, colors:{home, away}) → Players` — `{pitcher, batter, catcher, umpire, fielders:{p1b,p2b,ss,p3b,lf,cf,rf}, runners: Runner[], setTeams({batting, fielding}), playWindup(ms), playSwing(atMs), playCatch(), runFielderTo(pos), animateRunners(fromBases, toBases, scoringCount), setPitcherGhost(bool), update(dt)}`. 캐릭터: 캡슐 몸통 + 구 머리 + 모자(챙) + 팔다리 캡슐 + 글러브/배트, 팀 색 유니폼. 디자인은 우리 것(참고 게임의 흰 캡슐 타자와 다르게 굵은 2등신 + 큰 모자).
  - `createBall(scene) → Ball` — `{playPitch(path, startNow), stopAt(t), playHit(flight, fromPos) → Promise, trail.show/hide/fade, update(now)}`; 꼬리선 = 카메라를 향하는 리본 메시(가산 혼합, 팀 색), 최대 400 샘플.
  - `createEffects(scene) → {fireworks(pos), confetti(), zoneRing(on:boolean), update(dt)}` — zoneRing: 홈플레이트 위(z=HIT_ZONE.ideal) 반짝이는 링. 컨트롤러가 내가 타자일 때 공 z가 HIT_ZONE 안에 들어오면 켜고 나가면 끔 (design §5 보조 표시)
- [ ] **Step 1:** 임시 main.js로 씬 띄우고 직선/루프 Path를 반복 재생하는 디버그 루프 작성 (URL `?debug=scene`).
- [ ] **Step 2:** `npm start` 후 브라우저(데스크톱·mobile 프리셋)에서 스크린샷: 경기장·캐릭터·공·꼬리선 보임, 투수 뷰에서 투수 반투명, 콘솔 에러 0.
- [ ] **Step 3:** 커밋 `feat: 3D stadium, players, ball trail`.

### Task 8: 입력 + 효과음

**Files:** Create `public/js/input/drawPad.js`, `public/js/input/batInput.js`, `public/js/audio.js`

**Interfaces:**
- Consumes: `Stage.plateRayFromScreen`, `Stage.projectToScreen`, `Stage.screenRayDir`, `BOX`, `ZONE`, `STROKE_LIMITS`, `strokeInk`
- Produces:
  - `createDrawPad(stage, overlayCanvas) → {start({clockEndsAt, onThrow(stroke)}), stop(), showStroke(stroke|null)}` — 박스(BOX 모서리 투영)와 존 표시, 펜 굵기 화면 높이의 0.9%, 잉크 게이지(남은 비율), 남은 시간 원형 시계. pointerdown 박스 안에서만 시작, `setPointerCapture`, pointermove 마다 `plateRayFromScreen` → (u,v) 변환(박스 밖이면 clamp), 8ms 미만 간격 점은 합침, pointerup/cancel/잉크 소진/maxDuration → `onThrow`. 리사이즈 시 오버레이 다시 그림(그리던 선은 박스 좌표로 저장되어 있으므로 다시 투영).
  - `createBatInput(stage, el) → {arm({startNow, onSwing({t, ray})}), disarm()}` — 첫 pointerdown만 사용, t = now − startNow, ray = `screenRayDir`.
  - `audio = {unlock(), play(name), setEnabled(bool)}` — name ∈ `'whoosh','mitt','crack','cheer','boo','click','strikeout','homerun'`. 전부 OscillatorNode/노이즈 버퍼 합성.
- [ ] **Step 1:** 디버그 페이지 `?debug=draw`: 그리면 즉시 buildPath로 던지고 투수 뷰에서 공이 선 위를 지나가는지 확인, `?debug=bat`: 직선 공에 탭.
- [ ] **Step 2: 브라우저 확인** — mobile 프리셋에서 그리는 동안 `window.scrollY`·`visualViewport.scale` 변화 없음 (Review Focus 1). 세로→가로 리사이즈 후 박스 재배치되고 새로 그린 선이 공과 일치 (Review Focus 5). 공이 그린 선에서 벗어나지 않음.
- [ ] **Step 3:** 커밋 `feat: draw pad, bat input, synth audio`.

### Task 9: 경기 흐름 (AI + 온라인)

**Files:** Create `public/js/game/controller.js`, `localMatch.js`, `onlineMatch.js`, `public/js/net.js`

**Interfaces:**
- Consumes: Task 4 `resolvePitch`, Task 5 `generateAiStroke`, Task 6 소켓 이벤트, Task 7·8 모듈
- Produces:
  - 매치 소스 공통 인터페이스 (EventTarget 기반):
    - 이벤트: `phase` `{phase, game, pitcherTeam, pitchId, clockEndsAt?}` (clockEndsAt은 로컬 시각), `pitchStart` `{pitchId, stroke, startNow}` (로컬 performance.now 기준), `result` `PitchResult`, `emote` `{team, id}`, `room` (온라인만), `closed` `{reason}`
    - 메서드: `me → 'home'|'away'`, `submitStroke(stroke)`, `submitSwing({t, ray})`, `submitTake()`, `sendEmote(id)`, `rematch()`, `leave()`
  - `createLocalMatch({innings, difficulty, myTeam}) → MatchSource` — AI가 투수면 phase 후 900~1500ms "고민" 뒤 `generateAiStroke` → pitchStart. AI가 타자면 stroke 받는 즉시 `resolvePitch({swing:{type:'ai',difficulty}})`를 계산해 두고 pitchStart → T 후 result. 사람이 타자면 swing/take 받으면 resolvePitch. 결과 후 `RESULT_MS` 대기 → 다음 phase. 시드 = `hashSeed(Date.now(), pitchNo)`.
  - `createOnlineMatch(net) → MatchSource` — 서버 시각 → 로컬 변환은 `net.offset`.
  - `net = {connect() → Promise, offset, emit(ev, payload) → Promise<ack>, on(ev, cb), sessionId}` — sessionId는 localStorage `gd.session`(없으면 crypto.randomUUID). connect 직후 time:ping 5회 중앙값으로 offset. 재연결 시 자동 `room:rejoin`, `visibilitychange` 복귀 시 연결 확인.
  - `createGameController({stage, players, ball, effects, hud, overlays, drawPad, batInput, audio}) → {run(matchSource) → Promise<'lobby'|'rematch'>}` — phase pitching & 내가 투수 → setView('pitcher') + drawPad.start; 내가 타자 → setView('batter') + "상대가 그리는 중…" 표시. pitchStart → playWindup, 공 재생, 내가 타자면 batInput.arm, 공이 CATCHER_Z 지나면 자동 submitTake. result → 스윙 애니메이션(swingT), 타구면 setView('follow')+playHit+runFielderTo, 주자 애니메이션, 배너, 효과음, HUD 갱신. halfOver → "공수교대" 배너 + overview 뷰. final → 결과 화면.
- [ ] **Step 1:** AI 대전으로 1이닝 끝까지 플레이(브라우저). 확인: 투구 → AI 스윙 → 결과 → 카운트/아웃/주자/점수 HUD 반영 → 공수교대 → 내가 타자 → AI가 이상한 선 → 탭 → 결과 → 경기 종료 화면.
- [ ] **Step 2:** 탭 2개로 온라인 1이닝(둘 다 같은 결과·같은 점수), 한 탭 새로고침 후 복귀 확인.
- [ ] **Step 3:** 커밋 `feat: game controller, local and online matches`.

### Task 10: 로비·HUD·결과 화면·연출 마감

**Files:** Create `public/js/ui/lobby.js`, `hud.js`, `overlays.js`; Modify `public/js/main.js`(최종 라우터), `public/css/style.css`

**Interfaces:**
- Consumes: Task 9 컨트롤러·매치 소스, `net`
- Produces:
  - 화면: `lobby` → (`AI 대전` 설정 모달: 이닝 1/3/5/9, 난이도 쉬움/보통/어려움, 선공/후공) / (`친구 대전` → `방 만들기` | 코드 4칸 입력 `참가`) → `room` 대기실(큰 코드, `링크 복사`, 모바일은 `navigator.share`, 두 플레이어 카드, 방장만 이닝 선택 + `경기 시작`) → `game` → `result`(최종 점수, 이닝별 점수표, 팀별 탈삼진·최고 구속·가장 미친 공, `재대결`/`로비로`).
  - URL `?room=ABCD`로 들어오면 닉네임만 묻고 바로 참가. 닉네임 localStorage `gd.name`, 최대 10자.
  - 서버 깨우는 중: 소켓 연결 1.5초 넘으면 "서버 깨우는 중… (최대 1분)" 표시.
  - HUD: 상단 전광판(원정/홈 이름·점수·이닝 ▲▼), B·S·O 점, 주자 다이아몬드, 직전 투구 카드(구종 이름, km/h, 변화 지수 0~100), 역할 배지(`✏️ 내가 던질 차례` / `🏏 내가 칠 차례`), 온라인일 때 이모티콘 바(ㅋㅋ 😱 👏 😡 🔥) + 상대 이모티콘 떠오르는 애니메이션, 우상단 메뉴(효과음 켜기/끄기, 나가기 확인창).
  - 배너 문구: `스트라이크!`, `볼`, `파울`, `삼진!`, `볼넷`, `땅볼 아웃`, `뜬공 아웃`, `병살!`, `희생플라이`, `안타!`, `2루타!`, `3루타!!`, `홈런!!!`, `공수교대`, `끝내기!!`, `승리!`, `패배…`, `무승부`.
  - 스타일: 낙서/마커 느낌 로고, 두꺼운 외곽선 버튼, 밝은 팀 색(홈 #ff5a36, 원정 #2f7dff), 다크 반투명 HUD 카드, 폰트는 시스템 한글 폰트(Pretendard 없으면 `-apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`).
- [ ] **Step 1:** 구현 후 데스크톱 1280×800, 모바일 세로 375×812, 모바일 가로 812×375에서 각 화면 스크린샷 — 겹침·잘림·가로 스크롤 없음.
- [ ] **Step 2:** 커밋 `feat: lobby, HUD, result screen, polish`.

### Task 11: 통합 확인 + 밸런스

- [ ] **Step 1:** `npm test` 전부 PASS.
- [ ] **Step 2:** AI 대전 3이닝 완주(보통). 기록: 직선만 던질 때 vs 이상한 선 던질 때 AI 안타율 체감 — 이상한 선이 확실히 유리해야 함(design §1 실패 조건). 아니면 `DIFFICULTY`·`CONTACT` 수치 조정 후 테스트 재실행.
- [ ] **Step 3:** 사람 타격 난이도: 보통 AI 투수 상대로 10구 중 2~4번 컨택이 목표. 너무 어려우면 `CONTACT.dMax` 0.30→0.34.
- [ ] **Step 4:** 온라인 2탭 3이닝 완주, 이모티콘, 재대결, 강제 새로고침 복귀.
- [ ] **Step 5:** 콘솔 에러 0, 모바일 프리셋에서 프레임 끊김 없음.
- [ ] **Step 6:** 커밋 `chore: balance tuning`.

### Task 12: 배포

- [ ] **Step 1:** `README.md`(실행법·조작법), `render.yaml`(web, node, free, singapore, buildCommand `npm install`, startCommand `npm start`, healthCheckPath `/healthz`).
- [ ] **Step 2:** **사용자에게 저장소 공개/비공개 확인** 후 `gh repo create` + push.
- [ ] **Step 3:** Render `create_web_service`(free, singapore, node, repo URL, branch main) → `list_deploys`로 live 확인 → 배포 URL에서 `/healthz` 200, 실제 기기 크기 2개(데스크톱·모바일 프리셋)로 AI 대전 1타석 + 온라인 방 생성/참가 확인.
- [ ] **Step 4:** 사용자에게 URL과 친구 초대 방법 전달.
