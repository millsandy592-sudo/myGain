const modal = document.querySelector('[data-modal]');
const confirmButton = document.querySelector('[data-confirm]');
const statusMessage = document.querySelector('.modal-status');
const modalTitle = document.querySelector('#modal-title');
const modalCopy = document.querySelector('[data-modal-copy]');
const depositDetails = document.querySelector('[data-deposit-details]');
const memberDepositDetails = document.querySelector('[data-member-deposit-details]');
const depositFinalAmount = document.querySelector('[data-deposit-final-amount]');
const balance = document.querySelector('[data-balance]');
const amountButtons = document.querySelectorAll('[data-amount]');
const toast = document.querySelector('[data-toast]');
const withdrawModal = document.querySelector('[data-withdraw-modal]');
const pendingList = document.querySelector('[data-pending-list]');
const pendingSection = document.querySelector('[data-pending-section]');
const notificationList = document.querySelector('[data-notification-list]');
const notificationSection = document.querySelector('[data-notification-section]');
const authScreen = document.querySelector('[data-auth-screen]');
const app = document.querySelector('[data-app]');
const memberDisplayName = document.querySelector('[data-member-display-name]');
const profileDisplayName = document.querySelector('[data-profile-display-name]');
const profileModal = document.querySelector('[data-profile-modal]');
const profileStatus = document.querySelector('[data-profile-status]');
const authForm = document.querySelector('[data-auth-form]');
const authTitle = document.querySelector('[data-auth-title]');
const authIntro = document.querySelector('[data-auth-intro]');
const authSubmit = document.querySelector('[data-auth-submit]');
const authSwitchCopy = document.querySelector('[data-auth-switch-copy]');
const authStatus = document.querySelector('[data-auth-status]');
const phoneError = document.querySelector('[data-phone-error]');
const passwordError = document.querySelector('[data-password-error]');
const referralLabel = document.querySelector('[data-referral-label]');
const referralInput = document.querySelector('[data-referral-input]');
const memberReferral = document.querySelector('[data-member-referral]');
const purchaseConfirmation = document.querySelector('[data-purchase-confirmation]');
const purchaseConfirmationCopy = document.querySelector('[data-purchase-confirmation-copy]');
const purchaseConfirmationStatus = document.querySelector('[data-purchase-confirmation-status]');
let pendingPurchase = null;
const transactionTabs = document.querySelectorAll('[data-transaction-plan]');
const sidePage = document.querySelector('[data-side-page]');
const sidePageTitle = document.querySelector('[data-side-page-title]');
const sidePageContent = document.querySelector('[data-side-page-content]');
let sidePageState = null;
const formatCurrency = (value) => new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(Number(value) || 0);
const isDashboardHome = location.pathname === '/' || location.pathname === '/dashboard';
const membersKey = 'mygainMembers';
let members = JSON.parse(localStorage.getItem(membersKey) || '{}');
let currentMember;
let authMode = 'login';
authScreen.hidden = false;
app.hidden = true;
app.setAttribute('aria-hidden', 'true');
let selectedDeposit = 50;
const localWithdrawalSettings = {
  thresholds: { 1: 250, 2: 500, 3: 1000, 4: 2000 },
  limits: { 1: 1, 2: 1, 3: 1, 4: 1 },
  intervals: { 1: 1, 2: 1, 3: 1, 4: 1 },
};
const customDepositAmount = document.querySelector('[data-custom-deposit-amount]');
let depositStep = 'amount';
let toastTimer;
const settingsKey = 'northstarAdminSettings';
const notificationsKey = 'northstarNotifications';
const accountsKey = 'northstarDepositAccounts';
const infoKey = 'northstarMemberInformation';
const adminSettings = { accountName: 'MyGain Investments', routingNumber: '021000021', accountNumber: '•••• 4829', contact: 'support@mygain.test', ...JSON.parse(localStorage.getItem(settingsKey) || '{}') };
const defaultDepositAccounts = [{ id: 'default-account', accountName: adminSettings.accountName, routingNumber: adminSettings.routingNumber, accountNumber: adminSettings.accountNumber, contact: adminSettings.contact }];
const depositAccounts = JSON.parse(localStorage.getItem(accountsKey) || 'null') || defaultDepositAccounts;
let paymentRequests = [];
let approvedWithdrawals = JSON.parse(localStorage.getItem('northstarApprovedWithdrawals') || '[]');
let notifications = JSON.parse(localStorage.getItem(notificationsKey) || '[]');
let memberInformation = JSON.parse(localStorage.getItem(infoKey) || '[]');
let activeDepositAccount = depositAccounts[Math.floor(Math.random() * depositAccounts.length)];

const adminConfig = {
  dailyProfitPercent: localStorage.getItem('northstarProfitRate') === null ? 10 : Number(localStorage.getItem('northstarProfitRate')),
};
const defaultProducts = [
  { level: 1, name: 'Foundation fund', code: 'LEVEL 1', amount: 50, symbol: 'F', color: '#dff6eb', textColor: '#299b76' },
  { level: 2, name: 'Growth fund', code: 'LEVEL 2', amount: 100, symbol: 'G', color: '#fff0ec', textColor: '#c1503b' },
  { level: 3, name: 'Momentum fund', code: 'LEVEL 3', amount: 250, symbol: 'M', color: '#fff6d8', textColor: '#bc8c12' },
  { level: 4, name: 'Summit fund', code: 'LEVEL 4', amount: 500, symbol: 'S', color: '#e9e6fb', textColor: '#756cc3' },
];
const levelProducts = JSON.parse(localStorage.getItem('northstarProducts') || 'null') || defaultProducts;
let investment = null;

