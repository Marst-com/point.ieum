# IEUM PointSystem

일하기(광산) · 상점(사이트 입장권) · 톡(DM/단톡) · 일한 등급(F~S) · 친구 · 관리 도구가 있는 포인트 시스템.
일해서 번 돌을 관리자가 보고 포인트로 배부하고, 그 포인트로 사이트 입장권을 사서 들어가 즐기는 구조야.
**프론트는 모양만**, 로직·DB 연결은 전부 **백엔드(Node.js + Express + Socket.io + Firebase Admin)** 에 있어.

```
ieum-pointsystem/
├─ frontend/      화면 (HTML/CSS/순수 JS — 빌드 없음)
├─ backend/       서버·검색 엔진·테스트·스크립트 (package.json 도 여기)
├─ env.example    환경변수 예시 (점 없는 이름이라 gitignore 에 안 걸려)
└─ README.md
```

## 바로 써 보기 (Firebase 없이)
```bash
cd backend
npm install
npm run dev        # 메모리 DB + 데모 계정 → http://localhost:3000  (프론트도 이 서버가 같이 내려줘)
```
데모 계정: `owner/owner1234`(제작자) · `manager/manager1234`(관리자) · `admin/admin1234`(어드민) · `miner/miner1234`, `miner2/miner1234`(멤버)

## 배포
공통: Firebase Firestore 를 만들고 서비스 계정 키(JSON)를 발급한 뒤, `backend/firestore.rules` 를 배포해 (클라이언트 직접 접근을 전부 막고 DB 는 백엔드만 만진다).
환경변수는 `env.example` 의 값들을 **호스팅 서비스의 환경변수 설정**에 넣어 (`JWT_SECRET`, `FIREBASE_SERVICE_ACCOUNT` 는 필수. 서비스 계정은 JSON 내용을 통째로 한 줄로).
로컬에서 파일로 쓰고 싶으면 `env.example` 을 `backend/.env` 로 복사해 (루트의 `.gitignore` 가 `.env` 는 올리지 않게 막아 줘).

### 방법 A — 서버 하나 (제일 간단)
backend 가 `../frontend` 를 그대로 내려줘서 서버 하나면 끝나.
- 루트 디렉터리 `backend` · 설치 `npm install` · 시작 `npm start` · 헬스체크 경로 `/healthz`
- `frontend/config.js`, `CORS_ORIGIN`, `SERVE_FRONTEND` 는 건드리지 않아도 돼.

### 방법 B — 프론트와 백엔드를 따로
1. **백엔드**를 먼저 올려 (방법 A 와 같은 설정) + 환경변수 추가: `SERVE_FRONTEND=0`, `CORS_ORIGIN=<프론트 주소>`
2. `frontend/config.js` 의 `API_BASE` 를 백엔드 주소로 바꿔 (예: `'https://ieum-api.example.com'`, 끝에 `/` 없이)
3. **프론트**는 `frontend` 폴더를 정적 사이트로 올려 (빌드 명령 없음, 출력 폴더도 그대로 `frontend`)
- 로그인 토큰은 `Authorization` 헤더로만 보내니까 쿠키 설정은 필요 없어. 실시간 톡(웹소켓)도 같은 `API_BASE` 로 붙어.
- 프론트 주소가 바뀌면 `CORS_ORIGIN` 도 같이 바꿔야 해. 안 맞으면 브라우저가 요청을 막아.
- 웹소켓은 서버가 `Origin` 을 직접 확인해서, 허용하지 않은 사이트에서는 연결이 거부돼.

### 처음 한 번
- 제작자 계정 만들기 (같은 환경변수로, `backend` 에서): `npm run owner -- <아이디> <비밀번호> [이름]`
- `NODE_ENV=production` 에서는 메모리 DB(`USE_MEMORY_DB=1`)나 `JWT_SECRET` 없는 시작을 거부해.

## 다른 시스템과 DB 함께 쓰기
**원칙: 다른 시스템은 "읽기만" 한다.** 포인트는 100% 관리자 지급이라 PointSystem 만 바꾸고, 다른 시스템은 계정과 입장권 보유 여부만 읽고, 각 시스템의 내용 데이터는 자기 컬렉션에 따로 둔다. 쓰는 쪽이 하나뿐이라 서로 덮어쓰는 충돌이 생기지 않아.

