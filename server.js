const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.MYGAIN_DATA_DIR || path.join(__dirname, 'data'));
const DB_PATH = path.join(DATA_DIR, 'db.json');
const PUBLIC_ROOT = __dirname;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

fs.mkdirSync(DATA_DIR, { recursive: true });
const starterProducts = [
  { id: 'foundation', name: 'Foundation fund', code: 'LEVEL 1', level: 1, amount: 50, dailyRate: 5, symbol: 'F', color: '#dff6eb', tickerSymbol: '', assetType: 'manual', manualTestRate: 5 },
  { id: 'growth', name: 'Growth fund', code: 'LEVEL 2', level: 2, amount: 100, dailyRate: 7, symbol: 'G', color: '#fff0ec', tickerSymbol: '', assetType: 'manual', manualTestRate: 7 },
  { id: 'momentum', name: 'Momentum fund', code: 'LEVEL 3', level: 3, amount: 250, dailyRate: 9, symbol: 'M', color: '#fff6d8', tickerSymbol: '', assetType: 'manual', manualTestRate: 9 },
  { id: 'summit', name: 'Summit fund', code: 'LEVEL 4', level: 4, amount: 500, dailyRate: 12, symbol: 'S', color: '#e9e6fb', tickerSymbol: '', assetType: 'manual', manualTestRate: 12 },
];

// ---------------------------------------------------------------------------
// Real market data. Admin assigns a ticker + assetType to a level; the rate
// paid out that level is then derived from the real 24h price change of that
// ticker instead of an arbitrary admin-typed number. If a level has no ticker
// assigned (or the market fetch fails), it falls back to `manualTestRate`,
// which is clearly a manual/testing figure rather than a live market number.
// ---------------------------------------------------------------------------
const MARKET_CACHE_MS = 5 * 60 * 1000; // refresh every 5 minutes
const marketCache = new Map(); // ticker+type -> { changePercent, fetchedAt }
const MAX_DAILY_RATE = 8; // sanity clamp: real markets don't move 10%+ a day
const DEFAULT_WITHDRAWAL_THRESHOLDS = { 1: 250, 2: 500, 3: 1000, 4: 2000 };
const DEFAULT_WITHDRAWAL_LIMITS = { 1: 1, 2: 1, 3: 1, 4: 1 };
const DEFAULT_WITHDRAWAL_INTERVALS = { 1: 1, 2: 1, 3: 1, 4: 1 };
const DEFAULT_REFERRAL_BONUSES = { 1: 25, 2: 50, 3: 100, 4: 200 };
const VAULT_COUNT = 5;
const DEFAULT_TIME_ZONE = 'Africa/Accra';

function httpsGetJson(requestUrl, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(requestUrl, { headers: { 'User-Agent': 'MyGain/1.0' } }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`Market request returned HTTP ${res.statusCode}`));
        return;
      }
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Market request timed out')));
  });
}

function httpsGetText(requestUrl, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(requestUrl, { headers: { 'User-Agent': 'MyGain/1.0' } }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`Market request returned HTTP ${res.statusCode}`));
        return;
      }
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => resolve(raw));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Market request timed out')));
  });
}

async function fetchMarketChangePercent(tickerSymbol, assetType) {
  const ticker = String(tickerSymbol || '').trim();
  if (!ticker) return null;
  const cacheKey = `${assetType}:${ticker.toLowerCase()}`;
  const cached = marketCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < MARKET_CACHE_MS) return cached.changePercent;
  try {
    let changePercent = null;
    if (assetType === 'crypto') {
      const data = await httpsGetJson(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ticker.toLowerCase())}&vs_currencies=usd&include_24hr_change=true`);
      const entry = data[ticker.toLowerCase()];
      if (entry && Number.isFinite(entry.usd_24h_change)) changePercent = entry.usd_24h_change;
    } else {
      // Stocks / commodities / indices via Stooq's free CSV feed (no API key required).
      const csv = await httpsGetText(`https://stooq.com/q/d/l/?s=${encodeURIComponent(ticker.toLowerCase())}&i=d`);
      const rows = csv.trim().split('\n').slice(1).filter(Boolean);
      if (rows.length >= 2) {
        const last = rows[rows.length - 1].split(',');
        const prev = rows[rows.length - 2].split(',');
        const lastClose = Number(last[4]);
        const prevClose = Number(prev[4]);
        if (Number.isFinite(lastClose) && Number.isFinite(prevClose) && prevClose > 0) {
          changePercent = ((lastClose - prevClose) / prevClose) * 100;
        }
      }
    }
    if (changePercent === null) return null;
    marketCache.set(cacheKey, { changePercent, fetchedAt: Date.now() });
    return changePercent;
  } catch (error) {
    console.error(`Market fetch failed for ${ticker} (${assetType}):`, error.message);
    return cached ? cached.changePercent : null;
  }
}

// Refreshes every product's live-market-derived dailyRate. Runs on a timer so
// requests never block on a network call. Products without a ticker (or a
// failed fetch) keep using their admin-set manualTestRate.
async function refreshProductRates() {
  let initialDb;
  try { initialDb = readDb(); } catch { return; }
  const marketResults = new Map();
  for (const product of initialDb.products) {
    if (product.tickerSymbol && product.assetType && product.assetType !== 'manual') {
      const changePercent = await fetchMarketChangePercent(product.tickerSymbol, product.assetType);
      marketResults.set(product.id, changePercent);
    }
  }

  // Re-read immediately before writing so a slow market request can never
  // overwrite a member/admin transaction that was saved while we were waiting.
  let db;
  try { db = readDb(); } catch { return; }
  let changed = false;
  for (const product of db.products) {
    const hasMarketConfig = product.tickerSymbol && product.assetType && product.assetType !== 'manual';
    const changePercent = marketResults.get(product.id);
    if (hasMarketConfig && changePercent !== null && changePercent !== undefined) {
      const clamped = Math.max(-MAX_DAILY_RATE, Math.min(MAX_DAILY_RATE, Math.abs(Number(changePercent))));
      if (Number.isFinite(clamped) && (product.dailyRate !== clamped || product.rateSource !== 'market')) {
        product.dailyRate = clamped;
        product.rateSource = 'market';
        product.rateUpdatedAt = Date.now();
        changed = true;
      }
      continue;
    }
    const fallback = Number(product.manualTestRate ?? product.dailyRate ?? 0);
    if (Number.isFinite(fallback) && (product.dailyRate !== fallback || product.rateSource !== 'manual')) {
      product.dailyRate = fallback;
      product.rateSource = 'manual';
      product.rateUpdatedAt = Date.now();
      changed = true;
    }
  }
  if (changed) writeDb(db);
}

// ---------------------------------------------------------------------------
// Login security: brute-force lockout for both member and admin sign-in.
// ---------------------------------------------------------------------------
const loginAttempts = new Map(); // key -> { count, firstAttemptAt, lockedUntil }
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const requestRateLimits = new Map();
const AUTH_RATE_LIMIT = 30;
const AUTH_RATE_WINDOW_MS = 60 * 1000;

function requestIp(request) {
  return request.socket?.remoteAddress || 'unknown';
}

function isRateLimited(bucket, request) {
  const key = `${bucket}:${requestIp(request)}`;
  const now = Date.now();
  const entry = requestRateLimits.get(key);
  if (!entry || now - entry.startedAt >= AUTH_RATE_WINDOW_MS) {
    requestRateLimits.set(key, { count: 1, startedAt: now });
    return false;
  }
  entry.count += 1;
  return entry.count > AUTH_RATE_LIMIT;
}

function loginKey(kind, identifier, request) {
  const ip = request.socket?.remoteAddress || 'unknown';
  return `${kind}:${identifier}:${ip}`;
}

function isLockedOut(key) {
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (entry.lockedUntil && entry.lockedUntil > Date.now()) return true;
  if (entry.lockedUntil && entry.lockedUntil <= Date.now()) loginAttempts.delete(key);
  return false;
}

