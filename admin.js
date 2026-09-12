const catalogKey = 'northstarProducts';
const rateKey = 'northstarProfitRate';
const requestKey = 'northstarPaymentRequests';
const settingsKey = 'northstarAdminSettings';
const notificationsKey = 'northstarNotifications';
const accountsKey = 'northstarDepositAccounts';
const infoKey = 'northstarMemberInformation';
const adminApp = document.querySelector('[data-admin-app]');
const adminLogin = document.querySelector('[data-admin-login]');
const adminLoginForm = document.querySelector('[data-admin-login-form]');
const adminLoginStatus = document.querySelector('[data-admin-login-status]');
const defaultProducts = [
  { id: 'foundation', name: 'Foundation fund', code: 'LEVEL 1', level: 1, amount: 50, dailyRate: 5, symbol: 'F', color: '#dff6eb', imageUrl: '' },
  { id: 'growth', name: 'Growth fund', code: 'LEVEL 2', level: 2, amount: 100, dailyRate: 7, symbol: 'G', color: '#fff0ec', imageUrl: '' },
  { id: 'momentum', name: 'Momentum fund', code: 'LEVEL 3', level: 3, amount: 250, dailyRate: 9, symbol: 'M', color: '#fff6d8', imageUrl: '' },
  { id: 'summit', name: 'Summit fund', code: 'LEVEL 4', level: 4, amount: 500, dailyRate: 12, symbol: 'S', color: '#e9e6fb', imageUrl: '' },
];
let products = JSON.parse(localStorage.getItem(catalogKey) || 'null') || defaultProducts;
let requests = JSON.parse(localStorage.getItem(requestKey) || '[]');
const adminSettings = { accountName: 'MyGain Investments', routingNumber: '021000021', accountNumber: '•••• 4829', contact: 'support@mygain.test', ...JSON.parse(localStorage.getItem(settingsKey) || '{}') };
let notifications = JSON.parse(localStorage.getItem(notificationsKey) || '[]');
let memberInformation = JSON.parse(localStorage.getItem(infoKey) || '[]');
let depositAccounts = JSON.parse(localStorage.getItem(accountsKey) || 'null') || [{ id: 'default-account', accountName: adminSettings.accountName, routingNumber: adminSettings.routingNumber, accountNumber: adminSettings.accountNumber, contact: adminSettings.contact }];
let editingId = null;
let toastTimer;
const list = document.querySelector('[data-admin-list]');
const emptyState = document.querySelector('[data-admin-empty]');
const formModal = document.querySelector('[data-form-modal]');
const form = document.querySelector('[data-asset-form]');
const formTitle = document.querySelector('[data-form-title]');
const formSubmit = document.querySelector('[data-form-submit]');
const imagePreview = document.querySelector('[data-image-preview]');
const imageInput = form.elements.imageUrl;
const toast = document.querySelector('[data-admin-toast]');
const approvalList = document.querySelector('[data-approval-list]');
const approvalEmpty = document.querySelector('[data-approval-empty]');
const noticeAdminList = document.querySelector('[data-notice-admin-list]');
const depositAccountList = document.querySelector('[data-deposit-account-list]');
const infoForm = document.querySelector('[data-info-form]');
const infoPreview = document.querySelector('[data-info-preview]');
const publishedInfo = document.querySelector('[data-published-info]');
const memberDirectory = document.querySelector('[data-member-directory]');
const membersEmpty = document.querySelector('[data-members-empty]');
const memberDetailModal = document.querySelector('[data-member-detail-modal]');
const memberDetailTitle = document.querySelector('[data-member-detail-title]');
const memberDetailSummary = document.querySelector('[data-member-detail-summary]');
const memberDetailStats = document.querySelector('[data-member-detail-stats]');
const memberActivityList = document.querySelector('[data-member-activity-list]');
const formatCurrency = (value) => new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(Number(value) || 0);
const MAX_LOCAL_IMAGE_BYTES = 4 * 1024 * 1024;