**1) 이름 충돌 방지** — 우리 컬렉션은 전부 `DB_PREFIX`(기본 `ieumps_`)가 붙어: `ieumps_users`, `ieumps_rooms` … 다른 시스템은 자기 접두사를 쓰고, `ieumps_` 로 시작하는 컬렉션에는 쓰지 마. (처음 데이터를 넣은 뒤 접두사를 바꾸면 기존 데이터가 안 보이게 되니까 바꾸지 마.)

**2) 읽어도 되는 곳 (공유용 읽기 전용 복사본)** — 원본이 바뀌는 트랜잭션 안에서 같이 쓰니까 원본과 어긋나지 않아. 비밀번호 해시·포인트·돌·친구 같은 건 들어 있지 않아.

| 컬렉션 | 문서 id | 필드 |
|---|---|---|
| `ieumps_shared_accounts` | 사용자 id | `schema`, `username`, `name`, `role`, `updatedAt` |
| `ieumps_shared_tickets` | `사용자id__사이트id` | `schema`, `uid`, `siteId`, `at`, `updatedAt` |

`schema`(지금 1)는 필드가 바뀌면 올라가. 한 사이트의 입장권 보유자 목록은 `where siteId == <사이트 id>` 로 읽으면 돼.

**3) 접근 방법 두 가지**
- **API (권장):** 사이트 키(`siteKey`, 관리 화면에서 확인)로 인증하는 읽기 전용 호출이야.
  ```
  POST /api/external/account  { siteKey, userId | username } → { id, username, name, role }
  POST /api/external/ticket   { siteKey, userId }            → { owned, via: 'ticket'|'staff'|null, since }
  POST /api/external/verify   { siteKey, token }             → 입장 토큰 확인 (ieum_token)
  ```
  입장권은 **자기 사이트 것만** 알려줘. 다른 사이트의 입장권은 못 봐.
- **직접 읽기:** 다른 시스템의 **서버**가 Admin SDK 로 위 두 컬렉션을 읽어. 반드시 읽기 전용 서비스 계정(IAM 역할 `roles/datastore.viewer`)을 쓰고 쓰기 권한은 주지 마. 브라우저/앱이 직접 읽는 건 막혀 있어(`firestore.rules`) — 그쪽은 API 를 써.

> ⚠ **직접 읽기의 한계:** `roles/datastore.viewer` 는 Firestore **전체**를 읽을 수 있는 역할이라, 직접 읽는 시스템은 `ieumps_users`(비밀번호 해시·포인트 포함)까지 읽을 수 있어. 그래서 직접 읽기는 **믿을 수 있는 서버에만** 주고, 그렇지 않은 시스템은 API 만 쓰게 해. 완전히 가르려면 PointSystem 을 별도 Firebase 프로젝트로 분리해야 하는데, 이 경우 공유용 복사본을 다른 프로젝트로 내보내는 건 아직 안 만들었어.

**4) 동기화 점검·복구** (backend 폴더에서)
```bash
npm run sync:check     # 원본 ↔ 공유용 복사본(계정·입장권) ↔ 검색 색인이 어긋났는지 보고만 한다
npm run sync:repair    # 어긋난 것을 원본 기준으로 고친다 (몇 번 돌려도 결과가 같아)
```
`SYNC_ON_START=1` 이면 서버를 켤 때마다 복사본을 자동으로 맞춰. 원본이 항상 기준이고, 복사본·검색 색인은 언제든 원본으로 다시 만들 수 있어.

**5) 우리 쪽 동시 쓰기** — 포인트·구매·가입·친구·돌 캐기·역할 변경·사이트 수정·DM 열기·단톡 나가기·메시지 저장은 전부 DB 트랜잭션이라, 여러 요청(또는 서버 여러 대)이 동시에 와도 한 번만 반영돼. 메시지는 더 새로운 것만 "마지막 메시지"가 돼.
- 한계: 일하기 속도 제한(매크로 방지)은 서버 한 대 안에서만 세. 서버를 여러 대 띄우면 대수만큼 느슨해져.
- 한계: 검색 색인은 변경 직후 바로 고치지만, 서버 여러 대가 동시에 같은 사람을 고치면 순서가 뒤바뀔 수 있어. 그럴 땐 `sync:repair` 로 맞춰.
- 한계: 동시성 테스트는 메모리 DB 로 했어. 실제 Firestore 에서의 동시 처리는 이 환경에서 확인하지 못했어.

