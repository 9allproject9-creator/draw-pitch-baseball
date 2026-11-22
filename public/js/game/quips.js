// 던질 때·결과 때 뜨는 웃긴 멘트
const Q = {
  insane: [
    '🚨 물리법칙 위반 감지! 🚨', '뉴턴이 무덤에서 벌떡 일어났습니다', '중력이 퇴근했습니다', '이 공은 GPS가 고장났어요',
    '물리 선생님이 오열합니다 😭', '아인슈타인도 포기한 궤적', '공이 자아를 찾았습니다', '과학자들이 긴급회의 소집',
    '이건 야구가 아니라 현대미술이다 🎨', '공: 나도 내가 어디 가는지 몰라', '관성의 법칙? 그게 뭔데', 'NASA에서 연락 왔어요 🛰️',
    '심판: 이거… 규칙에 있나요?', '양자역학적 투구입니다', '공이 차원을 넘나듭니다 🌀',
  ],
  loops: [
    '공이 회전목마를 탔어요 🎠', '어지러워… 공이 멀미해요 🤢', '뱅글뱅글 무한 루프', '공: 여기가 어디죠?',
    '롤러코스터 탑승 완료 🎢', '공이 자기 꼬리를 쫓는 중', '토네이도 경보 발령 🌪️', '빙글빙글 돌아가는 공의 하루',
  ],
  zigzag: [
    '번개 맞은 공 ⚡', '지그재그 음주운전 단속 대상 🚓', '공이 술 마셨나요?', '공이 춤을 춥니다 💃',
    '테트리스 하는 공', '번개처럼 꺾입니다', '공이 길을 세 번 잃었어요',
  ],
  eight: ['무한대 ∞ 공', '8자 드라이브 중', '공이 피겨스케이팅을 합니다 ⛸️'],
  curve: ['교과서에 실릴 커브', '휘어지는 인생처럼', '바나나킥인 줄', '살짝 꺾어봤어요 😏'],
  fast: [
    '💨 빛보다 빠른 공', '포수 손 괜찮아요?', '스피드건 고장났어요', '과속 단속 카메라 찰칵 📸',
    '공이 순간이동했습니다', '타자: 방금 뭐 지나갔어?', '음속 돌파 💥', '눈 깜빡하면 끝',
  ],
  slow: [
    '🐢 공이 산책 중…', '커피 한 잔 하고 올게요 ☕', '공이 오다가 잠들었어요 😴', '아리랑~ 아리랑~',
    '공: 천천히 가도 괜찮아', '달팽이도 추월하겠다', '공이 경치 구경 중', '택배보다 느린 공',
  ],
  straight: ['정직한 직구. 노잼 😐', '교과서 직구 📚', '평범함의 극치', '공이 곧은 인생을 삽니다', 'FM 투구'],
  any: [
    '뭐야 저 공은 ㅋㅋ', '이게… 야구라고?', '타자: ???', '공이 자유를 찾았어요', '중력: 나 무시하냐?',
    '오늘 공 컨디션 묘하네요', '해설자도 말을 잃었습니다', '이걸 치라고?',
  ],
  miss: [
    '헛스윙 폭발 💥 다 날아갔다!', '선풍기 스윙 🌀', '바람의 아들 등장', '스윙 한 번에 셋이 우주로 🚀',
    '심판까지 왜 날아가요 ㅋㅋ', '포수: 저는 왜요?', '홈플레이트 대폭발', '헛스윙 에너지 보존 법칙 위반',
  ],
  hbp: ['타자: 왜 나한테 그래요 😭', '고의 아니에요 (아마도)', '타자 발사 완료 🚀', '아야!! 벽까지 날아감', '보험 처리 될까요?'],
  hr: ['공이 우주로 떠났습니다 🚀', '관중석 택배 도착 📦', '안녕~ 잘 가~ 👋', '저 공은 이제 전설입니다'],
  strikeout: ['삼진! 마구의 승리 🎉', '타자 멘탈 붕괴', '배트는 장식이었나요?'],
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function pitchQuip(p) {
  const name = p.name || '';
  const roll = Math.random();
  if (p.craziness >= 0.8) return pick(Q.insane);
  if (p.kmh >= 140 && roll < 0.7) return pick(Q.fast);
  if (p.kmh <= 40 && roll < 0.7) return pick(Q.slow);
  if (name.includes('회오리') || name.includes('블랙홀')) return pick(roll < 0.25 ? Q.insane : Q.loops);
  if (name.includes('8자')) return pick(Q.eight);
  if (name.includes('지그재그') || name.includes('번개')) return pick(Q.zigzag);
  if (name.includes('커브') || name.includes('슬라이더')) return pick(Q.curve);
  if (p.craziness < 0.06) return pick(Q.straight);
  return pick(roll < 0.3 ? Q.insane : Q.any);
}

export function resultQuip(outcome, events) {
  if (outcome === 'MISS') return pick(Q.miss);
  if (outcome === 'HBP') return pick(Q.hbp);
  if (outcome === 'HR') return pick(Q.hr);
  if (events?.some((e) => e.type === 'strikeout')) return pick(Q.strikeout);
  return null;
}
