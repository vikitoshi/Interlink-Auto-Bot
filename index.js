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

const API_BASE_URL = 'https://prod.interlinklabs.ai/api/v1';
const MINI_API_BASE_URL = 'https://interlink-mini-app.interlinklabs.ai/api';
const TOKEN_FILE_PATH = path.join(__dirname, 'token.txt');
const REFRESH_TOKEN_FILE_PATH = path.join(__dirname, 'refresh_token.txt');
const MINI_TOKEN_FILE_PATH = path.join(__dirname, 'mini_token.txt');
const DEVICE_FILE_PATH = path.join(__dirname, 'device.txt');
const PROXIES_FILE_PATH = path.join(__dirname, 'proxies.txt');
const APP_ID = 'id__mk39oef6we80fs7j2rif';
const CLAIM_INTERVAL_MS = 4 * 60 * 60 * 1000;
const APP_VERSION = '5.0.0';

const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

const logger = {
  info: (msg) => console.log(`${colors.green}[✓] ${msg}${colors.reset}`),
  wallet: (msg) => console.log(`${colors.yellow}[➤] ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}[⚠] ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}[✗] ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}[✅] ${msg}${colors.reset}`),
  loading: (msg) => console.log(`${colors.cyan}[⟳] ${msg}${colors.reset}`),
  step: (msg) => console.log(`${colors.white}[➤] ${msg}${colors.reset}`),
  banner: () => {
    console.log(`${colors.cyan}${colors.bold}`);
    console.log(`---------------------------------------------`);
    console.log(`Interlink Auto Bot - Airdrop Insiders`);
    console.log(`---------------------------------------------${colors.reset}`);
    console.log();
  }
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function promptInput(question) {
  return new Promise((resolve) => {
    rl.question(`${colors.white}${question}${colors.reset}`, (answer) => {
      resolve(answer.trim());
    });
  });
}

function generateRandomDeviceId() {
  return crypto.randomBytes(8).toString('hex');
}

function saveToken(token) {
  try {
    fs.writeFileSync(TOKEN_FILE_PATH, token);
    logger.info(`Access token saved to ${TOKEN_FILE_PATH}`);
  } catch (error) {
    logger.error(`Error saving token: ${error.message}`);
  }
}

function saveRefreshToken(token) {
  try {
    fs.writeFileSync(REFRESH_TOKEN_FILE_PATH, token);
    logger.info(`Refresh token saved to ${REFRESH_TOKEN_FILE_PATH}`);
  } catch (error) {
    logger.error(`Error saving refresh token: ${error.message}`);
  }
}

function saveMiniToken(token) {
  try {
    fs.writeFileSync(MINI_TOKEN_FILE_PATH, token);
    logger.info(`Mini token saved to ${MINI_TOKEN_FILE_PATH}`);
  } catch (error) {
    logger.error(`Error saving mini token: ${error.message}`);
  }
}

function readToken() {
  try {
    return fs.readFileSync(TOKEN_FILE_PATH, 'utf8').trim();
  } catch {
    logger.warn(`Token file not found or invalid. Will attempt login.`);
    return null;
  }
}

function readRefreshToken() {
  try {
    return fs.readFileSync(REFRESH_TOKEN_FILE_PATH, 'utf8').trim();
  } catch {
    return null;
  }
}

function readMiniToken() {
  try {
    return fs.readFileSync(MINI_TOKEN_FILE_PATH, 'utf8').trim();
  } catch {
    logger.warn(`Mini token file not found or invalid.`);
    return null;
  }
}

function readDevice() {
  try {
    return fs.readFileSync(DEVICE_FILE_PATH, 'utf8').trim();
  } catch {
    logger.warn(`Device file not found. Will generate random device ID.`);
    return null;
  }
}

function saveDevice(deviceId) {
  try {
    fs.writeFileSync(DEVICE_FILE_PATH, deviceId);
    logger.info(`Device ID saved to ${DEVICE_FILE_PATH}`);
  } catch (error) {
    logger.error(`Error saving device ID: ${error.message}`);
  }
}

function readProxies() {
  try {
    if (!fs.existsSync(PROXIES_FILE_PATH)) {
      logger.warn(`Proxies file not found. Running without proxies.`);
      return [];
    }
    const content = fs.readFileSync(PROXIES_FILE_PATH, 'utf8');
    return content.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  } catch (error) {
    logger.error(`Error reading proxies file: ${error.message}`);
    return [];
  }
}

function getRandomProxy(proxies) {
  if (!proxies.length) return null;
  return proxies[Math.floor(Math.random() * proxies.length)];
}

function createProxyAgent(proxyUrl) {
  if (!proxyUrl) return null;
  if (proxyUrl.startsWith('socks://') || proxyUrl.startsWith('socks4://') || proxyUrl.startsWith('socks5://')) {
    return new SocksProxyAgent(proxyUrl);
  }
  return new HttpsProxyAgent(proxyUrl);
}

function createApiClient(token, proxy = null, deviceId = null) {
  const config = {
    baseURL: API_BASE_URL,
    headers: {
      'User-Agent': 'okhttp/4.12.0',
      'Accept-Encoding': 'gzip',
      'Content-Type': 'application/json',
      'version': APP_VERSION,
      'x-platform': 'android',
    },
    timeout: 30000,
    httpsAgent: new https.Agent({ rejectUnauthorized: false })
  };

  if (token) {
    config.headers['authorization'] = `Bearer ${token}`;
  }

  if (deviceId) {
    config.headers = {
      ...config.headers,
      'x-unique-id': deviceId,
      'x-model': 'Redmi Note 8 Pro',
      'x-brand': 'XiaoMi',
      'x-system-name': 'Android',
      'x-device-id': deviceId,
      'x-bundle-id': 'org.ai.interlinklabs.interlinkId',
    };
  }

  if (proxy) {
    try {
      const proxyAgent = createProxyAgent(proxy);
      config.httpsAgent = proxyAgent;
      config.proxy = false;
      logger.info(`Using proxy: ${proxy}`);
    } catch (error) {
      logger.error(`Error setting up proxy: ${error.message}`);
    }
  }

  const instance = axios.create(config);

  instance.interceptors.request.use((conf) => {
    conf.headers['x-date'] = Date.now().toString();

    if (conf.method === 'post' && conf.data) {
      const body = typeof conf.data === 'object' ? JSON.stringify(conf.data) : conf.data.toString();
      const hash = crypto.createHash('sha256').update(body, 'utf8').digest('base64');
      conf.headers['x-content-hash'] = hash;
    }

    return conf;
  });

  return instance;
}

function createMiniApiClient(miniToken, proxy = null, deviceId, appId) {
  const config = {
    baseURL: MINI_API_BASE_URL,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Redmi Note 8 Pro Build/V417IR; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.114 Mobile Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Encoding': 'gzip, deflate',
      'origin': 'https://interlink-mini-app.interlinklabs.ai',
      'x-requested-with': 'org.ai.interlinklabs.interlinkId',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'cors',
      'sec-fetch-dest': 'empty',
      'referer': 'https://interlink-mini-app.interlinklabs.ai/qi-hong-interlink/',
      'accept-language': 'en-US,en;q=0.9',
      'Authorization': `Bearer ${miniToken}`,
      'Cookie': `jwt_${appId}=${miniToken}`
    },
    timeout: 30000,
    httpsAgent: new https.Agent({ rejectUnauthorized: false })
  };

  if (proxy) {
    try {
      const proxyAgent = createProxyAgent(proxy);
      config.httpsAgent = proxyAgent;
      config.proxy = false;
      logger.info(`Using proxy for mini API: ${proxy}`);
    } catch (error) {
      logger.error(`Error setting up proxy for mini API: ${error.message}`);
    }
  }

  return axios.create(config);
}

