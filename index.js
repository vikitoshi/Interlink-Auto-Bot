const axios = require('axios');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const readline = require('readline');
const { clear } = require('console');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const https = require('https');
const crypto = require('crypto');

const API_BASE_URL        = 'https://prod.interlinklabs.ai/api/v1';
const TOKEN_FILE_PATH     = path.join(__dirname, 'token.txt');
const REFRESH_TOKEN_FILE  = path.join(__dirname, 'refresh_token.txt');
const DEVICE_FILE_PATH    = path.join(__dirname, 'device.txt');
const PROXIES_FILE_PATH   = path.join(__dirname, 'proxies.txt');
const APP_VERSION         = '5.0.0';
const CLAIM_INTERVAL_MS   = 4 * 60 * 60 * 1000;
const REFRESH_BUFFER_MS   = 5 * 60 * 1000;

const colors = {
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  white: '\x1b[37m', cyan:   '\x1b[36m', reset: '\x1b[0m', bold: '\x1b[1m'
};
const logger = {
  info:    (m) => console.log(`${colors.green}[✓] ${m}${colors.reset}`),
  warn:    (m) => console.log(`${colors.yellow}[⚠] ${m}${colors.reset}`),
  error:   (m) => console.log(`${colors.red}[✗] ${m}${colors.reset}`),
  success: (m) => console.log(`${colors.green}[✅] ${m}${colors.reset}`),
  loading: (m) => console.log(`${colors.cyan}[⟳] ${m}${colors.reset}`),
  step:    (m) => console.log(`${colors.white}[➤] ${m}${colors.reset}`),
  banner: () => {
    console.log(`${colors.cyan}${colors.bold}`);
    console.log(`---------------------------------------------`);
    console.log(`  Interlink Auto Bot - Airdrop Insiders`);
    console.log(`---------------------------------------------${colors.reset}\n`);
  }
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const promptInput = (q) => new Promise(res =>
  rl.question(`${colors.white}${q}${colors.reset}`, a => res(a.trim()))
);

const save = (file, data) => { try { fs.writeFileSync(file, data); } catch(e) { logger.error(`Save error: ${e.message}`); } };
const read = (file, fallback = null) => { try { return fs.readFileSync(file, 'utf8').trim(); } catch { return fallback; } };

const saveToken        = (t) => { save(TOKEN_FILE_PATH, t);    logger.info('Access token saved.'); };
const saveRefreshToken = (t) => { save(REFRESH_TOKEN_FILE, t); logger.info('Refresh token saved.'); };
const saveDevice       = (d) => { save(DEVICE_FILE_PATH, d);   logger.info(`Device ID saved: ${d}`); };
const readToken        = ()  => read(TOKEN_FILE_PATH);
const readRefreshToken = ()  => read(REFRESH_TOKEN_FILE);
const readDevice       = ()  => read(DEVICE_FILE_PATH);

function readProxies() {
  try {
    if (!fs.existsSync(PROXIES_FILE_PATH)) return [];
    return fs.readFileSync(PROXIES_FILE_PATH, 'utf8')
      .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  } catch { return []; }
}
const getRandomProxy  = (list) => list.length ? list[Math.floor(Math.random() * list.length)] : null;
const makeProxyAgent  = (url)  => url.startsWith('socks') ? new SocksProxyAgent(url) : new HttpsProxyAgent(url);

function jwtPayload(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8')); }
  catch { return null; }
}
function tokenExpiringSoon(token) {
  const p = jwtPayload(token);
  if (!p?.exp) return true;
  return Date.now() >= p.exp * 1000 - REFRESH_BUFFER_MS;
}

function makeClient(token = null, proxy = null, deviceId = null) {
  const headers = {
    'User-Agent':      'okhttp/4.12.0',
    'Accept-Encoding': 'gzip',
    'Content-Type':    'application/json',
    'version':         APP_VERSION,
    'x-platform':      'android',
  };
  if (token)    headers['authorization'] = `Bearer ${token}`;
  if (deviceId) Object.assign(headers, {
    'x-unique-id':   deviceId,
    'x-model':       'Redmi Note 8 Pro',
    'x-brand':       'XiaoMi',
    'x-system-name': 'Android',
    'x-device-id':   deviceId,
    'x-bundle-id':   'org.ai.interlinklabs.interlinkId',
  });

  const agent = (() => {
    if (proxy) {
      try { return makeProxyAgent(proxy); } catch(e) { logger.error(`Proxy error: ${e.message}`); }
    }
    return new https.Agent({ rejectUnauthorized: false });
  })();

  const inst = axios.create({ baseURL: API_BASE_URL, headers, timeout: 30000, httpsAgent: agent, proxy: proxy ? false : undefined });

  inst.interceptors.request.use(conf => {
    conf.headers['x-date'] = Date.now().toString();
    if (conf.method === 'post' && conf.data) {
      const body = typeof conf.data === 'object' ? JSON.stringify(conf.data) : String(conf.data);
      conf.headers['x-content-hash'] = crypto.createHash('sha256').update(body, 'utf8').digest('base64');
    }
    return conf;
  });

  return inst;
}

function createSession(initAccess, initRefresh, deviceId, proxies) {
  let access   = initAccess;
  let refresh  = initRefresh;
  let busy     = false;
  let failed   = false;

  async function doRefresh() {
    if (!refresh) { logger.error('No refresh token.'); failed = true; return false; }
    const proxy  = getRandomProxy(proxies);
    const client = makeClient(access, proxy, deviceId); 
    try {
      logger.loading('Refreshing access token via POST /auth/token ...');
      const res = await client.post('/auth/token', { refreshToken: refresh });
      if (res.data.statusCode === 200) {
        const newAccess  = res.data.data?.accessToken  || res.data.data?.jwtToken;
        const newRefresh = res.data.data?.refreshToken;
        if (newAccess) {
          access  = newAccess;
          if (newRefresh) refresh = newRefresh;
          saveToken(access);
          if (newRefresh) saveRefreshToken(refresh);
          logger.success('Token refreshed successfully.');
          failed = false;
          return true;
        }
      }
      logger.error(`Refresh failed: ${JSON.stringify(res.data)}`);
    } catch(e) {
      logger.error(`Refresh error: ${e.response?.data?.message || e.message}`);
    }
    failed = true;
    return false;
  }

  async function ensureFresh() {
    if (failed) return false;
    if (!tokenExpiringSoon(access)) return true;
    if (busy) {
      for (let i = 0; i < 30 && busy; i++) await sleep(500);
      return !failed;
    }
    busy = true;
    const ok = await doRefresh();
    busy = false;
    return ok;
  }

  function client(proxy = null) { return makeClient(access, proxy, deviceId); }
  function getAccess()  { return access; }
  function getRefresh() { return refresh; }
  function isOk()       { return !failed; }
  function update(newAccess, newRefresh) {
    access = newAccess; if (newRefresh) refresh = newRefresh;
    failed = false; saveToken(newAccess); if (newRefresh) saveRefreshToken(newRefresh);
  }

  function scheduleRefresh() {
    const p     = jwtPayload(access);
    const expMs = p?.exp ? p.exp * 1000 : Date.now() + 25 * 60 * 1000;
    const wait  = Math.max(10000, expMs - REFRESH_BUFFER_MS - Date.now());
    logger.info(`Next token refresh in ${Math.round(wait / 60000)} min.`);
    setTimeout(async () => {
      const ok = await ensureFresh();
      if (ok) scheduleRefresh();
    }, wait);
  }

  return { ensureFresh, client, getAccess, getRefresh, isOk, update, scheduleRefresh };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function checkLoginId(client, loginId, deviceId) {
  try {
    const r = await client.get(`/auth/loginId-exist-check/${loginId}`, { params: { deviceId } });
    if (r.data.statusCode === 200) { logger.success('Login ID exists.'); return true; }
    logger.error(`Login ID check failed: ${JSON.stringify(r.data)}`); return false;
  } catch(e) { logger.error(`Login ID error: ${e.response?.data?.message || e.message}`); return false; }
}

async function checkPasscode(client, loginId, passcode, deviceId) {
  try {
    const r = await client.post('/auth/check-passcode?v=2', { loginId, passcode, deviceId });
    if (r.data.statusCode === 200) {
      logger.success('Passcode verified.');
      const email = r.data.data?.email || r.data.data?.verificationInfo?.[0]?.gmail || null;
      return { ok: true, email };
    }
    logger.error(`Passcode failed: ${JSON.stringify(r.data)}`); return { ok: false, email: null };
  } catch(e) { logger.error(`Passcode error: ${e.response?.data?.message || e.message}`); return { ok: false, email: null }; }
}

async function sendOtp(client, loginId, passcode, email, deviceId) {
  try {
    const r = await client.post('/auth/send-otp-email-verify-login', { loginId, passcode, email, deviceId });
    if (r.data.statusCode === 200) logger.success(`OTP sent to ${email}.`);
    else logger.error(`OTP send failed: ${JSON.stringify(r.data)}`);
  } catch(e) { logger.error(`OTP send error: ${e.response?.data?.message || e.message}`); }
}

async function verifyOtp(client, loginId, otp, deviceId) {
  try {
    const r = await client.post('/auth/check-otp-email-verify-login?v=2', { loginId, otp, deviceId });
    if (r.data.statusCode === 200) {
      logger.success(r.data.message);
      return { accessToken: r.data.data.accessToken, refreshToken: r.data.data.refreshToken };
    }
    logger.error(`OTP verify failed: ${JSON.stringify(r.data)}`); return null;
  } catch(e) { logger.error(`OTP verify error: ${e.response?.data?.message || e.message}`); return null; }
}

async function login(proxies, deviceId) {
  const loginId  = await promptInput('Enter your login ID: ');
  const passcode = await promptInput('Enter your passcode: ');
  const proxy    = getRandomProxy(proxies);
  const client   = makeClient(null, proxy, deviceId);

  if (!await checkLoginId(client, loginId, deviceId)) return null;
  const { ok, email: detectedEmail } = await checkPasscode(client, loginId, passcode, deviceId);
  if (!ok) return null;

  const email = detectedEmail || await promptInput('Enter your email for OTP: ');
  if (detectedEmail) logger.info(`Email: ${email}`);

  await sendOtp(client, loginId, passcode, email, deviceId);
  const otp    = await promptInput('Enter OTP: ');
  const tokens = await verifyOtp(client, loginId, otp, deviceId);
  if (!tokens) return null;

  saveToken(tokens.accessToken);
  if (tokens.refreshToken) saveRefreshToken(tokens.refreshToken);
  return tokens;
}

async function getUserFull(client) {
  try {
    const r = await client.get('/auth/current-user-full?include=userInfo,token,isClaimable');
    if (r.data.statusCode === 200) return r.data.data;
    logger.error(`current-user-full: ${JSON.stringify(r.data)}`); return null;
  } catch(e) { logger.error(`current-user-full error: ${e.response?.data?.message || e.message}`); return null; }
}

async function checkClaimable(client) {
  try {
    const r = await client.get('/token/check-is-claimable');
    return r.data.data;
  } catch(e) {
    logger.error(`check-is-claimable error: ${e.response?.data?.message || e.message}`);
    return { isClaimable: false, nextFrame: Date.now() + 5 * 60 * 1000 };
  }
}

async function claimAirdrop(client) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await client.post('/token/claim-airdrop', "");
      
      const claimTime = r.data?.data ?? Date.now();
      logger.success(`Airdrop claimed! Queue/time: ${claimTime}`);
      return claimTime;
    } catch(e) {
      const msg    = e.response?.data?.message || e.message;
      const status = e.response?.status;
      logger.error(`Claim error (attempt ${attempt}/3): [Status ${status || 'N/A'}] ${msg}`);
      
      if (attempt < 3 && (status === 500 || status === 503 || !status)) {
        logger.loading(`Retrying in 15s...`);
        await sleep(15000);
      }
    }
  }
  return null;
}

