import { clientIp } from '../common/client-ip.js';
import { rateKey } from '../rate-limit/rate-limit.service.js';
import { hashLinkToken, LINK_TOKEN_PATTERN, linkMail, linkUrl, newLinkToken } from './email-links.js';

describe('email links', () => {
  it('makes 256-bit url-safe tokens and stores only a hash', () => {
    const token = newLinkToken();
    expect(token).toMatch(LINK_TOKEN_PATTERN);
    expect(newLinkToken()).not.toBe(token);
    expect(hashLinkToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashLinkToken(token)).not.toContain(token);
  });

  it('puts the token in the fragment of a localised page', () => {
    expect(linkUrl('https://godee.vercel.app', 'en', 'reset', 'abc')).toBe(
      'https://godee.vercel.app/en/reset-password#token=abc',
    );
    expect(linkUrl('http://localhost:3300', 'vi', 'verify', 'abc')).toBe(
      'http://localhost:3300/vi/verify-email#token=abc',
    );
  });

  it('builds the link email from fixed copy only (no user-chosen name)', () => {
    const mail = linkMail('vi', 'verify', 'https://x.test/vi/verify-email#token=a');
    expect(mail.text.startsWith('Chào bạn,')).toBe(true);
    expect(mail.html).toContain('href="https://x.test/vi/verify-email#token=a"');
    expect(mail.text).toContain('https://x.test/vi/verify-email#token=a');
    expect(linkMail('en', 'reset', 'https://x.test/en/reset-password#token=a').text.startsWith('Hi,')).toBe(true);
  });
});

describe('rate limit keys and client IP', () => {
  it('never stores the raw id and ignores case', () => {
    expect(rateKey('login:email', 'Ann@Example.com')).toBe(rateKey('login:email', 'ann@example.com'));
    expect(rateKey('login:email', 'ann@example.com')).not.toContain('ann');
    expect(rateKey('login:email', 'a@b.c')).not.toBe(rateKey('login:ip', 'a@b.c'));
  });

  it('takes the first forwarded address', () => {
    const req = (headers: Record<string, string>) => ({ headers, socket: { remoteAddress: '127.0.0.1' } }) as never;
    expect(clientIp(req({ 'x-vercel-forwarded-for': '198.51.100.1', 'x-forwarded-for': '10.0.0.1' }))).toBe('198.51.100.1');
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9');
    expect(clientIp(req({}))).toBe('127.0.0.1');
  });
});
