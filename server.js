// ════════════════════════════════════════════════════════════
// ConnexChat 테스트 서버 (Module B + C)
//   - REST API (Express)
//   - WebSocket (ws)  : 읽지 않은 대화 / 채팅방 실시간 대화
//   - 데이터는 메모리에 저장 (서버 재시작 시 초기화)
//
// 로컬 실행:  npm install && npm start   → http://localhost:8080
// 배포 시:    포트는 process.env.PORT 사용 (Render/Railway 등 자동 지정)
// ════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
app.use(cors());
app.use(express.json());

// ── 로그인 계정 ──
const TEST_EMAIL = 'user000@mod.com';
const TEST_PASSWORD = 'password123';
const MY_ID = 100; // "나"의 사용자 id (isMyMessage 판단용)

// 프로필 이미지: 별도 파일 없이 항상 뜨는 공개 아바타 사용
const img = (n) => `https://i.pravatar.cc/150?img=${n}`;

// ── 메모리 데이터 ──
const me = {
  id: MY_ID,
  email: TEST_EMAIL,
  name: 'Competitor1 님',
  profileImage: img(12),
  createdAt: '2025-01-20T09:00:00Z',
};

const employees = [
  { id: 1, name: '김지훈 대리', department: '개발팀', position: '대리', profileImage: img(1) },
  { id: 2, name: '이서연 사원', department: '개발팀', position: '사원', profileImage: img(2) },
  { id: 3, name: '박민수 과장', department: '개발팀', position: '과장', profileImage: img(3) },
  { id: 4, name: '최유진 사원', department: '디자인팀', position: '사원', profileImage: img(4) },
  { id: 5, name: '정우빈 팀장', department: '개발팀', position: '팀장', profileImage: img(5) },
  { id: 6, name: '한지민 대리', department: '마케팅팀', position: '대리', profileImage: img(6) },
  { id: 7, name: '서민재 사원', department: '인사팀', position: '사원', profileImage: img(7) },
  { id: 8, name: '오세훈 대리', department: '영업팀', position: '대리', profileImage: img(8) },
  { id: 9, name: '강하늘 과장', department: '기획팀', position: '과장', profileImage: img(9) },
];
const empById = (id) => employees.find((e) => e.id === id);

let nextRoomId = 4;
let chatrooms = [
  { id: 1, sectionName: '사내 전체 공지', roomName: '개발팀 기술 공유방', lastMessage: '채팅방 목록의 대화 내용입니다...', lastMessageTime: '오후 10:21', participants: [1, 2, 3] },
  { id: 2, sectionName: '개발팀', roomName: '디자인 협업 세션', lastMessage: '채팅방 목록의 대화 내용입니다...', lastMessageTime: '오후 10:21', participants: [1, 4, 5] },
  { id: 3, sectionName: '개발팀', roomName: '마케팅 정기 회의', lastMessage: '채팅방 목록의 대화 내용입니다...', lastMessageTime: '오후 10:21', participants: [2, 3, 6] },
];
const roomById = (id) => chatrooms.find((r) => r.id === id);

let nextMsgId = 100;
// 채팅방별 메시지 목록
const messages = {
  1: [
    { id: 1, senderId: 1, senderName: '김지훈 대리', senderProfile: img(1), content: '오늘 회의는 4시에서 5시로 변경되었습니다.', timestamp: '오후 5:24', isMyMessage: false },
    { id: 2, senderId: MY_ID, content: '확인했습니다. 회의실도 변경되나요?', timestamp: '오후 5:24', isMyMessage: true },
    { id: 3, senderId: 3, senderName: '박민수 과장', senderProfile: img(3), content: '회의실은 그대로 A룸이에요. 변경된 건 시간뿐입니다.', timestamp: '오후 5:26', isMyMessage: false },
    { id: 4, senderId: 6, senderName: '한지민 대리', senderProfile: img(6), content: "발표자료는 방금 드라이브에 업로드했습니다.", timestamp: '오후 5:47', isMyMessage: false },
  ],
  2: [
    { id: 20, senderId: 4, senderName: '최유진 사원', senderProfile: img(4), content: '시안 공유드립니다!', timestamp: '오후 2:10', isMyMessage: false },
  ],
  3: [],
};
// 채팅방별 읽지 않은 개수
const unreadCount = { 1: 2, 2: 1, 3: 2 };