async function postClaimAds(client, lastClaimTime) {
  try {
    const r = await client.get(
      `/token/get-random-ads-mining-new?totalHhp=1&lastTimeClaim=${lastClaimTime}`
    );
    if (r.data.statusCode === 200) {
      const { frame, retryNumber, timeRetry } = r.data.data;
      logger.info(`Post-claim ads: frame=${frame}, retries=${retryNumber}, interval=${timeRetry}s`);
    }
  } catch(e) {
    logger.warn(`Post-claim ads error (non-critical): ${e.response?.data?.message || e.message}`);
  }
}

function display(userInfo, token) {
  if (!userInfo || !token) return;
  console.log('\n' + '='.repeat(50));
  console.log(`${colors.white}${colors.bold}USER${colors.reset}`);
  console.log(`${colors.white}Username:   ${colors.reset}${userInfo.username}`);
  console.log(`${colors.white}Email:      ${colors.reset}${userInfo.email}`);
  console.log(`${colors.white}ID:         ${colors.reset}${userInfo.loginId}`);
  console.log(`${colors.white}Tier:       ${colors.reset}${userInfo.metadata?.tierNameAmbassador || 'N/A'}`);
  console.log(`\n${colors.yellow}${colors.bold}TOKENS${colors.reset}`);
  console.log(`${colors.yellow}Gold:       ${colors.reset}${token.interlinkGoldTokenAmount}`);
  console.log(`${colors.yellow}Silver:     ${colors.reset}${token.interlinkSilverTokenAmount}`);
  console.log(`${colors.yellow}Diamond:    ${colors.reset}${token.interlinkDiamondTokenAmount}`);
  console.log(`${colors.yellow}Interlink:  ${colors.reset}${token.interlinkTokenAmount}`);
  console.log(`${colors.yellow}Mining/day: ${colors.reset}${token.dailyMiningRate}`);
  console.log(`${colors.yellow}Streak:     ${colors.reset}${token.burningStreak}`);
  console.log(`${colors.yellow}Burned:     ${colors.reset}${token.burnedCycles} cycles`);
  console.log(`${colors.yellow}Recover:    ${colors.reset}${token.itlgRecoverable} ITLG`);
  console.log(`${colors.yellow}Last claim: ${colors.reset}${moment(token.lastClaimTime).format('YYYY-MM-DD HH:mm:ss')}`);
  console.log('='.repeat(50) + '\n');
}

