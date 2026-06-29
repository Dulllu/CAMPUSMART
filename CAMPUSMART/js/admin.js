'use strict';
const API = (window.CAMPUSMART_CONFIG?.API) || 'http://localhost:5000/api';
const SERVER = (window.CAMPUSMART_CONFIG?.SERVER) || 'http://localhost:5000';

const $ = id => document.getElementById(id);
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const fmtPrice = n => 'KES ' + Number(n||0).toLocaleString();
const authHdr = () => ({ 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('cm_admin_token')}` });

function showToast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

/* ── Auth ────────────────────────────────────────────── */
async function adminLogin() {
  const email = $('admin-email').value.trim();
  const password = $('admin-password').value;
  $('login-error').style.display = 'none';
  try {
    const r = await fetch(`${API}/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) });
    const d = await r.json();
    if (!r.ok) { $('login-error').textContent = d.error || 'Login failed.'; $('login-error').style.display=''; return; }
    if (d.user.role !== 'admin') { $('login-error').textContent = 'This account does not have admin access.'; $('login-error').style.display=''; return; }
    localStorage.setItem('cm_admin_token', d.token);
    enterAdmin();
  } catch { $('login-error').textContent = 'Could not reach server.'; $('login-error').style.display=''; }
}

function adminLogout() {
  localStorage.removeItem('cm_admin_token');
  $('app').classList.remove('active');
  $('login-screen').style.display = 'flex';
}

function enterAdmin() {
  $('login-screen').style.display = 'none';
  $('app').classList.add('active');
  showAdminPage('overview');
}

/* ── Page nav ────────────────────────────────────────── */
function showAdminPage(page) {
  ['overview','verifications','users','listings','reports','disputes','heatmap','promo'].forEach(p => $(`page-${p}`)?.classList.add('hidden'));
  $(`page-${page}`)?.classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  const titles = { overview:'Overview', verifications:'ID Verifications', users:'Users', listings:'Listings', reports:'Reports', disputes:'Disputes', heatmap:'Activity Heatmap', promo:'Send Promo Email' };
  $('page-title').textContent = titles[page] || page;

  if (page === 'overview') loadOverview();
  if (page === 'verifications') loadVerifications();
  if (page === 'users') loadUsers();
  if (page === 'listings') loadListingsAdmin();
  if (page === 'reports') loadReports();
  if (page === 'disputes') loadDisputes();
  if (page === 'heatmap') loadHeatmap();
}

/* ── Overview ────────────────────────────────────────── */
async function loadOverview() {
  try {
    const r = await fetch(`${API}/admin/overview`, { headers: authHdr() });
    if (r.status === 401 || r.status === 403) return adminLogout();
    const d = await r.json();

    $('overview-stats').innerHTML = `
      <div class="stat-card"><div class="num">${d.totalUsers}</div><div class="lbl">Total Users</div></div>
      <div class="stat-card"><div class="num">${d.newUsers30d}</div><div class="lbl">New Users (30d)</div></div>
      <div class="stat-card"><div class="num">${d.activeListings}</div><div class="lbl">Active Listings</div></div>
      <div class="stat-card"><div class="num">${d.draftListings}</div><div class="lbl">Drafts</div></div>
      <div class="stat-card warn"><div class="num">${d.pendingIds}</div><div class="lbl">Pending ID Reviews</div></div>
      <div class="stat-card danger"><div class="num">${d.openReports}</div><div class="lbl">Open Reports</div></div>
      <div class="stat-card danger"><div class="num">${d.openDisputes}</div><div class="lbl">Open Disputes</div></div>`;

    const maxCount = Math.max(1, ...d.listingsByType.map(t => t.count));
    $('listings-by-type').innerHTML = d.listingsByType.map(t => `
      <div class="heatmap-bar-row">
        <div class="heatmap-label">${esc(t._id || 'unknown')}</div>
        <div class="heatmap-bar-bg"><div class="heatmap-bar-fill" style="width:${(t.count/maxCount*100)}%"></div></div>
        <div class="heatmap-count">${t.count}</div>
      </div>`).join('') || '<p class="empty-row">No data yet.</p>';

    const maxSignup = Math.max(1, ...d.dailySignups.map(s => s.count));
    $('daily-signups').innerHTML = d.dailySignups.map(s => `
      <div class="heatmap-bar-row">
        <div class="heatmap-label">${esc(s._id)}</div>
        <div class="heatmap-bar-bg"><div class="heatmap-bar-fill" style="width:${(s.count/maxSignup*100)}%"></div></div>
        <div class="heatmap-count">${s.count}</div>
      </div>`).join('') || '<p class="empty-row">No signups this week.</p>';
  } catch { showToast('Could not load overview.'); }
}