async function checkLoginIdExist(apiClient, loginId, deviceId) {
  try {
    const response = await apiClient.get(`/auth/loginId-exist-check/${loginId}`, { params: { deviceId } });
    if (response.data.statusCode === 200) {
      logger.success('Login ID exists.');
      return true;
    }
    logger.error(`Login ID check failed: ${JSON.stringify(response.data)}`);
    return false;
  } catch (error) {
    logger.error(`Error checking login ID: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

async function checkPasscode(apiClient, loginId, passcode, deviceId) {
  try {
    // Updated: uses ?v=2 query param as per new API
    const payload = { loginId, passcode, deviceId };
    const response = await apiClient.post('/auth/check-passcode?v=2', payload);
    if (response.data.statusCode === 200) {
      logger.success('Passcode verified.');
      // Return email from verificationInfo for OTP step
      const email = response.data.data?.email
        || response.data.data?.verificationInfo?.[0]?.gmail
        || null;
      return { success: true, email };
    }
    logger.error(`Passcode check failed: ${JSON.stringify(response.data)}`);
    return { success: false, email: null };
  } catch (error) {
    logger.error(`Error checking passcode: ${error.response?.data?.message || error.message}`);
    if (error.response?.data) logger.error(`Details: ${JSON.stringify(error.response.data)}`);
    return { success: false, email: null };
  }
}

async function sendOtp(apiClient, loginId, passcode, email, deviceId) {
  try {
    const payload = { loginId, passcode, email, deviceId };
    const response = await apiClient.post('/auth/send-otp-email-verify-login', payload);
    if (response.data.statusCode === 200) {
      logger.success(response.data.message);
      logger.info(`If OTP doesn't arrive, stop the bot (Ctrl+C) and restart.`);
    } else {
      logger.error(`Failed to send OTP: ${JSON.stringify(response.data)}`);
    }
  } catch (error) {
    logger.error(`Error sending OTP: ${error.response?.data?.message || error.message}`);
    if (error.response?.data) logger.error(`Details: ${JSON.stringify(error.response.data)}`);
  }
}