## 구조
```
backend/
  server/     config · permissions · realtime · app · index
    db/         collections · memoryAdapter · firestoreAdapter · index(facade)
    services/   auth · user · grade · point · work · shop · friend · chat · userSearch
    routes/     auth · me · work · shop · external · friends · chat · admin/{workRecords,points,shopSites,roles}
    middleware/ auth · errorHandler · rateLimit        socket/ index(실시간 톡)
    search/     client · documents · indexer · bootstrap (서비스 ↔ 검색 엔진 연결)
    shared/     projections(공유용 복사본의 모양=약속) · reconcile(점검·복구)
    utils/      errors · validate · similarity · tokens · ids · asyncHandler
  search/     직접 만든 검색 엔진 (외부 의존성 0) — 아래 '검색 엔진' 참고
    engine/     analyzer(한글 분해·초성·자판 변환) · similarity · shardIndex · sortedBlocks · persistence · shard
    cluster/    cluster(라우터) · remoteShard · hash     node/ shardServer     bin/ shardNode     schema.js
  tests/      node:test (52개)
  scripts/    createOwner · checkFrontend · reindexSearch · benchSearch · syncShared
frontend/
  index.html · config.js(백엔드 주소 설정)
  css/        tokens · base · components · home · work · chat · lists
  js/         main · routes
    core/       api · store · router · session · socket · dom · toast · format · labels
    components/ header · modal · tabs · searchBox · userRow · gradeBadge · emptyState · miningScene
    screens/    login · home(+homeTiles) · work · myGrade · shop · friends · chat/* · admin/*
```

## 역할/권한 (server/permissions.js)
| 역할 | 할 수 있는 것 |
|---|---|
| 멤버 | 일하기, 상점 구매, 톡, 친구, 내 등급 |
| 어드민 | 멤버 기능(일하기 제외) + 일한 내역 보기 + 포인트 배부 |
| 관리자 | 어드민 + 상점에 사이트 추가/수정/숨기기 |
| 제작자 | 전부 + 등급 관리(멤버/어드민/관리자 지정) |
| 익명 | 상점 구경만 (DB에 저장 안 됨) |

## 상점 사이트 연동 (DB 공유 사이트)
들어가기 → 서버가 `주소?ieum_token=...`(2분짜리 토큰)으로 보내줘. 사이트 서버는 이렇게 확인해:
```
POST /api/external/verify   { "siteKey": "<관리 화면의 사이트 키>", "token": "<ieum_token>" }
→ { valid: true, user: { id, username, name } }
```

## 테스트
```bash
# 아래 명령은 모두 backend 폴더에서
npm test               # 백엔드 + 검색 엔진 + 배포 설정 + DB 공유/동시성 52개
npm run check:front    # 프론트 문법/import/CSS 클래스/CSP 정적 검사
```

## 검색 엔진
유저(친구 찾기·포인트 배부·등급 관리·일한 내역), 상점 사이트, 톡 메시지를 각각 따로 검색하되 **하나의 엔진**이 처리해.
- **한글**: 자모로 풀어서 비교해서 `민ㅈ`(타이핑 도중), `ㅁㅈ`/`ㄱㅁㅈ`(초성), `김민쥰`(오타), 영문 오타도 돼. 정렬은 정확히 같음 → 앞부분 → 포함 → 비슷함 순, 같으면 인기(친구 수)·등급·최신순.
- **한/영 키를 잘못 눌러도**: 영문 자판으로 친 `alswns`는 "민준"을, 한글 모드로 친 `ㅡㅑㅜㅓㅕㅜ`는 `minjun`을 찾아 (두벌식 기준, 3글자 이상). 정상 질의로 결과가 충분하면 변환 검색은 하지 않고, 원래 질의의 결과가 항상 위에 와.
- **구조**: 3-gram 역색인 + 가장 짧은 목록부터 교집합(흔한 글자가 섞여도 빠름) → 정확히 맞는 결과가 모자랄 때만 오타 허용 단계. 순위는 정렬 블록으로 "나보다 돌 많은 사람 수"를 정확히 계산(동점은 같은 순위).
- **분산**: 문서 id 해시로 샤드에 나눠 저장, 읽기는 모든 샤드에 동시에 물어서 합쳐. 샤드는 이 서버 안에 둘 수도(`SEARCH_LOCAL_SHARDS`), 다른 서버의 샤드 노드로 둘 수도 있어(`SEARCH_NODES`).
- **저장**: 샤드 노드는 `snapshot + wal` 로 디스크에 저장하고 껐다 켜면 복원해 (`SEARCH_DATA_DIR`).
- DB(Firestore)가 원본이고 색인은 언제든 `npm run search:reindex` 로 다시 만들 수 있어.