function readLocalImage(file) {
  if (!file) return Promise.resolve('');
  if (!file.type.startsWith('image/')) return Promise.reject(new Error('Choose an image file.'));
  if (file.size > MAX_LOCAL_IMAGE_BYTES) return Promise.reject(new Error('Images must be 4 MB or smaller.'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(new Error('Could not read that image.')));
    reader.readAsDataURL(file);
  });
}

document.querySelectorAll('[data-image-upload]').forEach((input) => {
  input.addEventListener('change', async () => {
    const form = input.closest('form');
    const urlInput = form?.elements[input.dataset.imageUpload];
    if (!urlInput || !input.files[0]) return;
    try {
      urlInput.value = await readLocalImage(input.files[0]);
      urlInput.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (error) {
      input.value = '';
      showToast(error.message);
    }
  });
});

document.querySelector('[data-admin-logout]').addEventListener('click', async () => {
  const token = sessionStorage.getItem('mygainAdminToken');
  try { if (token) await fetch('/api/admin/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); } catch {}
  sessionStorage.removeItem('mygainAdminToken');
  window.location.href = 'admin.html';
});

async function adminApi(path, options = {}) {
  const token = sessionStorage.getItem('mygainAdminToken');
  return fetch(path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '', ...(options.headers || {}) } });
}

async function loadPaymentRequests() {
  const response = await adminApi('/api/payment-requests');
  if (!response.ok) return;
  const result = await response.json();
  const knownPendingDeposits = new Set(requests.filter((request) => request.type === 'deposit' && request.status === 'pending').map((request) => request.id));
  requests = result.requests || [];
  renderApprovals();
  const hasNewPendingDeposit = requests.some((request) => request.type === 'deposit' && request.status === 'pending' && !knownPendingDeposits.has(request.id));
  if (hasNewPendingDeposit) showToast('New deposit waiting for approval.');
}

async function loadVaultDashboard() {
  const response = await adminApi('/api/admin/vaults');
  if (!response.ok) return;
  const result = await response.json();
  document.querySelector('[data-vault-admin-date]').textContent = result.vaultDate;
  document.querySelector('[data-admin-vault-total]').textContent = result.totalOpened;
  document.querySelector('[data-admin-vault-profit]').textContent = formatCurrency(result.totalProfit);
  document.querySelector('[data-admin-vault-users]').textContent = result.usersOpened;
  document.querySelector('[data-admin-vault-rate]').textContent = `Daily rate ${Number(result.dailyRate || 0).toFixed(2)}% · Each vault ${Number(result.vaultRate || 0).toFixed(2)}%`;
  document.querySelector('[data-admin-vault-history]').innerHTML = result.openings.length
    ? result.openings.map((opening) => `<div class="vault-admin-row"><span><strong>${opening.member?.memberNumber || 'Unknown member'} · Vault ${opening.vaultNumber}</strong><small>${opening.vaultDate} · Eligible balance GHS ${Number(opening.eligibleBalance || 0).toFixed(2)}</small></span><strong>+${formatCurrency(opening.rewardAmount)}</strong></div>`).join('')
    : '<p class="catalog-note">No vaults opened today.</p>';
}

adminLoginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(adminLoginForm));
  const response = await fetch('/api/admin/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
  const result = await response.json();
  if (!response.ok) { adminLoginStatus.textContent = result.error || 'Unable to sign in.'; return; }
  sessionStorage.setItem('mygainAdminToken', result.token);
  adminLogin.hidden = true;
  adminApp.hidden = false;
  loadPaymentRequests().catch(() => {});
  loadVaultDashboard().catch(() => {});
  loadMembers().catch(() => {});
  setInterval(() => loadPaymentRequests().catch(() => {}), 2000);
  setInterval(() => loadVaultDashboard().catch(() => {}), 5000);
  setInterval(() => loadMembers().catch(() => {}), 5000);
});