async function verifyOtp(apiClient, loginId, otp, deviceId) {
  try {
    const payload = { loginId, otp, deviceId };
    // Updated: uses ?v=2 query param as per new API
    const response = await apiClient.post('/auth/check-otp-email-verify-login?v=2', payload);
    if (response.data.statusCode === 200) {
      logger.success(response.data.message);
      // Updated: response now returns accessToken + refreshToken + sessionId
      const { accessToken, refreshToken, sessionId } = response.data.data;
      if (refreshToken) saveRefreshToken(refreshToken);
      logger.info(`Session ID: ${sessionId}`);
      return accessToken || null;
    }
    logger.error(`Failed to verify OTP: ${JSON.stringify(response.data)}`);
    return null;
  } catch (error) {
    logger.error(`Error verifying OTP: ${error.response?.data?.message || error.message}`);
    if (error.response?.data) logger.error(`Details: ${JSON.stringify(error.response.data)}`);
    return null;
  }
}

async function getMiniToken(apiClient, loginId, appId) {
  try {
    const payload = { loginId, appId };
    const response = await apiClient.post('https://interlink-mini-app.interlinklabs.ai/api/tracking/verify', payload, {
      headers: { 'api-public': 'e97ae0aa6520499d9edf20bd5a1e13c7' }
    });
    const miniToken = response.data.data?.token || response.data.data?.jwtToken;
    if (miniToken) {
      saveMiniToken(miniToken);
      logger.success('Mini token obtained successfully.');
      return miniToken;
    }
    logger.error('No mini token found in response.');
    return null;
  } catch (error) {
    logger.error(`Error obtaining mini token: ${error.response?.data?.message || error.message}`);
    return null;
  }
}

