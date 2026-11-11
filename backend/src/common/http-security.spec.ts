import { checkCsrf } from './http-security.js';

const allowed = ['https://godee.vercel.app', 'http://localhost:3300'];
const req = (over: Partial<Parameters<typeof checkCsrf>[0]>) => ({ method: 'POST', hasBody: true, contentType: 'application/json', ...over });

describe('checkCsrf', () => {
  it('lets safe methods through, whatever their origin', () => {
    expect(checkCsrf({ method: 'GET', origin: 'https://evil.example', hasBody: false }, allowed)).toBeNull();
  });

  it('allows same-origin JSON writes and body-less writes such as logout', () => {
    expect(checkCsrf(req({ origin: 'https://godee.vercel.app', secFetchSite: 'same-origin' }), allowed)).toBeNull();
    expect(checkCsrf({ method: 'POST', hasBody: false, origin: 'http://localhost:3300' }, allowed)).toBeNull();
    // Non-browser clients send no Origin at all.
    expect(checkCsrf(req({}), allowed)).toBeNull();
  });

  it('refuses a cross-site form post (login CSRF)', () => {
    expect(
      checkCsrf(
        req({ origin: 'https://evil.example', contentType: 'application/x-www-form-urlencoded', secFetchSite: 'cross-site' }),
        allowed,
      )?.status,
    ).toBe(403);
    expect(checkCsrf(req({ origin: 'https://evil.example' }), allowed)?.status).toBe(403);
    expect(checkCsrf(req({ origin: 'null' }), allowed)?.status).toBe(403);
  });

  it('refuses non-JSON bodies even without an Origin header', () => {
    expect(checkCsrf(req({ contentType: 'text/plain' }), allowed)?.status).toBe(415);
    expect(checkCsrf(req({ contentType: 'application/x-www-form-urlencoded' }), allowed)?.status).toBe(415);
    expect(checkCsrf(req({ contentType: 'application/json; charset=utf-8' }), allowed)).toBeNull();
  });
});