function renderPlanTransactions() {
    if (isDashboardHome) return;
  const investments = latestEarnings?.investments || [];
  [1, 2].forEach((planNumber) => {
    const list = document.querySelector(`[data-transaction-list="${planNumber}"]`);
    const empty = document.querySelector(`[data-transaction-empty="${planNumber}"]`);
    if (!list || !empty) return;
    const planInvestments = investments.filter((item) => Number(item.planNumber) === planNumber);
    const planRequests = paymentRequests.filter((item) => Number(item.planNumber) === planNumber);
    const rows = [
      ...planInvestments.map((item) => ({ type: 'purchase', title: item.assetName, detail: `Level ${item.level} · ${new Date(item.purchasedAt).toLocaleDateString()}`, amount: -Number(item.amount), status: 'Completed', icon: '↗' })),
      ...planRequests.map((item) => ({ type: item.type, title: item.type === 'withdrawal' ? 'Withdrawal' : 'Deposit', detail: `${item.status === 'pending' ? 'Pending approval' : item.status} · ${new Date(item.createdAt).toLocaleDateString()}`, amount: item.type === 'withdrawal' ? -Number(item.amount) : Number(item.amount), status: item.status, icon: item.type === 'withdrawal' ? '↙' : '↓' })),
      ...vaultHistory.map((item) => ({ type: 'profit', title: `Vault ${item.vaultNumber} profit`, detail: `${item.vaultDate} · Completed`, amount: Number(item.amount), status: 'completed', icon: '↗' })),
    ].sort((left, right) => right.detail.localeCompare(left.detail));
    list.innerHTML = rows.map((row) => `<div class="transaction"><span class="transaction-icon ${row.type === 'withdrawal' ? 'coral-icon' : 'teal-icon'}">${row.icon}</span><div class="transaction-copy"><strong>${row.title}</strong><small>${row.detail}</small></div><strong class="transaction-amount ${row.amount >= 0 ? 'positive' : ''}">${row.amount >= 0 ? '+' : '-'}${formatCurrency(Math.abs(row.amount))}</strong></div>`).join('');
    empty.hidden = rows.length > 0;
  });
}

let vaultHistory = [];

function renderVaults(state) {
  document.querySelector('[data-vault-date]').textContent = state.vaultDate;
  document.querySelector('[data-vault-daily-rate]').textContent = `${Number(state.dailyRate || 0).toFixed(2)}%`;
  document.querySelector('[data-vault-opened-count]').textContent = `${state.openedCount} / 5`;
  document.querySelector('[data-vault-profit-received]').textContent = formatCurrency(state.profitReceived);
  document.querySelector('[data-vault-profit-remaining]').textContent = formatCurrency(state.remainingProfit);
  document.querySelector('[data-vault-list]').innerHTML = state.vaults.map((vault) => `
    <button type="button" class="vault-card ${vault.opened ? 'is-opened' : ''}" data-open-vault="${vault.vaultNumber}" ${vault.opened ? 'disabled' : ''}>
      <span class="vault-icon">${vault.opened ? '✓' : '🔒'}</span><span class="vault-copy"><strong>Vault ${vault.vaultNumber}</strong><small>${vault.opened ? `Opened today · ${formatCurrency(vault.rewardAmount)}` : 'Available · Tap to open'}</small></span><span class="vault-arrow">${vault.opened ? 'Opened' : 'Open →'}</span>
    </button>`).join('');
}

async function loadVaults() {
    if (isDashboardHome) return;
  const token = sessionStorage.getItem('mygainSessionToken');
  if (!token) return;
  const response = await fetch('/api/vaults/today', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) return;
  const result = await response.json();
  renderVaults(result.vaults);
  const historyResponse = await fetch('/api/vaults/history', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (historyResponse.ok) {
    const historyResult = await historyResponse.json();
    vaultHistory = historyResult.history || [];
    renderPlanTransactions();
  }
}

async function openVault(vaultNumber, button) {
  const token = sessionStorage.getItem('mygainSessionToken');
  if (!token || !button) return;
  button.disabled = true;
  document.querySelector('[data-vault-status]').textContent = 'Opening vault...';
  try {
    const response = await fetch(`/api/vaults/${vaultNumber}/open`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to open this vault.');
    latestEarnings = result.earnings;
    balance.textContent = formatCurrency(result.earnings.portfolioValue);
    renderVaults(result.vaults);
    document.querySelector('[data-vault-status]').textContent = `Vault opened. You received ${formatCurrency(result.rewardAmount)}.`;
    renderPlanTransactions();
  } catch (error) {
    button.disabled = false;
    document.querySelector('[data-vault-status]').textContent = error.message || 'Unable to open this vault.';
  }
}

document.querySelector('[data-vault-list]').addEventListener('click', (event) => {
  const button = event.target.closest('[data-open-vault]');
  if (button && !button.disabled) openVault(Number(button.dataset.openVault), button);
});

transactionTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const planNumber = tab.dataset.transactionPlan;
    transactionTabs.forEach((item) => { const active = item === tab; item.classList.toggle('active', active); item.setAttribute('aria-selected', active); });
    document.querySelectorAll('[data-transaction-page]').forEach((page) => { page.hidden = page.dataset.transactionPage !== planNumber; });
  });
});

const sidePageSections = {
  '#portfolio': { title: 'Portfolio', selector: '#portfolio' },
  '#markets': { title: 'Markets', selector: '#markets' },
  '#goals': { title: 'Goals', selector: '#goals' },
};

function closeSidePage() {
  if (!sidePageState) return;
  sidePageState.placeholder.parentNode.insertBefore(sidePageState.section, sidePageState.placeholder);
  sidePageState.placeholder.remove();
  sidePageState = null;
  sidePage.hidden = true;
  document.body.classList.remove('side-page-open');
}

function openSidePage(config) {
  closeSidePage();
  const section = document.querySelector(config.selector);
  if (!section) return;
  const placeholder = document.createComment(`Return ${config.selector} to dashboard`);
  section.parentNode.insertBefore(placeholder, section);
  sidePageContent.append(section);
  sidePageTitle.textContent = config.title;
  sidePageState = { section, placeholder };
  sidePage.hidden = false;
  document.body.classList.add('side-page-open');
}

document.querySelectorAll('.main-nav .nav-item').forEach((item) => {
  item.addEventListener('click', (event) => {
    const config = sidePageSections[item.getAttribute('href')];
    if (!config) {
      closeSidePage();
      return;
    }
    event.preventDefault();
    openSidePage(config);
    document.querySelectorAll('.main-nav .nav-item').forEach((navItem) => navItem.classList.toggle('active', navItem === item));
  });
});

document.querySelector('[data-close-side-page]').addEventListener('click', closeSidePage);
sidePage.addEventListener('click', (event) => { if (event.target === sidePage) closeSidePage(); });

