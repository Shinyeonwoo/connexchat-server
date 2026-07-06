# ConnexChat 테스트 서버 (Module B + C)

Flutter 앱(Connex Chat) 수업/테스트용 서버. REST API + WebSocket 을 모두 제공한다.
데이터는 메모리에 저장(재시작 시 초기화). 로그인: `user000@mod.com` / `password123`

## 로컬 실행
```bash
npm install
npm start          # http://localhost:8080
```

## 제공 기능
- Module B: `POST /auth/login`, `GET /users/me`, `GET /employees`, `GET /chatrooms`, `POST /chatrooms`
- Module C(REST): `GET /messages/unread`, `PUT /messages/read`, `DELETE /chatrooms/:id/leave`,
  `PUT /chatrooms/:id`, `GET /chatrooms/:id/messages`, `POST /messages/send`
- Module C(WebSocket): `/ws/unread`, `/ws/chatrooms/:id/messages`

## 무료 배포 (고정 도메인) — Render.com
1. 이 `connexchat-server` 폴더를 GitHub 저장소에 올린다.
2. https://render.com 가입(무료) → **New + → Web Service** → 그 저장소 선택.
   (또는 **New + → Blueprint** 선택 시 `render.yaml` 로 자동 설정)
3. Runtime: Node / Build: `npm install` / Start: `npm start` (자동 인식됨) → Create.
4. 배포 완료되면 주소가 생긴다:  `https://<이름>.onrender.com`
   - REST 는 그대로,  WebSocket 은 `wss://<이름>.onrender.com/ws/...`
   ※ 무료 플랜은 15분 미사용 시 잠들었다가 요청 오면 다시 깨어남(첫 요청이 느릴 수 있음).

## 앱에 연결
Flutter 앱의 화면들에서 서버 주소(`tank2401.dothome.co.kr`)를
발급받은 `<이름>.onrender.com` 으로 바꾸면 된다. (WebSocket 은 `wss://`)
