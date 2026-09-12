const token = sessionStorage.getItem('mygainSessionToken');
const form = document.querySelector('[data-profile-form]');
const status = document.querySelector('[data-profile-status]');
const memberLabel = document.querySelector('[data-profile-member]');
const phoneLabel = document.querySelector('[data-profile-phone]');
const avatar = document.querySelector('[data-profile-avatar]');

if (!token) {
  status.textContent = 'Sign in from the dashboard to edit your profile.';
  form.querySelectorAll('input, button').forEach((element) => { element.disabled = true; });
} else {
  loadProfile();
}

async function loadProfile() {
  try {
    const response = await fetch('/api/me/earnings', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!response.ok) throw new Error('Your session has expired. Please log in again.');
    const result = await response.json();
    const member = result.member;
    document.querySelector('#profile-nickname').value = member.nickname || '';
    document.querySelector('#profile-account-name').value = member.withdrawalAccountName || '';
    document.querySelector('#profile-account-number').value = member.withdrawalAccountNumber || '';
    memberLabel.textContent = member.nickname || `Member ${member.memberNumber}`;
    phoneLabel.textContent = `${member.phone} · ${member.memberNumber}`;
    phoneLabel.href = `tel:${member.phone}`;
    avatar.textContent = (member.nickname || member.memberNumber || 'M').slice(0, 2).toUpperCase();
  } catch (error) {
    status.textContent = error.message;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  const saveButton = form.querySelector('button');
  saveButton.disabled = true;
  status.textContent = 'Saving...';
  try {
    const response = await fetch('/api/me/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to save profile.');
    memberLabel.textContent = result.member.nickname;
    avatar.textContent = result.member.nickname.slice(0, 2).toUpperCase();
    status.textContent = 'Profile saved.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    saveButton.disabled = false;
  }
});
