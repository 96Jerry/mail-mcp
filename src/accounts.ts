import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Claude Code가 어느 폴더에서 띄우든 이 프로젝트의 .env를 읽도록 실행 파일 기준으로 찾는다
const envPath = join(import.meta.dirname, '..', '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);

export interface MailAccount {
  id: string;
  label: string;
  host: string;
  port: number;
  user: string;
  password: string;
}

const PRESETS = [
  { id: 'naver', label: '네이버', host: 'imap.naver.com', env: 'NAVER' },
  { id: 'daum', label: '다음', host: 'imap.daum.net', env: 'DAUM' },
] as const;

// 아이디·비밀번호가 둘 다 있는 계정만 쓴다
export const accounts: MailAccount[] = PRESETS.flatMap((p) => {
  const user = process.env[`${p.env}_USER`]?.trim();
  const password = process.env[`${p.env}_PASSWORD`]?.trim();
  if (!user || !password) return [];
  return [{ id: p.id, label: p.label, host: p.host, port: 993, user, password }];
});

export function getAccount(id: string): MailAccount {
  const account = accounts.find((a) => a.id === id);
  if (!account) {
    const available = accounts.map((a) => a.id).join(', ') || '없음';
    throw new Error(`설정되지 않은 계정: ${id} (사용 가능: ${available})`);
  }
  return account;
}
