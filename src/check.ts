// 접속 점검: `npm run check`. 각 계정에 로그인해 메일함 목록과 최근 메일 3통의 제목을 출력한다
import { accounts } from './accounts.js';
import { listMailboxes, searchMessages } from './imap.js';

if (accounts.length === 0) {
  console.log('.env에 설정된 계정이 없습니다. .env.example을 참고하세요.');
  process.exit(1);
}

let failed = false;
for (const account of accounts) {
  try {
    const boxes = await listMailboxes(account);
    const recent = await searchMessages(account, 'INBOX', { limit: 3 });
    console.log(`✔ ${account.label} (${account.user}) — 메일함 ${boxes.length}개`);
    console.log(`  메일함: ${boxes.map((b) => b.path).join(', ')}`);
    for (const m of recent) console.log(`  · ${m.date?.slice(0, 10)} ${m.subject}`);
  } catch (e) {
    failed = true;
    console.log(`✘ ${account.label} (${account.user}) — ${(e as Error).message}`);
  }
}
process.exit(failed ? 1 : 0);