if (sessionStorage.getItem('mygainAdminToken')) {
  adminLogin.hidden = true;
  adminApp.hidden = false;
  loadPaymentRequests().catch(() => {});
  loadVaultDashboard().catch(() => {});
  setInterval(() => loadPaymentRequests().catch(() => {}), 2000);
  setInterval(() => loadVaultDashboard().catch(() => {}), 5000);
}

async function loadMembers() {
  const response = await adminApi('/api/admin/members');
  if (!response.ok) return;
  const result = await response.json();
  membersEmpty.hidden = result.members.length > 0;
  memberDirectory.innerHTML = result.members.map((member) => `<article class="member-row" data-member-id="${member.id}"><span class="member-avatar">${member.memberNumber.charAt(0)}</span><span class="member-main"><strong>${member.memberNumber}</strong><small>Registered ${new Date(member.createdAt).toLocaleDateString()}</small></span><span class="member-contact"><small>Phone contact</small><strong>${member.phone}</strong></span><span class="member-balance"><small>Balance</small><strong>${formatCurrency(member.earnings.balance)}</strong></span><button type="button" class="${member.active ? 'reject-button' : 'approve-button'}" data-toggle-member="${member.id}" data-active="${member.active}">${member.active ? 'Deactivate' : 'Reactivate'}</button><button type="button" class="reject-button" data-remove-member="${member.id}" data-member-number="${member.memberNumber}">Remove</button></article>`).join('');
}

memberDirectory.addEventListener('click', async (event) => {
  const removeButton = event.target.closest('[data-remove-member]');
  if (removeButton) {
    if (!window.confirm(`Remove member ${removeButton.dataset.memberNumber}? This permanently deletes the account and its records.`)) return;
    const response = await adminApi(`/api/admin/members/${removeButton.dataset.removeMember}`, { method: 'DELETE' });
    if (response.ok) { showToast('Member removed from the system.'); loadMembers(); }
    else showToast('Unable to remove this member.');
    return;
  }
  if (event.target.closest('button')) return;
  const memberRow = event.target.closest('[data-member-id]');
  if (memberRow) openMemberDetails(memberRow.dataset.memberId);
});

async function openMemberDetails(memberId) {
  const response = await adminApi(`/api/admin/members/${memberId}`);
  if (!response.ok) { showToast('Unable to load member activity.'); return; }
  const result = await response.json();
  const { member, earnings, activities } = result;
  memberDetailTitle.textContent = `${member.memberNumber} activity`;
  memberDetailSummary.textContent = `${member.phone} · Registered ${new Date(member.createdAt).toLocaleDateString()} · ${member.active ? 'Active' : 'Deactivated'}`;
  memberDetailStats.innerHTML = `<span><small>Portfolio</small><strong>${formatCurrency(earnings.portfolioValue)}</strong></span><span><small>Withdrawable</small><strong>${formatCurrency(earnings.withdrawable)}</strong></span><span><small>Pending withdrawals</small><strong>${formatCurrency(earnings.pendingWithdrawals)}</strong></span><span><small>Current rate</small><strong>${Number(earnings.activeRate || 0).toFixed(2)}% / day</strong></span>`;
  memberActivityList.innerHTML = activities.length ? activities.map((activity) => `<div class="member-activity-item"><span><strong>${activity.detail}</strong><small>${new Date(activity.createdAt).toLocaleString()} · ${activity.status}</small></span><strong>${activity.type === 'withdrawal' ? '-' : '+'}${formatCurrency(activity.amount)}</strong></div>`).join('') : '<p class="catalog-note">No activity recorded yet.</p>';
  memberDetailModal.hidden = false;
}

document.querySelector('[data-close-member-detail]').addEventListener('click', () => { memberDetailModal.hidden = true; });
memberDetailModal.addEventListener('click', (event) => {
  if (event.target === memberDetailModal) memberDetailModal.hidden = true;
});

