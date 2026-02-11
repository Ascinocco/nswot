import { createServer } from 'http';
import { randomBytes, createHash } from 'crypto';
import { shell } from 'electron';
import type { JiraOAuthTokens } from './jira.types';

const ATLASSIAN_AUTH_URL = 'https://auth.atlassian.com/authorize';
const ATLASSIAN_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const OAUTH_SCOPES = 'read:jira-work read:confluence-content.all read:confluence-space.summary offline_access';
const CALLBACK_PORT = 17839;
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export class JiraAuthProvider {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  async initiateOAuthFlow(): Promise<JiraOAuthTokens> {
    const { codeVerifier, codeChallenge } = generatePKCE();

    const { port, authCode } = await this.startCallbackServer(codeChallenge);
    const redirectUri = `http://localhost:${port}/callback`;

    const code = await authCode;
    return this.exchangeCodeForTokens(code, redirectUri, codeVerifier);
  }

  async refreshAccessToken(refreshToken: string): Promise<JiraOAuthTokens> {
    const response = await fetch(ATLASSIAN_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error = new Error(`Token refresh failed: ${response.status}`);
      (error as unknown as { status: number }).status = response.status;
      throw error;
    }

    const body = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope: string;
    };

    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: Date.now() + body.expires_in * 1000,
      scope: body.scope,
    };
  }

  private async startCallbackServer(
    codeChallenge: string,
  ): Promise<{ port: number; authCode: Promise<string> }> {
    return new Promise((resolveServer) => {
      const server = createServer();

      const authCodePromise = new Promise<string>((resolveCode, rejectCode) => {
        const timeout = setTimeout(() => {
          server.close();
          rejectCode(new Error('OAuth callback timeout — no response within 5 minutes'));
        }, CALLBACK_TIMEOUT_MS);

        server.on('request', (req, res) => {
          const url = new URL(req.url ?? '/', `http://localhost`);
          if (url.pathname !== '/callback') {
            res.writeHead(404);
            res.end('Not found');
            return;
          }

          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<html><body><h1>Authorization failed</h1><p>You can close this window.</p></body></html>');
            clearTimeout(timeout);
            server.close();
            rejectCode(new Error(`OAuth error: ${error}`));
            return;
          }

          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<html><body><h1>Missing authorization code</h1></body></html>');
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Authorization successful!</h1><p>You can close this window and return to nswot.</p></body></html>');
          clearTimeout(timeout);
          server.close();
          resolveCode(code);
        });
      });

      server.listen(CALLBACK_PORT, () => {
        const redirectUri = `http://localhost:${CALLBACK_PORT}/callback`;
        const state = randomBytes(16).toString('hex');

        const authUrl = new URL(ATLASSIAN_AUTH_URL);
        authUrl.searchParams.set('audience', 'api.atlassian.com');
        authUrl.searchParams.set('client_id', this.clientId);
        authUrl.searchParams.set('scope', OAUTH_SCOPES);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('prompt', 'consent');
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');

        shell.openExternal(authUrl.toString());

        resolveServer({ port: CALLBACK_PORT, authCode: authCodePromise });
      });
    });
  }

  private async exchangeCodeForTokens(
    code: string,
    redirectUri: string,
    codeVerifier: string,
  ): Promise<JiraOAuthTokens> {
    const response = await fetch(ATLASSIAN_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    if (!response.ok) {
      const error = new Error(`Token exchange failed: ${response.status}`);
      (error as unknown as { status: number }).status = response.status;
      throw error;
    }

    const body = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope: string;
    };

    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: Date.now() + body.expires_in * 1000,
      scope: body.scope,
    };
  }
}

function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}