// 현재 시각을 "오후 5:24" 형태로
function nowTime() {
  const d = new Date();
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h < 12 ? '오전' : '오후';
  h = h % 12 || 12;
  return `${ampm} ${h}:${m}`;
}

// 응답 도우미
const ok = (res, data, message) => res.json({ success: true, ...(message ? { message } : {}), data });
const fail = (res, code, message, errors) =>
  res.status(code).json({ success: false, message, ...(errors ? { errors } : {}) });

// ── 인증 미들웨어 (Bearer 토큰이 있으면 통과) ──
function auth(req, res, next) {
  const h = req.headers['authorization'] || '';
  if (!h.startsWith('Bearer ') || h.slice(7).length < 3) {
    return fail(res, 401, '인증이 필요합니다.', [
      { code: 'UNAUTHORIZED', message: '유효하지 않은 토큰입니다.' },
    ]);
  }
  next();
}

// ════════════════════════════════════════════════════════════
// [Module B] REST API
// ════════════════════════════════════════════════════════════

// 로그인
app.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const errors = [];
  if (!email) errors.push({ code: 'INVALID_FORMAT', message: '이메일을 입력해주세요.' });
  if (!password || password.length < 4)
    errors.push({ code: 'INVALID_FORMAT', message: '비밀번호는 4자 이상이어야 합니다.' });
  if (errors.length) return fail(res, 400, '유효성 검사 실패', errors);

  if (email !== TEST_EMAIL || password !== TEST_PASSWORD)
    return fail(res, 401, '로그인 실패', [
      { code: 'INVALID_CREDENTIALS', message: '이메일 또는 비밀번호가 올바르지 않습니다.' },
    ]);

  ok(res, { token: 'connexchat-token-' + Date.now() }, '로그인 성공');
});

// 내 정보
app.get('/users/me', auth, (req, res) => ok(res, me));

// 사원 목록
app.get('/employees', auth, (req, res) =>
  res.json({ success: true, data: employees, totalCount: employees.length }));

// 채팅방 목록 (즐겨찾기 포함 - includeFavorites 쿼리는 받되 동일 형식 반환)
app.get('/chatrooms', auth, (req, res) => {
  const list = chatrooms.map((r) => ({
    id: r.id,
    roomName: r.roomName,
    sectionName: r.sectionName,
    lastMessage: r.lastMessage,
    lastMessageTime: r.lastMessageTime,
    unreadCount: unreadCount[r.id] || 0,
    participants: r.participants,
  }));
  ok(res, { chatrooms: list, totalCount: list.length });
});

// 채팅방 생성
app.post('/chatrooms', auth, (req, res) => {
  const { roomName, participants, sectionName } = req.body || {};
  if (!roomName) return fail(res, 400, '채팅방 이름을 입력해주세요.');
  const room = {
    id: nextRoomId++,
    sectionName: sectionName || '개발팀',
    roomName,
    lastMessage: '',
    lastMessageTime: '',
    participants: participants || [],
  };
  chatrooms.unshift(room);
  messages[room.id] = [];
  unreadCount[room.id] = 0;
  ok(res, {
    id: room.id,
    roomName: room.roomName,
    participants: (room.participants || []).map((id) => {
      const e = empById(id);
      return e ? { id: e.id, name: e.name, profileImage: e.profileImage } : { id };
    }),
    createdAt: new Date().toISOString(),
    createdBy: 'user000',
  }, '채팅방이 생성되었습니다.');
});

// ════════════════════════════════════════════════════════════
// [Module C] REST API
// ════════════════════════════════════════════════════════════

// 읽지 않은 대화 목록 (REST 버전)
function buildUnread() {
  const unreadChats = chatrooms
    .filter((r) => (unreadCount[r.id] || 0) > 0)
    .map((r) => ({
      chatroomId: r.id,
      roomName: r.roomName,
      lastMessage: r.lastMessage || '대화 내용입니다...',
      unreadCount: unreadCount[r.id],
      participants: r.participants.map((id) => {
        const e = empById(id);
        return e ? { id: e.id, name: e.name, profileImage: e.profileImage } : { id };
      }),
    }));
  const totalCount = unreadChats.reduce((s, c) => s + c.unreadCount, 0);
  return { totalCount, message: `읽지 않은 대화가 ${totalCount}개 있어요!`, unreadChats };
}