function registerFailedLogin(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.firstAttemptAt > ATTEMPT_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttemptAt: now, lockedUntil: 0 });
    return;
  }
  entry.count += 1;
  if (entry.count >= MAX_LOGIN_ATTEMPTS) entry.lockedUntil = now + LOCKOUT_MS;
}

function clearLoginAttempts(key) {
  loginAttempts.delete(key);
}

function pruneExpiredSessions(db) {
  const now = Date.now();
  db.sessions = (db.sessions || []).filter((session) => session.expiresAt > now);
  db.adminSessions = (db.adminSessions || []).filter((session) => session.expiresAt > now);
}

function securityHeaders(request, response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data:; connect-src 'self';");
  const forwardedProto = String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  if (forwardedProto === 'https' || request.socket.encrypted) response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

function parseBody(request) {
  return new Promise((resolve, reject) => {
    const declaredLength = Number(request.headers['content-length'] || 0);
    if (declaredLength > MAX_BODY_BYTES) {
      reject(new Error('Request body too large'));
      request.resume();
      return;
    }
    let raw = '';
    let size = 0;
    let rejected = false;
    request.on('data', (chunk) => {
      if (rejected) return;
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        rejected = true;
        reject(new Error('Request body too large'));
        request.resume();
        return;
      }
      raw += chunk;
    });
    request.on('end', () => {
      if (rejected) return;
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON body')); }
    });
    request.on('error', reject);
  });
}

function finiteNumber(value, { min = -Infinity, max = Infinity } = {}) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function boundedString(value, maxLength = 200) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function bearerToken(request) {
  const header = String(request.headers.authorization || '');
  const match = header.match(/^Bearer\s+([^\s]+)$/i);
  return match ? match[1] : '';
}

function safeImageUrl(value, maxLength = 1000) {
  const url = boundedString(value, maxLength);
  if (!url) return '';
  if (url.startsWith('data:image/')) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? url : '';
  } catch { return ''; }
}

function readDb() {
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  db.settings ||= {};
  db.settings.timeZone ||= DEFAULT_TIME_ZONE;
  db.settings.withdrawalLimits = { ...DEFAULT_WITHDRAWAL_LIMITS, ...(db.settings.withdrawalLimits || {}) };
  db.settings.withdrawalIntervals = { ...DEFAULT_WITHDRAWAL_INTERVALS, ...(db.settings.withdrawalIntervals || {}) };
  db.settings.withdrawalThresholds = { ...DEFAULT_WITHDRAWAL_THRESHOLDS, ...(db.settings.withdrawalThresholds || {}) };
  db.settings.referralBonuses = { ...DEFAULT_REFERRAL_BONUSES, ...(db.settings.referralBonuses || {}) };
  db.members ||= [];
  db.paymentRequests ||= [];
  db.sessions ||= [];
  db.notifications ||= [];
  db.information ||= [];
  db.depositAccounts ||= [];
  db.levelPurchases ||= [];
  db.bonuses ||= [];
  db.vaultOpenings ||= [];
  db.profitTransactions ||= [];
  if (!Array.isArray(db.products) || db.products.length === 0) {
    db.products = starterProducts;
    writeDb(db);
  }
  if (!Array.isArray(db.admins) || db.admins.length === 0) {
    const adminEmail = process.env.MYGAIN_ADMIN_EMAIL;
    const adminPassword = process.env.MYGAIN_ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      throw new Error('MYGAIN_ADMIN_EMAIL and MYGAIN_ADMIN_PASSWORD are required to initialize the admin account');
    }

    const password = hashPassword(adminPassword);

    db.admins = [{
      id: crypto.randomUUID(),
      email: adminEmail.toLowerCase(),
      passwordSalt: password.salt,
      passwordHash: password.hash,
      createdAt: Date.now()
    }];

    db.adminSessions = [];
    writeDb(db);
  }
  db.adminSessions ||= [];
  db.vaultOpenings ||= [];
  db.profitTransactions ||= [];
  backfillReferralRewards(db);
  return db;
}

function writeDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporaryPath = `${DB_PATH}.tmp`;
  const payload = JSON.stringify(db, null, 2);
  fs.writeFileSync(temporaryPath, payload, { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(temporaryPath, 0o600); } catch {}
  fs.renameSync(temporaryPath, DB_PATH);
  try { fs.chmodSync(DB_PATH, 0o600); } catch {}
}

function awardReferralReward(db, member, purchase) {
  if (!member.referredBy || member.referralRewardAwarded) return 0;
  const referrer = db.members.find((item) => item.memberNumber === member.referredBy);
  const alreadyRecorded = (db.bonuses || []).some((bonus) => bonus.memberId === referrer?.id && String(bonus.reason || '').includes(`· ${member.memberNumber} `));
  if (alreadyRecorded) {
    member.referralRewardAwarded = true;
    return 0;
  }
  const bonus = Number(db.settings.referralBonuses?.[purchase.level] ?? 0);
  if (!referrer || bonus <= 0) return 0;
  referrer.referralBonus += bonus;
  (db.bonuses ||= []).push({ id: crypto.randomUUID(), memberId: referrer.id, amount: bonus, reason: `Referral reward · ${member.memberNumber} first Level ${purchase.level} purchase`, createdAt: Date.now() });
  member.referralRewardAwarded = true;
  return bonus;
}

function backfillReferralRewards(db) {
  let changed = false;
  for (const member of db.members) {
    if (!member.referredBy || member.referralRewardAwarded) continue;
    const firstPurchase = (db.levelPurchases || []).filter((item) => item.memberId === member.id).sort((left, right) => left.purchasedAt - right.purchasedAt)[0];
    if (firstPurchase && awardReferralReward(db, member, firstPurchase) > 0) changed = true;
  }
  if (changed) writeDb(db);
}

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}

function matchesPassword(password, member) {
  if (member.passwordHash.length === 64) {
    const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(member.passwordHash, 'hex'), Buffer.from(legacyHash, 'hex'));
  }
  const candidate = crypto.scryptSync(password, member.passwordSalt, 64);
  const stored = Buffer.from(member.passwordHash, 'hex');
  return stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);
}

function memberNumber(db) {
  let code;
  do {
    code = `${String.fromCharCode(65 + crypto.randomInt(26))}${String(crypto.randomInt(10000)).padStart(4, '0')}`;
  } while (db.members.some((member) => member.memberNumber === code));
  return code;
}

function publicMember(member, includePrivateAccount = false) {
  const result = { id: member.id, phone: member.phone, memberNumber: member.memberNumber, nickname: member.nickname || '', referralBonus: member.referralBonus, createdAt: member.createdAt };
  if (includePrivateAccount) {
    result.withdrawalAccountName = member.withdrawalAccountName || '';
    result.withdrawalAccountNumber = member.withdrawalAccountNumber || '';
  }
  return result;
}

function teamPublicMember(member) {
  return { id: member.id, memberNumber: member.memberNumber, nickname: member.nickname || '', createdAt: member.createdAt };
}

function earningWindowStart(purchasedAt) {
  const purchaseDate = new Date(purchasedAt);
  const firstEarning = new Date(purchaseDate);
  firstEarning.setHours(6, 0, 0, 0);
  if (purchaseDate.getTime() >= firstEarning.getTime()) firstEarning.setDate(firstEarning.getDate() + 1);
  return firstEarning.getTime();
}

function earningDays(purchasedAt, now = Date.now()) {
  const start = earningWindowStart(purchasedAt);
  if (now < start) return 1;
  return Math.min(30, Math.floor((now - start) / 86400000) + 1);
}

function currentDayProgress(now = Date.now()) {
  const start = new Date(now);
  start.setHours(6, 0, 0, 0);
  if (start.getTime() > now) start.setDate(start.getDate() - 1);
  return Math.min(1, Math.max(0, (now - start.getTime()) / 86400000));
}