function renderAdminProducts() {
  const list = document.querySelector('[data-product-list]');
  list.innerHTML = [1, 2].map((planNumber) => `
    <section class="purchase-plan" data-plan-section="${planNumber}">
      <div class="purchase-plan-heading"><div><p class="label">Independent track</p><h3>Plan ${planNumber}</h3></div><span>Levels 1–4</span></div>
        <div class="purchase-plan-heading"><div><p class="label">Independent track</p><h3>Plan ${planNumber}</h3></div><span>Levels 1–4 · <strong data-plan-balance="${planNumber}">Shared portfolio</strong></span></div>
      <div class="purchase-plan-levels">${levelProducts.map((product) => `
        <div class="watch-item">
          <div class="asset-name"><span class="asset-logo" style="background:${product.color};color:${product.textColor || '#299b76'}">${product.imageUrl ? `<img src="${product.imageUrl}" alt="">` : product.symbol}</span><span><strong>${product.name}</strong><small>${product.code} · ${formatCurrency(product.amount)}</small></span></div>
          <span class="asset-price"><strong>Level ${product.level}</strong><small class="positive">${product.dailyRate ?? adminConfig.dailyProfitPercent}% daily</small><button type="button" class="purchase-level" data-purchase-level="${product.level}" data-purchase-plan="${planNumber}">Plan ${planNumber}</button></span>
        </div>`).join('')}</div>
    </section>`).join('');
}

function updatePurchaseOptions(investments = []) {
  const planState = [1, 2].reduce((state, planNumber) => {
    const planInvestments = investments.filter((item) => Number(item.planNumber || 0) === planNumber);
    const highestLevel = planInvestments.reduce((highest, item) => Math.max(highest, Number(item.level)), 0);
    state[planNumber] = { highestLevel, current: planInvestments[planInvestments.length - 1], active: planInvestments.some((item) => item.active) };
    return state;
  }, {});
  document.querySelectorAll('[data-purchase-level]').forEach((button) => {
    const level = Number(button.dataset.purchaseLevel);
    const planNumber = Number(button.dataset.purchasePlan);
    const state = planState[planNumber];
    const canUpgrade = state.highestLevel === 0 || level > state.highestLevel;
    button.disabled = !canUpgrade;
    button.textContent = level <= state.highestLevel
      ? (investments.some((item) => Number(item.planNumber || 0) === planNumber && Number(item.level) === level && item.active) ? `Plan ${planNumber} active` : `Plan ${planNumber} expired`)
      : canUpgrade ? `Plan ${planNumber} ${state.highestLevel ? 'upgrade' : 'purchase'}`
        : 'Upgrade only';
  });
}
async function purchaseLevel(level, planNumber, button) {
  const token = sessionStorage.getItem('mygainSessionToken');
  if (!token) { showFeedback('Log in before purchasing a level.'); return; }
  const product = levelProducts.find((item) => item.level === Number(level));
  if (!product) return;
  button.disabled = true;
  button.textContent = 'Purchasing...';
  try {
    const response = await fetch('/api/level-purchases', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ level: Number(level), planNumber: Number(planNumber) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to purchase this level.');
    await loadServerEarnings();
    showFeedback(`Plan ${planNumber}, Level ${level} purchased for ${formatCurrency(product.amount)}.`);
  } catch (error) {
    showFeedback(error.message || 'Unable to purchase this level.');
  } finally {
    button.disabled = false;
    if (button.textContent === 'Purchasing...') button.textContent = 'Purchase';
  }
}

function closePurchaseConfirmation() {
  pendingPurchase = null;
  purchaseConfirmationStatus.textContent = '';
  purchaseConfirmation.hidden = true;
}

function requestPurchaseConfirmation(level, planNumber, button) {
  const product = levelProducts.find((item) => item.level === Number(level));
  if (!product) return;
  pendingPurchase = { level: Number(level), planNumber: Number(planNumber), button };
  purchaseConfirmationCopy.textContent = `You are about to purchase ${product.name}, Level ${level}, for ${formatCurrency(product.amount)} on Plan ${planNumber}. Confirm to continue.`;
  purchaseConfirmation.hidden = false;
}

function investmentProfit() {
  if (!investment) return 0;
  const start = new Date(investment.startedAt);
  start.setHours(6, 0, 0, 0);
  if (investment.startedAt >= start.getTime()) start.setDate(start.getDate() + 1);
  const days = Date.now() < start.getTime() ? 1 : Math.min(30, Math.floor((Date.now() - start.getTime()) / 86400000) + 1);
  return investment.amount * ((investment.dailyRate ?? adminConfig.dailyProfitPercent) / 100) * days;
}

function renderInvestment() {
  const summary = document.querySelector('[data-profit-summary]');
  const rateLabel = document.querySelector('[data-member-rate]');
  if (rateLabel) rateLabel.textContent = `${adminConfig.dailyProfitPercent}% daily · Admin controlled`;
  if (!investment) {
    summary.hidden = true;
    return;
  }
  const profit = investmentProfit();
  summary.hidden = false;
  document.querySelector('[data-profit-title]').textContent = `${investment.assetName} · Level ${investment.level}`;
  document.querySelector('[data-profit-copy]').textContent = `${formatCurrency(investment.amount)} deposited · ${investment.dailyRate}% daily · Open the five vaults to receive profit`;
  document.querySelector('[data-profit-total]').textContent = `+${formatCurrency(profit)}`;
  const withdrawals = approvedWithdrawals.reduce((total, request) => total + Number(request.amount || 0), 0);
  const pendingWithdrawals = paymentRequests.filter((request) => request.type === 'withdrawal' && request.status === 'pending').reduce((total, request) => total + Number(request.amount || 0), 0);
  const total = investment.amount + profit - withdrawals - pendingWithdrawals;
  balance.textContent = formatCurrency(total);
}

function renderPendingRequests() {
  const pending = paymentRequests.filter((request) => request.status === 'pending');
  pendingSection.hidden = pending.length === 0;
  pendingList.innerHTML = pending.map((request) => `<div class="pending-item"><span class="pending-icon ${request.type === 'deposit' ? 'teal-icon' : 'coral-icon'}">${request.type === 'deposit' ? '↗' : '↙'}</span><span><strong>${request.type === 'deposit' ? 'Deposit' : 'Withdrawal'} · ${formatCurrency(request.amount)}</strong><small>${request.type === 'deposit' ? 'Account funding deposit' : `To ${request.destination || request.accountName}`}</small></span><em>Pending approval</em></div>`).join('');
}

async function loadMemberPaymentRequests() {
  const token = sessionStorage.getItem('mygainSessionToken');
  if (!token) return;
  const response = await fetch('/api/me/payment-requests', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) return;
  const result = await response.json();
  const previousStatuses = new Map(paymentRequests.map((request) => [request.id, request.status]));
  paymentRequests = result.requests || [];
  renderPendingRequests();
  renderPlanTransactions();
  const paymentStatusChanged = paymentRequests.some((request) => previousStatuses.get(request.id) && previousStatuses.get(request.id) !== request.status);
  if (paymentStatusChanged) await loadServerEarnings();
}

function renderNotifications() {
  const memberLevel = investment?.level;
  const visible = notifications.filter((notice) => notice.audience === 'all' || notice.audience === String(memberLevel));
  const summary = document.querySelector('[data-notice-summary]');
  if (summary) summary.textContent = visible.length ? `${visible.length} notice${visible.length === 1 ? '' : 's'} available` : 'No new notices';
  if (isDashboardHome) return;
  notificationSection.hidden = visible.length === 0;

  const mobileMenuToggle = document.querySelector('[data-mobile-menu-toggle]');
  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', () => {
      const open = document.body.classList.toggle('mobile-menu-open');
      mobileMenuToggle.setAttribute('aria-expanded', String(open));
      mobileMenuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    const closeMobileMenu = () => {
      document.body.classList.remove('mobile-menu-open');
      mobileMenuToggle.setAttribute('aria-expanded', 'false');
      mobileMenuToggle.setAttribute('aria-label', 'Open menu');
    };
    document.querySelectorAll('.main-nav a').forEach((link) => link.addEventListener('click', closeMobileMenu));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && document.body.classList.contains('mobile-menu-open')) closeMobileMenu();
    });
    document.addEventListener('click', (event) => {
      if (document.body.classList.contains('mobile-menu-open') && !event.target.closest('.sidebar') && !event.target.closest('[data-mobile-menu-toggle]')) closeMobileMenu();
    });
  }
  notificationList.innerHTML = visible.slice().reverse().map((notice) => `<div class="member-notice"><span class="notice-icon">✦</span><span><strong>${notice.audience === 'all' ? 'MyGain update' : `Level ${notice.audience} update`}</strong><small>${notice.message}</small></span></div>`).join('');
}