app.get('/messages/unread', auth, (req, res) => ok(res, buildUnread()));

// 대화 읽음 처리
app.put('/messages/read', auth, (req, res) => {
  const { chatroomId } = req.body || {};
  const room = roomById(Number(chatroomId));
  if (!room)
    return fail(res, 400, '채팅방을 찾을 수 없습니다.', [
      { code: 'CHATROOM_NOT_FOUND', message: '존재하지 않는 채팅방입니다.' },
    ]);
  const read = unreadCount[room.id] || 0;
  unreadCount[room.id] = 0;
  broadcastUnread(); // WebSocket 으로 갱신 알림
  ok(res, { chatroomId: room.id, readMessages: read, remainingUnread: 0 }, '메시지를 읽음 처리했습니다.');
});

// 채팅방 나가기
app.delete('/chatrooms/:id/leave', auth, (req, res) => {
  const id = Number(req.params.id);
  const idx = chatrooms.findIndex((r) => r.id === id);
  if (idx === -1)
    return fail(res, 400, '권한이 없습니다.', [
      { code: 'PERMISSION_DENIED', message: '이미 나간 채팅방이거나 참여하지 않은 채팅방입니다.' },
    ]);
  chatrooms.splice(idx, 1);
  delete messages[id];
  delete unreadCount[id];
  ok(res, { chatroomId: id, leftAt: new Date().toISOString() }, '채팅방에서 나갔습니다.');
});

// 채팅방 수정
app.put('/chatrooms/:id', auth, (req, res) => {
  const id = Number(req.params.id);
  const room = roomById(id);
  if (!room) return fail(res, 400, '채팅방을 찾을 수 없습니다.');
  const { sectionName, roomName, participants } = req.body || {};
  if (roomName) room.roomName = roomName;
  if (sectionName) room.sectionName = sectionName;
  if (participants) room.participants = participants;
  ok(res, {
    id: room.id,
    sectionName: room.sectionName,
    roomName: room.roomName,
    participants: room.participants.map((pid) => {
      const e = empById(pid);
      return e ? { id: e.id, name: e.name, profileImage: e.profileImage } : { id: pid };
    }),
    updatedAt: new Date().toISOString(),
  }, '채팅방이 수정되었습니다.');
});

// 채팅 메시지 조회 (REST 버전)
app.get('/chatrooms/:id/messages', auth, (req, res) => {
  const id = Number(req.params.id);
  const room = roomById(id);
  if (!room) return fail(res, 400, '채팅방을 찾을 수 없습니다.');
  ok(res, { chatroomId: id, chatroomName: room.roomName, messages: messages[id] || [] });
});

// 메시지 전송 (REST 버전)
app.post('/messages/send', auth, (req, res) => {
  const { chatroomId, content } = req.body || {};
  const room = roomById(Number(chatroomId));
  if (!room) return fail(res, 400, '채팅방을 찾을 수 없습니다.');
  const msg = { id: nextMsgId++, chatroomId: room.id, senderId: MY_ID, content, timestamp: nowTime(), isMyMessage: true };
  messages[room.id] = messages[room.id] || [];
  messages[room.id].push(msg);
  room.lastMessage = content;
  room.lastMessageTime = msg.timestamp;
  broadcastToRoom(room.id, msg); // WebSocket 으로도 전파
  ok(res, msg, '메시지가 전송되었습니다.');
});

// ════════════════════════════════════════════════════════════
// [수업용 예제 11·12] 데모 채팅방 REST (인증 불필요)
// ════════════════════════════════════════════════════════════

// 데모 채팅방 목록
app.get('/demo/chatrooms', (req, res) => ok(res, demoRoomList));

// 데모 채팅방 만들기
app.post('/demo/chatrooms', (req, res) => {
  const { roomName } = req.body || {};
  if (!roomName) return fail(res, 400, '채팅방 이름을 입력해주세요.');
  const room = { id: demoNextRoomId++, roomName };
  demoRoomList.push(room);
  demoChatMessages[room.id] = [];
  ok(res, room, '채팅방이 만들어졌습니다.');
});

