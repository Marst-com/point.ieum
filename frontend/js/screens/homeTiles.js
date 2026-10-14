// 홈 화면 버튼 목록. perm 이 있는 사람에게만 보인다. 맨 앞의 버튼이 큰 버튼(hero)이 된다.
// 멤버는 '일하기', 어드민/관리자는 '일하기' 대신 관리 도구들이 맨 앞에 온다.
export const TILES = [
  { perm: 'work.mine', to: '/work', icon: '⛏️', name: '일하기', desc: '화면을 눌러 돌을 캐요' },
  { perm: 'work.view', to: '/admin/work', icon: '📋', name: '일한 내역', desc: '1위부터 보기' },
  { perm: 'points.grant', to: '/admin/points', icon: '🪙', name: '포인트 배부', desc: '이름 검색 후 지급·차감' },
  { perm: 'shop.manage', to: '/admin/shop', icon: '🏗️', name: '상점 사이트', desc: '입장권 사이트 관리' },
  { perm: 'roles.manage', to: '/admin/roles', icon: '🛡️', name: '등급 관리', desc: '멤버·어드민·관리자' },
  { perm: 'shop.view', to: '/shop', icon: '🛒', name: '상점', desc: '사이트 입장권' },
  { perm: 'chat', to: '/chat', icon: '💬', name: '톡', desc: '단톡·DM' },
  { perm: 'work.mine', to: '/grade', icon: '🏅', name: '내 일한 등급', desc: 'F부터 S까지' },
  { perm: 'friends', to: '/friends', icon: '👥', name: '친구', desc: '아이디로 추가' },
];
