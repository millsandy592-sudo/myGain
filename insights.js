const params = new URLSearchParams(location.search);
const view = params.get('view') || 'portfolio';
const formatCurrency = (value) => new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(Number(value) || 0);
const content = document.querySelector('[data-insights-content]');

document.querySelectorAll('.insights-tab').forEach((tab) => {
  if (tab.dataset.tab === view) tab.classList.add('active');
});

function dayBoundaries(now = Date.now()) {
  const start = new Date(now);
  start.setHours(6, 0, 0, 0);
  if (start.getTime() > now) start.setDate(start.getDate() - 1);
  return { start: start.getTime(), end: start.getTime() + 86400000 };
}

async function load() {
  const token = sessionStorage.getItem('mygainSessionToken');
  if (!token) {
    content.innerHTML = '<p class="insights-empty">Log in from the overview page to see your numbers here.</p>';
    return;
  }
  const response = await fetch('/api/me/earnings', { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    content.innerHTML = '<p class="insights-empty">Could not load your account right now. Try again shortly.</p>';
    return;
  }
  const { earnings } = await response.json();
  const { start, end } = dayBoundaries();
  const fraction = Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
  const liveToday = Number(earnings.dailyAmount || 0) * fraction;
  const baseValue = Number(earnings.portfolioValue || 0) - Number(earnings.todayEarnings || 0);
  const liveTotal = baseValue + liveToday;

  if (view === 'returns') {
    content.innerHTML = `
      <section class="insights-hero"><small>Daily return rate</small><h1>${Number(earnings.activeRate || 0).toFixed(2)}% / day</h1>
        <p>This rate is set per level. When a level has a market ticker attached, it is refreshed from that ticker's real 24-hour price change. Without a ticker, an admin-set testing rate is used instead.</p></section>
      <div class="insights-grid">
        <div class="insights-card"><small>Active level</small><strong>${earnings.activeLevel ? `Level ${earnings.activeLevel}` : 'None'}</strong></div>
        <div class="insights-card"><small>Daily payout at current rate</small><strong>${formatCurrency(earnings.dailyAmount)}</strong></div>
        <div class="insights-card"><small>Active levels running</small><strong>${earnings.activeLevelCount || 0}</strong></div>
      </div>
      <p class="insights-note">Rates are capped at 8%/day platform-wide, in line with realistic market movement.</p>`;
  } else if (view === 'profit') {
    content.innerHTML = `
      <section class="insights-hero"><small><span class="live-pulse"></span> Accruing today</small><h1>${formatCurrency(liveToday)}</h1>
        <p>Today's profit accrues steadily from midnight-to-midnight based on your active level's daily rate, and locks in at ${formatCurrency(earnings.dailyAmount)} for the day.</p></section>
      <div class="insights-grid">
        <div class="insights-card"><small>Total profit to date</small><strong>${formatCurrency(earnings.profit)}</strong></div>
        <div class="insights-card"><small>Referral bonuses earned</small><strong>${formatCurrency(earnings.bonuses)}</strong></div>
        <div class="insights-card"><small>Total withdrawn</small><strong>${formatCurrency(earnings.withdrawn)}</strong></div>
      </div>
      <div class="insights-list">${(earnings.investments || []).map((investment) => `
        <div class="insights-row"><span>Level ${investment.level} · ${investment.assetName}</span><strong>${formatCurrency(investment.profit)}</strong></div>`).join('') || '<p class="insights-empty">No investments yet.</p>'}</div>`;
  } else {
    content.innerHTML = `
      <section class="insights-hero"><small>Total portfolio value</small><h1>${formatCurrency(liveTotal)}</h1>
        <p>This is your deposits and bonuses, plus profit earned so far, minus withdrawals and level purchases.</p></section>
      <div class="insights-grid">
        <div class="insights-card"><small>Deposited</small><strong>${formatCurrency(earnings.deposited)}</strong></div>
        <div class="insights-card"><small>Invested in levels</small><strong>${formatCurrency(earnings.purchased)}</strong></div>
        <div class="insights-card"><small>Cash balance</small><strong>${formatCurrency(earnings.cashBalance)}</strong></div>
        <div class="insights-card"><small>Withdrawable now</small><strong>${formatCurrency(earnings.withdrawable)}</strong></div>
      </div>`;
  }
}

load().catch(() => { content.innerHTML = '<p class="insights-empty">Something went wrong loading this page.</p>'; });
setInterval(() => load().catch(() => {}), 1000);