// 데모 채팅방 삭제
app.delete('/demo/chatrooms/:id', (req, res) => {
  const id = Number(req.params.id);
  const idx = demoRoomList.findIndex((r) => r.id === id);
  if (idx === -1) return fail(res, 400, '채팅방을 찾을 수 없습니다.');
  demoRoomList.splice(idx, 1);
  delete demoChatMessages[id];
  delete demoChatClients[id];
  ok(res, { id }, '채팅방이 삭제되었습니다.');
});

// ════════════════════════════════════════════════════════════
// [수업 연습용 API] /study/*  — 인증 없이 쓰는 쉬운 예제 API
//   과일 목록으로 GET / POST / PUT / DELETE 를 연습한다.
//   (+ 미니 로그인: /study/login → /study/secret 는 토큰 필요)
// ════════════════════════════════════════════════════════════
let studyFruits = [
  { id: 1, name: 'Apple', price: 1000 },
  { id: 2, name: 'Banana', price: 500 },
  { id: 3, name: 'Grape', price: 3000 },
];
let studyNextId = 4;
const STUDY_TOKEN = 'study-token-1234';

// 1) 인사 한마디 (가장 단순한 GET)
app.get('/study/hello', (req, res) => ok(res, { message: '안녕하세요! 서버입니다.' }));

// 2) 서버의 현재 시간
app.get('/study/time', (req, res) => ok(res, { now: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) }));

// 3) 과일 목록 (+ ?search=글자 로 검색)
app.get('/study/fruits', (req, res) => {
  const search = req.query.search;
  const list = search ? studyFruits.filter((f) => f.name.includes(search)) : studyFruits;
  ok(res, list);
});

// 4) 과일 한 개 상세 (경로 파라미터)
app.get('/study/fruits/:id', (req, res) => {
  const fruit = studyFruits.find((f) => f.id === Number(req.params.id));
  if (!fruit) return fail(res, 404, '그 번호의 과일이 없습니다.');
  ok(res, fruit);
});

// 5) 과일 추가 (POST)
app.post('/study/fruits', (req, res) => {
  const { name, price } = req.body || {};
  if (!name) return fail(res, 400, '과일 이름(name)을 보내주세요.');
  const fruit = { id: studyNextId++, name, price: Number(price) || 0 };
  studyFruits.push(fruit);
  ok(res, fruit, '과일이 추가되었습니다.');
});

// 6) 과일 수정 (PUT)
app.put('/study/fruits/:id', (req, res) => {
  const fruit = studyFruits.find((f) => f.id === Number(req.params.id));
  if (!fruit) return fail(res, 404, '그 번호의 과일이 없습니다.');
  const { name, price } = req.body || {};
  if (name) fruit.name = name;
  if (price !== undefined) fruit.price = Number(price);
  ok(res, fruit, '과일이 수정되었습니다.');
});

// 7) 과일 삭제 (DELETE)
app.delete('/study/fruits/:id', (req, res) => {
  const idx = studyFruits.findIndex((f) => f.id === Number(req.params.id));
  if (idx === -1) return fail(res, 404, '그 번호의 과일이 없습니다.');
  const removed = studyFruits.splice(idx, 1)[0];
  ok(res, removed, '과일이 삭제되었습니다.');
});

// 8) 미니 로그인 (토큰 연습용)
app.post('/study/login', (req, res) => {
  const { email, password } = req.body || {};
  if (email === 'student@test.com' && password === '1234') {
    return ok(res, { token: STUDY_TOKEN }, '로그인 성공');
  }
  fail(res, 401, '이메일 또는 비밀번호가 틀렸습니다.');
});