/* ── Verifications ───────────────────────────────────── */
async function loadVerifications() {
  try {
    const r = await fetch(`${API}/admin/verifications/pending`, { headers: authHdr() });
    const d = await r.json();
    const tbody = $('verifications-table');
    if (!d.users?.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No pending verifications 🎉</td></tr>'; return; }
    tbody.innerHTML = d.users.map(u => `
      <tr>
        <td>${esc(u.name)}</td>
        <td>${esc(u.email)}</td>
        <td>${esc(u.regNumber||'—')}</td>
        <td>${u.studentIdImage ? `<img class="id-thumb" src="${SERVER+u.studentIdImage}" onclick="window.open('${SERVER+u.studentIdImage}','_blank')"/>` : '—'}</td>
        <td>${new Date(u.createdAt).toLocaleDateString()}</td>
        <td>
          <button class="btn-sm approve" onclick="reviewId('${u._id}',true)">Approve</button>
          <button class="btn-sm reject" onclick="reviewId('${u._id}',false)">Reject</button>
        </td>
      </tr>`).join('');
  } catch { showToast('Could not load verifications.'); }
}
async function reviewId(userId, approve) {
  try {
    const r = await fetch(`${API}/admin/verifications/review`, { method:'POST', headers: authHdr(), body: JSON.stringify({ userId, approve }) });
    if (!r.ok) return showToast('Action failed.');
    showToast(approve ? 'ID approved ✅' : 'ID rejected.');
    loadVerifications();
  } catch { showToast('Action failed.'); }
}

/* ── Users ───────────────────────────────────────────── */
async function loadUsers() {
  const search = $('user-search').value.trim();
  try {
    const r = await fetch(`${API}/admin/users?search=${encodeURIComponent(search)}&limit=50`, { headers: authHdr() });
    const d = await r.json();
    const tbody = $('users-table');
    if (!d.users?.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-row">No users found.</td></tr>'; return; }
    tbody.innerHTML = d.users.map(u => `
      <tr>
        <td>${esc(u.name)}</td>
        <td>${esc(u.email)}</td>
        <td>${esc(u.school||'—')}</td>
        <td>${u.strikes||0}</td>
        <td>${u.ratingCount ? '⭐ '+u.ratingAvg.toFixed(1)+' ('+u.ratingCount+')' : '—'}</td>
        <td><span class="badge ${u.isSuspended?'suspended':'active'}">${u.isSuspended?'Suspended':'Active'}</span></td>
        <td><button class="btn-sm ${u.isSuspended?'approve':'reject'}" onclick="toggleSuspend('${u._id}',${!u.isSuspended})">${u.isSuspended?'Unsuspend':'Suspend'}</button></td>
      </tr>`).join('');
  } catch { showToast('Could not load users.'); }
}
async function toggleSuspend(userId, suspend) {
  try {
    const r = await fetch(`${API}/admin/users/suspend`, { method:'POST', headers: authHdr(), body: JSON.stringify({ userId, suspend }) });
    if (!r.ok) return showToast('Action failed.');
    showToast(suspend ? 'User suspended.' : 'User unsuspended.');
    loadUsers();
  } catch { showToast('Action failed.'); }
}

/* ── Listings ────────────────────────────────────────── */
let currentListingTypeFilter = '';
async function loadListingsAdmin() {
  try {
    const r = await fetch(`${API}/admin/listings?listingType=${currentListingTypeFilter}&limit=50`, { headers: authHdr() });
    const d = await r.json();
    const tbody = $('listings-table');
    if (!d.listings?.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No listings found.</td></tr>'; return; }
    tbody.innerHTML = d.listings.map(l => `
      <tr>
        <td>${esc(l.title)}</td>
        <td>${esc(l.listingType)}</td>
        <td>${esc(l.seller?.name||'Unknown')}</td>
        <td>${fmtPrice(l.price)}</td>
        <td><span class="badge ${l.isActive?'active':'suspended'}">${l.isActive?'Active':'Removed'}</span></td>
        <td>${l.isActive ? `<button class="btn-sm reject" onclick="removeListing('${l._id}')">Remove</button>` : '—'}</td>
      </tr>`).join('');
  } catch { showToast('Could not load listings.'); }
}
function filterListingsAdmin(type, btn) {
  currentListingTypeFilter = type;
  document.querySelectorAll('#listing-type-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadListingsAdmin();
}
async function removeListing(id) {
  if (!confirm('Remove this listing from public view?')) return;
  try {
    const r = await fetch(`${API}/admin/listings/${id}/remove`, { method:'POST', headers: authHdr() });
    if (!r.ok) return showToast('Action failed.');
    showToast('Listing removed.');
    loadListingsAdmin();
  } catch { showToast('Action failed.'); }
}

/* ── Reports ─────────────────────────────────────────── */
async function loadReports() {
  try {
    const r = await fetch(`${API}/admin/reports`, { headers: authHdr() });
    const d = await r.json();
    const tbody = $('reports-table');
    if (!d.reports?.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No reports.</td></tr>'; return; }
    tbody.innerHTML = d.reports.map(rp => `
      <tr>
        <td>${esc(rp.reportedUser?.name||'Unknown')}</td>
        <td>${esc(rp.reason)}</td>
        <td>${esc(rp.listing?.title||'—')}</td>
        <td>${esc(rp.reportedBy?.name||'Anonymous')}</td>
        <td><span class="badge ${rp.status==='resolved'?'approved':'pending'}">${esc(rp.status)}</span></td>
        <td>${rp.status!=='resolved' ? `
          <button class="btn-sm outline" onclick="resolveReport('${rp._id}','dismiss')">Dismiss</button>
          <button class="btn-sm approve" onclick="resolveReport('${rp._id}','warn')">Warn</button>
          <button class="btn-sm reject" onclick="resolveReport('${rp._id}','suspend')">Suspend</button>` : '—'}</td>
      </tr>`).join('');
  } catch { showToast('Could not load reports.'); }
}
async function resolveReport(reportId, action) {
  try {
    const r = await fetch(`${API}/admin/reports/resolve`, { method:'POST', headers: authHdr(), body: JSON.stringify({ reportId, action }) });
    if (!r.ok) return showToast('Action failed.');
    showToast('Report resolved.');
    loadReports();
  } catch { showToast('Action failed.'); }
}

/* ── Disputes ────────────────────────────────────────── */
async function loadDisputes() {
  try {
    const r = await fetch(`${API}/disputes/admin`, { headers: authHdr() });
    const d = await r.json();
    const tbody = $('disputes-table');
    if (!d.disputes?.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No disputes.</td></tr>'; return; }
    tbody.innerHTML = d.disputes.map(dp => `
      <tr>
        <td>${esc(dp.listing?.title||'—')}</td>
        <td>${esc(dp.raisedBy?.name||'Unknown')}</td>
        <td>${esc(dp.against?.name||'Unknown')}</td>
        <td>${esc(dp.reason.substring(0,60))}</td>
        <td><span class="badge ${dp.status==='open'?'pending':dp.status.includes('resolved')?'approved':'rejected'}">${esc(dp.status)}</span></td>
        <td>${dp.status==='open'||dp.status==='under_review' ? `
          <button class="btn-sm approve" onclick="resolveDispute('${dp._id}','resolved_favor_raiser')">Favor Raiser</button>
          <button class="btn-sm reject" onclick="resolveDispute('${dp._id}','resolved_favor_against')">Favor Other</button>
          <button class="btn-sm outline" onclick="resolveDispute('${dp._id}','dismissed')">Dismiss</button>` : '—'}</td>
      </tr>`).join('');
  } catch { showToast('Could not load disputes.'); }
}
async function resolveDispute(disputeId, status) {
  try {
    const r = await fetch(`${API}/disputes/admin/resolve`, { method:'POST', headers: authHdr(), body: JSON.stringify({ disputeId, status }) });
    if (!r.ok) return showToast('Action failed.');
    showToast('Dispute resolved.');
    loadDisputes();
  } catch { showToast('Action failed.'); }
}

/* ── Heatmap ─────────────────────────────────────────── */
function heatmapBars(data, containerId) {
  const max = Math.max(1, ...data.map(d => d.count));
  $(containerId).innerHTML = data.length ? data.map(d => `
    <div class="heatmap-bar-row">
      <div class="heatmap-label">${esc(d._id || 'Unknown')}</div>
      <div class="heatmap-bar-bg"><div class="heatmap-bar-fill" style="width:${(d.count/max*100)}%"></div></div>
      <div class="heatmap-count">${d.count}</div>
    </div>`).join('') : '<p class="empty-row">No data yet.</p>';
}
async function loadHeatmap() {
  try {
    const r = await fetch(`${API}/admin/heatmap`, { headers: authHdr() });
    const d = await r.json();
    heatmapBars(d.byHostel, 'heatmap-hostel');
    heatmapBars(d.bySchool, 'heatmap-school');
    heatmapBars(d.byCategory, 'heatmap-category');
  } catch { showToast('Could not load heatmap.'); }
}

/* ── Promo Blast ─────────────────────────────────────── */
async function loadSubscriberCount() {
  try {
    const secret = localStorage.getItem('cm_admin_secret') || '';
    const r = await fetch(`${API}/auth/subscribers/count`, { headers: { 'x-admin-secret': secret } });
    if (r.ok) {
      const d = await r.json();
      const el = $('subscriber-count');
      if (el) el.textContent = `${d.count} active subscriber${d.count !== 1 ? 's' : ''}`;
    }
  } catch {}
}

async function sendPromoBlastAdmin() {
  const subject  = $('promo-subject').value.trim();
  const headline = $('promo-headline').value.trim();
  const body     = $('promo-body').value.trim();
  const ctaText  = $('promo-cta-text').value.trim() || 'Browse Now';
  const ctaLink  = $('promo-cta-link').value.trim() || SERVER;
  if (!subject || !headline || !body) return showToast('Fill in subject, headline and body first.');
  
  const secret = localStorage.getItem('cm_admin_secret') || prompt('Enter ADMIN_SECRET:') || '';
  if (!secret) return showToast('Admin secret required.', 'error');
  localStorage.setItem('cm_admin_secret', secret);

  // Load count first so admin knows who they're emailing
  let count = '?';
  try {
    const cr = await fetch(`${API}/auth/subscribers/count`, { headers: { 'x-admin-secret': secret } });
    if (cr.ok) { const cd = await cr.json(); count = cd.count; }
  } catch {}

  if (!confirm(`Send this email to ALL ${count} active subscriber${count !== 1 ? 's' : ''}?\n\nSubject: ${subject}`)) return;
  
  const btn = document.querySelector('[onclick="sendPromoBlastAdmin()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  
  try {
    const r = await fetch(`${API}/auth/promo-blast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
      body: JSON.stringify({ subject, headline, body, ctaText, ctaLink }),
    });
    const d = await r.json();
    if (!r.ok) return showToast(d.error || 'Send failed.', 'error');
    showToast(`✅ Sent to ${d.sent} subscribers! (${d.failed} failed)`);
    // Clear form
    ['promo-subject','promo-headline','promo-body','promo-cta-text','promo-cta-link'].forEach(id=>$(id)&&($(id).value=''));
  } catch { showToast('Send failed — check your connection.', 'error'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Send to All Subscribers'; } }
}

/* ── Init ────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('cm_admin_token')) enterAdmin();
});
