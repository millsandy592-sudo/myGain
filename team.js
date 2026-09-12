const token = sessionStorage.getItem('mygainSessionToken');
const status = document.querySelector('[data-team-status]');
const teamList = document.querySelector('[data-team-list]');
const teamEmpty = document.querySelector('[data-team-empty]');
let referralLink = '';

const formatCurrency = (value) => new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(Number(value) || 0);

function renderTeam(result) {
  referralLink = `${window.location.origin}${result.referralLink}`;
  document.querySelector('[data-team-code]').textContent = result.referralCode;
  document.querySelector('[data-team-link]').textContent = referralLink;
  document.querySelector('[data-team-count]').textContent = result.team.length;
  document.querySelector('[data-team-profit]').textContent = formatCurrency(result.teamProfit);
  document.querySelector('[data-team-commission]').textContent = `${formatCurrency(result.dailyCommission)} (10%)`;
  teamEmpty.hidden = result.team.length > 0;
  teamList.innerHTML = result.team.map((entry) => `<article class="team-member panel-light"><span class="avatar">${(entry.member.nickname || entry.member.memberNumber).charAt(0).toUpperCase()}</span><span class="team-member-copy"><strong>${entry.member.nickname || entry.member.memberNumber}</strong><small>${entry.member.memberNumber} · ${entry.active ? 'Active' : 'Deactivated'}${entry.earnings.highestLevel ? ` · Level ${entry.earnings.highestLevel}` : ''}</small></span><span class="team-member-profit"><small>Daily profit</small><strong>${formatCurrency(entry.earnings.profit)}</strong><em>+${formatCurrency(entry.dailyCommission)} commission (10%)</em></span></article>`).join('');
}

async function loadTeam() {
  if (!token) {
    status.textContent = 'Sign in from the dashboard to view your team.';
    return;
  }
  try {
    const response = await fetch('/api/me/team', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to load your team.');
    renderTeam(result);
  } catch (error) {
    status.textContent = error.message;
  }
}

document.querySelector('[data-copy-team-link]').addEventListener('click', async () => {
  if (!referralLink) return;
  try {
    await navigator.clipboard.writeText(referralLink);
    status.textContent = 'Referral link copied.';
  } catch {
    status.textContent = referralLink;
  }
});

loadTeam();
