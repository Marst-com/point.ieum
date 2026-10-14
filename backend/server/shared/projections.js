// 다른 시스템이 읽는 "공유용 복사본"의 모양. 이 파일이 곧 공유 약속(계약)이다.
// 원본(users, purchases)이 바뀌는 트랜잭션 안에서 같이 쓰기 때문에, 원본과 어긋나지 않는다.
const SCHEMA_VERSION = 1; // 필드를 바꾸면 올린다 (다른 시스템이 버전을 보고 대응할 수 있게)

/** 계정: 누구인지만 알려준다. 비밀번호 해시·포인트·돌·친구 수는 넣지 않는다. */
const accountProjection = (u) => ({ schema: SCHEMA_VERSION, username: u.username, name: u.name, role: u.role });

const ticketId = (uid, siteId) => `${uid}__${siteId}`;

/** 입장권: "이 사람이 이 사이트 입장권을 가지고 있다" 는 사실만. */
const ticketProjection = ({ uid, siteId, at }) => ({ schema: SCHEMA_VERSION, uid, siteId, at });

// 어긋났는지 비교할 필드 (updatedAt 은 쓸 때마다 바뀌니까 제외)
const ACCOUNT_FIELDS = ['schema', 'username', 'name', 'role'];
const TICKET_FIELDS = ['schema', 'uid', 'siteId', 'at'];

module.exports = { SCHEMA_VERSION, accountProjection, ticketId, ticketProjection, ACCOUNT_FIELDS, TICKET_FIELDS };
