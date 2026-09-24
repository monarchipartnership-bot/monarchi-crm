// One-time local utility — NOT part of the deployed app, not imported by
// anything in src/ or api/. Run it once on your own machine to turn your
// Google Ads OAuth Client ID/Secret into a refresh token, which then goes
// into Vercel's GOOGLE_ADS_REFRESH_TOKEN env var by hand.
//
// Usage (PowerShell), from the app/ directory:
//   $env:GOOGLE_OAUTH_CLIENT_ID = "<your client id>"
//   $env:GOOGLE_OAUTH_CLIENT_SECRET = "<your client secret>"
//   node scripts/get-google-ads-refresh-token.js
//
// It starts a tiny local server, prints a Google login URL — open that URL
// in your own regular browser (the one you're already logged into Google
// with), approve access, and you'll be redirected back to localhost. The
// script then prints your refresh token to this terminal. Nothing here
// ever leaves your machine.
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const PORT = 53682;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`;
const SCOPE = 'https://www.googleapis.com/auth/adwords';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET first (see the comment at the top of this file).');
  process.exit(1);
}

function postForm(url, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== '/oauth2callback') { res.writeHead(404); res.end(); return; }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (error) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<p>Google повернув помилку: ${error}. Закрийте це вікно і спробуйте ще раз.</p>`);
    console.error('OAuth error:', error);
    server.close();
    return;
  }

  try {
    const { status, data } = await postForm('https://oauth2.googleapis.com/token', {
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    });
    if (status !== 200 || !data.refresh_token) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<p>Не вдалося отримати refresh_token. Дивіться термінал для деталей.</p>');
      console.error('Token exchange failed:', data);
      console.error(
        data.error === 'invalid_grant'
          ? '\nЯкщо це повторний запуск — Google міг вже видавав токен раніше для цього ж застосунку. Спробуйте ще раз, це нормально видасть новий.'
          : ''
      );
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<p>Готово! Refresh token у терміналі. Це вікно можна закрити.</p>');
      console.log('\n=== Ваш refresh token (збережіть його в Vercel як GOOGLE_ADS_REFRESH_TOKEN) ===\n');
      console.log(data.refresh_token);
      console.log('\n===============================================================\n');
    }
  } catch (err) {
    console.error('Request failed:', err);
  } finally {
    server.close();
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  console.log('\nВідкрийте це посилання у своєму звичайному браузері (де ви залогінені в Google):\n');
  console.log(authUrl.toString());
  console.log('\nЧекаю на підтвердження...\n');
});