memberDirectory.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-toggle-member]');
  if (!button) return;
  const active = button.dataset.active !== 'true';
  const response = await adminApi(`/api/admin/members/${button.dataset.toggleMember}`, { method: 'PATCH', body: JSON.stringify({ active }) });
  if (response.ok) { showToast(active ? 'Member reactivated.' : 'Member deactivated.'); loadMembers(); }
});

function saveProducts() {
  localStorage.setItem(catalogKey, JSON.stringify(products));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

function renderProducts() {
  list.innerHTML = '';
  emptyState.hidden = products.length > 0;
  document.querySelector('[data-asset-count]').textContent = products.length;
  if (!products.length) return;
  products.forEach((product) => {
    const item = document.createElement('article');
    item.className = 'admin-product';
    const image = product.imageUrl
      ? `<img src="${product.imageUrl}" alt="${product.name} image">`
      : product.symbol || product.name.charAt(0).toUpperCase();
    item.innerHTML = `
      <span class="product-art" style="background:${product.color || '#dff6eb'}">${image}</span>
      <span class="product-copy"><strong>${product.name}</strong><small>${product.code} · Level ${product.level}</small></span>
      <span class="product-meta"><strong>${formatCurrency(product.amount)}</strong><small>Entry amount</small></span>
      <span class="product-meta"><strong>${Number(product.dailyRate ?? 0).toFixed(2)}% / day</strong><small>${product.tickerSymbol ? `Live · ${product.tickerSymbol.toUpperCase()}` : 'Manual / testing rate'}</small></span>
      <span class="product-actions"><button class="icon-action" type="button" data-edit="${product.id}">Edit</button><button class="icon-action" type="button" data-delete="${product.id}">Delete</button></span>`;
    list.appendChild(item);
  });
}

function renderApprovals() {
  const pending = requests.filter((request) => request.status === 'pending');
  approvalList.innerHTML = '';
    approvalEmpty.hidden = pending.length > 0; 
  pending.forEach((request) => {
    const item = document.createElement('article');
    item.className = 'approval-item';
    const member = request.member || {};
    const memberDetails = `${member.memberNumber || 'Unknown member'} · ${member.phone || 'No phone'} · Account: ${request.accountName || 'Not provided'} · ${request.accountNumber || 'No account number'}`;
    const transactionDetails = request.type === 'deposit'
      ? 'Account funding deposit'
      : `To ${request.accountName || 'account'} · Account ${request.accountNumber || 'Not provided'}`;
    item.innerHTML = `<span class="approval-icon ${request.type === 'deposit' ? 'deposit' : 'withdrawal'}">${request.type === 'deposit' ? '↗' : '↙'}</span><span class="approval-copy"><strong>${request.type === 'deposit' ? 'Deposit' : 'Withdrawal'} · ${formatCurrency(request.amount)}</strong><small>${transactionDetails}</small><small>${memberDetails}</small></span><span class="approval-time">${new Date(request.createdAt).toLocaleDateString()}</span><span class="approval-actions"><button type="button" class="approve-button" data-approve="${request.id}">Approve</button><button type="button" class="reject-button" data-reject="${request.id}">Reject</button></span>`;
    approvalList.appendChild(item);
  });
}

function renderNotices() {
  noticeAdminList.innerHTML = notifications.length ? notifications.slice().reverse().map((notice) => `<div class="notice-admin-item"><span><strong>${notice.audience === 'all' ? 'All levels' : `Level ${notice.audience}`}</strong><small>${notice.message}</small></span><button type="button" class="reject-button" data-delete-notice="${notice.id}">Delete</button></div>`).join('') : '<p class="catalog-note">No notifications published yet.</p>';
}

function renderDepositAccounts() {
  depositAccountList.innerHTML = depositAccounts.map((account) => `<div class="deposit-account-item"><span><strong>${account.accountName}</strong><small>${account.routingNumber} · ${account.accountNumber} · ${account.contact}</small></span><button type="button" class="reject-button" data-delete-account="${account.id}">Remove</button></div>`).join('');
}

function renderPublishedInfo() {
  publishedInfo.innerHTML = memberInformation.length ? memberInformation.slice().reverse().map((item) => `<div class="published-info-item">${item.imageUrl ? `<img src="${item.imageUrl}" alt="">` : '<span class="published-info-mark">✦</span>'}<span><strong>${item.title}</strong><small>${item.audience === 'all' ? 'All levels' : `Level ${item.audience}`} · ${item.message}</small></span><button type="button" class="reject-button" data-delete-info="${item.id}">Delete</button></div>`).join('') : '<p class="catalog-note">No information published yet.</p>';
}

async function updateRequest(id, status) {
  const request = requests.find((item) => item.id === id);
  if (!request) return;
  const response = await adminApi(`/api/payment-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  if (!response.ok) { showToast('Unable to update this payment request.'); return; }
  request.status = status;
  request.reviewedAt = Date.now();
  if (status === 'approved' && request.type === 'withdrawal') {
    const withdrawals = JSON.parse(localStorage.getItem('northstarApprovedWithdrawals') || '[]');
    withdrawals.push(request);
    localStorage.setItem('northstarApprovedWithdrawals', JSON.stringify(withdrawals));
  }
  localStorage.setItem(requestKey, JSON.stringify(requests));
  renderApprovals();
  showToast(`${request.type === 'deposit' ? 'Deposit' : 'Withdrawal'} ${status}.`);
}

approvalList.addEventListener('click', (event) => {
  const approve = event.target.closest('[data-approve]');
  const reject = event.target.closest('[data-reject]');
  if (approve) updateRequest(approve.dataset.approve, 'approved');
  if (reject) updateRequest(reject.dataset.reject, 'rejected');
});

document.querySelector('[data-notification-form]').addEventListener('submit', (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  notifications.push({ id: `notice-${Date.now()}`, audience: values.audience, message: values.message.trim(), createdAt: Date.now() });
  localStorage.setItem(notificationsKey, JSON.stringify(notifications));
  event.currentTarget.reset();
  renderNotices();
  showToast('Notification published to members.');
  adminApi('/api/admin/notifications', { method: 'POST', body: JSON.stringify(values) }).catch(() => {});
});

noticeAdminList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-delete-notice]');
  if (!button) return;
  notifications = notifications.filter((notice) => notice.id !== button.dataset.deleteNotice);
  localStorage.setItem(notificationsKey, JSON.stringify(notifications));
  renderNotices();
  showToast('Notification removed.');
});

document.querySelector('[data-deposit-account-form]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const response = await adminApi('/api/admin/deposit-accounts', { method: 'POST', body: JSON.stringify(values) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    document.querySelector('[data-account-status]').textContent = result.error || 'Could not add deposit account.';
    return;
  }
  if (result.account) depositAccounts.push(result.account);
  localStorage.setItem(accountsKey, JSON.stringify(depositAccounts));
  event.currentTarget.reset();
  renderDepositAccounts();
  document.querySelector('[data-account-status]').textContent = 'Deposit account added.';
  showToast('Deposit account added to the random selection pool.');
});

depositAccountList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-delete-account]');
  if (!button) return;
  if (depositAccounts.length === 1) { showToast('Keep at least one deposit account available.'); return; }
  const response = await adminApi(`/api/admin/deposit-accounts/${encodeURIComponent(button.dataset.deleteAccount)}`, { method: 'DELETE' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { showToast(result.error || 'Could not remove deposit account.'); return; }
  depositAccounts = Array.isArray(result.accounts) ? result.accounts : depositAccounts.filter((account) => account.id !== button.dataset.deleteAccount);
  localStorage.setItem(accountsKey, JSON.stringify(depositAccounts));
  renderDepositAccounts();
  showToast('Deposit account removed.');
});

infoForm.elements.imageUrl.addEventListener('input', () => {
  const url = infoForm.elements.imageUrl.value.trim();
  infoPreview.innerHTML = url ? `<img src="${url}" alt="Information preview">` : '<span>Image preview</span>';
});

infoForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(infoForm));
  memberInformation.push({ id: `info-${Date.now()}`, audience: values.audience, title: values.title.trim(), message: values.message.trim(), imageUrl: values.imageUrl.trim(), createdAt: Date.now() });
  localStorage.setItem(infoKey, JSON.stringify(memberInformation));
  infoForm.reset();
  infoPreview.innerHTML = '<span>Image preview</span>';
  renderPublishedInfo();
  showToast('Information published to the member screen.');
  adminApi('/api/admin/information', { method: 'POST', body: JSON.stringify(values) }).catch(() => {});
});

publishedInfo.addEventListener('click', (event) => {
  const button = event.target.closest('[data-delete-info]');
  if (!button) return;
  memberInformation = memberInformation.filter((item) => item.id !== button.dataset.deleteInfo);
  localStorage.setItem(infoKey, JSON.stringify(memberInformation));
  renderPublishedInfo();
  showToast('Published information removed.');
});

function openForm(product = null) {
  editingId = product ? product.id : null;
  form.reset();
  form.elements.color.value = product?.color || '#dff6eb';
  form.elements.manualTestRate.value = product?.manualTestRate ?? product?.dailyRate ?? 5;
  form.elements.tickerSymbol.value = product?.tickerSymbol || '';
  form.elements.assetType.value = product?.assetType && product.assetType !== 'manual' ? product.assetType : 'stock';
  if (product) {
    formTitle.textContent = 'Edit asset';
    formSubmit.textContent = 'Save changes';
    Object.entries(product).forEach(([key, value]) => {
      if (form.elements[key] && key !== 'id' && key !== 'symbol') form.elements[key].value = value;
    });
  } else {
    formTitle.textContent = 'Add an asset';
    formSubmit.textContent = 'Publish asset';
  }
  updatePreview();
  formModal.hidden = false;
  form.elements.name.focus();
}

function closeForm() {
  formModal.hidden = true;
  form.reset();
  editingId = null;
  imagePreview.innerHTML = '<span>Image preview</span>';
}

function updatePreview() {
  const url = imageInput.value.trim();
  imagePreview.innerHTML = url ? `<img src="${url}" alt="Asset preview">` : '<span>Image preview</span>';
}

document.querySelector('[data-open-form]').addEventListener('click', () => openForm());
document.querySelector('[data-close-form]').addEventListener('click', closeForm);
formModal.addEventListener('click', (event) => { if (event.target === formModal) closeForm(); });
imageInput.addEventListener('input', updatePreview);

document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !formModal.hidden) closeForm(); });

list.addEventListener('click', (event) => {
  const editButton = event.target.closest('[data-edit]');
  const deleteButton = event.target.closest('[data-delete]');
  if (editButton) openForm(products.find((product) => product.id === editButton.dataset.edit));
  if (deleteButton) {
    products = products.filter((product) => product.id !== deleteButton.dataset.delete);
    saveProducts();
    renderProducts();
    showToast('Asset removed from the member catalog.');
  }
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const wasEditing = Boolean(editingId);
  const data = new FormData(form);
  const name = data.get('name').trim();
  const tickerSymbol = data.get('tickerSymbol').trim();
  const manualTestRate = Number(data.get('manualTestRate'));
  const product = {
    id: editingId || `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
    name,
    code: data.get('code').trim().toUpperCase(),
    level: Number(data.get('level')),
    amount: Number(data.get('amount')),
    tickerSymbol,
    assetType: tickerSymbol ? data.get('assetType') : 'manual',
    manualTestRate,
    dailyRate: tickerSymbol ? manualTestRate : manualTestRate, // server refreshes this from the market on its own timer once a ticker is set
    color: data.get('color'),
    imageUrl: data.get('imageUrl').trim(),
    symbol: name.charAt(0).toUpperCase(),
  };
  const conflictingLevel = products.find((item) => item.level === product.level && item.id !== editingId);
  if (conflictingLevel) {
    document.querySelector('[data-form-status]').textContent = `Level ${product.level} is already assigned to ${conflictingLevel.name}. Edit or remove it first.`;
    return;
  }
  products = editingId ? products.map((item) => item.id === editingId ? product : item) : [...products, product];
  saveProducts();
  renderProducts();
  closeForm();
  showToast(wasEditing ? 'Asset changes saved.' : 'Asset published to the member catalog.');
  adminApi('/api/admin/products', { method: 'POST', body: JSON.stringify(product) }).catch(() => {});
});