async function validateMiniToken(miniToken, appId) {
  const validateConfig = {
    baseURL: MINI_API_BASE_URL,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Redmi Note 8 Pro Build/V417IR; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.114 Mobile Safari/537.36',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
      'origin': 'https://interlink-mini-app.interlinklabs.ai',
      'x-requested-with': 'org.ai.interlinklabs.interlinkId',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'cors',
      'sec-fetch-dest': 'empty',
      'referer': 'https://interlink-mini-app.interlinklabs.ai/qi-hong-interlink/',
      'accept-language': 'en-US,en;q=0.9'
    },
    timeout: 30000,
    httpsAgent: new https.Agent({ rejectUnauthorized: false })
  };
  const validateClient = axios.create(validateConfig);
  try {
    const res = await validateClient.post('/tracking/validate-token', { token: miniToken, appId });
    if (res.data.success) {
      logger.info('Mini token validated successfully.');
    } else {
      logger.error('Mini token validation failed.');
    }
  } catch (error) {
    logger.error(`Error validating mini token: ${error.response?.data?.message || error.message}`);
  }
}

async function login(proxies, deviceId) {
  const loginId = await promptInput('Enter your login ID (or email): ');
  const passcode = await promptInput('Enter your passcode: ');

  const proxy = getRandomProxy(proxies);
  let apiClient = createApiClient(null, proxy || null, deviceId);
  if (proxy) logger.step(`Using proxy: ${proxy}`);

  if (!await checkLoginIdExist(apiClient, loginId, deviceId)) return null;

  const { success, email: detectedEmail } = await checkPasscode(apiClient, loginId, passcode, deviceId);
  if (!success) return null;

  let email = detectedEmail;
  if (!email) {
    email = await promptInput('Enter your email for OTP: ');
  } else {
    logger.info(`Email detected from account: ${email}`);
  }

  await sendOtp(apiClient, loginId, passcode, email, deviceId);
  const otp = await promptInput('Enter OTP: ');

  const token = await verifyOtp(apiClient, loginId, otp, deviceId);
  if (!token) return null;

  // Recreate client with new access token
  apiClient = createApiClient(token, proxy || null, deviceId);

  const appId = APP_ID;
  let miniToken = await getMiniToken(apiClient, loginId, appId);
  if (miniToken) await validateMiniToken(miniToken, appId);

  saveToken(token);
  return { token, miniToken };
}

/**
 * Updated: uses /auth/current-user-full to get userInfo + token data in one call.
 */
async function getCurrentUserFull(apiClient) {
  try {
    const response = await apiClient.get('/auth/current-user-full?include=userInfo,token,isClaimable');
    if (response.data.statusCode === 200) {
      return response.data.data; // { userInfo, token, isClaimable, metadata }
    }
    logger.error(`Failed to get user full info: ${JSON.stringify(response.data)}`);
    return null;
  } catch (error) {
    logger.error(`Error getting user full info: ${error.response?.data?.message || error.message}`);
    return null;
  }
}

async function getCurrentUser(apiClient) {
  try {
    const response = await apiClient.get('/auth/current-user');
    return response.data.data;
  } catch (error) {
    logger.error(`Error getting user info: ${error.response?.data?.message || error.message}`);
    return null;
  }
}

async function getTokenBalance(apiClient) {
  try {
    const response = await apiClient.get('/token/get-token');
    return response.data.data;
  } catch (error) {
    logger.error(`Error getting token balance: ${error.response?.data?.message || error.message}`);
    return null;
  }
}

async function checkIsClaimable(apiClient) {
  try {
    const response = await apiClient.get('/token/check-is-claimable');
    return response.data.data;
  } catch (error) {
    logger.error(`Error checking claimable: ${error.response?.data?.message || error.message}`);
    return { isClaimable: false, nextFrame: Date.now() + 1000 * 60 * 5 };
  }
}

/**
 * Updated: fetch random ads before claiming (required by new API flow).
 * Returns frame info from the ads endpoint.
 */