function formatTime(ms) {
  if (ms <= 0) return '00:00:00';
  return [Math.floor(ms / 3600000), Math.floor((ms / 60000) % 60), Math.floor((ms / 1000) % 60)]
    .map(v => String(v).padStart(2, '0')).join(':');
}

async function connect(session, proxies) {
  let data = await getUserFull(session.client(null));
  if (!data && proxies.length) {
    for (let i = 0; i < Math.min(proxies.length, 5) && !data; i++) {
      logger.step(`Trying proxy ${i + 1}: ${proxies[i]}`);
      data = await getUserFull(session.client(proxies[i]));
    }
  }
  if (!data) return {};
  return { userInfo: data.userInfo, tokenInfo: data.token, isClaimable: data.isClaimable };
}

async function runBot() {
  clear();
  logger.banner();

  const proxies    = readProxies();
  let accessToken  = readToken();
  let refreshToken = readRefreshToken();
  let deviceId     = readDevice();

  if (!deviceId) {
    deviceId = crypto.randomBytes(8).toString('hex');
    saveDevice(deviceId);
  }

  if (!accessToken) {
    logger.step('No token found. Logging in...');
    const tokens = await login(proxies, deviceId);
    if (!tokens) { logger.error('Login failed. Exiting.'); process.exit(1); }
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
  }

  let session = createSession(accessToken, refreshToken, deviceId, proxies);
  session.scheduleRefresh();

  let { userInfo, tokenInfo, isClaimable } = await connect(session, proxies);

  if (!userInfo) {
    logger.warn('Cannot connect. Refreshing token...');
    const ok = await session.ensureFresh();
    if (ok) ({ userInfo, tokenInfo, isClaimable } = await connect(session, proxies));
  }

  if (!userInfo) {
    logger.error('Still failed. Re-logging in...');
    const tokens = await login(proxies, deviceId);
    if (!tokens) { logger.error('Login failed. Exiting.'); process.exit(1); }
    session = createSession(tokens.accessToken, tokens.refreshToken, deviceId, proxies);
    session.scheduleRefresh();
    ({ userInfo, tokenInfo, isClaimable } = await connect(session, proxies));
    if (!userInfo) { logger.error('Failed after re-login. Exiting.'); process.exit(1); }
  }

  logger.success(`Connected as ${userInfo.username}`);
  logger.info(`Started: ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
  display(userInfo, tokenInfo);

  async function attemptClaim() {
    const ok = await session.ensureFresh();
    if (!ok) {
      logger.error('Token expired. Re-logging in...');
      const tokens = await login(proxies, deviceId);
      if (!tokens) { logger.warn('Re-login failed. Will retry next cycle.'); return Date.now() + CLAIM_INTERVAL_MS; }
      session.update(tokens.accessToken, tokens.refreshToken);
    }

    const proxy  = getRandomProxy(proxies);
    const client = session.client(proxy);

    const claimCheck = await checkClaimable(client);

    if (!claimCheck?.isClaimable) {
      logger.info('Not claimable yet.');
      return claimCheck?.nextFrame || Date.now() + CLAIM_INTERVAL_MS;
    }

    logger.loading('Claimable! Preparing airdrop sequence...');

    const lastClaimTime = tokenInfo?.lastClaimTime || Date.now();
    logger.step('Triggering ads session...');
    try {
      await client.get(`/token/get-random-ads-mining-new?totalHhp=1&lastTimeClaim=${lastClaimTime}`);
      await sleep(15000); 
    } catch(e) {
      logger.warn(`Ad request warning: ${e.response?.data?.message || e.message}`);
    }

    logger.loading('Claiming airdrop now...');
    const claimTime = await claimAirdrop(client);

    if (claimTime !== null) {
      const ts = typeof claimTime === 'number' ? claimTime : Date.now();
      await postClaimAds(client, ts);
    }

    logger.loading('Refreshing data...');
    const updated = await getUserFull(client);
    if (updated) {
      userInfo   = updated.userInfo;
      tokenInfo  = updated.token;
      isClaimable= updated.isClaimable;
      display(userInfo, tokenInfo);
    }

    return isClaimable?.nextFrame || Date.now() + CLAIM_INTERVAL_MS;
  }

  logger.step('Initial claim check...');
  let nextClaimTime = await attemptClaim();

  setInterval(() => {
    const rem = Math.max(0, nextClaimTime - Date.now());
    process.stdout.write(`\r${colors.white}Next claim in: ${colors.bold}${formatTime(rem)}${colors.reset}      `);
    if (rem <= 0) {
      process.stdout.write('\n');
      logger.step('Claim time reached!');
      attemptClaim().then(n => { nextClaimTime = n; });
    }
  }, 1000);

  const scheduleNext = () => {
    setTimeout(async () => {
      logger.step('Scheduled claim triggered.');
      nextClaimTime = await attemptClaim();
      scheduleNext();
    }, Math.max(1000, nextClaimTime - Date.now()));
  };
  scheduleNext();

  logger.success('Bot running! Press Ctrl+C to exit.');
}

process.on('SIGINT', () => {
  console.log('');
  logger.info('Bot stopped by user.');
  rl.close();
  process.exit(0);
});
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught: ${err.message}`);
  console.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason}`);
});

runBot().catch(e => { logger.error(`Fatal: ${e.message}`); process.exit(1); });