function calendarDate(now = Date.now(), timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function vaultDate(db, now = Date.now()) {
  return calendarDate(now, db.settings.timeZone || DEFAULT_TIME_ZONE);
}

function earningsForMember(db, member) {
  const deposits = db.paymentRequests.filter((item) => item.memberId === member.id && item.type === 'deposit' && item.status === 'approved');
  const withdrawals = db.paymentRequests.filter((item) => item.memberId === member.id && item.type === 'withdrawal' && ['approved', 'pending'].includes(item.status));
  const bonuses = (db.bonuses || []).filter((item) => item.memberId === member.id);
  const purchases = (db.levelPurchases || []).filter((item) => item.memberId === member.id);
  const now = Date.now();
  const investments = purchases.map((purchase) => {
    const days = earningDays(purchase.purchasedAt, now);
    const product = db.products.find((item) => Number(item.level) === Number(purchase.level));
    const dailyRate = Number(product?.dailyRate ?? purchase.dailyRate ?? db.settings.dailyProfitPercent ?? 0);
    return { id: purchase.id, planNumber: Number(purchase.planNumber || 0), amount: Number(purchase.amount), level: purchase.level, assetName: purchase.assetName, dailyRate, days, active: days < 30, expiresAt: earningWindowStart(purchase.purchasedAt) + 30 * 86400000, purchasedAt: purchase.purchasedAt, profit: 0 };
  });
  const deposited = investments.reduce((total, item) => total + item.amount, 0);
  const approvedDeposits = deposits.reduce((total, item) => total + Number(item.amount), 0);
  const purchased = purchases.reduce((total, item) => total + Number(item.amount), 0);
  const memberVaults = (db.vaultOpenings || []).filter((item) => item.memberId === member.id);
  const profit = memberVaults.reduce((total, item) => total + Number(item.rewardAmount || 0), 0);
  const bonusTotal = bonuses.reduce((total, item) => total + Number(item.amount), 0);
  const teamMembers = db.members.filter((item) => item.referredBy === member.memberNumber);
  const teamProfit = teamMembers.reduce((total, item) => total + Number(earningsForMember(db, item).todayEarnings || 0), 0);
  const teamCommission = teamProfit * 0.10;
  const withdrawn = withdrawals.reduce((total, item) => total + Number(item.amount), 0);
  const approvedWithdrawn = withdrawals.filter((item) => item.status === 'approved').reduce((total, item) => total + Number(item.amount), 0);
  const pendingWithdrawals = withdrawals.filter((item) => item.status === 'pending').reduce((total, item) => total + Number(item.amount), 0);
  const cashBalance = approvedDeposits + bonusTotal + teamCommission - approvedWithdrawn - pendingWithdrawals - purchased;
  const portfolioValue = approvedDeposits + bonusTotal + teamCommission - approvedWithdrawn - pendingWithdrawals - purchased + profit;
  const highestLevel = purchases.reduce((highest, item) => Math.max(highest, Number(item.level) || 0), 0);
  const withdrawalThreshold = Number(db.settings.withdrawalThresholds?.[highestLevel] || 0);
  const withdrawalEligible = highestLevel > 0 && portfolioValue >= withdrawalThreshold;
  const activeInvestments = investments.filter((item) => item.active);
  const dailyAmount = activeInvestments.reduce((total, item) => total + Number(item.amount) * Number(item.dailyRate) / 100, 0);
  const today = vaultDate(db, now);
  const todayEarnings = memberVaults.filter((item) => item.vaultDate === today).reduce((total, item) => total + Number(item.rewardAmount || 0), 0);
  const activeInvestment = activeInvestments[activeInvestments.length - 1];
  const history = Array.from({ length: 30 }, (_, index) => {
    const point = new Date(now);
    point.setHours(6, 0, 0, 0);
    point.setDate(point.getDate() - (29 - index));
    const depositsAtPoint = deposits.filter((item) => (item.approvedAt || item.createdAt) <= point.getTime()).reduce((total, item) => total + Number(item.amount), 0);
    const withdrawalsAtPoint = withdrawals.filter((item) => item.status === 'approved' && (item.approvedAt || item.createdAt) <= point.getTime()).reduce((total, item) => total + Number(item.amount), 0);
    const bonusesAtPoint = bonuses.filter((item) => item.createdAt <= point.getTime()).reduce((total, item) => total + Number(item.amount), 0);
    const purchasesAtPoint = purchases.filter((item) => item.purchasedAt <= point.getTime()).reduce((total, item) => total + Number(item.amount), 0);
    const profitAtPoint = memberVaults.filter((item) => Number(item.createdAt) <= point.getTime()).reduce((total, item) => total + Number(item.rewardAmount || 0), 0);
    return { date: point.toISOString(), value: Math.max(0, depositsAtPoint + bonusesAtPoint - withdrawalsAtPoint - purchasesAtPoint + profitAtPoint) };
  });
  const withdrawalLimit = Number(db.settings.withdrawalLimits?.[highestLevel] ?? 1);
  const dayStart = new Date(now);
  dayStart.setHours(6, 0, 0, 0);
  if (dayStart.getTime() > now) dayStart.setDate(dayStart.getDate() - 1);
  const withdrawalsToday = withdrawals.filter((item) => Number(item.createdAt || 0) >= dayStart.getTime()).length;
  const withdrawalInterval = Math.max(1, Number(db.settings.withdrawalIntervals?.[highestLevel] ?? 1));
  const latestWithdrawal = withdrawals.reduce((latest, item) => Math.max(latest, Number(item.createdAt || 0)), 0);
  const nextWithdrawalAt = latestWithdrawal ? latestWithdrawal + withdrawalInterval * 86400000 : null;
  const activeRate = dailyAmount && deposited ? dailyAmount / deposited * 100 : activeInvestment?.dailyRate || 0;
  return { deposited: approvedDeposits, purchased, profit, bonuses: bonusTotal, teamProfit, teamCommission, withdrawn: approvedWithdrawn, pendingWithdrawals, withdrawable: Math.max(0, portfolioValue), withdrawalThreshold, withdrawalEligible, highestLevel, withdrawalLimit, withdrawalInterval, withdrawalsToday, withdrawalsRemaining: Math.max(0, withdrawalLimit - withdrawalsToday), nextWithdrawalAt, cashBalance, portfolioValue, todayEarnings, dailyAmount, activeLevelCount: activeInvestments.length, maxActiveLevels: 2, nextPayoutAt: null, activeLevel: activeInvestment?.level || null, activeRate, history, balance: portfolioValue, investments, bonusLedger: bonuses };
}

function vaultSummary(db, member, earnings = earningsForMember(db, member)) {
  const today = vaultDate(db);
  const openings = (db.vaultOpenings || []).filter((item) => item.memberId === member.id && item.vaultDate === today);
  const opened = new Set(openings.map((item) => Number(item.vaultNumber)));
  const dailyRate = Number(earnings.activeRate || 0);
  const vaultRate = dailyRate / VAULT_COUNT;
  const dailyProfit = Number(earnings.dailyAmount || 0);
  const vaultAmount = dailyProfit / VAULT_COUNT;
  const profitReceived = openings.reduce((total, item) => total + Number(item.rewardAmount || 0), 0);
  return { vaultDate: today, dailyRate, vaultRate, eligibleBalance: Number(earnings.deposited || 0), dailyProfit, vaultAmount, opened: [...opened].sort((left, right) => left - right), openedCount: opened.size, profitReceived, remainingProfit: Math.max(0, dailyProfit - profitReceived), vaults: Array.from({ length: VAULT_COUNT }, (_, index) => { const vaultNumber = index + 1; const opening = openings.find((item) => Number(item.vaultNumber) === vaultNumber); return { vaultNumber, opened: Boolean(opening), openedAt: opening?.createdAt || null, rewardAmount: opening?.rewardAmount || null }; }) };
}

function sessionMember(request, db) {
  const token = bearerToken(request);
  const session = db.sessions.find((item) => item.token === token && item.expiresAt > Date.now());
  return session ? db.members.find((member) => member.id === session.memberId) : null;
}

function requireAdmin(request, db) {
  const token = bearerToken(request);
  return db.adminSessions.some((session) => session.token === token && session.expiresAt > Date.now());
}

async function api(request, response, pathname) {
  const db = readDb();
  if (request.method === 'POST' && ['/api/auth/login', '/api/auth/signup', '/api/admin/auth/login'].includes(pathname) && isRateLimited(pathname, request)) {
    return json(response, 429, { error: 'Too many authentication requests. Please try again shortly.' });
  }
  if (request.method === 'POST' && pathname === '/api/admin/auth/login') {
    const body = await parseBody(request);
    const email = boundedString(body.email, 254).toLowerCase();
    const key = loginKey('admin', email, request);
    if (!email || email.length > 254 || typeof body.password !== 'string' || body.password.length > 256) return json(response, 400, { error: 'Enter a valid admin email and password.' });

    if (isLockedOut(key)) return json(response, 429, { error: 'Too many failed attempts. Try again in 15 minutes.' });
    const admin = db.admins.find((item) => item.email === email);
    if (!admin || typeof body.password !== 'string' || !matchesPassword(body.password, admin)) {
      registerFailedLogin(key);
      return json(response, 401, { error: 'Admin email or password is incorrect.' });
    }
    clearLoginAttempts(key);
    const token = crypto.randomBytes(32).toString('hex');
    pruneExpiredSessions(db);
    db.adminSessions.push({ token, adminId: admin.id, expiresAt: Date.now() + 1000 * 60 * 60 * 8 });
    writeDb(db);
    return json(response, 200, { admin: { id: admin.id, email: admin.email }, token });
  }
  if (request.method === 'PATCH' && pathname === '/api/admin/auth/password') {
    if (!requireAdmin(request, db)) return json(response, 403, { error: 'Admin access required.' });
    const token = bearerToken(request);
    const session = db.adminSessions.find((item) => item.token === token);
    const admin = db.admins.find((item) => item.id === session.adminId);
    const body = await parseBody(request);
    if (!matchesPassword(String(body.currentPassword || ''), admin)) return json(response, 401, { error: 'Current password is incorrect.' });
    if (typeof body.newPassword !== 'string' || body.newPassword.length > 256 || !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}/.test(body.newPassword)) return json(response, 400, { error: 'New password needs 12+ characters with uppercase, lowercase, and a number.' });
    const upgraded = hashPassword(body.newPassword);
    admin.passwordSalt = upgraded.salt;
    admin.passwordHash = upgraded.hash;
    db.adminSessions = db.adminSessions.filter((item) => item.adminId !== admin.id || item.token === token);
    writeDb(db);
    return json(response, 200, { ok: true });
  }
  if (request.method === 'POST' && pathname === '/api/admin/auth/logout') {
    const token = bearerToken(request);
    if (token) {
      db.adminSessions = (db.adminSessions || []).filter((session) => session.token !== token);
      writeDb(db);
    }
    return json(response, 200, { ok: true });
  }
  if (request.method === 'POST' && pathname === '/api/auth/logout') {
    const token = bearerToken(request);
    if (token) {
      db.sessions = (db.sessions || []).filter((session) => session.token !== token);
      writeDb(db);
    }
    return json(response, 200, { ok: true });
  }
  if (request.method === 'POST' && pathname === '/api/auth/signup') {
    const body = await parseBody(request);
    const phone = normalizePhone(body.phone);
    if (!/^\d{10}$/.test(phone) || typeof body.password !== 'string' || body.password.length > 256 || !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}/.test(body.password)) return json(response, 400, { error: 'Use a 10-digit phone number and a 12+ character password with uppercase, lowercase, a number, and a symbol.' });
    if (db.members.some((member) => normalizePhone(member.phone) === phone)) return json(response, 409, { error: 'That phone number already has an account.' });
    const referral = boundedString(body.referralCode, 20).toUpperCase();
    const referrer = db.members.find((member) => member.memberNumber === referral);
    if (referral && !referrer) return json(response, 400, { error: 'Referral code not found.' });
    const password = hashPassword(body.password);
    const member = { id: crypto.randomUUID(), phone, memberNumber: memberNumber(db), passwordSalt: password.salt, passwordHash: password.hash, nickname: '', withdrawalAccountName: '', withdrawalAccountNumber: '', referralBonus: 0, referredMembers: [], createdAt: Date.now() };
    if (referrer && referrer.id !== member.id) { referrer.referredMembers.push(member.memberNumber); member.referredBy = referrer.memberNumber; member.referralLevelsAwarded = []; }
    db.members.push(member);
    const token = crypto.randomBytes(32).toString('hex');
    pruneExpiredSessions(db);
    db.sessions.push({ token, memberId: member.id, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7 });
    writeDb(db);
    return json(response, 201, { member: publicMember(member), token });
  }
  if (request.method === 'POST' && pathname === '/api/auth/login') {
    const body = await parseBody(request);
    const phone = normalizePhone(body.phone);
    const key = loginKey('member', phone, request);
    if (isLockedOut(key)) return json(response, 429, { error: 'Too many failed attempts. Try again in 15 minutes.' });
    const member = db.members.find((item) => normalizePhone(item.phone) === phone);
    if (!member || member.active === false || !matchesPassword(body.password || '', member)) {
      registerFailedLogin(key);
      return json(response, 401, { error: member?.active === false ? 'This member account is deactivated.' : 'Phone number or password is incorrect.' });
    }
    clearLoginAttempts(key);
    member.phone = phone;
    if (member.passwordHash.length === 64) {
      const upgraded = hashPassword(body.password);
      member.passwordSalt = upgraded.salt;
      member.passwordHash = upgraded.hash;
    }
    const token = crypto.randomBytes(32).toString('hex');
    pruneExpiredSessions(db);
    db.sessions.push({ token, memberId: member.id, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7 });
    writeDb(db);
    return json(response, 200, { member: publicMember(member), token });
  }
  if (request.method === 'GET' && pathname === '/api/products') return json(response, 200, { products: db.products });
  if (request.method === 'GET' && pathname === '/api/settings') {
    if (!requireAdmin(request, db)) return json(response, 403, { error: 'Admin access required.' });
    return json(response, 200, { settings: db.settings });
  }
  if (request.method === 'GET' && pathname === '/api/notifications') return json(response, 200, { notifications: db.notifications, information: db.information });
  if (request.method === 'GET' && pathname === '/api/me/notices') {
    const member = sessionMember(request, db);
    if (!member) return json(response, 401, { error: 'Login required.' });
    const memberLevel = Math.max(...(db.levelPurchases || []).filter((item) => item.memberId === member.id).map((item) => Number(item.level) || 0), 0);
    const notices = (db.notifications || []).filter((notice) => notice.audience === 'all' || String(notice.audience) === String(memberLevel)).sort((left, right) => right.createdAt - left.createdAt);
    return json(response, 200, { notices });
  }
  if (request.method === 'GET' && pathname === '/api/live-state') return json(response, 200, { products: db.products, settings: db.settings, notifications: db.notifications, information: db.information });
  if (request.method === 'GET' && pathname === '/api/me/live-state') {
    const member = sessionMember(request, db);
    if (!member) return json(response, 401, { error: 'Login required.' });
    return json(response, 200, { products: db.products, settings: db.settings, depositAccounts: db.depositAccounts, notifications: db.notifications, information: db.information });
  }
  if (request.method === 'GET' && pathname === '/api/vaults/today') {
    const member = sessionMember(request, db);
    if (!member) return json(response, 401, { error: 'Login required.' });
    const earnings = earningsForMember(db, member);
    return json(response, 200, { vaults: vaultSummary(db, member, earnings) });
  }
  if (request.method === 'GET' && pathname === '/api/vaults/history') {
    const member = sessionMember(request, db);
    if (!member) return json(response, 401, { error: 'Login required.' });
    return json(response, 200, { history: (db.profitTransactions || []).filter((item) => item.memberId === member.id && item.source === 'vault').sort((left, right) => right.createdAt - left.createdAt) });
  }
  if (request.method === 'GET' && pathname === '/api/me/transactions') {
    const member = sessionMember(request, db);
    if (!member) return json(response, 401, { error: 'Login required.' });
    const transactions = [
      ...(db.paymentRequests || []).filter((item) => item.memberId === member.id && ['deposit', 'withdrawal'].includes(item.type)).map((item) => ({ id: item.id, type: item.type, title: item.type === 'deposit' ? 'Deposit' : 'Withdrawal', amount: item.type === 'withdrawal' ? -Number(item.amount) : Number(item.amount), status: item.status, createdAt: item.createdAt, detail: item.status === 'pending' ? 'Pending approval' : item.status })),
      ...(db.levelPurchases || []).filter((item) => item.memberId === member.id).map((item) => ({ id: item.id, type: 'purchase', title: `${item.assetName || 'Level purchase'} · Level ${item.level}`, amount: -Number(item.amount), status: 'completed', createdAt: item.purchasedAt, detail: 'Investment purchase' })),
      ...(db.profitTransactions || []).filter((item) => item.memberId === member.id).map((item) => ({ id: item.id, type: 'profit', title: `Vault ${item.vaultNumber} profit`, amount: Number(item.amount), status: 'completed', createdAt: item.createdAt, detail: item.vaultDate })),
      ...(db.bonuses || []).filter((item) => item.memberId === member.id).map((item) => ({ id: item.id, type: 'bonus', title: 'Bonus', amount: Number(item.amount), status: 'completed', createdAt: item.createdAt, detail: item.reason || 'Bonus' })),
    ].sort((left, right) => right.createdAt - left.createdAt);
    return json(response, 200, { transactions });
  }
  if (request.method === 'POST' && pathname.startsWith('/api/vaults/') && pathname.endsWith('/open')) {
    const member = sessionMember(request, db);
    if (!member) return json(response, 401, { error: 'Login required.' });
    if (member.active === false) return json(response, 403, { error: 'This member account is deactivated.' });
    const vaultNumber = Number(pathname.split('/')[3]);
    if (!Number.isInteger(vaultNumber) || vaultNumber < 1 || vaultNumber > VAULT_COUNT) return json(response, 400, { error: 'Choose a vault from 1 to 5.' });
    const earnings = earningsForMember(db, member);
    const summary = vaultSummary(db, member, earnings);
    if (!summary.dailyProfit || !earnings.investments.some((item) => item.active)) return json(response, 400, { error: 'You need an active investment before opening a vault.' });
    const alreadyOpened = (db.vaultOpenings || []).some((item) => item.memberId === member.id && item.vaultDate === summary.vaultDate && Number(item.vaultNumber) === vaultNumber);
    if (alreadyOpened) return json(response, 409, { error: 'That vault has already been opened today.' });
    const createdAt = Date.now();
    const opening = { id: crypto.randomUUID(), memberId: member.id, vaultNumber, vaultDate: summary.vaultDate, dailyRate: summary.dailyRate, vaultRate: summary.vaultRate, eligibleBalance: summary.eligibleBalance, rewardAmount: Number(summary.vaultAmount.toFixed(2)), createdAt };
    const transaction = { id: crypto.randomUUID(), memberId: member.id, type: 'profit', source: 'vault', vaultOpeningId: opening.id, vaultNumber, vaultDate: summary.vaultDate, amount: opening.rewardAmount, createdAt };
    db.vaultOpenings.push(opening);
    db.profitTransactions.push(transaction);
    writeDb(db);
    const updatedEarnings = earningsForMember(db, member);
    return json(response, 201, { opening, transaction, rewardAmount: opening.rewardAmount, earnings: updatedEarnings, vaults: vaultSummary(db, member, updatedEarnings) });
  }
  if (request.method === 'GET' && pathname === '/api/me/earnings') {
    const member = sessionMember(request, db);
    if (!member) return json(response, 401, { error: 'Login required.' });
    return json(response, 200, { earnings: earningsForMember(db, member), member: publicMember(member), settings: { dailyProfitPercent: db.settings.dailyProfitPercent, referralBonuses: db.settings.referralBonuses, withdrawalThresholds: db.settings.withdrawalThresholds, withdrawalLimits: db.settings.withdrawalLimits, withdrawalIntervals: db.settings.withdrawalIntervals } });
  }
  if (request.method === 'GET' && pathname === '/api/me/team') {
    const member = sessionMember(request, db);
    if (!member) return json(response, 401, { error: 'Login required.' });
    const team = db.members.filter((item) => item.referredBy === member.memberNumber).map((item) => {
      const earnings = earningsForMember(db, item);
      return { member: teamPublicMember(item), active: item.active !== false, earnings: { profit: earnings.todayEarnings, portfolioValue: earnings.portfolioValue, highestLevel: earnings.highestLevel, activeLevel: earnings.activeLevel }, dailyCommission: Number(earnings.todayEarnings || 0) * 0.10 };
    });
    const teamProfit = team.reduce((total, item) => total + item.earnings.profit, 0);
    return json(response, 200, { referralCode: member.memberNumber, team, teamProfit, dailyCommission: teamProfit * 0.10, referralLink: `/?ref=${encodeURIComponent(member.memberNumber)}` });
  }
  if (request.method === 'PATCH' && pathname === '/api/me/profile') {
    const member = sessionMember(request, db);
    if (!member) return json(response, 401, { error: 'Login required.' });
    const body = await parseBody(request);
    const nickname = boundedString(body.nickname, 40);
    const withdrawalAccountName = boundedString(body.withdrawalAccountName, 120);
    const withdrawalAccountNumber = boundedString(body.withdrawalAccountNumber, 80);
    if (!nickname) return json(response, 400, { error: 'Enter a nickname.' });
    if (!withdrawalAccountName || !withdrawalAccountNumber) return json(response, 400, { error: 'Enter the withdrawal account name and number.' });
    member.nickname = nickname;
    member.withdrawalAccountName = withdrawalAccountName;
    member.withdrawalAccountNumber = withdrawalAccountNumber;
    writeDb(db);
    return json(response, 200, { member: publicMember(member) });
  }
  if (request.method === 'POST' && pathname === '/api/level-purchases') {
    const member = sessionMember(request, db);
    if (!member) return json(response, 401, { error: 'Login required.' });
    if (member.active === false) return json(response, 403, { error: 'This member account is deactivated.' });
    const body = await parseBody(request);
    const product = db.products.find((item) => item.level === Number(body.level));
    if (!product) return json(response, 404, { error: 'That level is not available.' });
    const earnings = earningsForMember(db, member);
    const amount = Number(product.amount);
    const planNumber = Number(body.planNumber);
    if (![1, 2].includes(planNumber)) return json(response, 400, { error: 'Choose Plan 1 or Plan 2.' });
    const purchases = (db.levelPurchases || []).filter((item) => item.memberId === member.id && Number(item.planNumber || 0) === planNumber);
    const highestLevel = purchases.reduce((highest, item) => Math.max(highest, Number(item.level)), 0);
    if (highestLevel > 0 && product.level <= highestLevel) return json(response, 400, { error: `Plan ${planNumber} can only upgrade above Level ${highestLevel}.` });
    if (earnings.portfolioValue < amount) return json(response, 400, { error: `Your portfolio is GHS ${earnings.portfolioValue.toFixed(2)}; Level ${product.level} requires GHS ${amount.toFixed(2)}.` });
    const purchase = { id: crypto.randomUUID(), memberId: member.id, planNumber, level: product.level, assetName: product.name, amount, dailyRate: Number(product.dailyRate ?? db.settings.dailyProfitPercent ?? 0), purchasedAt: Date.now() };
    (db.levelPurchases ||= []).push(purchase);
    const referralReward = awardReferralReward(db, member, purchase);
    writeDb(db);
    return json(response, 201, { purchase, referralReward, earnings: earningsForMember(db, member) });
  }
  if (request.method === 'POST' && pathname === '/api/payment-requests') {
    const member = sessionMember(request, db);
    if (!member) return json(response, 401, { error: 'Login required.' });
    const body = await parseBody(request);
    if (member.active === false) return json(response, 403, { error: 'This member account is deactivated.' });
    if (body.type === 'deposit') {
      const amount = finiteNumber(body.amount, { min: 0.01, max: 100000000 });
      if (!Number.isFinite(amount) || amount < 100) return json(response, 400, { error: 'Deposit amount must be at least GHS 100.' });
      const pendingDeposit = db.paymentRequests.find((item) => item.memberId === member.id && item.type === 'deposit' && item.status === 'pending');
      if (pendingDeposit) return json(response, 409, { error: 'Complete the current deposit approval before starting another deposit.' });
    }
    const accountName = boundedString(body.accountName, 120);
    const accountNumber = boundedString(body.accountNumber, 80);
    const amount = finiteNumber(body.amount, { min: 0.01, max: 100000000 });
    if (!['deposit', 'withdrawal'].includes(body.type) || amount === null) return json(response, 400, { error: 'Invalid payment request.' });
    if (!accountName || !accountNumber) return json(response, 400, { error: 'Account name and account number are required.' });
    const item = { id: crypto.randomUUID(), memberId: member.id, type: body.type, amount, accountName, accountNumber, status: 'pending', createdAt: Date.now() };
    if (body.type === 'deposit') {
      item.depositAccount = body.depositAccount && typeof body.depositAccount === 'object' ? {
        id: boundedString(body.depositAccount.id, 100),
        accountName: boundedString(body.depositAccount.accountName, 120),
        routingNumber: boundedString(body.depositAccount.routingNumber, 80),
        accountNumber: boundedString(body.depositAccount.accountNumber, 80),
        contact: boundedString(body.depositAccount.contact, 120),
      } : null;
      if (item.amount < 100) return json(response, 400, { error: 'Deposit amount must be at least GHS 100.' });
    }
    db.paymentRequests.push(item);
    writeDb(db);
    return json(response, 201, { request: item });
  }
  if (request.method === 'GET' && pathname === '/api/payment-requests') {
    if (!requireAdmin(request, db)) return json(response, 403, { error: 'Admin access required.' });
    const requests = db.paymentRequests.map((item) => {
      const member = db.members.find((candidate) => candidate.id === item.memberId);
      return { ...item, member: member ? publicMember(member, true) : null };
    });
    return json(response, 200, { requests });
  }
  if (request.method === 'GET' && pathname === '/api/me/payment-requests') {
    const member = sessionMember(request, db);
    if (!member) return json(response, 401, { error: 'Login required.' });
    return json(response, 200, { requests: db.paymentRequests.filter((item) => item.memberId === member.id) });
  }
  if (request.method === 'GET' && pathname === '/api/admin/members') {
    if (!requireAdmin(request, db)) return json(response, 403, { error: 'Admin access required.' });
    const members = db.members.map((member) => ({ ...publicMember(member, true), active: member.active !== false, earnings: earningsForMember(db, member) }));
    return json(response, 200, { members });
  }
  if (request.method === 'GET' && pathname === '/api/admin/vaults') {
    if (!requireAdmin(request, db)) return json(response, 403, { error: 'Admin access required.' });
    const today = vaultDate(db);
    const openings = (db.vaultOpenings || []).filter((item) => item.vaultDate === today);
    const byLevel = openings.reduce((result, opening) => {
      const member = db.members.find((item) => item.id === opening.memberId);
      const level = Math.max(...(db.levelPurchases || []).filter((item) => item.memberId === opening.memberId).map((item) => Number(item.level) || 0), 0);
      const key = String(level || 'none');
      result[key] = (result[key] || 0) + 1;
      return result;
    }, {});
    return json(response, 200, { vaultDate: today, dailyRate: Number(db.settings.dailyProfitPercent || 0), vaultRate: Number(db.settings.dailyProfitPercent || 0) / VAULT_COUNT, totalOpened: openings.length, totalProfit: openings.reduce((total, item) => total + Number(item.rewardAmount || 0), 0), usersOpened: new Set(openings.map((item) => item.memberId)).size, openingsByLevel: byLevel, openings: openings.map((opening) => ({ ...opening, member: publicMember(db.members.find((item) => item.id === opening.memberId) || {}, true) })) });
  }
  if (request.method === 'GET' && pathname === '/api/admin/vaults/history') {
    if (!requireAdmin(request, db)) return json(response, 403, { error: 'Admin access required.' });
    return json(response, 200, { history: (db.vaultOpenings || []).slice().sort((left, right) => right.createdAt - left.createdAt).map((opening) => ({ ...opening, member: publicMember(db.members.find((item) => item.id === opening.memberId) || {}, true) })) });
  }
  if (request.method === 'GET' && pathname.startsWith('/api/admin/members/')) {
    if (!requireAdmin(request, db)) return json(response, 403, { error: 'Admin access required.' });
    const memberId = pathname.split('/').pop();
    const member = db.members.find((item) => item.id === memberId);
    if (!member) return json(response, 404, { error: 'Member not found.' });
    const activities = [
      ...(db.paymentRequests || []).filter((item) => item.memberId === memberId).map((item) => ({ type: item.type, status: item.status, amount: Number(item.amount || 0), createdAt: item.createdAt, detail: item.type === 'deposit' ? `${item.assetName || 'Deposit'} · Level ${item.level || '-'}` : `Withdrawal to ${item.accountName || 'account'}` })),
      ...(db.levelPurchases || []).filter((item) => item.memberId === memberId).map((item) => ({ type: 'purchase', status: 'completed', amount: Number(item.amount || 0), createdAt: item.purchasedAt, detail: `${item.assetName || 'Level purchase'} · Level ${item.level}` })),
      ...(db.bonuses || []).filter((item) => item.memberId === memberId).map((item) => ({ type: 'bonus', status: 'completed', amount: Number(item.amount || 0), createdAt: item.createdAt, detail: item.reason || 'Admin bonus' })),
      ...(db.profitTransactions || []).filter((item) => item.memberId === memberId).map((item) => ({ type: 'profit', status: 'completed', amount: Number(item.amount || 0), createdAt: item.createdAt, detail: `Vault ${item.vaultNumber} profit · ${item.vaultDate}` })),
    ].sort((left, right) => right.createdAt - left.createdAt);
    return json(response, 200, { member: { ...publicMember(member, true), active: member.active !== false }, earnings: earningsForMember(db, member), activities });
  }
  if (request.method === 'DELETE' && pathname.startsWith('/api/admin/members/')) {
    if (!requireAdmin(request, db)) return json(response, 403, { error: 'Admin access required.' });
    const memberId = pathname.split('/').pop();
    const member = db.members.find((item) => item.id === memberId);
    if (!member) return json(response, 404, { error: 'Member not found.' });
    db.members = db.members.filter((item) => item.id !== memberId);
    db.sessions = (db.sessions || []).filter((session) => session.memberId !== memberId);
    db.paymentRequests = (db.paymentRequests || []).filter((item) => item.memberId !== memberId);
    db.levelPurchases = (db.levelPurchases || []).filter((item) => item.memberId !== memberId);
    db.bonuses = (db.bonuses || []).filter((item) => item.memberId !== memberId);
    db.vaultOpenings = (db.vaultOpenings || []).filter((item) => item.memberId !== memberId);
    db.profitTransactions = (db.profitTransactions || []).filter((item) => item.memberId !== memberId);
    db.members.forEach((item) => {
      item.referredMembers = (item.referredMembers || []).filter((memberNumber) => memberNumber !== member.memberNumber);
      if (item.referredBy === member.memberNumber) delete item.referredBy;
    });
    writeDb(db);
    return json(response, 200, { removed: memberId });
  }
  if (request.method === 'PATCH' && pathname.startsWith('/api/admin/members/')) {
    if (!requireAdmin(request, db)) return json(response, 403, { error: 'Admin access required.' });
    const member = db.members.find((item) => item.id === pathname.split('/').pop());
    const body = await parseBody(request);
    if (!member || typeof body.active !== 'boolean') return json(response, 404, { error: 'Member not found.' });
    member.active = body.active;
    writeDb(db);
    return json(response, 200, { member: { ...publicMember(member, true), active: member.active } });
  }
  if (request.method === 'PATCH' && pathname.startsWith('/api/payment-requests/')) {
    if (!requireAdmin(request, db)) return json(response, 403, { error: 'Admin access required.' });
    const id = pathname.split('/').pop();
    const body = await parseBody(request);
    const item = db.paymentRequests.find((requestItem) => requestItem.id === id);
    if (!item || !['approved', 'rejected'].includes(body.status)) return json(response, 404, { error: 'Request not found.' });
    const previousStatus = item.status;
    if (previousStatus !== 'pending') return json(response, 409, { error: 'This payment request has already been reviewed.' });
    item.status = body.status;
    item.reviewedAt = Date.now();
    if (body.status === 'approved' && previousStatus !== 'approved') {
      item.approvedAt = Date.now();
      if (item.type === 'deposit') {
        item.dailyRate = Number(db.settings.dailyProfitPercent ?? 0);
      }
    }
    writeDb(db);
    return json(response, 200, { request: item });
  }
  if (request.method === 'PATCH' && pathname === '/api/admin/settings') {
    if (!requireAdmin(request, db)) return json(response, 403, { error: 'Admin access required.' });
    const body = await parseBody(request);
    const dailyProfitPercentValue = finiteNumber(body.dailyProfitPercent ?? db.settings.dailyProfitPercent ?? 5, { min: 0, max: 100 });
    const referralBonusAmountValue = finiteNumber(body.referralBonusAmount ?? db.settings.referralBonusAmount ?? 25, { min: 0, max: 100000000 });
    if (dailyProfitPercentValue === null || referralBonusAmountValue === null) return json(response, 400, { error: 'Profit and referral bonus values must be valid non-negative numbers.' });
    const dailyProfitPercent = dailyProfitPercentValue;
    const referralBonusAmount = referralBonusAmountValue;
    const withdrawalLimits = { ...DEFAULT_WITHDRAWAL_LIMITS, ...(db.settings.withdrawalLimits || {}) };
    const withdrawalThresholds = { ...DEFAULT_WITHDRAWAL_THRESHOLDS, ...(db.settings.withdrawalThresholds || {}) };
    const withdrawalIntervals = { ...DEFAULT_WITHDRAWAL_INTERVALS, ...(db.settings.withdrawalIntervals || {}) };
    const referralBonuses = { ...DEFAULT_REFERRAL_BONUSES, ...(db.settings.referralBonuses || {}) };
    if (body.withdrawalLimits && typeof body.withdrawalLimits === 'object') {
      for (const level of [1, 2, 3, 4]) { const value = finiteNumber(body.withdrawalLimits[level] ?? withdrawalLimits[level], { min: 0, max: 1000000 }); if (value === null) return json(response, 400, { error: `Invalid withdrawal limit for Level ${level}.` }); withdrawalLimits[level] = Math.floor(value); }
    }
    if (body.withdrawalThresholds && typeof body.withdrawalThresholds === 'object') {
      for (const level of [1, 2, 3, 4]) { const value = finiteNumber(body.withdrawalThresholds[level] ?? withdrawalThresholds[level], { min: 0, max: 100000000 }); if (value === null) return json(response, 400, { error: `Invalid withdrawal threshold for Level ${level}.` }); withdrawalThresholds[level] = value; }
    }
    if (body.withdrawalIntervals && typeof body.withdrawalIntervals === 'object') {
      for (const level of [1, 2, 3, 4]) { const value = finiteNumber(body.withdrawalIntervals[level] ?? withdrawalIntervals[level], { min: 1, max: 3650 }); if (value === null) return json(response, 400, { error: `Invalid withdrawal interval for Level ${level}.` }); withdrawalIntervals[level] = Math.floor(value); }
    }
    if (body.referralBonuses && typeof body.referralBonuses === 'object') {
      for (const level of [1, 2, 3, 4]) { const value = finiteNumber(body.referralBonuses[level] ?? referralBonuses[level], { min: 0, max: 100000000 }); if (value === null) return json(response, 400, { error: `Invalid referral bonus for Level ${level}.` }); referralBonuses[level] = value; }
    }
    const backgroundImageUrl = body.backgroundImageUrl !== undefined ? safeImageUrl(body.backgroundImageUrl, 1000) : (db.settings.backgroundImageUrl || '');
    const adminBackgroundImageUrl = body.adminBackgroundImageUrl !== undefined ? safeImageUrl(body.adminBackgroundImageUrl, 1000) : (db.settings.adminBackgroundImageUrl || '');
    const timeZone = body.timeZone !== undefined ? boundedString(body.timeZone, 100) || DEFAULT_TIME_ZONE : (db.settings.timeZone || DEFAULT_TIME_ZONE);
    const contactDetails = ['accountName', 'routingNumber', 'accountNumber', 'contact'].every((key) => body[key] !== undefined)
      ? {
        accountName: boundedString(body.accountName, 160),
        routingNumber: boundedString(body.routingNumber, 80),
        accountNumber: boundedString(body.accountNumber, 100),
        contact: boundedString(body.contact, 160),
      }
      : null;
    if (contactDetails && Object.values(contactDetails).some((value) => !value)) return json(response, 400, { error: 'All deposit details are required.' });
    try { calendarDate(Date.now(), timeZone); } catch { return json(response, 400, { error: 'Use a valid application time zone.' }); }
    db.settings = { ...db.settings, dailyProfitPercent, referralBonusAmount, withdrawalLimits, withdrawalThresholds, withdrawalIntervals, referralBonuses, backgroundImageUrl, adminBackgroundImageUrl, timeZone };
    if (contactDetails) {
      const account = { id: db.depositAccounts[0]?.id || 'default-account', ...contactDetails };
      db.depositAccounts = db.depositAccounts.length ? [account, ...db.depositAccounts.slice(1)] : [account];
    }
    // dailyProfitPercent is only used as the manual/testing fallback rate for
    // products that have no live market ticker attached.
    db.products = db.products.map((product) => (product.tickerSymbol ? product : { ...product, dailyRate: dailyProfitPercent, manualTestRate: dailyProfitPercent, rateSource: 'manual' }));
    writeDb(db);
    return json(response, 200, { settings: db.settings });
  }
  if (request.method === 'POST' && pathname === '/api/admin/bonuses') {
    if (!requireAdmin(request, db)) return json(response, 403, { error: 'Admin access required.' });
    const body = await parseBody(request);
    const member = db.members.find((item) => item.memberNumber === boundedString(body.memberNumber, 20).toUpperCase());
    const amount = finiteNumber(body.amount, { min: 0.01, max: 100000000 });
    if (!member || amount === null) return json(response, 400, { error: 'Valid member number and bonus amount are required.' });
    const bonus = { id: crypto.randomUUID(), memberId: member.id, amount, reason: boundedString(body.reason || 'Admin bonus', 300) || 'Admin bonus', createdAt: Date.now() };
    (db.bonuses ||= []).push(bonus);
    member.referralBonus += amount;
    writeDb(db);
    return json(response, 201, { bonus });
  }
  if (request.method === 'POST' && pathname === '/api/admin/notifications') {
    if (!requireAdmin(request, db)) return json(response, 403, { error: 'Admin access required.' });
    const body = await parseBody(request);
    const audience = body.audience === 'all' || ['1','2','3','4'].includes(String(body.audience)) ? String(body.audience) : 'all';
    const message = boundedString(body.message, 2000);
    if (!message) return json(response, 400, { error: 'Notification message is required.' });
    const item = { id: crypto.randomUUID(), audience, message, createdAt: Date.now() };
    db.notifications.push(item); writeDb(db); return json(response, 201, { notification: item });
  }
  if (request.method === 'POST' && pathname === '/api/admin/information') {
    if (!requireAdmin(request, db)) return json(response, 403, { error: 'Admin access required.' });
    const body = await parseBody(request);
    const audience = body.audience === 'all' || ['1','2','3','4'].includes(String(body.audience)) ? String(body.audience) : 'all';
    const title = boundedString(body.title, 160);
    const message = boundedString(body.message, 4000);
    const imageUrl = safeImageUrl(body.imageUrl, 1000);
    if (!title || !message) return json(response, 400, { error: 'Information title and message are required.' });
    const item = { id: crypto.randomUUID(), audience, title, message, imageUrl, createdAt: Date.now() };
    db.information.push(item); writeDb(db); return json(response, 201, { information: item });
  }
  if (request.method === 'POST' && pathname === '/api/admin/deposit-accounts') {
    if (!requireAdmin(request, db)) return json(response, 403, { error: 'Admin access required.' });
    const body = await parseBody(request);
    const accountName = boundedString(body.accountName, 160);
    const routingNumber = boundedString(body.routingNumber, 80);
    const accountNumber = boundedString(body.accountNumber, 100);
    const contact = boundedString(body.contact, 160);
    if (!accountName || !routingNumber || !accountNumber || !contact) return json(response, 400, { error: 'All deposit account fields are required.' });
    const item = { id: crypto.randomUUID(), accountName, routingNumber, accountNumber, contact };
    db.depositAccounts.push(item); writeDb(db); return json(response, 201, { account: item });
  }
  if (request.method === 'GET' && pathname === '/api/admin/deposit-accounts') {
    if (!requireAdmin(request, db)) return json(response, 403, { error: 'Admin access required.' });
    return json(response, 200, { accounts: db.depositAccounts || [] });
  }
  if (request.method === 'DELETE' && pathname.startsWith('/api/admin/deposit-accounts/')) {
    if (!requireAdmin(request, db)) return json(response, 403, { error: 'Admin access required.' });
    const id = decodeURIComponent(pathname.split('/').pop());
    if (!id) return json(response, 400, { error: 'Deposit account id is required.' });
    if ((db.depositAccounts || []).length <= 1) return json(response, 400, { error: 'Keep at least one deposit account available.' });
    const before = db.depositAccounts.length;
    db.depositAccounts = db.depositAccounts.filter((account) => account.id !== id);
    if (db.depositAccounts.length === before) return json(response, 404, { error: 'Deposit account not found.' });
    writeDb(db);
    return json(response, 200, { ok: true, accounts: db.depositAccounts });
  }
  if (request.method === 'POST' && pathname === '/api/admin/products') {
    if (!requireAdmin(request, db)) return json(response, 403, { error: 'Admin access required.' });
    const body = await parseBody(request);
    const id = boundedString(body.id, 100) || crypto.randomUUID();
    const name = boundedString(body.name, 120);
    const code = boundedString(body.code, 40).toUpperCase();
    const level = finiteNumber(body.level, { min: 1, max: 4 });
    const amount = finiteNumber(body.amount, { min: 0.01, max: 100000000 });
    const tickerSymbol = boundedString(body.tickerSymbol, 100);
    const assetType = tickerSymbol ? boundedString(body.assetType || 'stock', 20) : 'manual';
    const manualTestRate = finiteNumber(body.manualTestRate ?? body.dailyRate ?? 5, { min: 0, max: 100 });
    const color = /^#[0-9a-f]{6}$/i.test(String(body.color || '')) ? String(body.color) : '#dff6eb';
    const imageUrl = safeImageUrl(body.imageUrl, 1000);
    if (!name || !code || level === null || amount === null || manualTestRate === null || !['manual','stock','crypto','commodity'].includes(assetType)) return json(response, 400, { error: 'Invalid product details.' });
    if (tickerSymbol && !['stock','crypto','commodity'].includes(assetType)) return json(response, 400, { error: 'Invalid market type.' });
    const item = { id, name, code, level: Math.floor(level), amount, tickerSymbol, assetType, manualTestRate, dailyRate: manualTestRate, color, imageUrl, symbol: name.charAt(0).toUpperCase(), rateSource: tickerSymbol ? 'market' : 'manual' };
    const conflictingProduct = db.products.find((product) => product.level === item.level && product.id !== item.id);
    if (conflictingProduct) return json(response, 409, { error: `Level ${item.level} is already assigned to another product.` });
    db.products = db.products.filter((product) => product.id !== item.id);
    db.products.push(item); writeDb(db); return json(response, 201, { product: item });
  }
  return json(response, 404, { error: 'API route not found.' });
}

