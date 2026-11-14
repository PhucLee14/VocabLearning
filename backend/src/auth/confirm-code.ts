import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * 6-digit codes emailed to confirm a sensitive action (PLAN.md Phase 1.5).
 * A code is valid for CODE_TTL_MS, once, for one user and one action, and is
 * void after MAX_ATTEMPTS wrong guesses. Only a salted hash is stored.
 */
export const CONFIRM_ACTIONS = ['set_password', 'delete_account'] as const;
export type ConfirmAction = (typeof CONFIRM_ACTIONS)[number];

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const RESEND_AFTER_MS = 60 * 1000;

export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

const digest = (salt: string, userId: string, action: string, code: string) =>
  createHash('sha256').update(`${salt}:${userId}:${action}:${code}`).digest('hex');

/** "<salt>.<sha256>" – the salt keeps stored values unique even when two codes are equal. */
export function hashCode(userId: string, action: string, code: string): string {
  const salt = randomBytes(12).toString('hex');
  return `${salt}.${digest(salt, userId, action, code)}`;
}

export function codeMatches(stored: string, userId: string, action: string, code: string): boolean {
  const [salt, hash] = stored.split('.');
  if (!salt || !hash || !/^\d{6}$/.test(code)) return false;
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(digest(salt, userId, action, code), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

const COPY = {
  vi: {
    set_password: 'đặt mật khẩu cho tài khoản',
    delete_account: 'xóa vĩnh viễn tài khoản',
    subject: (code: string) => `Mã xác nhận Godee: ${code}`,
    body: (what: string, code: string) =>
      `Chào bạn,\n\nMã xác nhận để ${what} của bạn là: ${code}\n\nMã có hiệu lực trong 10 phút và chỉ dùng được một lần.\nNếu bạn không yêu cầu, hãy bỏ qua email này và đổi mật khẩu hoặc đăng xuất các thiết bị khác.\n\n— Godee`,
  },
  en: {
    set_password: 'set a password for your account',
    delete_account: 'permanently delete your account',
    subject: (code: string) => `Your Godee code: ${code}`,
    body: (what: string, code: string) =>
      `Hi,\n\nYour code to ${what} is: ${code}\n\nIt is valid for 10 minutes and can be used once.\nIf you didn't ask for it, ignore this email and sign out your other devices.\n\n— Godee`,
  },
} as const;

/**
 * The email that carries a code, in the learner's language. Like linkMail, it
 * contains no user-chosen text (an account may use a stranger's address).
 */
export function codeMail(locale: 'vi' | 'en', action: ConfirmAction, code: string) {
  const c = COPY[locale];
  const text = c.body(c[action], code);
  // Escape the text, then highlight the code (digits only).
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const html =
    `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#1b2420">` +
    escape(text)
      .split('\n')
      .join('<br>')
      .replace(code, `<strong style="font-size:22px;letter-spacing:3px">${code}</strong>`) +
    `</div>`;
  return { subject: c.subject(code), text, html };
}