document.querySelector('[data-save-default]').addEventListener('click', () => {
  const input = document.querySelector('#default-rate');
  const rate = Math.max(0, Number(input.value) || 0);
  input.value = rate;
  localStorage.setItem(rateKey, rate);
  document.querySelector('[data-rate-summary]').textContent = rate;
  document.querySelector('[data-settings-status]').textContent = 'Default rate saved.';
  showToast(`All level rates set to ${rate}%. You can edit levels individually afterward.`);
  adminApi('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ dailyProfitPercent: rate }) }).catch(() => {});
});

document.querySelector('[data-bonus-form]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const response = await adminApi('/api/admin/bonuses', { method: 'POST', body: JSON.stringify(values) });
  const result = await response.json();
  document.querySelector('[data-bonus-status]').textContent = response.ok ? 'Bonus awarded.' : result.error;
  if (response.ok) { event.currentTarget.reset(); showToast('Bonus added to the member earnings ledger.'); }
});

document.querySelector('#default-rate').value = Number(localStorage.getItem(rateKey) || 5);
document.querySelector('[data-rate-summary]').textContent = document.querySelector('#default-rate').value;

document.querySelector('[data-save-referral]').addEventListener('click', async () => {
  const referralBonuses = {};
  document.querySelectorAll('[data-referral-bonus]').forEach((input) => {
    const amount = Math.max(0, Number(input.value) || 0);
    input.value = amount;
    referralBonuses[input.dataset.referralBonus] = amount;
  });
  const response = await adminApi('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ referralBonuses }) });
  document.querySelector('[data-referral-status]').textContent = response.ok ? 'Referral bonuses saved.' : 'Could not save referral bonuses.';
  if (response.ok) showToast('Referral bonuses by level updated.');
});

document.querySelector('[data-save-withdrawal-limits]').addEventListener('click', async () => {
  const withdrawalLimits = {};
  const withdrawalThresholds = {};
  const withdrawalIntervals = {};
  document.querySelectorAll('[data-withdrawal-threshold]').forEach((input) => {
    const value = Math.max(0, Number(input.value) || 0);
    input.value = value;
    withdrawalThresholds[input.dataset.withdrawalThreshold] = value;
  });
  document.querySelectorAll('[data-withdrawal-limit]').forEach((input) => {
    const value = Math.max(0, Math.floor(Number(input.value) || 0));
    input.value = value;
    withdrawalLimits[input.dataset.withdrawalLimit] = value;
  });
  document.querySelectorAll('[data-withdrawal-interval]').forEach((input) => {
    const value = Math.max(1, Math.floor(Number(input.value) || 1));
    input.value = value;
    withdrawalIntervals[input.dataset.withdrawalInterval] = value;
  });
  const response = await adminApi('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ withdrawalLimits, withdrawalThresholds, withdrawalIntervals }) });
  document.querySelector('[data-withdrawal-limits-status]').textContent = response.ok ? 'Withdrawal limits saved.' : 'Could not save withdrawal limits.';
  if (response.ok) showToast('Daily withdrawal limits updated.');
});

const backgroundForm = document.querySelector('[data-background-form]');
backgroundForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(backgroundForm));
  const response = await adminApi('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(values) });
  document.querySelector('[data-background-status]').textContent = response.ok ? 'Backgrounds saved.' : 'Could not save backgrounds.';
  if (response.ok) {
    showToast('Background images updated.');
    if (values.adminBackgroundImageUrl) document.body.style.setProperty('--admin-bg-image', `url("${values.adminBackgroundImageUrl}")`);
  }
});