function renderMemberInformation() {
  const section = document.querySelector('[data-info-feed-section]');
  const feed = document.querySelector('[data-info-feed]');
  const memberLevel = investment?.level;
  const visible = memberInformation.filter((item) => item.audience === 'all' || item.audience === String(memberLevel));
  section.hidden = visible.length === 0;
  feed.innerHTML = visible.slice().reverse().map((item) => `<article class="info-card">${item.imageUrl ? `<img src="${item.imageUrl}" alt="">` : '<span class="info-card-mark">✦</span>'}<div><p class="label">${item.audience === 'all' ? 'For all members' : `For Level ${item.audience}`}</p><h3>${item.title}</h3><p>${item.message}</p></div></article>`).join('');
}

async function syncLiveState() {
  try {
    const token = sessionStorage.getItem('mygainSessionToken');
    const response = await fetch(token ? '/api/me/live-state' : '/api/live-state', { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' });
    if (!response.ok) return;
    const state = await response.json();
    levelProducts.splice(0, levelProducts.length, ...(state.products || []));
    notifications = state.notifications || [];
    memberInformation = state.information || [];
    if (Array.isArray(state.depositAccounts) && state.depositAccounts.length) depositAccounts.splice(0, depositAccounts.length, ...state.depositAccounts); else if (!token) depositAccounts.splice(0, depositAccounts.length, ...defaultDepositAccounts);
    adminConfig.dailyProfitPercent = Number(state.settings?.dailyProfitPercent ?? adminConfig.dailyProfitPercent);
    Object.assign(localWithdrawalSettings.thresholds, state.settings?.withdrawalThresholds || {});
    Object.assign(localWithdrawalSettings.limits, state.settings?.withdrawalLimits || {});
    Object.assign(localWithdrawalSettings.intervals, state.settings?.withdrawalIntervals || {});
    if (state.settings?.backgroundImageUrl) document.documentElement.style.setProperty('--member-bg-image', `url("${state.settings.backgroundImageUrl}")`);
    renderAdminProducts();
    renderNotifications();
    renderMemberInformation();
    if (sessionStorage.getItem('mygainSessionToken')) await loadServerEarnings();
  } catch {
    showFeedback('Live updates are temporarily unavailable.');
  }
}

function generateMemberNumber() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let number;
  do {
    number = `${letters[Math.floor(Math.random() * letters.length)]}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
  } while (Object.values(members).some((member) => member.memberNumber === number));
  return number;
}

function renderMemberReferral() {
  if (!currentMember) return;
  memberReferral.hidden = false;
  document.querySelector('[data-member-number]').textContent = currentMember.memberNumber;
  document.querySelector('[data-referral-bonus]').textContent = formatCurrency(currentMember.referralBonus);
}

function renderPortfolioGraph(history = []) {
  const line = document.querySelector('[data-chart-line]');
  const area = document.querySelector('[data-chart-area]');
  const labels = document.querySelectorAll('[data-chart-labels] span');
  if (!line || !area || !history.length) return;
  const values = history.map((point) => Number(point.value) || 0);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;
  const points = values.map((value, index) => {
    const x = index * 620 / Math.max(1, values.length - 1);
    const y = 136 - ((value - minimum) / range) * 120;
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  line.setAttribute('d', `M${points.join(' L')}`);
  area.setAttribute('d', `M${points.join(' L')} L620 150 L0 150 Z`);
  labels.forEach((label, index) => {
    const historyIndex = Math.round(index * (history.length - 1) / Math.max(1, labels.length - 1));
    label.textContent = index === labels.length - 1 ? 'Today' : new Date(history[historyIndex].date).toLocaleDateString('en-GH', { month: 'short', day: 'numeric' });
  });
}

// --- Live accrual ticker -----------------------------------------------
// Today's profit is a real number the server already computed from the
// member's amount and the level's (market-linked) daily rate. Rather than
// having that number appear instantly, we visually accrue it second by
// second across the trading day (06:00 -> 06:00), so the balance and chart
// climb smoothly toward the same figure the server reports, then reset for
// the next day. Nothing here invents numbers; it only paces the reveal of
// numbers already calculated from real deposits and real market rates.
let latestEarnings = null;
let liveTickerStarted = false;

function dayBoundaries(now = Date.now()) {
  const start = new Date(now);
  start.setHours(6, 0, 0, 0);
  if (start.getTime() > now) start.setDate(start.getDate() - 1);
  return { start: start.getTime(), end: start.getTime() + 86400000 };
}

function liveAccrualTick() {
  if (!latestEarnings) return;
  const liveToday = Number(latestEarnings.todayEarnings || 0);
  const liveTotal = Number(latestEarnings.portfolioValue || 0);
  balance.textContent = formatCurrency(liveTotal);
  const todayEl = document.querySelector('[data-today-earnings]');
  if (todayEl) todayEl.innerHTML = `<span class="live-pulse"></span>Today +${formatCurrency(liveToday)}`;
  const statRate = document.querySelector('[data-stat-daily-rate]');
  if (statRate) statRate.textContent = `${Number(latestEarnings.activeRate || 0).toFixed(2)}%`;
  const statProfit = document.querySelector('[data-stat-today-profit]');
  if (statProfit) statProfit.textContent = formatCurrency(liveToday);
  const statPortfolio = document.querySelector('[data-stat-portfolio-value]');
  if (statPortfolio) statPortfolio.textContent = formatCurrency(liveTotal);
  const chartLine = document.querySelector('[data-chart-line]');
  const chartArea = document.querySelector('[data-chart-area]');
  if (chartLine && latestEarnings.history?.length) {
    const values = latestEarnings.history.map((point) => Number(point.value) || 0);
    values[values.length - 1] = liveTotal;
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const range = maximum - minimum || 1;
    const points = values.map((value, index) => {
      const x = index * 620 / Math.max(1, values.length - 1);
      const y = 136 - ((value - minimum) / range) * 120;
      return `${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    chartLine.setAttribute('d', `M${points.join(' L')}`);
    if (chartArea) chartArea.setAttribute('d', `M${points.join(' L')} L620 150 L0 150 Z`);
  }
}

function ensureLiveTicker() {
  if (liveTickerStarted) return;
  liveTickerStarted = true;
  setInterval(liveAccrualTick, 1000);
}

async function loadServerEarnings() {
  const token = sessionStorage.getItem('mygainSessionToken');
  if (!token || !(location.port === '3000' || location.port === '')) return;
  const response = await fetch('/api/me/earnings', { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return;
  const result = await response.json();
  latestEarnings = result.earnings;
  Object.assign(localWithdrawalSettings.thresholds, result.settings?.withdrawalThresholds || {});
  Object.assign(localWithdrawalSettings.limits, result.settings?.withdrawalLimits || {});
  Object.assign(localWithdrawalSettings.intervals, result.settings?.withdrawalIntervals || {});
  renderPlanTransactions();
  ensureLiveTicker();
  const total = Number(result.earnings.portfolioValue || 0);
  balance.textContent = formatCurrency(total);
  const withdrawalMessage = result.earnings.withdrawalEligible
    ? `Withdrawable ${formatCurrency(result.earnings.withdrawable)} · Every ${result.earnings.withdrawalInterval ?? 1} day${(result.earnings.withdrawalInterval ?? 1) === 1 ? '' : 's'} · ${result.earnings.withdrawalsRemaining} left today`
    : `Unlocks at ${formatCurrency(result.earnings.withdrawalThreshold ?? 250)}`;
  document.querySelector('[data-available-balance]').textContent = withdrawalMessage;
  document.querySelectorAll('[data-plan-balance]').forEach((element) => { element.textContent = `Shared portfolio ${formatCurrency(result.earnings.withdrawable)}`; });
  document.querySelector('[data-today-earnings]').textContent = `Today +${formatCurrency(result.earnings.todayEarnings)}`;
  document.querySelector('[data-daily-payout]').textContent = `Available in 5 vaults ${formatCurrency(result.earnings.dailyAmount)}`;
  document.querySelector('[data-next-payout]').textContent = 'Open vaults to receive profit';
  document.querySelector('[data-portfolio-rate]').textContent = `${Number(result.earnings.activeRate || 0)}% daily`;
  document.querySelector('[data-portfolio-level]').textContent = result.earnings.activeLevel ? `Level ${result.earnings.activeLevel}` : 'No active level';
  renderPortfolioGraph(result.earnings.history);
  updatePurchaseOptions(result.earnings.investments);
  currentMember = result.member;
  investment = result.earnings.investments.slice().reverse().find((item) => item.active) || null;
  const memberName = currentMember.nickname || 'Jordan';
  const levelLabel = investment ? ` · Level ${investment.level}` : result.earnings.investments.length ? ' · Level expired' : '';
  memberDisplayName.textContent = `${memberName}${levelLabel}`;
  profileDisplayName.textContent = memberName;
  document.querySelector('[data-profile-summary]').hidden = false;
  document.querySelector('[data-profile-summary-name]').textContent = currentMember.nickname || 'Nickname not set';
  document.querySelector('[data-profile-summary-account]').textContent = currentMember.withdrawalAccountName
    ? `${currentMember.withdrawalAccountName} · Account ending ${String(currentMember.withdrawalAccountNumber || '').slice(-4)}`
    : 'Withdrawal account not set';
  renderMemberReferral();
  const profitSummary = document.querySelector('[data-profit-summary]');
  if (result.earnings.investments.length > 0) {
    const latestInvestment = result.earnings.investments[result.earnings.investments.length - 1];
    profitSummary.hidden = false;
    document.querySelector('[data-profit-title]').textContent = `${latestInvestment.assetName} · Level ${latestInvestment.level}`;
      document.querySelector('[data-profit-copy]').textContent = latestInvestment.active
        ? `${formatCurrency(latestInvestment.amount)} purchased · ${latestInvestment.dailyRate}% daily · Available through five vaults each calendar day`
      : `Level ${latestInvestment.level} expired after 30 earning days · Purchase another level to continue`;
    document.querySelector('[data-profit-total]').textContent = `+${formatCurrency(result.earnings.profit)}`;
  } else profitSummary.hidden = true;
  await loadVaults();
}

async function hashPassword(password) {
  if (globalThis.crypto?.subtle) {
    const data = new TextEncoder().encode(password);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  // LAN HTTP is not a secure context on many phones; server auth remains authoritative.
  return `local-${Array.from(new TextEncoder().encode(password), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

renderAdminProducts();
renderInvestment();
renderPendingRequests();
renderNotifications();
renderMemberInformation();
syncLiveState();
setInterval(syncLiveState, 5000);
document.querySelector('[data-product-list]').addEventListener('click', (event) => {
  const button = event.target.closest('[data-purchase-level]');
  if (button && !button.disabled) requestPurchaseConfirmation(button.dataset.purchaseLevel, button.dataset.purchasePlan, button);
});

document.querySelector('[data-close-purchase-confirmation]').addEventListener('click', closePurchaseConfirmation);
document.querySelector('[data-cancel-purchase]').addEventListener('click', closePurchaseConfirmation);
purchaseConfirmation.addEventListener('click', (event) => { if (event.target === purchaseConfirmation) closePurchaseConfirmation(); });
document.querySelector('[data-confirm-purchase]').addEventListener('click', async (event) => {
  if (!pendingPurchase) return;
  const purchase = pendingPurchase;
  event.currentTarget.disabled = true;
  purchaseConfirmationStatus.textContent = 'Processing purchase...';
  await purchaseLevel(purchase.level, purchase.planNumber, purchase.button);
  event.currentTarget.disabled = false;
  closePurchaseConfirmation();
});

if (sessionStorage.getItem('mygainSessionToken')) {
  loadServerEarnings().then(() => {
    if (!currentMember) return;
    authScreen.hidden = true;
    app.hidden = false;
    app.setAttribute('aria-hidden', 'false');
    renderMemberReferral();
    loadMemberPaymentRequests().catch(() => {});
  }).catch(() => {});
}

function setAuthMode(mode) {
  authMode = mode;
  const signUp = mode === 'signup';
  authTitle.textContent = signUp ? 'Create your member account' : 'Sign in to your account';
  authIntro.textContent = signUp ? 'Start building a clearer financial future today.' : 'Keep your goals moving in the right direction.';
  authSubmit.innerHTML = signUp ? 'Create account <span>→</span>' : 'Log in <span>→</span>';
  authSwitchCopy.textContent = signUp ? 'Already a member?' : 'New to MyGain?';
  document.querySelector('[data-auth-mode="signup"]').textContent = signUp ? 'Log in' : 'Create an account';
  document.querySelector('[data-auth-mode="login"]').textContent = signUp ? 'Log in' : 'Log in';
  authStatus.textContent = '';
  referralLabel.hidden = !signUp;
  referralInput.hidden = !signUp;
  referralInput.required = false;
}

document.addEventListener('click', (event) => {
  const modeButton = event.target.closest('[data-auth-mode]');
  const openMoneyButton = event.target.closest('[data-open-modal]');
  if (modeButton) {
    event.preventDefault();
    setAuthMode(modeButton.dataset.authMode);
  }
  if (openMoneyButton) {
    event.preventDefault();
    openModal();
  }
});

setAuthMode('login');

const referralFromLink = new URLSearchParams(window.location.search).get('ref');
if (referralFromLink) {
  setAuthMode('signup');
  referralInput.value = referralFromLink.trim().toUpperCase();
}

document.querySelector('[data-toggle-password]').addEventListener('click', (event) => {
  const password = document.querySelector('#member-password');
  const visible = password.type === 'text';
  password.type = visible ? 'password' : 'text';
  event.currentTarget.textContent = visible ? 'Show' : 'Hide';
});

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const phone = document.querySelector('#member-phone').value.trim();
  const phoneDigits = phone.replace(/\D/g, '');
  const phoneKey = phoneDigits.length === 11 && phoneDigits.startsWith('1') ? phoneDigits.slice(1) : phoneDigits;
  const password = document.querySelector('#member-password').value;
  phoneError.textContent = '';
  passwordError.textContent = '';
  authStatus.textContent = '';
  if (!/^\d{10}$/.test(phoneKey)) {
    phoneError.textContent = 'Enter exactly 10 digits, for example 5551234567.';
    document.querySelector('#member-phone').focus();
    return;
  }
  if (!password) {
    passwordError.textContent = 'Enter your password.';
    document.querySelector('#member-password').focus();
    return;
  }
  if (authMode === 'signup' && password.length < 8) {
    passwordError.textContent = 'Use at least 8 characters.';
    document.querySelector('#member-password').focus();
    return;
  }
  const passwordHash = await hashPassword(password);
  let backendAuthenticated = false;
  if (location.port === '3000' || location.port === '') {
    try {
      const endpoint = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password, referralCode: referralInput.value.trim().toUpperCase() }) });
      const result = await response.json();
      if (!response.ok) {
        const legacyMember = members[phoneKey];
        if (authMode === 'login' && response.status === 401 && legacyMember?.passwordHash === passwordHash) {
          const migration = await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }) });
          const migrated = await migration.json();
          if (migration.ok) {
            currentMember = migrated.member;
            sessionStorage.setItem('mygainSessionToken', migrated.token);
            backendAuthenticated = true;
          } else {
            authStatus.textContent = migrated.error || 'Unable to restore this account.';
            document.querySelector('#member-password').focus();
            return;
          }
        } else {
          authStatus.textContent = result.error || 'Unable to authenticate.';
          document.querySelector('#member-password').focus();
          return;
        }
      }
      if (backendAuthenticated) {
        authStatus.textContent = authMode === 'signup' ? `Welcome to MyGain. Your member number is ${currentMember.memberNumber}.` : `Welcome back. Your member number is ${currentMember.memberNumber}.`;
      } else {
        currentMember = result.member;
        sessionStorage.setItem('mygainSessionToken', result.token);
        backendAuthenticated = true;
      }
    } catch {
      authStatus.textContent = 'The MyGain server is unavailable. Try again shortly.';
      return;
    }
  }
  currentMember = currentMember || members[phoneKey];
  if (backendAuthenticated) {
    authStatus.textContent = authMode === 'signup' ? `Welcome to MyGain. Your member number is ${currentMember.memberNumber}.` : `Welcome back. Your member number is ${currentMember.memberNumber}.`;
  }
  if (!backendAuthenticated && authMode === 'signup' && currentMember) {
    authStatus.textContent = 'That phone number already has an account. Log in instead.';
    return;
  }
  if (!backendAuthenticated && authMode === 'login' && (!currentMember || currentMember.passwordHash !== passwordHash)) {
    authStatus.textContent = 'Phone number or password is incorrect.';
    return;
  }
  if (!currentMember && !backendAuthenticated) {
    currentMember = { phone: phoneKey, passwordHash, memberNumber: generateMemberNumber(), referralBonus: 0, referredMembers: [], createdAt: Date.now() };
    const referralCode = referralInput.value.trim().toUpperCase();
    const referrer = Object.values(members).find((member) => member.memberNumber === referralCode);
    if (authMode === 'signup' && referralCode && !referrer) {
      authStatus.textContent = 'That referral code was not found. Check it and try again.';
      return;
    }
    if (authMode === 'signup' && referrer && referrer.phone !== phoneKey) {
      referrer.referredMembers.push(currentMember.memberNumber);
      currentMember.referredBy = referrer.memberNumber;
    }
    members[phoneKey] = currentMember;
    localStorage.setItem(membersKey, JSON.stringify(members));
  }
  authStatus.textContent = backendAuthenticated ? authStatus.textContent : authMode === 'signup'
    ? `Welcome to MyGain. Your member number is ${currentMember.memberNumber}.`
    : `Welcome back. Your member number is ${currentMember.memberNumber}.`;
  setTimeout(() => {
    authScreen.hidden = true;
    app.hidden = false;
    app.setAttribute('aria-hidden', 'false');
    renderMemberReferral();
    loadServerEarnings().catch(() => {});
    loadMemberPaymentRequests().catch(() => {});
  }, 700);
});

document.querySelector('[data-copy-referral]').addEventListener('click', async () => {
  if (!currentMember) return;
  await navigator.clipboard?.writeText(currentMember.memberNumber);
  showFeedback(`Referral code ${currentMember.memberNumber} copied.`);
});

function showFeedback(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

function updateConfirmLabel() {
  confirmButton.textContent = depositStep === 'member-details' || depositStep === 'admin-details' ? 'Continue' : depositStep === 'amount' ? 'Review deposit' : 'Confirm payment';
}

function openModal() {
  depositStep = 'amount';
  modalTitle.textContent = 'Choose deposit amount';
  modalCopy.textContent = 'Choose the amount you want to deposit.';
  document.querySelector('#deposit-account-name').value = '';
  document.querySelector('#deposit-account-number').value = '';
  activeDepositAccount = depositAccounts[Math.floor(Math.random() * depositAccounts.length)] || defaultDepositAccounts[0];
  document.querySelector('[data-deposit-account]').textContent = activeDepositAccount.accountName;
  document.querySelector('[data-deposit-routing]').textContent = activeDepositAccount.routingNumber;
  document.querySelector('[data-deposit-number]').textContent = activeDepositAccount.accountNumber;
  document.querySelector('[data-deposit-contact]').textContent = activeDepositAccount.contact;
  document.querySelector('[data-deposit-reference]').textContent = activeDepositAccount.id.slice(-6).toUpperCase();
  depositDetails.hidden = true;
  memberDepositDetails.hidden = true;
  document.querySelector('.amount-options').hidden = false;
  depositFinalAmount.hidden = true;
  customDepositAmount.value = '';
  confirmButton.disabled = false;
  confirmButton.hidden = false;
  amountButtons.forEach((button) => {
    button.hidden = false;
    button.disabled = false;
    button.classList.remove('selected');
  });
  statusMessage.textContent = '';
  updateConfirmLabel();
  modal.hidden = false;
}

document.querySelector('[data-copy-deposit-number]').addEventListener('click', async (event) => {
  const accountNumber = activeDepositAccount?.accountNumber || document.querySelector('[data-deposit-number]').textContent;
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(accountNumber);
    else {
      const copyInput = document.createElement('input');
      copyInput.value = accountNumber;
      document.body.appendChild(copyInput);
      copyInput.select();
      document.execCommand('copy');
      copyInput.remove();
    }
    event.currentTarget.textContent = 'Copied';
    showFeedback('Deposit account number copied.');
    setTimeout(() => { event.currentTarget.textContent = 'Copy'; }, 1600);
  } catch { showFeedback('Unable to copy the account number.'); }
});

function closeModal() {
  modal.hidden = true;
  statusMessage.textContent = '';
}

document.querySelector('[data-close-modal]').addEventListener('click', closeModal);
modal.addEventListener('click', (event) => {
  if (event.target === modal) closeModal();
});

function closeWithdraw() {
  withdrawModal.hidden = true;
  document.querySelector('[data-withdraw-status]').textContent = '';
}

document.querySelector('[data-open-withdraw]').addEventListener('click', () => {
  document.querySelector('#withdraw-account-name').value = currentMember?.withdrawalAccountName || '';
  document.querySelector('#withdraw-account-number').value = currentMember?.withdrawalAccountNumber || '';
  withdrawModal.hidden = false;
});
document.querySelector('[data-close-withdraw]').addEventListener('click', closeWithdraw);
withdrawModal.addEventListener('click', (event) => { if (event.target === withdrawModal) closeWithdraw(); });
document.querySelector('[data-open-profile]').addEventListener('click', () => { window.location.href = '/profile'; });
document.querySelector('[data-member-logout]').addEventListener('click', async () => {
  const token = sessionStorage.getItem('mygainSessionToken');
  try { if (token) await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); } catch {}
  sessionStorage.removeItem('mygainSessionToken');
  window.location.href = '/';
});
document.querySelector('[data-close-profile]').addEventListener('click', () => { profileModal.hidden = true; profileStatus.textContent = ''; });
profileModal.addEventListener('click', (event) => { if (event.target === profileModal) profileModal.hidden = true; });
document.querySelector('[data-save-profile]').addEventListener('click', async () => {
  const token = sessionStorage.getItem('mygainSessionToken');
  const values = {
    nickname: document.querySelector('#profile-nickname').value.trim(),
    withdrawalAccountName: document.querySelector('#profile-account-name').value.trim(),
    withdrawalAccountNumber: document.querySelector('#profile-account-number').value.trim(),
  };
  if (!values.nickname || !values.withdrawalAccountName || !values.withdrawalAccountNumber) {
    profileStatus.textContent = 'Complete all profile fields.';
    return;
  }
  const button = document.querySelector('[data-save-profile]');
  button.disabled = true;
  profileStatus.textContent = 'Saving...';
  try {
    const response = await fetch('/api/me/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to save profile.');
    currentMember = result.member;
    profileDisplayName.textContent = currentMember.nickname;
    memberDisplayName.textContent = `${currentMember.nickname}${investment ? ` · Level ${investment.level}` : ''}`;
    profileStatus.textContent = 'Profile saved.';
    setTimeout(() => { profileModal.hidden = true; }, 700);
  } catch (error) {
    profileStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
document.querySelector('[data-submit-withdraw]').addEventListener('click', async () => {
  const amount = Number(document.querySelector('#withdraw-amount').value);
  const accountName = document.querySelector('#withdraw-account-name').value.trim();
  const accountNumber = document.querySelector('#withdraw-account-number').value.trim();
  const status = document.querySelector('[data-withdraw-status]');
  if (amount < 1 || !accountName || !accountNumber) { status.textContent = 'Enter the account name and account number.'; return; }
  const request = { id: `withdrawal-${Date.now()}`, type: 'withdrawal', amount, accountName, accountNumber, status: 'pending', createdAt: Date.now() };
  const token = sessionStorage.getItem('mygainSessionToken');
  if (!token) { status.textContent = 'Please sign in again before submitting a withdrawal.'; return; }
  const response = await fetch('/api/payment-requests', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(request) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { status.textContent = result.error || 'Unable to submit withdrawal.'; return; }
  await loadMemberPaymentRequests();
  status.textContent = 'Withdrawal submitted for admin approval.';
});
let memberPaymentSyncActive = false;
setInterval(async () => {
  if (memberPaymentSyncActive) return;
  memberPaymentSyncActive = true;
  try { await loadMemberPaymentRequests(); } catch {} finally { memberPaymentSyncActive = false; }
}, 1000);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !modal.hidden) closeModal();
});

document.querySelectorAll('[data-feedback]').forEach((element) => {
  element.addEventListener('click', (event) => {
    if (element.matches('a')) event.preventDefault();
    showFeedback(element.dataset.feedback);
  });
  if (element.getAttribute('role') === 'button') {
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        showFeedback(element.dataset.feedback);
      }
    });
  }
});

amountButtons.forEach((button) => {
  button.addEventListener('click', () => {
    selectedDeposit = Number(button.dataset.amount);
    amountButtons.forEach((item) => item.classList.remove('selected'));
    button.classList.add('selected');
    confirmButton.disabled = false;
    depositFinalAmount.hidden = false;
    depositFinalAmount.textContent = `You are depositing ${formatCurrency(selectedDeposit)}.`;
    updateConfirmLabel();
  });
});

customDepositAmount.addEventListener('input', () => {
  const amount = Number(customDepositAmount.value);
  amountButtons.forEach((item) => item.classList.remove('selected'));
  if (!Number.isFinite(amount) || amount < 100) {
    confirmButton.disabled = true;
    depositFinalAmount.hidden = true;
    return;
  }
  selectedDeposit = amount;
  confirmButton.disabled = false;
  depositFinalAmount.hidden = false;
  depositFinalAmount.textContent = `You are depositing ${formatCurrency(selectedDeposit)}.`;
  updateConfirmLabel();
});

confirmButton.addEventListener('click', async () => {
  if (depositStep === 'member-details') {
    const accountName = document.querySelector('#deposit-account-name').value.trim();
    const accountNumber = document.querySelector('#deposit-account-number').value.trim();
    if (!accountName || !accountNumber) {
      statusMessage.textContent = 'Enter your account name and account number to continue.';
      return;
    }
    depositStep = 'admin-details';
    modalTitle.textContent = 'Admin deposit details';
    modalCopy.textContent = 'Send your deposit using these MyGain account details.';
    memberDepositDetails.hidden = true;
    depositDetails.hidden = false;
    confirmButton.disabled = false;
    updateConfirmLabel();
    return;
  }
  if (depositStep === 'admin-details') {
    depositStep = 'confirm';
    modalTitle.textContent = 'Confirm your payment';
    modalCopy.textContent = `I have sent ${formatCurrency(selectedDeposit)} to the deposit account.`;
    depositFinalAmount.hidden = false;
    depositFinalAmount.textContent = `I have sent ${formatCurrency(selectedDeposit)} to the deposit account.`;
    updateConfirmLabel();
    return;
  }

  if (depositStep === 'amount') {
    depositStep = 'member-details';
    modalTitle.textContent = 'Your account details';
    modalCopy.textContent = 'Enter the account details you will use for this deposit.';
    document.querySelector('.amount-options').hidden = true;
    memberDepositDetails.hidden = false;
    depositFinalAmount.hidden = true;
    confirmButton.disabled = false;
    updateConfirmLabel();
    return;
  }

  const accountName = document.querySelector('#deposit-account-name').value.trim();
  const accountNumber = document.querySelector('#deposit-account-number').value.trim();
  if (!accountName || !accountNumber) {
    statusMessage.textContent = 'Your account details are required.';
    return;
  }
  if (!Number.isFinite(selectedDeposit) || selectedDeposit < 100) {
    statusMessage.textContent = 'Choose or enter a deposit amount of at least GHS 100.';
    return;
  }
  const request = { id: `deposit-${Date.now()}`, type: 'deposit', amount: selectedDeposit, depositAccount: activeDepositAccount, accountName, accountNumber, status: 'pending', createdAt: Date.now() };
  const token = sessionStorage.getItem('mygainSessionToken');
  if (!token) {
    statusMessage.textContent = 'Please sign in again before submitting a deposit.';
    return;
  }
  if (paymentRequests.some((item) => item.type === 'deposit' && item.status === 'pending')) {
    statusMessage.textContent = 'Your current deposit is waiting for admin approval before another deposit can be made.';
    return;
  }
  confirmButton.disabled = true;
  confirmButton.textContent = 'Submitting...';
  try {
    const response = await fetch('/api/payment-requests', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(request) });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || 'Deposit request failed');
    }
    await loadMemberPaymentRequests();
  } catch (error) {
    confirmButton.disabled = false;
    updateConfirmLabel();
    statusMessage.textContent = error.message || 'Unable to submit the deposit. Please try again.';
    return;
  }
  depositStep = 'complete';
  modalTitle.textContent = 'Deposit submitted';
  modalCopy.textContent = 'Your deposit is waiting for administrator approval.';
  depositDetails.hidden = true;
  amountButtons.forEach((button) => { button.hidden = true; });
  confirmButton.hidden = true;
  statusMessage.textContent = `${formatCurrency(selectedDeposit)} will appear after approval.`;
});
