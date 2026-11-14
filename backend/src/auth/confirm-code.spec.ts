import { codeMail, codeMatches, hashCode, newCode } from './confirm-code.js';

describe('confirmation codes', () => {
  it('are 6 digits', () => {
    for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^\d{6}$/);
  });

  it('match only for the same user, action and code; stored values are unique', () => {
    const stored = hashCode('user-1', 'delete_account', '012345');
    expect(stored).not.toContain('012345');
    expect(codeMatches(stored, 'user-1', 'delete_account', '012345')).toBe(true);
    expect(codeMatches(stored, 'user-1', 'delete_account', '012346')).toBe(false);
    expect(codeMatches(stored, 'user-2', 'delete_account', '012345')).toBe(false);
    expect(codeMatches(stored, 'user-1', 'set_password', '012345')).toBe(false);
    expect(codeMatches(stored, 'user-1', 'delete_account', '12345')).toBe(false);
    expect(hashCode('user-1', 'delete_account', '012345')).not.toBe(stored);
  });

  it('builds a localised email from fixed copy only (no user-chosen name)', () => {
    const mail = codeMail('vi', 'set_password', '482913');
    expect(mail.subject).toContain('482913');
    expect(mail.text.startsWith('Chào bạn,')).toBe(true);
    expect(mail.text).toContain('đặt mật khẩu');
    expect(mail.html).toContain('<strong style="font-size:22px;letter-spacing:3px">482913</strong>');
    expect(codeMail('en', 'delete_account', '000001').text).toContain('permanently delete');
  });
});
