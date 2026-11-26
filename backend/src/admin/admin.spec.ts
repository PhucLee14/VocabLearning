import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { replyMail } from '../feedback/feedback.service.js';
import { AdminGuard } from './admin.guard.js';
import { changes } from './audit.service.js';

const contextWith = (user: unknown) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;

describe('AdminGuard', () => {
  const guard = new AdminGuard();

  it('lets admins through', () => {
    expect(guard.canActivate(contextWith({ id: 'a', role: 'ADMIN' }))).toBe(true);
  });

  it('refuses learners and anonymous requests with 403', () => {
    expect(() => guard.canActivate(contextWith({ id: 'u', role: 'USER' }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextWith(undefined))).toThrow(ForbiddenException);
  });
});

describe('audit changes()', () => {
  it('lists only the fields that differ, as [before, after]', () => {
    const before = { headword: 'bank', meaningVi: null, synonyms: ['shore'], senseNo: 1 };
    expect(changes(before, { headword: 'bank', meaningVi: 'bờ sông', synonyms: ['shore'], senseNo: undefined })).toEqual({
      meaningVi: [null, 'bờ sông'],
    });
  });

  it('compares arrays and objects by value', () => {
    expect(changes({ topicIds: ['a', 'b'] }, { topicIds: ['a', 'b'] })).toEqual({});
    expect(changes({ topicIds: ['a'] }, { topicIds: ['a', 'b'] })).toEqual({ topicIds: [['a'], ['a', 'b']] });
  });

  it('treats a missing value and null as the same', () => {
    expect(changes({}, { ipa: null })).toEqual({});
  });
});

describe('replyMail', () => {
  it('holds only fixed text and the link, in the learner’s language', () => {
    const vi = replyMail('vi', 'https://godee.vercel.app/vi/feedback');
    expect(vi.subject).toContain('Godee');
    expect(vi.text).toContain('https://godee.vercel.app/vi/feedback');
    expect(replyMail('en', 'x').text.startsWith('Hi,')).toBe(true);
  });
});
