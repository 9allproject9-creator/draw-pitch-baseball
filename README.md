# 그려던져! ⚾

선을 그리면 **그린 모양 그대로** 공이 날아가는 야구 게임.
지그재그, 뱅글뱅글, 정신나간 낙서 — 그릴 수 있으면 던질 수 있다.

- 🤖 **AI 대전** — 난이도 3단계, 1·3·5·9이닝
- 👫 **친구 대전** — 4글자 방 코드 / 링크로 1:1 온라인 대결
- 📱 모바일·PC 모두 지원

## 조작

| | |
|---|---|
| ✏️ 던질 때 | 화면에 한 붓으로 선을 그리고 손을 떼면 바로 던져짐. 선 끝이 노란 존 안이면 스트라이크 |
| 🏏 칠 때 | 공이 홈 근처에 오면 공을 터치/클릭 |
| 🌀 마구 | 이상하게 그릴수록 치기 어렵고, 빨리 그릴수록 공이 빨라짐 |

야구 룰 그대로: 3스트라이크 삼진, 4볼 볼넷, 몸에 맞는 공, 3아웃 공수교대, 연장전.

## 실행

```bash
npm install
npm run dev       # Cloudflare 로컬 환경 http://localhost:8787
npm test          # 규칙·궤적·판정·방 테스트
npm run deploy    # Cloudflare에 배포
```

## 구조

- `shared/` — 규칙, 선 분석, 궤적, 타격 판정, AI (서버와 브라우저가 같이 사용)
- `server/` — 방 로직(RoomCore)과 경기 진행(ServerMatch)
- `worker/` — Cloudflare Worker + Durable Object (방 하나 = Durable Object 하나, 웹소켓)
- `public/` — Three.js 3D 클라이언트

Cloudflare Workers 무료 플랜으로 돌아가요 (잠들지 않음).
