# mail-mcp

네이버·다음 메일을 IMAP으로 읽어 Claude에게 넘기는 **읽기 전용** MCP 서버. 분석(요약·분류·할 일 추출)은 Claude가 대화에서 한다.

- stdio 방식: Claude Code가 필요할 때 자식 프로세스로 띄우고 세션이 끝나면 함께 종료한다. 포트를 열지 않는다
- 메일함을 읽기 전용(EXAMINE)으로 열어 읽음 상태를 바꾸지 않는다
- 발송·삭제·이동 도구는 일부러 두지 않는다. 메일 본문 속 문장을 AI가 지시로 오해해도 피해가 없게 하기 위함

## 도구

| 도구 | 설명 |
|---|---|
| `list_accounts` | 설정된 계정 |
| `list_mailboxes` | 메일함 목록 (`specialUse`로 보낸편지함·스팸 구분) |
| `search_messages` | 날짜·보낸이·제목·본문·안 읽음 조건으로 목록 (최신순) |
| `read_message` | 본문(HTML은 텍스트로 변환, 2만 자에서 자름)과 첨부 목록 |

## 설치

Node.js 24 이상 (npm 포함).

```bash
npm install
npm run build
cp .env.example .env   # 계정 정보 입력
npm run check          # 접속 점검: 메일함 목록과 최근 메일 3통 제목 출력
```

메일 서비스 쪽 준비:

- 네이버: 메일 → 환경설정 → POP3/IMAP 설정 → IMAP 사용. 2단계 인증 중이면 애플리케이션 비밀번호 발급
- 다음: 환경설정 → IMAP/POP3 → IMAP 사용. 2단계 인증 중이면 앱 비밀번호 발급

## Claude Code에 등록

어느 프로젝트에서든 쓰도록 사용자 범위로 등록한다.

```bash
# macOS
claude mcp add --scope user mail -- node ~/dev/mcp/mail/dist/index.js

# Windows (경로는 clone한 위치에 맞춘다)
claude mcp add --scope user mail -- node C:\dev\mcp\mail\dist\index.js
```

다른 기기(Windows)에서 쓰려면 이 저장소를 clone해 위 설치를 반복하고 그 기기의 `.env`를 따로 만든다. 메일 서버가 네이버·다음에 있으므로 맥을 거칠 필요가 없다.
