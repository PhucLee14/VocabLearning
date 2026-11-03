import { createHash } from 'node:crypto';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import {
  authorizationUrl,
  exchangeCode,
  newPending,
  pkceChallenge,
  publicOrigin,
  redirectUri,
  safeLocale,
  safeNext,
  verifyIdToken,
} from './google.js';

describe('Google sign-in helpers', () => {
  it('only accepts same-site next paths', () => {
    expect(safeNext('/words?status=new')).toBe('/words?status=new');
    expect(safeNext('//evil.example')).toBe('/dashboard');
    expect(safeNext('/\\evil.example')).toBe('/dashboard');
    expect(safeNext('https://evil.example')).toBe('/dashboard');
    expect(safeNext(undefined)).toBe('/dashboard');
    expect(safeLocale('en')).toBe('en');
    expect(safeLocale('fr')).toBe('vi');
  });

  it('builds the callback on the first frontend origin', () => {
    const origin = publicOrigin('https://vocab.example.app/, http://localhost:3300');
    expect(origin).toBe('https://vocab.example.app');
    expect(redirectUri(origin)).toBe('https://vocab.example.app/api/auth/google/callback');
  });

  it('sends state and an S256 PKCE challenge to Google', () => {
    const pending = newPending('/dashboard', 'vi');
    const url = new URL(authorizationUrl({ clientId: 'cid', redirectUri: 'http://localhost:3300/cb', pending }));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'cid',
      redirect_uri: 'http://localhost:3300/cb',
      response_type: 'code',
      scope: 'openid email profile',
      state: pending.state,
      code_challenge_method: 'S256',
    });
    const expected = createHash('sha256').update(pending.verifier).digest('base64url');
    expect(url.searchParams.get('code_challenge')).toBe(expected);
    expect(pkceChallenge(pending.verifier)).toBe(expected);
    expect(pending.verifier.length).toBeGreaterThanOrEqual(43); // RFC 7636 minimum
  });

  it('exchanges the code with the verifier and returns the ID token', async () => {
    let sent: URLSearchParams | undefined;
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      sent = init.body as URLSearchParams;
      return new Response(JSON.stringify({ id_token: 'abc' }), { status: 200 });
    }) as unknown as typeof fetch;
    const token = await exchangeCode({
      code: 'c',
      verifier: 'v',
      clientId: 'cid',
      clientSecret: 'sec',
      redirectUri: 'r',
      fetchImpl: fakeFetch,
    });
    expect(token).toBe('abc');
    expect(sent?.get('code_verifier')).toBe('v');
    expect(sent?.get('grant_type')).toBe('authorization_code');

    const failing = (async () => new Response('{"error":"invalid_grant"}', { status: 400 })) as unknown as typeof fetch;
    await expect(
      exchangeCode({ code: 'c', verifier: 'v', clientId: 'cid', clientSecret: 's', redirectUri: 'r', fetchImpl: failing }),
    ).rejects.toThrow(/invalid_grant/);
  });
});

describe('verifyIdToken', () => {
  const setup = async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
    const keys = createLocalJWKSet({ keys: [jwk] });
    const sign = (claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: string } = {}) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer(opts.iss ?? 'https://accounts.google.com')
        .setAudience(opts.aud ?? 'cid')
        .setSubject('google-sub-1')
        .setIssuedAt()
        .setExpirationTime(opts.exp ?? '5m')
        .sign(privateKey);
    return { keys, sign };
  };

  it('returns the profile from a valid token', async () => {
    const { keys, sign } = await setup();
    const token = await sign({ email: 'Ha@Example.com', email_verified: true, name: 'Hà', picture: 'https://p' });
    await expect(verifyIdToken(token, 'cid', keys)).resolves.toEqual({
      sub: 'google-sub-1',
      email: 'ha@example.com',
      emailVerified: true,
      name: 'Hà',
      picture: 'https://p',
    });
  });

  it('rejects another audience, another issuer and an expired token', async () => {
    const { keys, sign } = await setup();
    const claims = { email: 'a@b.c', email_verified: true };
    await expect(verifyIdToken(await sign(claims, { aud: 'someone-else' }), 'cid', keys)).rejects.toThrow();
    await expect(verifyIdToken(await sign(claims, { iss: 'https://evil.example' }), 'cid', keys)).rejects.toThrow();
    await expect(verifyIdToken(await sign(claims, { exp: '-1m' }), 'cid', keys)).rejects.toThrow();
  });

  it('reports an unverified email', async () => {
    const { keys, sign } = await setup();
    const profile = await verifyIdToken(await sign({ email: 'a@b.c', email_verified: false }), 'cid', keys);
    expect(profile.emailVerified).toBe(false);
  });
});
