// 화면 목록. perm 은 서버가 내려주는 권한 이름과 같다. (서버 쪽 server/permissions.js)
// 더 구체적인 경로(/chat/new)가 :roomId 보다 먼저 와야 한다.
export const ROUTES = [
  { path: '/', load: () => import('./screens/home.js') },
  { path: '/work', perm: 'work.mine', load: () => import('./screens/work.js') },
  { path: '/grade', perm: 'grade.view', load: () => import('./screens/myGrade.js') },
  { path: '/shop', perm: 'shop.view', load: () => import('./screens/shop.js') },
  { path: '/friends', perm: 'friends', load: () => import('./screens/friends.js') },
  { path: '/chat', perm: 'chat', load: () => import('./screens/chat/roomList.js') },
  { path: '/chat/new', perm: 'chat', load: () => import('./screens/chat/newChat.js') },
  { path: '/chat/:roomId', perm: 'chat', load: () => import('./screens/chat/roomView.js') },
  { path: '/admin/work', perm: 'work.view', load: () => import('./screens/admin/workRecords.js') },
  { path: '/admin/points', perm: 'points.grant', load: () => import('./screens/admin/pointGrant.js') },
  { path: '/admin/shop', perm: 'shop.manage', load: () => import('./screens/admin/shopManage.js') },
  { path: '/admin/roles', perm: 'roles.manage', load: () => import('./screens/admin/roleManage.js') },
];
