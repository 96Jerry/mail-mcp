import { convert as htmlToText } from 'html-to-text';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

import type { MailAccount } from './accounts.js';

// 긴 뉴스레터 하나가 대화 맥락을 다 차지하지 않게 자른다
const MAX_BODY_CHARS = 20_000;

export interface MailboxInfo {
  path: string;
  name: string;
  specialUse?: string;
}

export interface MessageSummary {
  uid: number;
  date: string | null;
  from: string;
  subject: string;
  seen: boolean;
}

export interface MessageDetail extends MessageSummary {
  to: string;
  cc: string;
  body: string;
  truncated: boolean;
  attachments: { filename: string; contentType: string; size: number }[];
}

export interface SearchFilter {
  since?: string;
  before?: string;
  from?: string;
  subject?: string;
  text?: string;
  unseenOnly?: boolean;
  limit: number;
}

// 호출마다 접속하고 끊는다. 상시 연결을 유지하면 세션 만료·재접속 처리가 필요해진다
async function withClient<T>(
  account: MailAccount,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: true,
    auth: { user: account.user, pass: account.password },
    // 기본 로거는 stdout에 쓰는데, stdio MCP에서 stdout은 프로토콜 전용이라 섞이면 연결이 깨진다
    logger: false,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

// 읽기 전용(EXAMINE)으로 열어 Claude가 메일을 읽어도 '읽음' 표시가 바뀌지 않게 한다
async function withMailbox<T>(
  account: MailAccount,
  folder: string,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  return withClient(account, async (client) => {
    const lock = await client.getMailboxLock(folder, { readOnly: true });
    try {
      return await fn(client);
    } finally {
      lock.release();
    }
  });
}

export function listMailboxes(account: MailAccount): Promise<MailboxInfo[]> {
  return withClient(account, async (client) => {
    const boxes = await client.list();
    return boxes.map((b) => ({
      path: b.path,
      name: b.name,
      ...(b.specialUse ? { specialUse: b.specialUse } : {}),
    }));
  });
}

export function searchMessages(
  account: MailAccount,
  folder: string,
  filter: SearchFilter,
): Promise<MessageSummary[]> {
  return withMailbox(account, folder, async (client) => {
    const uids = await client.search(
      {
        ...(filter.since ? { since: filter.since } : {}),
        ...(filter.before ? { before: filter.before } : {}),
        ...(filter.from ? { from: filter.from } : {}),
        ...(filter.subject ? { subject: filter.subject } : {}),
        ...(filter.text ? { text: filter.text } : {}),
        ...(filter.unseenOnly ? { seen: false } : {}),
      },
      { uid: true },
    );
    if (!uids || uids.length === 0) return [];

    // UID는 도착 순서대로 커지므로 뒤에서 자르면 최신 메일이다
    const recent = uids.slice(-filter.limit);
    const messages = await client.fetchAll(
      recent,
      { envelope: true, flags: true, internalDate: true },
      { uid: true },
    );
    return messages
      .map((m) => ({
        uid: m.uid,
        date: toIso(m.envelope?.date ?? m.internalDate),
        from: formatAddresses(m.envelope?.from),
        subject: m.envelope?.subject ?? '(제목 없음)',
        seen: m.flags?.has('\\Seen') ?? false,
      }))
      .sort((a, b) => b.uid - a.uid);
  });
}

export function readMessage(
  account: MailAccount,
  folder: string,
  uid: number,
): Promise<MessageDetail> {
  return withMailbox(account, folder, async (client) => {
    const msg = await client.fetchOne(
      String(uid),
      { source: true, flags: true },
      { uid: true },
    );
    if (!msg || !msg.source) {
      throw new Error(`메일을 찾을 수 없음: ${folder} uid=${uid}`);
    }

    const parsed = await simpleParser(msg.source);
    // 텍스트 파트가 없는 HTML 전용 메일이 많다
    const fullBody =
      parsed.text?.trim() ||
      (parsed.html ? htmlToText(parsed.html, { wordwrap: false }) : '');
    const truncated = fullBody.length > MAX_BODY_CHARS;

    return {
      uid,
      date: toIso(parsed.date),
      from: parsed.from?.text ?? '',
      to: addressText(parsed.to),
      cc: addressText(parsed.cc),
      subject: parsed.subject ?? '(제목 없음)',
      seen: msg.flags?.has('\\Seen') ?? false,
      body: truncated ? fullBody.slice(0, MAX_BODY_CHARS) : fullBody,
      truncated,
      attachments: parsed.attachments.map((a) => ({
        filename: a.filename ?? '(이름 없음)',
        contentType: a.contentType,
        size: a.size,
      })),
    };
  });
}

function toIso(value: Date | string | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatAddresses(
  list: { name?: string; address?: string }[] | undefined,
): string {
  return (list ?? [])
    .map((a) => (a.name ? `${a.name} <${a.address ?? ''}>` : (a.address ?? '')))
    .join(', ');
}

type ParsedAddress = { text: string } | { text: string }[] | undefined;

function addressText(value: ParsedAddress): string {
  if (!value) return '';
  return Array.isArray(value) ? value.map((v) => v.text).join(', ') : value.text;
}
