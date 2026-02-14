import { createServer } from 'http';
import type { Server } from 'http';
import { randomBytes, createHash } from 'crypto';
import { shell } from 'electron';
import type { JiraOAuthTokens } from './jira.types';

const ATLASSIAN_AUTH_URL = 'https://auth.atlassian.com/authorize';
const ATLASSIAN_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const OAUTH_SCOPES = 'read:jira-work read:confluence-content.all read:confluence-space.summary read:space:confluence read:page:confluence read:comment:confluence offline_access';
const CALLBACK_PORT = 17839;
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export class JiraAuthProvider {
  /** Track active callback server to prevent port conflicts on re-entry. */
  private activeServer: Server | null = null;
  private activeTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  async initiateOAuthFlow(): Promise<JiraOAuthTokens> {
    // Clean up any previous auth server to prevent EADDRINUSE
    this.cleanupActiveServer();

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
      signal: AbortSignal.timeout(30_000),
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

  private cleanupActiveServer(): void {
    if (this.activeTimeout) {
      clearTimeout(this.activeTimeout);
      this.activeTimeout = null;
    }
    if (this.activeServer) {
      this.activeServer.close();
      this.activeServer = null;
    }
  }

  private async startCallbackServer(
    codeChallenge: string,
  ): Promise<{ port: number; authCode: Promise<string> }> {
    return new Promise((resolveServer, rejectServer) => {
      const server = createServer();
      this.activeServer = server;

      const authCodePromise = new Promise<string>((resolveCode, rejectCode) => {
        const timeout = setTimeout(() => {
          this.cleanupActiveServer();
          rejectCode(new Error('OAuth callback timeout — no response within 5 minutes'));
        }, CALLBACK_TIMEOUT_MS);
        this.activeTimeout = timeout;

        // Generate state for CSRF protection — validated on callback
        const expectedState = randomBytes(16).toString('hex');

        server.on('request', (req, res) => {
          const url = new URL(req.url ?? '/', `http://localhost`);
          if (url.pathname !== '/callback') {
            res.writeHead(404);
            res.end('Not found');
            return;
          }

          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');
          const returnedState = url.searchParams.get('state');

          // Validate CSRF state parameter
          if (returnedState !== expectedState) {
            res.writeHead(403, { 'Content-Type': 'text/html' });
            res.end('<html><body><h1>Invalid state parameter</h1><p>Possible CSRF attack. Please retry authorization.</p></body></html>');
            clearTimeout(timeout);
            this.activeTimeout = null;
            server.close();
            this.activeServer = null;
            rejectCode(new Error('OAuth CSRF validation failed: state parameter mismatch'));
            return;
          }

          if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<html><body><h1>Authorization failed</h1><p>You can close this window.</p></body></html>');
            clearTimeout(timeout);
            this.activeTimeout = null;
            server.close();
            this.activeServer = null;
            rejectCode(new Error(`OAuth error: ${error}`));
            return;
          }

          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<html><body><h1>Missing authorization code</h1><p>Please retry authorization.</p></body></html>');
            // Clean up on missing code (was a resource leak)
            clearTimeout(timeout);
            this.activeTimeout = null;
            server.close();
            this.activeServer = null;
            rejectCode(new Error('OAuth callback missing authorization code'));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Authorization successful!</h1><p>You can close this window and return to nswot.</p></body></html>');
          clearTimeout(timeout);
          this.activeTimeout = null;
          server.close();
          this.activeServer = null;
          resolveCode(code);
        });

        server.listen(CALLBACK_PORT, () => {
          const redirectUri = `http://localhost:${CALLBACK_PORT}/callback`;

          const authUrl = new URL(ATLASSIAN_AUTH_URL);
          authUrl.searchParams.set('audience', 'api.atlassian.com');
          authUrl.searchParams.set('client_id', this.clientId);
          authUrl.searchParams.set('scope', OAUTH_SCOPES);
          authUrl.searchParams.set('redirect_uri', redirectUri);
          authUrl.searchParams.set('state', expectedState);
          authUrl.searchParams.set('response_type', 'code');
          authUrl.searchParams.set('prompt', 'consent');
          authUrl.searchParams.set('code_challenge', codeChallenge);
          authUrl.searchParams.set('code_challenge_method', 'S256');

          shell.openExternal(authUrl.toString());

          resolveServer({ port: CALLBACK_PORT, authCode: authCodePromise });
        });

        server.on('error', (err) => {
          this.activeServer = null;
          clearTimeout(timeout);
          this.activeTimeout = null;
          rejectServer(new Error(`OAuth callback server failed to start: ${err.message}`));
        });
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
      signal: AbortSignal.timeout(30_000),
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
