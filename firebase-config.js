/**
 * Firebase 웹 설정
 *
 * ⚠️ 아래 apiKey 값만 채워주세요.
 *    Firebase 콘솔 → 프로젝트 설정 → 일반 → 내 앱 → SDK 설정 및 구성 → 구성(Config)
 *    거기 있는 apiKey 값("AIzaSyCv"로 시작하는 39자)을 따옴표 안에 붙여넣으면 됩니다.
 *
 * 참고: 이 값들은 공개돼도 되는 값입니다(웹앱에 그대로 실려 배포됨).
 *       실제 데이터 보호는 Firestore 보안 규칙(익명 로그인 필수)이 담당합니다.
 *       텔레그램 봇 토큰 같은 진짜 비밀과는 성격이 다릅니다.
 */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCveiRtVn7HBsAmPBQPMnZlOgav8H_M2hM",

  // 아래는 이미 채워져 있으니 건드리지 마세요.
  authDomain: "gugudan-champion.firebaseapp.com",
  projectId: "gugudan-champion",
  storageBucket: "gugudan-champion.firebasestorage.app",
  messagingSenderId: "875140716009",
  appId: "1:875140716009:web:bbb70846d4f8b5405b2778",
};