async function fetchAdsMining(apiClient, lastClaimTime) {
  try {
    const totalHhp = 1;
    const response = await apiClient.get(
      `/token/get-random-ads-mining-new?totalHhp=${totalHhp}&lastTimeClaim=${lastClaimTime}`
    );
    if (response.data.statusCode === 200) {
      const { data, frame, time, retryNumber, timeRetry } = response.data.data;
      logger.info(`Ads fetched — frame: ${frame}, retries allowed: ${retryNumber}, retry interval: ${timeRetry}s`);
      return response.data.data;
    }
    logger.warn(`Ads fetch returned unexpected status: ${response.data.statusCode}`);
    return null;
  } catch (error) {
    logger.warn(`Ads fetch error (non-critical): ${error.response?.data?.message || error.message}`);
    return null;
  }
}

async function claimAirdrop(apiClient) {
  try {
    const response = await apiClient.post('/token/claim-airdrop');
    // Updated: response.data is the queue position (number)
    logger.success(`Airdrop claimed! Queue position: ${response.data.data}`);
    return response.data;
  } catch (error) {
    logger.error(`Error claiming airdrop: ${error.response?.data?.message || error.message}`);
    return null;
  }
}

async function doSpin(mainClient, miniClient) {
  try {
    const ticketsRes = await miniClient.get('/spin-ticket/get-number-of-tickets');
    const { numberOfTickets, amountITLG, isFirstTicket } = ticketsRes.data.data;

    let shouldBuy = false;
    if (numberOfTickets === 0) {
      if (isFirstTicket) {
        shouldBuy = true;
        logger.loading('Buying first free ticket...');
      } else {
        const balRes = await mainClient.get('/token/get-token');
        const balance = balRes.data.data.interlinkTokenAmount;
        if (balance >= amountITLG) {
          shouldBuy = true;
          logger.loading(`Buying ticket for ${amountITLG} ITLG...`);
        } else {
          logger.warn(`Insufficient ITLG for ticket: ${balance} < ${amountITLG}`);
        }
      }
    }

    if (shouldBuy) {
      const refId = crypto.randomUUID();
      const buyRes = await miniClient.post('/spin-ticket/buy', null, { headers: { 'x-ref-id': refId } });
      if (buyRes.data.success && buyRes.data.code === 200) {
        logger.success(`Ticket bought: ${buyRes.data.data.message}`);
        if (buyRes.data.data.nextTimeToBuy) {
          const waitMs = new Date(buyRes.data.data.nextTimeToBuy).getTime() - Date.now();
          if (waitMs > 0) {
            logger.info(`Waiting ${(waitMs / 1000).toFixed(1)}s before spin...`);
            await new Promise(resolve => setTimeout(resolve, waitMs));
          }
        }
      } else {
        logger.error('Failed to buy ticket.');
        return;
      }
    }

    const currentTicketsRes = await miniClient.get('/spin-ticket/get-number-of-tickets');
    const currentNumTickets = currentTicketsRes.data.data.numberOfTickets;

    if (currentNumTickets > 0) {
      logger.loading('Performing spin...');
      const spinRes = await miniClient.get('/spin-reward/generate-random');
      if (spinRes.data.success && spinRes.data.code === 200) {
        const { spinRewardType, spinRewardValue } = spinRes.data.data;
        logger.success(`Spin successful! Won ${spinRewardValue} ${spinRewardType}`);
      } else {
        logger.error('Spin failed.');
      }
    } else {
      logger.warn('No tickets available to spin.');
    }
  } catch (error) {
    logger.error(`Error during spin: ${error.response?.data?.message || error.message}`);
  }
}