// 9) 비밀 정보 (토큰이 있어야 볼 수 있다)
app.get('/study/secret', (req, res) => {
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${STUDY_TOKEN}`) {
    return fail(res, 401, '토큰이 없거나 틀렸습니다. (Authorization: Bearer 토큰)');
  }
  ok(res, { secret: '비밀 메시지: 오늘 급식은 치킨입니다.' });
});

app.get('/', (req, res) => res.send('ConnexChat 서버 동작 중 ✅ (Module B + C, WebSocket 포함)'));

// ════════════════════════════════════════════════════════════
// WebSocket
//   /ws/unread?token=...                     → 읽지 않은 대화 실시간
//   /ws/chatrooms/:id/messages?token=...     → 채팅방 실시간 대화
// ════════════════════════════════════════════════════════════

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const unreadClients = new Set();       // /ws/unread 접속들
const roomClients = new Map();         // roomId -> Set(ws)
const demoRooms = new Map();           // (수업용) 방이름 -> Set(ws)
const practiceClients = new Set();     // (수업용) /ws/practice 접속들

// (수업용 예제 11·12) 데모 채팅방 - 인증 없이, 기록 저장됨
let demoNextRoomId = 1;
const demoRoomList = [];               // [ {id, roomName} ]
const demoChatMessages = {};           // roomId -> [ {id, sender, content, time} ]
const demoChatClients = {};            // roomId -> Set(ws)
let demoMsgSeq = 1;

function broadcastUnread() {
  const payload = JSON.stringify({ name: 'Unread Messages Update', response: { event: 'unread_messages', data: buildUnread() } });
  for (const ws of unreadClients) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}

function broadcastToRoom(roomId, msg) {
  const set = roomClients.get(roomId);
  if (!set) return;
  const payload = JSON.stringify({ name: 'New Message', response: { event: 'unread_message', data: msg } });
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;

  // 읽지 않은 대화
  if (path === '/ws/unread') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      unreadClients.add(ws);
      // 접속 즉시 현재 상태 1회 전송
      ws.send(JSON.stringify({ name: 'Unread Messages Update', response: { event: 'unread_messages', data: buildUnread() } }));
      ws.on('close', () => unreadClients.delete(ws));
    });
    return;
  }

  // 채팅방 대화: /ws/chatrooms/{id}/messages
  const m = path.match(/^\/ws\/chatrooms\/(\d+)\/messages$/);
  if (m) {
    const roomId = Number(m[1]);
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (!roomClients.has(roomId)) roomClients.set(roomId, new Set());
      roomClients.get(roomId).add(ws);

      const room = roomById(roomId);
      // 최초 연결 시 지난 대화 목록 1회 전송
      ws.send(JSON.stringify({
        name: 'Stadt Connection',
        response: {
          event: 'connected_chatroom',
          data: { chatroomId: roomId, chatroomName: room ? room.roomName : '채팅방', messages: messages[roomId] || [] },
        },
      }));

      // 클라이언트가 보낸 메시지 처리
      ws.on('message', (raw) => {
        let obj;
        try { obj = JSON.parse(raw.toString()); } catch (_) { return; }
        if (obj.event === 'send_message') {
          const content = obj.body?.content || '';
          if (!content) return;
          const msg = { id: nextMsgId++, senderId: MY_ID, content, timestamp: nowTime(), isMyMessage: true };
          messages[roomId] = messages[roomId] || [];
          messages[roomId].push(msg);
          if (room) { room.lastMessage = content; room.lastMessageTime = msg.timestamp; }
          broadcastToRoom(roomId, msg); // 방의 모두에게 전파
        }
      });

      ws.on('close', () => roomClients.get(roomId)?.delete(ws));
    });
    return;
  }

  // ──────────────────────────────────────────────────────────
  // [WebSocket 수업용 데모 엔드포인트] (인증 불필요)
  // ──────────────────────────────────────────────────────────

  // 1) 에코: 보낸 글자를 그대로 돌려준다  → /ws/echo
  if (path === '/ws/echo') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on('message', (raw) => ws.send(raw.toString()));
    });
    return;
  }

  // 2) 시간 방송: 1초마다 현재 시간을 보내준다  → /ws/time
  if (path === '/ws/time') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      const timer = setInterval(() => {
        if (ws.readyState === ws.OPEN) ws.send(new Date().toLocaleTimeString('ko-KR'));
      }, 1000);
      ws.on('close', () => clearInterval(timer));
    });
    return;
  }

  // 3) 방 브로드캐스트: 같은 방(name)에 접속한 모두에게 전달 + 접속자 수  → /ws/room?name=xxx
  if (path === '/ws/room') {
    const roomName = url.searchParams.get('name') || 'lobby';
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (!demoRooms.has(roomName)) demoRooms.set(roomName, new Set());
      const set = demoRooms.get(roomName);
      set.add(ws);
      const announce = () => {
        const payload = JSON.stringify({ type: 'members', count: set.size });
        for (const c of set) if (c.readyState === c.OPEN) c.send(payload);
      };
      announce(); // 접속 시 인원수 알림
      ws.on('message', (raw) => {
        const payload = JSON.stringify({ type: 'chat', text: raw.toString() });
        for (const c of set) if (c.readyState === c.OPEN) c.send(payload);
      });
      ws.on('close', () => { set.delete(ws); announce(); });
    });
    return;
  }

  // 4) 모듈 C 연습: 최초 연결 시 지난 메시지(connected) + 보내면(send_message)
  //    새 메시지(new_message) 를 방송하고, 1초 뒤 상대(봇)가 자동 응답  → /ws/practice
  if (path === '/ws/practice') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      practiceClients.add(ws);
      // 최초 1회: 지난 메시지 목록
      ws.send(JSON.stringify({
        event: 'connected',
        data: {
          messages: [
            { id: 1, sender: '김코딩', content: '안녕하세요! 환영합니다.', isMine: false },
            { id: 2, sender: '나', content: '안녕하세요~', isMine: true },
          ],
        },
      }));
      let seq = 100;
      ws.on('message', (raw) => {
        let obj; try { obj = JSON.parse(raw.toString()); } catch (_) { return; }
        if (obj.event !== 'send_message') return;
        const content = obj.body?.content || '';
        if (!content) return;
        // 내가 보낸 메시지 방송
        const mine = { id: seq++, sender: '나', content, isMine: true };
        const payload = JSON.stringify({ event: 'new_message', data: mine });
        for (const c of practiceClients) if (c.readyState === c.OPEN) c.send(payload);
        // 1초 뒤 상대(봇) 자동 응답
        setTimeout(() => {
          const reply = { id: seq++, sender: '상대', content: `"${content}" 잘 받았어요! 👍`, isMine: false };
          const p2 = JSON.stringify({ event: 'new_message', data: reply });
          for (const c of practiceClients) if (c.readyState === c.OPEN) c.send(p2);
        }, 1000);
      });
      ws.on('close', () => practiceClients.delete(ws));
    });
    return;
  }

  // 5) (예제 11·12) 데모 채팅방: 기록 저장 + 이름 포함  → /ws/demo/chatrooms/{id}?name=이름
  const dm = path.match(/^\/ws\/demo\/chatrooms\/(\d+)$/);
  if (dm) {
    const roomId = Number(dm[1]);
    const name = url.searchParams.get('name') || '익명';
    wss.handleUpgrade(req, socket, head, (ws) => {
      demoChatMessages[roomId] = demoChatMessages[roomId] || [];
      if (!demoChatClients[roomId]) demoChatClients[roomId] = new Set();
      demoChatClients[roomId].add(ws);

      // 최초 연결: 저장돼 있던 지난 대화 목록을 보냄 (기록 유지!)
      ws.send(JSON.stringify({
        event: 'connected',
        data: { messages: demoChatMessages[roomId] },
      }));

      ws.on('message', (raw) => {
        let obj; try { obj = JSON.parse(raw.toString()); } catch (_) { return; }
        if (obj.event !== 'send_message') return;
        const content = obj.body?.content || '';
        if (!content) return;
        const msg = { id: demoMsgSeq++, sender: name, content, time: nowTime() };
        demoChatMessages[roomId].push(msg); // ★ 저장 → 다음에 들어와도 남아있음
        const payload = JSON.stringify({ event: 'new_message', data: msg });
        for (const c of demoChatClients[roomId]) {
          if (c.readyState === c.OPEN) c.send(payload);
        }
      });

      ws.on('close', () => demoChatClients[roomId]?.delete(ws));
    });
    return;
  }

  socket.destroy(); // 알 수 없는 경로
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`✅ ConnexChat 서버 실행: http://localhost:${PORT}`);
  console.log(`   테스트 계정: ${TEST_EMAIL} / ${TEST_PASSWORD}`);
});
