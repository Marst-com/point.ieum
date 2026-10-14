'use strict';
// 색인 정의. text=검색 대상 글자 필드 / numeric=정렬·순위용 숫자 / filters=범위 제한(예: 방 번호)
module.exports = {
  // 모든 사용자 (친구 찾기·포인트 배부·등급 관리)
  users: { text: ['name', 'username'], numeric: ['friendCount', 'gradeRank', 'stones', 'createdAt'], filters: [], fuzzy: true, choseong: true },
  // 일하는 사용자만 (일한 내역·순위)
  workers: { text: ['name', 'username'], numeric: ['stones'], filters: [], fuzzy: true, choseong: true },
  // 상점 사이트
  sites: { text: ['name', 'description'], numeric: ['price', 'createdAt'], filters: ['active'], fuzzy: true, choseong: true },
  // 톡 메시지 (방 단위로 범위를 좁혀서 검색)
  messages: { text: ['text'], numeric: ['createdAt'], filters: ['roomId'], fuzzy: false, choseong: false },
};