function serveStatic(request, response, pathname) {
  const pageRoutes = {
    '/': 'index.html',
    '/profile': 'profile.html',
    '/team': 'team.html',
    '/dashboard': 'index.html',
    '/dashboard/vaults': 'vaults.html',
    '/dashboard/notices': 'notices.html',
    '/dashboard/transactions': 'transactions.html'
  };
  const requested = pageRoutes[pathname] || decodeURIComponent(pathname.replace(/^\//, ''));
  const root = path.resolve(PUBLIC_ROOT);
  const filePath = path.resolve(root, requested);
  const relativePath = path.relative(root, filePath);
  const extension = path.extname(filePath).toLowerCase();
  const allowedExtensions = new Set(['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf']);

  // Never expose the database, environment files, server source, package files,
  // or anything outside the project root. Only browser-safe asset types are public.
  if (!relativePath || relativePath.startsWith('..' + path.sep) || path.isAbsolute(relativePath)) return json(response, 404, { error: 'Not found.' });
  if (relativePath.split(path.sep).includes('data')) return json(response, 404, { error: 'Not found.' });
  const publicFileNames = new Set(['index.html', 'admin.html', 'insights.html', 'notices.html', 'profile.html', 'team.html', 'transactions.html', 'vaults.html', 'admin.css', 'admin.js', 'dashboard-pages.js', 'insights.js', 'profile.css', 'profile.js', 'script.js', 'style.css', 'team.css', 'team.js']);
  const fileName = path.basename(filePath);
  if (relativePath.includes(path.sep + '.') || fileName.startsWith('.') || relativePath === 'server.js' || relativePath === 'server copy.js' || relativePath === 'package.json' || relativePath === 'package-lock.json' || relativePath.endsWith('.env') || relativePath.endsWith('.pem') || relativePath.endsWith('.key')) return json(response, 404, { error: 'Not found.' });
  if (!publicFileNames.has(fileName) && !['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf'].includes(extension)) return json(response, 404, { error: 'Not found.' });
  if (!allowedExtensions.has(extension) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return json(response, 404, { error: 'Not found.' });

  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.map': 'application/json; charset=utf-8'
  };
  response.writeHead(200, { 'Content-Type': contentTypes[extension], 'Cache-Control': 'no-cache' });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer(async (request, response) => {
  securityHeaders(request, response);
  const url = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);
  try {
    if (request.method === 'GET' && url.pathname === '/healthz') return json(response, 200, { ok: true });
    if (url.pathname.startsWith('/api/')) await api(request, response, url.pathname);
    else if (request.method === 'GET') serveStatic(request, response, url.pathname);
    else json(response, 405, { error: 'Method not allowed.' });
  } catch (error) {
    console.error(error);
    json(response, 500, { error: 'Internal server error.' });
  }
});

server.listen(PORT, HOST, () => console.log(`MyGain backend listening on ${HOST}:${PORT}${IS_PRODUCTION ? ' (production)' : ''}`));

// Refresh market-linked daily rates on a timer so admin-assigned tickers stay
// current without blocking any individual request.
refreshProductRates().catch((error) => console.error('Initial rate refresh failed:', error.message));
setInterval(() => refreshProductRates().catch((error) => console.error('Rate refresh failed:', error.message)), MARKET_CACHE_MS);
setInterval(() => { try { const db = readDb(); pruneExpiredSessions(db); writeDb(db); } catch (error) { console.error('Session cleanup failed:', error.message); } for (const [key, entry] of requestRateLimits) { if (Date.now() - entry.startedAt >= AUTH_RATE_WINDOW_MS) requestRateLimits.delete(key); } for (const [key, entry] of loginAttempts) { if ((!entry.lockedUntil || entry.lockedUntil <= Date.now()) && Date.now() - entry.firstAttemptAt >= ATTEMPT_WINDOW_MS) loginAttempts.delete(key); } }, 30 * 60 * 1000);