```bash
# 샤드 노드 (서버마다 하나씩, backend 폴더에서)
SEARCH_KEY=비밀 SEARCH_PORT=7001 SEARCH_HOST=0.0.0.0 SEARCH_DATA_DIR=./data/shard-0 npm run search:node
# 앱 서버
SEARCH_NODES=http://10.0.0.11:7001,http://10.0.0.12:7001 SEARCH_KEY=비밀 npm start
```
샤드 노드는 반드시 사설망에서만 열고 `SEARCH_KEY` 를 걸어 (키 없으면 시작을 거부해).

### 실제로 잰 값 (이 샌드박스, 노드 1대, 가짜 사용자 100만 명, `npm run bench:search`)
색인 48,000건/초 · 메모리 약 1.1GB(1명당 약 1.2KB)

| 질의 | p50 | p95 | p99 |
|---|---|---|---|
| 이름 전체 ("김민준") | 0.6ms | 10.6ms | 15.6ms |
| 이름 일부 ("민준") | 1.8ms | 5.2ms | 8.0ms |
| 앞 두 글자 ("김민") | 6.0ms | 17.9ms | 25.0ms |
| 초성 3자 | 3.3ms | 21ms | 26ms |
| 오타 | 5.2ms | 12ms | 18ms |
| 아이디 | 3.9ms | 6.5ms | 8.0ms |
| **한 글자 ("김")** | 35ms | 44ms | 57ms |
| **초성 2자 ("ㅁㅈ")** | 35ms | 50ms | 57ms |
| 인기순 상위 20 / 내 순위 / 돌 갱신 / 가입 | 0.01ms | | |

### 수억 명이면 (위 측정값으로 한 계산 — 실제 부하 테스트는 아님)
- 메모리만 보면 노드 1대(힙 8GB) ≈ 600만 명 → 1억 명 ≈ 16대, 2억 명 ≈ 33대.
- 하지만 가장 느린 질의(한 글자·초성 2자)는 노드당 문서가 많을수록 느려져(100만 명에서 약 35~57ms). 최악 지연을 이 정도로 묶으려면 노드당 100만 명 안팎이 안전하고, 그러면 1억 명 ≈ 100대야. 질의를 2글자 이상으로 제한하면 훨씬 줄어.
- 샤드 노드는 Node 프로세스 1개 = CPU 1코어. 같은 프로세스에 샤드를 여러 개 두면 빨라지지 않고(측정함), **서버를 나눠야** 빨라져.

### 한계 (알고 쓰기)
- **복제 없음**: 노드가 죽으면 그 노드의 결과만 빠진 부분 결과가 나오고(`partial`), 복구되면 디스크에서 돌아와. 여러 사본을 두는 건 아직 안 만들었어.
- **샤드 개수를 바꾸면** 전부 다시 색인해야 해 (`npm run search:reindex`).
- 한 글자/초성 한 글자 질의는 "앞부분 일치"만 지원해. 후보가 너무 많으면 `truncated` 로 일부만 보고 답해.
- snapshot 은 동기 실행이라 아주 큰 노드에선 잠깐 멈춰. wal 은 20ms 단위로 모아 쓰니까 비정상 종료 시 마지막 20ms 는 잃을 수 있어.
- `reindexAll` 은 DB 를 통째로 읽어. 수억 건은 페이지 단위로 읽게 바꿔야 해.
- 전수 비교(정답) 테스트는 3천 건·240개 질의로 했어. 수억 건 규모의 정확도·장애 상황은 따로 부하 테스트가 필요해.
