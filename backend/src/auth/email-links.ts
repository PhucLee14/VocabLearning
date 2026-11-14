import { createHash, randomBytes } from 'node:crypto';

/**
 * One-time links emailed for email verification and password reset.
 *
 * The link carries a random 256-bit token in the URL fragment
 * (`/vi/reset-password#token=…`): fragments are never sent to a server, so
 * the token stays out of access logs and Referer headers. The page reads it
 * and POSTs it back; only its SHA-256 is stored (`auth_tokens`).
 */
export type LinkKind = 'verify' | 'reset';

export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 30 * 60 * 1000;

export const newLinkToken = () => randomBytes(32).toString('base64url');
export const hashLinkToken = (token: string) => createHash('sha256').update(token).digest('hex');
/** What a well-formed token looks like (43 base64url characters). */
export const LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const PAGE: Record<LinkKind, string> = { verify: 'verify-email', reset: 'reset-password' };

export const linkUrl = (origin: string, locale: 'vi' | 'en', kind: LinkKind, token: string) =>
  `${origin}/${locale}/${PAGE[kind]}#token=${token}`;

const COPY = {
  vi: {
    verify: {
      subject: 'Xác minh email cho tài khoản Godee',
      intro: 'Bấm nút bên dưới để xác minh địa chỉ email của tài khoản Godee.',
      button: 'Xác minh email',
      note: 'Link có hiệu lực trong 24 giờ. Nếu bạn không tạo tài khoản Godee, hãy bỏ qua email này.',
    },
    reset: {
      subject: 'Đặt lại mật khẩu Godee',
      intro: 'Có người (hy vọng là bạn) vừa yêu cầu đặt lại mật khẩu cho tài khoản Godee của bạn.',
      button: 'Đặt mật khẩu mới',
      note: 'Link có hiệu lực trong 30 phút và chỉ dùng được một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này: mật khẩu hiện tại vẫn giữ nguyên.',
    },
    greeting: 'Chào bạn,',
    fallback: 'Nếu nút không bấm được, hãy mở link này:',
  },
  en: {
    verify: {
      subject: 'Verify your email for Godee',
      intro: 'Press the button below to verify the email address of your Godee account.',
      button: 'Verify email',
      note: "The link is valid for 24 hours. If you didn't create a Godee account, ignore this email.",
    },
    reset: {
      subject: 'Reset your Godee password',
      intro: 'Someone (hopefully you) asked to reset the password of your Godee account.',
      button: 'Choose a new password',
      note: "The link is valid for 30 minutes and works once. If you didn't ask for it, ignore this email: your password stays the same.",
    },
    greeting: 'Hi,',
    fallback: "If the button doesn't work, open this link:",
  },
} as const;

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The email that carries a link, in the learner's language.
 *
 * No user-chosen text goes in (not even the name): anyone can sign up with a
 * stranger's address, and the account's name would then reach that stranger
 * in a verification or reset email sent from our address (spam / phishing).
 */
export function linkMail(locale: 'vi' | 'en', kind: LinkKind, url: string) {
  const c = COPY[locale];
  const k = c[kind];
  const text = `${c.greeting}\n\n${k.intro}\n\n${url}\n\n${k.note}\n\n— Godee`;
  const u = escape(url);
  const html =
    `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#1b2420">` +
    `<p>${escape(c.greeting)}</p><p>${escape(k.intro)}</p>` +
    `<p><a href="${u}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#1f9d55;color:#ffffff;font-weight:700;text-decoration:none">${escape(k.button)}</a></p>` +
    `<p style="font-size:13px;color:#5b6660">${escape(c.fallback)}<br><a href="${u}">${u}</a></p>` +
    `<p style="font-size:13px;color:#5b6660">${escape(k.note)}</p><p>— Godee</p></div>`;
  return { subject: k.subject, text, html };
}