function displayUserInfo(userInfo, tokenInfo) {
  if (!userInfo || !tokenInfo) return;

  console.log('\n' + '='.repeat(50));
  console.log(`${colors.white}${colors.bold}USER INFORMATION${colors.reset}`);
  console.log(`${colors.white}Username:${colors.reset} ${userInfo.username}`);
  console.log(`${colors.white}Email:${colors.reset} ${userInfo.email}`);
  console.log(`${colors.white}User ID:${colors.reset} ${userInfo.loginId}`);
  console.log(`${colors.white}Role:${colors.reset} ${userInfo.role}`);
  console.log(`${colors.white}Tier:${colors.reset} ${userInfo.metadata?.tierNameAmbassador || 'N/A'}`);

  console.log('\n' + '='.repeat(50));
  console.log(`${colors.yellow}${colors.bold}TOKEN BALANCE${colors.reset}`);
  console.log(`${colors.yellow}Gold Tokens:${colors.reset} ${tokenInfo.interlinkGoldTokenAmount}`);
  console.log(`${colors.yellow}Silver Tokens:${colors.reset} ${tokenInfo.interlinkSilverTokenAmount}`);
  console.log(`${colors.yellow}Diamond Tokens:${colors.reset} ${tokenInfo.interlinkDiamondTokenAmount}`);
  console.log(`${colors.yellow}Interlink Tokens:${colors.reset} ${tokenInfo.interlinkTokenAmount}`);
  console.log(`${colors.yellow}Daily Mining Rate:${colors.reset} ${tokenInfo.dailyMiningRate}`);
  console.log(`${colors.yellow}Burning Streak:${colors.reset} ${tokenInfo.burningStreak}`);
  console.log(`${colors.yellow}Burned Cycles:${colors.reset} ${tokenInfo.burnedCycles}`);
  console.log(`${colors.yellow}Recoverable ITLG:${colors.reset} ${tokenInfo.itlgRecoverable}`);
  console.log(`${colors.yellow}Last Claim:${colors.reset} ${moment(tokenInfo.lastClaimTime).format('YYYY-MM-DD HH:mm:ss')}`);
  console.log('='.repeat(50) + '\n');
}

function formatTimeRemaining(milliseconds) {
  if (milliseconds <= 0) return '00:00:00';
  const seconds = Math.floor((milliseconds / 1000) % 60);
  const minutes = Math.floor((milliseconds / (1000 * 60)) % 60);
  const hours = Math.floor((milliseconds / (1000 * 60 * 60)) % 24);
  return [hours, minutes, seconds].map(v => v.toString().padStart(2, '0')).join(':');
}

async function tryConnect(token, proxies, deviceId) {
  let apiClient;
  let fullData = null;

  logger.step(`Attempting connection without proxy...`);
  apiClient = createApiClient(token, null, deviceId);

  logger.loading(`Retrieving user information...`);
  fullData = await getCurrentUserFull(apiClient);

  if (!fullData && proxies.length > 0) {
    const maxAttempts = Math.min(proxies.length, 5);
    for (let i = 0; i < maxAttempts && !fullData; i++) {
      const proxy = proxies[i];
      logger.step(`Trying proxy ${i + 1}/${maxAttempts}: ${proxy}`);
      apiClient = createApiClient(token, proxy, deviceId);
      fullData = await getCurrentUserFull(apiClient);
      if (!fullData) logger.warn(`Proxy ${proxy} failed. Trying next...`);
    }
  }

  if (!fullData) return { apiClient, userInfo: null, tokenInfo: null, isClaimable: null };

  return {
    apiClient,
    userInfo: fullData.userInfo,
    tokenInfo: fullData.token,
    isClaimable: fullData.isClaimable
  };
}