async function loadDepositAccounts() {
  const response = await adminApi('/api/admin/deposit-accounts');
  if (!response.ok) return;
  const result = await response.json();
  if (Array.isArray(result.accounts)) {
    depositAccounts = result.accounts;
    localStorage.setItem(accountsKey, JSON.stringify(depositAccounts));
    renderDepositAccounts();
  }
}

async function loadSettingsIntoForms() {
  const response = await adminApi('/api/settings');
  if (!response.ok) return;
  const { settings } = await response.json();
  if (!settings) return;
  Object.entries(settings.referralBonuses || { 1: 25, 2: 50, 3: 100, 4: 200 }).forEach(([level, amount]) => {
    const input = document.querySelector(`[data-referral-bonus="${level}"]`);
    if (input) input.value = amount;
  });
  document.querySelector('#default-rate').value = settings.dailyProfitPercent ?? 5;
  document.querySelector('[data-rate-summary]').textContent = settings.dailyProfitPercent ?? 5;
  Object.entries(settings.withdrawalLimits || { 1: 1, 2: 1, 3: 1, 4: 1 }).forEach(([level, limit]) => {
    const input = document.querySelector(`[data-withdrawal-limit="${level}"]`);
    if (input) input.value = limit;
  });
  Object.entries(settings.withdrawalThresholds || { 1: 250, 2: 500, 3: 1000, 4: 2000 }).forEach(([level, amount]) => {
    const input = document.querySelector(`[data-withdrawal-threshold="${level}"]`);
    if (input) input.value = amount;
  });
  Object.entries(settings.withdrawalIntervals || { 1: 1, 2: 1, 3: 1, 4: 1 }).forEach(([level, interval]) => {
    const input = document.querySelector(`[data-withdrawal-interval="${level}"]`);
    if (input) input.value = interval;
  });
  backgroundForm.elements.backgroundImageUrl.value = settings.backgroundImageUrl || '';
  backgroundForm.elements.adminBackgroundImageUrl.value = settings.adminBackgroundImageUrl || '';
  if (settings.adminBackgroundImageUrl) document.body.style.setProperty('--admin-bg-image', `url("${settings.adminBackgroundImageUrl}")`);
}
loadSettingsIntoForms().catch(() => {});
loadDepositAccounts().catch(() => {});

