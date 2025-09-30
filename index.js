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
const MINI_TOKEN_FILE_PATH = path.join(__dirname, 'mini_token.txt');
const DEVICE_FILE_PATH = path.join(__dirname, 'device.txt');
const PROXIES_FILE_PATH = path.join(__dirname, 'proxies.txt');
const APP_ID = 'id__mk39oef6we80fs7j2rif';
const CLAIM_INTERVAL_MS = 4 * 60 * 60 * 1000; 
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
async function checkLoginIdExist(apiClient, loginId, deviceId) {
  try {
    const response = await apiClient.get(`/auth/loginId-exist-check/${loginId}`, { params: { deviceId } });
    if (response.data.statusCode === 200) {
      logger.success('Login ID exists.');
      return true;
    } else {
      logger.error(`Login ID check failed: ${JSON.stringify(response.data)}`);
      return false;
    }
  } catch (error) {
    logger.error(`Error checking login ID existence: ${error.response?.data?.message || error.message}`);
    return false;
  }
}
async function checkPasscode(apiClient, loginId, passcode, deviceId) {
  try {
    const payload = { loginId, passcode, deviceId };
    const response = await apiClient.post('/auth/check-passcode', payload);
    if (response.data.statusCode === 200) {
      logger.success('Passcode verified.');
      return true;
    } else {
      logger.error(`Passcode check failed: ${JSON.stringify(response.data)}`);
      return false;
    }
  } catch (error) {
    logger.error(`Error checking passcode: ${error.response?.data?.message || error.message}`);
    if (error.response?.data) {
      logger.error(`Response details: ${JSON.stringify(error.response.data)}`);
    }
    return false;
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
    if (error.response?.data) {
      logger.error(`Response details: ${JSON.stringify(error.response.data)}`);
    }
  }
}
async function verifyOtp(apiClient, loginId, otp, deviceId) {
  try {
    const payload = { loginId, otp, deviceId };
    const response = await apiClient.post('/auth/check-otp-email-verify-login', payload);
    if (response.data.statusCode === 200) {
      logger.success(response.data.message);
      const token = response.data.data.jwtToken;
      return token;
    } else {
      logger.error(`Failed to verify OTP: ${JSON.stringify(response.data)}`);
      return null;
    }
  } catch (error) {
    logger.error(`Error verifying OTP: ${error.response?.data?.message || error.message}`);
    if (error.response?.data) {
      logger.error(`Response details: ${JSON.stringify(error.response.data)}`);
    }
    return null;
  }
}
async function getMiniToken(apiClient, loginId, appId) {
  try {
    const payload = { loginId, appId };
    const response = await apiClient.post('https://interlink-mini-app.interlinklabs.ai/api/tracking/verify', payload, {
      headers: {
        'api-public': 'e97ae0aa6520499d9edf20bd5a1e13c7'
      }
    });
    const miniToken = response.data.data?.token || response.data.data?.jwtToken;
    if (miniToken) {
      saveMiniToken(miniToken);
      logger.success('Mini token obtained successfully.');
      return miniToken;
    } else {
      logger.error('No mini token found in response.');
      return null;
    }
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
function saveToken(token) {
  try {
    fs.writeFileSync(TOKEN_FILE_PATH, token);
    logger.info(`Token saved to ${TOKEN_FILE_PATH}`);
  } catch (error) {
    logger.error(`Error saving token: ${error.message}`);
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
  } catch (error) {
    logger.warn(`Token file not found or invalid. Will attempt login.`);
    return null;
  }
}
function readMiniToken() {
  try {
    return fs.readFileSync(MINI_TOKEN_FILE_PATH, 'utf8').trim();
  } catch (error) {
    logger.warn(`Mini token file not found or invalid.`);
    return null;
  }
}
function readDevice() {
  try {
    return fs.readFileSync(DEVICE_FILE_PATH, 'utf8').trim();
  } catch (error) {
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
async function login(proxies, deviceId) {
  const loginId = await promptInput('Enter your login ID (or email): ');
  const passcode = await promptInput('Enter your passcode: ');
  const email = await promptInput('Enter your email: ');
  let apiClient;
  const proxy = getRandomProxy(proxies);
  if (proxy) {
    logger.step(`Attempting to check login with proxy: ${proxy}`);
    apiClient = createApiClient(null, proxy, deviceId);
  } else {
    logger.step(`Attempting to check login without proxy...`);
    apiClient = createApiClient(null, null, deviceId);
  }
  if (!await checkLoginIdExist(apiClient, loginId, deviceId)) {
    return null;
  }
  if (!await checkPasscode(apiClient, loginId, passcode, deviceId)) {
    return null;
  }
  await sendOtp(apiClient, loginId, passcode, email, deviceId);
  const otp = await promptInput('Enter OTP: ');
  const token = await verifyOtp(apiClient, loginId, otp, deviceId);
  if (!token) {
    return null;
  }
  const appId = APP_ID;
  let miniToken = await getMiniToken(apiClient, loginId, appId);
  if (miniToken) {
    await validateMiniToken(miniToken, appId);
  }
  saveToken(token);
  return { token, miniToken };
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
  } else {
    return new HttpsProxyAgent(proxyUrl);
  }
}
function createApiClient(token, proxy = null, deviceId = null) {
  const config = {
    baseURL: API_BASE_URL,
    headers: {
      'User-Agent': 'okhttp/4.12.0',
      'Accept-Encoding': 'gzip'
    },
    timeout: 30000,
    httpsAgent: new https.Agent({ 
      rejectUnauthorized: false
    })
  };
  
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
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
      'version': '1.1.6'
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
          const nextTime = new Date(buyRes.data.data.nextTimeToBuy).getTime();
          const waitMs = nextTime - Date.now();
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
function formatTimeRemaining(milliseconds) {
  if (milliseconds <= 0) return '00:00:00';
  
  const seconds = Math.floor((milliseconds / 1000) % 60);
  const minutes = Math.floor((milliseconds / (1000 * 60)) % 60);
  const hours = Math.floor((milliseconds / (1000 * 60 * 60)) % 24);
  
  return [hours, minutes, seconds]
    .map(val => val.toString().padStart(2, '0'))
    .join(':');
}
async function getCurrentUser(apiClient) {
  try {
    const response = await apiClient.get('/auth/current-user');
    return response.data.data;
  } catch (error) {
    logger.error(`Error getting user information: ${error.response?.data?.message || error.message}`);
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
    logger.error(`Error checking if airdrop is claimable: ${error.response?.data?.message || error.message}`);
    return { isClaimable: false, nextFrame: Date.now() + 1000 * 60 * 5 };
  }
}
async function claimAirdrop(apiClient) {
  try {
    const response = await apiClient.post('/token/claim-airdrop');
    logger.success(`Airdrop claimed successfully!`);
    return response.data;
  } catch (error) {
    logger.error(`Error claiming airdrop: ${error.response?.data?.message || error.message}`);
    return null;
  }
}
function displayUserInfo(userInfo, tokenInfo) {
  if (!userInfo || !tokenInfo) return;
  
  console.log('\n' + '='.repeat(50));
  console.log(`${colors.white}${colors.bold}USER INFORMATION${colors.reset}`);
  console.log(`${colors.white}Username:${colors.reset} ${userInfo.username}`);
  console.log(`${colors.white}Email:${colors.reset} ${userInfo.email}`);
  console.log(`${colors.white}Wallet:${colors.reset} ${userInfo.connectedAccounts?.wallet?.address || 'Not connected'}`);
  console.log(`${colors.white}User ID:${colors.reset} ${userInfo.loginId}`);
  console.log(`${colors.white}Referral ID:${colors.reset} ${tokenInfo.userReferralId}`);
  
  console.log('\n' + '='.repeat(50));
  console.log(`${colors.yellow}${colors.bold}TOKEN BALANCE${colors.reset}`);
  console.log(`${colors.yellow}Gold Tokens:${colors.reset} ${tokenInfo.interlinkGoldTokenAmount}`);
  console.log(`${colors.yellow}Silver Tokens:${colors.reset} ${tokenInfo.interlinkSilverTokenAmount}`);
  console.log(`${colors.yellow}Diamond Tokens:${colors.reset} ${tokenInfo.interlinkDiamondTokenAmount}`);
  console.log(`${colors.yellow}Interlink Tokens:${colors.reset} ${tokenInfo.interlinkTokenAmount}`);
  console.log(`${colors.yellow}Last Claim:${colors.reset} ${moment(tokenInfo.lastClaimTime).format('YYYY-MM-DD HH:mm:ss')}`);
  console.log('='.repeat(50) + '\n');
}
async function tryConnect(token, proxies, deviceId) {
  let apiClient;
  let userInfo = null;
  let tokenInfo = null;
  
  logger.step(`Attempting connection without proxy...`);
  apiClient = createApiClient(token, null, deviceId);
  
  logger.loading(`Retrieving user information...`);
  userInfo = await getCurrentUser(apiClient);
  
  if (!userInfo && proxies.length > 0) {
    let attempts = 0;
    const maxAttempts = Math.min(proxies.length, 5);
    
    while (!userInfo && attempts < maxAttempts) {
      const proxy = proxies[attempts];
      logger.step(`Trying with proxy ${attempts + 1}/${maxAttempts}: ${proxy}`);
      
      apiClient = createApiClient(token, proxy, deviceId);
      
      logger.loading(`Retrieving user information...`);
      userInfo = await getCurrentUser(apiClient);
      attempts++;
      
      if (!userInfo) {
        logger.warn(`Proxy ${proxy} failed. Trying next...`);
      }
    }
  }
  
  if (userInfo) {
    logger.loading(`Retrieving token balance...`);
    tokenInfo = await getTokenBalance(apiClient);
  }
  
  return { apiClient, userInfo, tokenInfo };
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
      logger.info(`Generated random device ID: ${deviceId}`);
      saveDevice(deviceId);
    }
    
    let loginRes = null;
    if (!token) {
      logger.step(`No token found. Initiating login...`);
      loginRes = await login(proxies, deviceId);
      if (!loginRes || !loginRes.token) {
        logger.error(`Login failed. Exiting.`);
        process.exit(1);
      }
      token = loginRes.token;
      miniToken = loginRes.miniToken;
    }
    
    let { apiClient, userInfo, tokenInfo: initialTokenInfo } = await tryConnect(token, proxies, deviceId);
    
    if (!userInfo || !initialTokenInfo) {
      logger.error(`Failed to retrieve necessary information. Attempting login...`);
      loginRes = await login(proxies, deviceId);
      if (!loginRes || !loginRes.token) {
        logger.error(`Login failed. Exiting.`);
        process.exit(1);
      }
      token = loginRes.token;
      miniToken = loginRes.miniToken || readMiniToken();
      const result = await tryConnect(token, proxies, deviceId);
      apiClient = result.apiClient;
      userInfo = result.userInfo;
      initialTokenInfo = result.tokenInfo;
      if (!userInfo || !initialTokenInfo) {
        logger.error(`Failed to retrieve necessary information after login. Check your credentials and proxies.`);
        process.exit(1);
      }
    }
    
    let tokenInfo = initialTokenInfo;
    
    if (!miniToken && userInfo) {
      logger.step('Obtaining mini token...');
      const appId = APP_ID;
      miniToken = await getMiniToken(apiClient, userInfo.loginId, appId);
      if (miniToken) {
        await validateMiniToken(miniToken, appId);
      }
    }
    
    logger.success(`Connected as ${userInfo.username}`);
    logger.info(`Started at: ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
    
    displayUserInfo(userInfo, tokenInfo);
    
    async function attemptClaim() {
      let currentApiClient = apiClient;
      if (proxies.length > 0) {
        const randomProxy = getRandomProxy(proxies);
        currentApiClient = createApiClient(token, randomProxy, deviceId);
      }
      
      const claimCheck = await checkIsClaimable(currentApiClient);
      
      if (claimCheck.isClaimable) {
        logger.loading(`Airdrop is claimable! Attempting to claim...`);
        await claimAirdrop(currentApiClient);
        
        if (miniToken) {
          const miniProxy = getRandomProxy(proxies);
          const miniClient = createMiniApiClient(miniToken, miniProxy, deviceId, APP_ID);
          await doSpin(currentApiClient, miniClient);
        }
        
        logger.loading(`Updating token information...`);
        const newTokenInfo = await getTokenBalance(currentApiClient);
        if (newTokenInfo) {
          tokenInfo = newTokenInfo;
          displayUserInfo(userInfo, tokenInfo);
        }
      }
      
      return claimCheck.nextFrame;
    }
    
    logger.step(`Checking if airdrop is claimable...`);
    let nextClaimTime = await attemptClaim();
    
    const updateCountdown = () => {
      const now = Date.now();
      const timeRemaining = Math.max(0, nextClaimTime - now);
      
      process.stdout.write(`\r${colors.white}Next claim in: ${colors.bold}${formatTimeRemaining(timeRemaining)}${colors.reset}      `);
      
      if (timeRemaining <= 0) {
        process.stdout.write('\n');
        logger.step(`Claim time reached!`);
        
        attemptClaim().then(newNextFrame => {
          nextClaimTime = newNextFrame;
        });
      }
    };
    
    setInterval(updateCountdown, 1000);
    
    const scheduleNextCheck = () => {
      const now = Date.now();
      const timeUntilNextCheck = Math.max(1000, nextClaimTime - now);
      
      setTimeout(async () => {
        logger.step(`Scheduled claim time reached.`);
        nextClaimTime = await attemptClaim();
        scheduleNextCheck();
      }, timeUntilNextCheck);
    };
    
    scheduleNextCheck();
    
    logger.success(`Bot is running! Airdrop claims will be attempted automatically.`);
    logger.info(`Press Ctrl+C to exit`);
    
  } catch (error) {
    logger.error(`Unexpected error: ${error.message}`);
    process.exit(1);
  }
}
runBot().finally(() => rl.close());