async function runBot() {
  try {
    clear();
    logger.banner();

    const proxies = readProxies();
    let token = readToken();
    let miniToken = readMiniToken();
    let deviceId = readDevice();

    if (!deviceId) {
      deviceId = generateRandomDeviceId();
      logger.info(`Generated device ID: ${deviceId}`);
      saveDevice(deviceId);
    }

    if (!token) {
      logger.step(`No token found. Initiating login...`);
      const loginRes = await login(proxies, deviceId);
      if (!loginRes?.token) {
        logger.error(`Login failed. Exiting.`);
        process.exit(1);
      }
      token = loginRes.token;
      miniToken = loginRes.miniToken;
    }

    let { apiClient, userInfo, tokenInfo, isClaimable } = await tryConnect(token, proxies, deviceId);

    if (!userInfo || !tokenInfo) {
      logger.error(`Failed to retrieve user data. Attempting re-login...`);
      const loginRes = await login(proxies, deviceId);
      if (!loginRes?.token) {
        logger.error(`Login failed. Exiting.`);
        process.exit(1);
      }
      token = loginRes.token;
      miniToken = loginRes.miniToken || readMiniToken();
      const result = await tryConnect(token, proxies, deviceId);
      apiClient = result.apiClient;
      userInfo = result.userInfo;
      tokenInfo = result.tokenInfo;
      isClaimable = result.isClaimable;
      if (!userInfo || !tokenInfo) {
        logger.error(`Failed after re-login. Check credentials and proxies.`);
        process.exit(1);
      }
    }

    if (!miniToken && userInfo) {
      logger.step('Obtaining mini token...');
      miniToken = await getMiniToken(apiClient, userInfo.loginId, APP_ID);
      if (miniToken) await validateMiniToken(miniToken, APP_ID);
    }

    logger.success(`Connected as ${userInfo.username}`);
    logger.info(`Started at: ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
    displayUserInfo(userInfo, tokenInfo);


    async function attemptClaim() {
      const proxy = getRandomProxy(proxies);
      const currentApiClient = createApiClient(token, proxy, deviceId);

      // Use isClaimable from current-user-full or fall back to dedicated endpoint
      let claimCheck = isClaimable;
      if (!claimCheck) {
        claimCheck = await checkIsClaimable(currentApiClient);
      }

      if (claimCheck?.isClaimable) {
        logger.loading(`Airdrop is claimable! Fetching ads first...`);

        // Updated: fetch ads before claiming (new required step)
        await fetchAdsMining(currentApiClient, tokenInfo.lastClaimTime);

        logger.loading(`Claiming airdrop...`);
        await claimAirdrop(currentApiClient);

        if (miniToken) {
          const miniProxy = getRandomProxy(proxies);
          const miniClient = createMiniApiClient(miniToken, miniProxy, deviceId, APP_ID);
          await doSpin(currentApiClient, miniClient);
        }

        logger.loading(`Refreshing user data...`);
        const updated = await getCurrentUserFull(currentApiClient);
        if (updated) {
          userInfo = updated.userInfo;
          tokenInfo = updated.token;
          isClaimable = updated.isClaimable;
          displayUserInfo(userInfo, tokenInfo);
        }

        return isClaimable?.nextFrame || (Date.now() + CLAIM_INTERVAL_MS);
      }

      isClaimable = null;
      return claimCheck?.nextFrame || (Date.now() + CLAIM_INTERVAL_MS);
    }

    logger.step(`Checking if airdrop is claimable...`);
    let nextClaimTime = await attemptClaim();

    const updateCountdown = () => {
      const timeRemaining = Math.max(0, nextClaimTime - Date.now());
      process.stdout.write(
        `\r${colors.white}Next claim in: ${colors.bold}${formatTimeRemaining(timeRemaining)}${colors.reset}      `
      );

      if (timeRemaining <= 0) {
        process.stdout.write('\n');
        logger.step(`Claim time reached!`);
        attemptClaim().then(newNextFrame => { nextClaimTime = newNextFrame; });
      }
    };

    setInterval(updateCountdown, 1000);

    const scheduleNextCheck = () => {
      const timeUntilNextCheck = Math.max(1000, nextClaimTime - Date.now());
      setTimeout(async () => {
        logger.step(`Scheduled claim check triggered.`);
        nextClaimTime = await attemptClaim();
        scheduleNextCheck();
      }, timeUntilNextCheck);
    };

    scheduleNextCheck();

    logger.success(`Bot is running! Claims will be attempted automatically.`);
    logger.info(`Press Ctrl+C to exit`);

  } catch (error) {
    logger.error(`Unexpected error: ${error.message}`);
    process.exit(1);
  }
}

runBot().finally(() => rl.close());