const passwordModal = document.querySelector('[data-password-modal]');
document.querySelector('[data-open-password]').addEventListener('click', (event) => { event.preventDefault(); passwordModal.hidden = false; });
document.querySelector('[data-close-password]').addEventListener('click', () => { passwordModal.hidden = true; });
document.querySelector('[data-password-form]').addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const response = await adminApi('/api/admin/auth/password', { method: 'PATCH', body: JSON.stringify(values) });
  const result = await response.json().catch(() => ({}));
  document.querySelector('[data-password-status]').textContent = response.ok ? 'Password updated. Other sessions were signed out.' : (result.error || 'Could not update password.');
  if (response.ok) { event.currentTarget.reset(); showToast('Admin password changed.'); }
});
const contactForm = document.querySelector('[data-contact-form]');
Object.entries(adminSettings).forEach(([key, value]) => { if (contactForm.elements[key]) contactForm.elements[key].value = value; });
contactForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(contactForm));
  localStorage.setItem(settingsKey, JSON.stringify(values));
  document.querySelector('[data-contact-status]').textContent = 'Deposit details saved.';
  showToast('Member deposit instructions updated.');
});
renderProducts();
renderApprovals();
renderNotices();
renderDepositAccounts();
renderPublishedInfo();
if (sessionStorage.getItem('mygainAdminToken')) {
  loadMembers().catch(() => {});
  setInterval(() => loadMembers().catch(() => {}), 5000);
}
