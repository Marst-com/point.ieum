// 프론트와 백엔드를 "따로" 배포할 때만 바꿔. (같은 서버가 프론트까지 내려주면 비워 둬)
// 예: API_BASE: 'https://ieum-api.example.com'   ← 끝에 / 없이, 백엔드 주소
// 이 값을 바꾼 뒤 프론트를 다시 배포하면 돼. 백엔드의 CORS_ORIGIN 에는 이 프론트 주소를 넣어야 해.
window.IEUM_CONFIG = { API_BASE: '' };
