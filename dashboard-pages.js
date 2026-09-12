const page = document.body.dataset.dashboardPage;
const token = sessionStorage.getItem('mygainSessionToken');
const formatCurrency = (value) => new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(Number(value) || 0);
const content = document.querySelector('[data-page-content]');

const featureMenu = document.querySelector('[data-feature-menu]');
if (featureMenu) {
  featureMenu.addEventListener('click', () => {
    const open = document.body.classList.toggle('feature-menu-open');
    featureMenu.setAttribute('aria-expanded', String(open));
  });
  document.querySelectorAll('.feature-nav a').forEach((link) => link.addEventListener('click', () => document.body.classList.remove('feature-menu-open')));
  document.addEventListener('click', (event) => {
    if (document.body.classList.contains('feature-menu-open') && !event.target.closest('.feature-sidebar') && !event.target.closest('[data-feature-menu]')) {
      document.body.classList.remove('feature-menu-open');
      featureMenu.setAttribute('aria-expanded', 'false');
    }
  });
}

function showLoginRequired() {
  content.innerHTML = '<section class="page-empty"><h2>Sign in to continue</h2><p>Return to the dashboard and sign in to view this page.</p><a class="page-button" href="/dashboard">Back to dashboard</a></section>';
}

function renderPageHeader(title, description) {
  document.querySelector('[data-page-title]').textContent = title;
  document.querySelector('[data-page-description]').textContent = description;
}

async function loadVaultPage() {
  renderPageHeader('Daily Profit Vaults', 'Open each vault once per calendar day to receive your server-calculated share.');
  const response = await fetch('/api/vaults/today', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load your vaults.');
  const result = await response.json();
  renderVaultPage(result.vaults);
}

function renderVaultPage(state, status = '') {
  content.innerHTML = `<section class="vault-page-summary"><div><span class="page-label">Today’s rate</span><strong>${Number(state.dailyRate || 0).toFixed(2)}%</strong></div><div><span class="page-label">Progress</span><strong>${state.openedCount} / 5</strong></div><div><span class="page-label">Received</span><strong>${formatCurrency(state.profitReceived)}</strong></div><div><span class="page-label">Remaining</span><strong>${formatCurrency(state.remainingProfit)}</strong></div></section><section class="page-panel"><div class="page-panel-heading"><div><span class="page-label">${state.vaultDate}</span><h2>Choose a vault</h2></div><span class="page-note">Each vault is ${Number(state.vaultRate || 0).toFixed(2)}%</span></div><div class="page-vault-list">${state.vaults.map((vault) => `<button class="page-vault ${vault.opened ? 'is-opened' : ''}" type="button" data-page-vault="${vault.vaultNumber}" ${vault.opened ? 'disabled' : ''}><span class="page-vault-icon">${vault.opened ? '✓' : '🔒'}</span><span><strong>Vault ${vault.vaultNumber}</strong><small>${vault.opened ? `Opened today · ${formatCurrency(vault.rewardAmount)}` : 'Available · Tap to open'}</small></span><b>${vault.opened ? 'Opened' : 'Open →'}</b></button>`).join('')}</div><p class="page-status" data-page-status>${status}</p></section>`;
  content.querySelectorAll('[data-page-vault]').forEach((button) => button.addEventListener('click', () => openVault(button)));
}

async function openVault(button) {
  button.disabled = true;
  const status = content.querySelector('[data-page-status]');
  status.textContent = 'Opening vault...';
  const response = await fetch(`/api/vaults/${button.dataset.pageVault}/open`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  const result = await response.json();
  if (!response.ok) { button.disabled = false; status.textContent = result.error || 'Unable to open this vault.'; return; }
  renderVaultPage(result.vaults, `Vault opened. You received ${formatCurrency(result.rewardAmount)}.`);
}

async function loadNoticesPage() {
  renderPageHeader('Member Notices', 'Important updates from the MyGain team, filtered for your account.');
  const response = await fetch('/api/me/notices', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load notices.');
  const result = await response.json();
  const readKey = 'mygainReadNotices';
  const read = JSON.parse(sessionStorage.getItem(readKey) || '[]');
  content.innerHTML = result.notices.length ? `<div class="notice-page-list">${result.notices.map((notice) => { const isRead = read.includes(notice.id); return `<article class="notice-page-card ${isRead ? 'is-read' : ''}" data-notice-id="${notice.id}"><span class="notice-page-icon">📢</span><div><span class="page-label">${isRead ? 'Read notice' : 'New notice'}</span><h2>${notice.title || 'Member Notice'}</h2><p>${notice.message}</p><time>${new Date(notice.createdAt).toLocaleDateString('en-GH', { year: 'numeric', month: 'long', day: 'numeric' })}</time></div></article>`; }).join('')}</div>` : '<section class="page-empty"><h2>No notices yet</h2><p>New member updates will appear here.</p></section>';
  result.notices.forEach((notice) => { if (!read.includes(notice.id)) read.push(notice.id); });
  sessionStorage.setItem(readKey, JSON.stringify(read));
}

async function loadTransactionsPage() {
  renderPageHeader('Recent Transactions', 'A complete record of deposits, withdrawals, purchases, bonuses, and vault rewards.');
  const response = await fetch('/api/me/transactions', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load transactions.');
  const result = await response.json();
  content.innerHTML = result.transactions.length ? `<div class="transaction-page-list">${result.transactions.map((item) => `<article class="page-transaction"><span class="transaction-page-icon ${item.amount >= 0 ? 'positive' : 'negative'}">${item.amount >= 0 ? '↗' : '↙'}</span><span><strong>${item.title}</strong><small>${item.detail} · ${new Date(item.createdAt).toLocaleDateString('en-GH')}</small></span><b class="${item.amount >= 0 ? 'positive' : 'negative'}">${item.amount >= 0 ? '+' : '-'}${formatCurrency(Math.abs(item.amount))}</b></article>`).join('')}</div>` : '<section class="page-empty"><h2>No transactions yet</h2><p>Your account activity will appear here.</p></section>';
}

if (!token) showLoginRequired();
else (page === 'vaults' ? loadVaultPage() : page === 'notices' ? loadNoticesPage() : loadTransactionsPage()).catch(() => { content.innerHTML = '<section class="page-empty"><h2>Could not load this page</h2><p>Try again in a moment.</p></section>'; });
