/* ═══════════════════════════════════════════════════════
   CampusMart v5 — Premium app.js
   All backend API calls unchanged
   ═══════════════════════════════════════════════════════ */
'use strict';

const API    = (window.CAMPUSMART_CONFIG?.API)    || 'http://localhost:5000/api';
const SERVER = (window.CAMPUSMART_CONFIG?.SERVER) || 'http://localhost:5000';

/* ── State ───────────────────────────────────────────── */
let currentUser    = null;
let allListings    = [];
let filteredList   = [];
let currentPage    = 1;
const PAGE_SIZE    = 12;
let currentCat     = 'all';
let currentSort    = 'newest';
let currentDetail  = null;
let socket         = null;
let conversations  = {};
let activeChatId   = null;
let notifications  = JSON.parse(localStorage.getItem('cm_notifs')    || '[]');
let watchlist      = JSON.parse(localStorage.getItem('cm_watchlist') || '[]');
let reactions      = JSON.parse(localStorage.getItem('cm_reactions') || '{}');
let seenStories    = JSON.parse(localStorage.getItem('cm_seen_stories') || '[]');
let storyListings  = [];
let storyIndex     = 0;
let storyTimer     = null;
let searchDebounce = null;
let otpIsNewUser   = false;
let uploadedImages = [];
let editingListing = null;
let activeCampus   = 'all';
let liveCheckInterval = null;
let bsGalleryIndex = 0;

/* ── Utils ───────────────────────────────────────────── */
const $        = id => document.getElementById(id);
const esc      = s  => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmtPrice = n  => 'KES ' + Number(n||0).toLocaleString();
const authHdr  = () => ({ 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('cm_token')}` });
const isVerified = u => u && u.phone && u.campus && u.bio;

const timeAgo = d => {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60)     return 'just now';
  if (s < 3600)   return Math.floor(s/60)    + 'm ago';
  if (s < 86400)  return Math.floor(s/3600)  + 'h ago';
  if (s < 604800) return Math.floor(s/86400) + 'd ago';
  return new Date(d).toLocaleDateString('en-KE', {day:'numeric',month:'short'});
};

const catEmoji = c => ({books:'📚',electronics:'💻',clothes:'👕',food:'🍔',services:'🛠',other:'📦'}[c]||'📦');
const catImage = c => ({
  books:       'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=400&h=300&fit=crop',
  electronics: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400&h=300&fit=crop',
  clothes:     'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=400&h=300&fit=crop',
  food:        'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=400&h=300&fit=crop',
  services:    'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=400&h=300&fit=crop',
  other:       'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&h=300&fit=crop',
}[c] || 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&h=300&fit=crop');

/* ── Toast ───────────────────────────────────────────── */
function showToast(msg, type='info', dur=3500) {
  const c = $('toast-container'); if (!c) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  const icons = {success:'✅',error:'❌',warning:'⚠️',info:'ℹ️'};
  t.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span>${esc(msg)}</span>`;
  c.appendChild(t);
  requestAnimationFrame(() => { t.offsetHeight; t.classList.add('show'); });
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, dur);
}

/* ── Loader ──────────────────────────────────────────── */
function hideLoader() {
  const l = $('app-loader'); if (!l) return;
  setTimeout(() => {
    l.classList.add('fade-out');
    setTimeout(() => l.classList.add('gone'), 460);
  }, 400);
}

/* ── Cookie ──────────────────────────────────────────── */
function initCookieBanner() {
  if (localStorage.getItem('cm_cookie_consent')) return;
  setTimeout(() => $('cookie-banner')?.classList.add('visible'), 1800);
}
function acceptCookie()  { localStorage.setItem('cm_cookie_consent','accepted'); $('cookie-banner').classList.remove('visible'); }
function dismissCookie() { localStorage.setItem('cm_cookie_consent','declined'); $('cookie-banner').classList.remove('visible'); }

/* ── Onboarding ──────────────────────────────────────── */
function showOnboarding() {
  if (localStorage.getItem('cm_onboarded')) return;
  $('onboarding-overlay')?.classList.remove('hidden');
}
function dismissOnboarding() {
  localStorage.setItem('cm_onboarded','1');
  $('onboarding-overlay')?.classList.add('hidden');
}

/* ── Theme ───────────────────────────────────────────── */
function loadTheme() {
  const t = localStorage.getItem('cm_theme') ||
    (window.matchMedia?.('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  applyTheme(t);
}
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  $('theme-light')?.classList.toggle('active', t==='light');
  $('theme-dark')?.classList.toggle('active',  t==='dark');
  const btn = $('theme-toggle-btn');
  if (btn) btn.innerHTML = t==='dark' ? '<i class="fa fa-sun"></i>' : '<i class="fa fa-moon"></i>';
}
function setTheme(t) { localStorage.setItem('cm_theme', t); applyTheme(t); if (currentUser) fetch(`${API}/auth/me`,{method:'PUT',headers:authHdr(),body:JSON.stringify({theme:t})}).catch(()=>{}); }
function toggleTheme() { const t = document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark'; setTheme(t); }

/* ── Auth Tabs ───────────────────────────────────────── */
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  $(`tab-${tab}`)?.classList.add('active');
  $('auth-tab-email-otp').style.display = tab==='email-otp' ? '' : 'none';
  $('auth-tab-password').style.display  = tab==='password'  ? '' : 'none';
}
function switchAuth(panel) {
  ['signin-panel','signup-panel','forgot-panel'].forEach(p => $( p)?.classList.add('hidden'));
  $(`${panel}-panel`)?.classList.remove('hidden');
}

/* ── Password Strength ───────────────────────────────── */
function updatePasswordStrength(val) {
  const fill = $('pw-strength-fill'), lbl = $('pw-strength-label'); if (!fill||!lbl) return;
  let s=0;
  if(val.length>=8) s++;
  if(/[A-Z]/.test(val)) s++;
  if(/[0-9]/.test(val)) s++;
  if(/[^A-Za-z0-9]/.test(val)) s++;
  const cols=['','#ef4444','#f59e0b','#3b82f6','#10b981'];
  const lbls=['','Weak','Fair','Good','Strong'];
  fill.style.width=s*25+'%'; fill.style.background=cols[s];
  lbl.textContent=s?lbls[s]:''; lbl.style.color=cols[s];
}

/* ── Toggle Password Visibility ──────────────────────── */
function togglePass(id, btn) {
  const inp=$(id); if(!inp) return;
  inp.type=inp.type==='password'?'text':'password';
  btn.innerHTML=inp.type==='password'?'<i class="fa fa-eye"></i>':'<i class="fa fa-eye-slash"></i>';
}

/* ── Email OTP Login ─────────────────────────────────── */
function formatOTPInput(inp) {
  inp.value = inp.value.replace(/\D/g,'').substring(0,6);
  if (inp.value.length===6) doVerifyLoginOTP();
}

async function doSendLoginOTP() {
  const email = $('otp-login-email')?.value.trim();
  if (!email) return showToast('Enter your email address.','error');
  const btn = $('send-otp-btn');
  btn.disabled=true; btn.innerHTML='<i class="fa fa-spinner fa-spin"></i> Sending…';
  try {
    const r = await fetch(`${API}/auth/email-otp/send`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
    const d = await r.json();
    if(!r.ok) { showToast(d.error||'Could not send code.','error'); return; }
    otpIsNewUser = d.isNewUser;
    $('otp-verify-step').style.display = '';
    $('send-otp-btn').style.display    = 'none';
    $('otp-login-email').disabled      = true;
    $('otp-name-field').style.display        = d.isNewUser ? '' : 'none';
    $('otp-newsletter-label').style.display  = d.isNewUser ? '' : 'none';
    showToast(`Code sent to ${email} 📬`,'success');
    setTimeout(()=>$('otp-code-input')?.focus(),200);
  } catch { showToast('Cannot reach server.','error'); }
  finally { btn.disabled=false; btn.innerHTML='<i class="fa fa-paper-plane"></i> Send Sign-In Code'; }
}

async function doVerifyLoginOTP() {
  const email     = $('otp-login-email')?.value.trim();
  const otp       = $('otp-code-input')?.value.trim();
  const name      = $('otp-name')?.value.trim();
  const subscribe = $('otp-subscribe')?.checked||false;
  if(!otp||otp.length!==6) return showToast('Enter the 6-digit code.','error');
  if(otpIsNewUser&&!name)  return showToast('Enter your full name.','error');
  const btn=$('verify-otp-btn');
  btn.disabled=true; btn.innerHTML='<i class="fa fa-spinner fa-spin"></i> Verifying…';
  try {
    const r=await fetch(`${API}/auth/email-otp/verify`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,otp,name,subscribeNewsletter:subscribe})});
    const d=await r.json();
    if(!r.ok){showToast(d.error||'Verification failed.','error');if(d.needsName){$('otp-name-field').style.display='';$('otp-name')?.focus();}return;}
    localStorage.setItem('cm_token',d.token); localStorage.setItem('cm_user',JSON.stringify(d.user));
    currentUser=d.user; loadLocalData(); enterMarket();
    if(d.isNewUser){showToast('Welcome to CampusMart! 🎉','success',4000);showOnboarding();}
    else showToast('Signed in! 👋','success');
  } catch {showToast('Cannot reach server.','error');}
  finally{btn.disabled=false;btn.innerHTML='<i class="fa fa-check-circle"></i> Verify & Sign In';}
}

function resetOTPFlow() {
  $('otp-verify-step').style.display='none';
  $('send-otp-btn').style.display='';
  $('otp-login-email').disabled=false;
  $('otp-login-email').value='';
  if($('otp-code-input'))$('otp-code-input').value='';
  if($('otp-name'))$('otp-name').value='';
  otpIsNewUser=false;
}

/* ── Password Login ──────────────────────────────────── */
async function doLogin() {
  const email=$('login-email')?.value.trim(), pass=$('login-pass')?.value;
  if(!email||!pass) return showToast('Enter email and password.','error');
  const btn=$('login-btn'); btn.disabled=true; btn.innerHTML='<i class="fa fa-spinner fa-spin"></i> Signing in…';
  try {
    const r=await fetch(`${API}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pass})});
    const d=await r.json();
    if(!r.ok){showToast(d.error||'Login failed.','error');return;}
    localStorage.setItem('cm_token',d.token); localStorage.setItem('cm_user',JSON.stringify(d.user));
    currentUser=d.user; loadLocalData(); enterMarket();
  } catch {showToast('Cannot reach server.','error');}
  finally{btn.disabled=false;btn.innerHTML='<i class="fa fa-sign-in-alt"></i> Sign In';}
}

/* ── Register ────────────────────────────────────────── */
async function doRegister() {
  const name=$('reg-name')?.value.trim(),email=$('reg-email')?.value.trim(),phone=$('reg-phone')?.value.trim(),pass=$('reg-pass')?.value;
  if(!name||!email||!pass) return showToast('Name, email and password required.','error');
  if(pass.length<8) return showToast('Password must be at least 8 characters.','error');
  if(!/[A-Z]/.test(pass)||!/[0-9]/.test(pass)) return showToast('Password needs 1 uppercase + 1 number.','error');
  const btn=$('register-btn'); btn.disabled=true; btn.innerHTML='<i class="fa fa-spinner fa-spin"></i> Creating…';
  try {
    const r=await fetch(`${API}/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,password:pass,phone})});
    const d=await r.json();
    if(!r.ok){showToast(d.error||'Registration failed.','error');return;}
    localStorage.setItem('cm_token',d.token); localStorage.setItem('cm_user',JSON.stringify(d.user));
    currentUser=d.user; loadLocalData(); enterMarket(); showOnboarding();
    showToast('Welcome to CampusMart! 🎉','success');
  } catch {showToast('Cannot reach server.','error');}
  finally{btn.disabled=false;btn.innerHTML='<i class="fa fa-user-plus"></i> Create Account';}
}

/* ── Forgot Password ─────────────────────────────────── */
async function doForgotPassword() {
  const email=$('forgot-email')?.value.trim();
  if(!email) return showToast('Enter your email.','error');
  const btn=$('forgot-btn'); btn.disabled=true; btn.innerHTML='<i class="fa fa-spinner fa-spin"></i> Sending…';
  try {
    const r=await fetch(`${API}/auth/forgot-password`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
    const d=await r.json();
    if(!r.ok){showToast(d.error||'Failed.','error');return;}
    showToast(d.message||'Reset code sent!','success');
  } catch {showToast('Cannot reach server.','error');}
  finally{btn.disabled=false;btn.innerHTML='<i class="fa fa-paper-plane"></i> Send Reset Code';}
}

/* ── Google Auth ─────────────────────────────────────── */
async function doGoogleAuth() {
  try {
    const p=await fetch(`${API}/auth/google`,{method:'HEAD'}).catch(()=>null);
    if(p&&p.status===503){showToast('Google Sign-In not configured.','warning');return;}
  } catch {}
  window.location.href=`${API}/auth/google`;
}

async function doFacebookAuth() {
  try {
    const p=await fetch(`${API}/auth/facebook`,{method:'HEAD'}).catch(()=>null);
    if(p&&p.status===503){showToast('Facebook Sign-In not configured.','warning');return;}
  } catch {}
  window.location.href=`${API}/auth/facebook`;
}

async function doAppleAuth() {
  try {
    const p=await fetch(`${API}/auth/apple`,{method:'HEAD'}).catch(()=>null);
    if(p&&p.status===503){showToast('Sign in with Apple is not configured.','warning');return;}
  } catch {}
  window.location.href=`${API}/auth/apple`;
}

function handleOAuthErrorParam() {
  const params = new URLSearchParams(window.location.search);
  const err = params.get('error');
  if (!err) return;
  history.replaceState(null, '', window.location.pathname);
  const messages = {
    oauth_auth_failed:        'Sign-in was cancelled or failed. Please try again.',
    google_not_configured:    'Google Sign-In is not available right now.',
    google_failed:            'Google Sign-In failed. Please try again.',
    facebook_not_configured:  'Facebook Sign-In is not available right now.',
    facebook_failed:          'Facebook Sign-In failed. Please try again.',
    apple_not_configured:     'Sign in with Apple is not available right now.',
    apple_failed:             'Sign in with Apple failed. Please try again.',
  };
  showToast(messages[err] || 'Sign-in failed. Please try again.', 'error', 5000);
}

function handleGoogleRedirect() {
  const hash=window.location.hash;
  if(!hash.includes('google_token=')) return;
  const token=hash.split('google_token=')[1]?.split('&')[0];
  history.replaceState(null,'',window.location.pathname);
  if(!token) return;
  localStorage.setItem('cm_token',token);
  fetch(`${API}/auth/me`,{headers:{Authorization:`Bearer ${token}`}})
    .then(r=>r.json()).then(d=>{
      if(d.user){
        currentUser=d.user;localStorage.setItem('cm_user',JSON.stringify(d.user));loadLocalData();enterMarket();
        const providerNames={google:'Google',facebook:'Facebook',apple:'Apple'};
        const provider=providerNames[d.user.authProvider]||'your account';
        showToast(`Signed in with ${provider}! 🎉`,'success');
      }
    }).catch(()=>showToast('Sign-in succeeded but profile failed. Refresh.','warning'));
}

/* ── Logout ──────────────────────────────────────────── */
function doLogout() {
  socket?.disconnect(); socket=null;
  clearInterval(liveCheckInterval);
  localStorage.removeItem('cm_token'); localStorage.removeItem('cm_user');
  currentUser=null; allListings=[]; filteredList=[]; conversations={};
  $('market-page').classList.remove('active');
  $('login-page').classList.add('active');
  switchAuth('signin'); resetOTPFlow(); hideLoader();
  showToast('Logged out.','info');
}

/* ── Enter Market ────────────────────────────────────── */
function enterMarketBase() {
  $('login-page').classList.remove('active');
  $('market-page').classList.add('active');
  populateSafeZones(); updateUserUI(); loadListings();
  loadConversations(); initSocket(); updateBadges();
  showPageAnimated('listings');
  setTimeout(()=>{const sb=$('safety-banner');if(sb)setTimeout(()=>sb.style.display='none',8000);},0);
}

/* ── User UI ─────────────────────────────────────────── */
function updateUserUIBase() {
  if(!currentUser) return;
  const init=(currentUser.name||'S')[0].toUpperCase();
  ['user-avatar','sidebar-avatar','profile-avatar-big'].forEach(id=>{
    const el=$(id); if(!el) return;
    if(currentUser.avatar){
      const src=currentUser.avatar.startsWith('/')?SERVER+currentUser.avatar:currentUser.avatar;
      if(id==='user-avatar'||id==='sidebar-avatar'){
        el.style.backgroundImage=`url(${src})`;el.style.backgroundSize='cover';el.style.backgroundPosition='center';el.textContent='';
      } else {
        let img=el.querySelector('img'); if(!img){img=document.createElement('img');el.appendChild(img);}
        img.src=src; img.alt='avatar';
      }
    } else { el.textContent=init; el.style.backgroundImage=''; }
  });
  $('sidebar-name')  &&($('sidebar-name').textContent  =currentUser.name||'');
  $('sidebar-email') &&($('sidebar-email').textContent =currentUser.email||'');
  $('profile-name')  &&($('profile-name').textContent  =currentUser.name||'');
  $('profile-email') &&($('profile-email').textContent =currentUser.email||'');
  $('profile-campus')&&($('profile-campus').textContent=currentUser.campus?`📍 ${currentUser.campus}`:'');
  $('settings-email')&&($('settings-email').textContent=currentUser.email||'');
  $('edit-name')  &&($('edit-name').value   =currentUser.name  ||'');
  $('edit-phone') &&($('edit-phone').value  =currentUser.phone ||'');
  $('edit-campus')&&($('edit-campus').value =currentUser.campus||'');
  $('edit-bio')   &&($('edit-bio').value    =currentUser.bio   ||'');
  if(currentUser.createdAt){
    const days=Math.floor((Date.now()-new Date(currentUser.createdAt))/86400000);
    $('profile-joined-days')&&($('profile-joined-days').textContent=days);
  }
}

/* ── Page Navigation ─────────────────────────────────── */
function showPageAnimatedBase(page) {
  const views=['listings','offers','stores','recent','profile','watchlist','notifications','messages','settings','help','about','legal'];
  views.forEach(v=>{const el=$(`view-${v}`);if(el)el.style.display='none';});
  const target=$(`view-${page}`);
  if(target){target.style.display='';target.classList.remove('view-transition');void target.offsetWidth;target.classList.add('view-transition');}
  if(page==='profile')       loadProfilePage();
  if(page==='offers')        loadOffers();
  if(page==='stores')        loadStores();
  if(page==='recent')        loadRecentlyViewed();
  if(page==='watchlist')     loadWatchlist();
  if(page==='notifications') renderNotifications();
  if(page==='messages')      renderConversationList();
  closeSidebar();
}

function goHome() {
  showPageAnimated('listings');
  document.querySelectorAll('.bnav-item').forEach(b=>b.classList.remove('active'));
  $('bnav-home')?.classList.add('active');
  document.querySelectorAll('.nav-pill').forEach(p=>p.classList.remove('active'));
  $('pill-home')?.classList.add('active');
}
function bnavGo(page,btnId) { showPageAnimated(page); document.querySelectorAll('.bnav-item').forEach(b=>b.classList.remove('active')); $(btnId)?.classList.add('active'); }

/* ── Top pill nav (desktop primary destinations) ──────── */
function navPillGo(page, pillId) {
  showPageAnimated(page);
  document.querySelectorAll('.nav-pill').forEach(p => p.classList.remove('active'));
  $(pillId)?.classList.add('active');
}

/* ── Mobile bottom-pill "Search" shortcut ─────────────── */
function focusMobileSearch() {
  goHome();
  setTimeout(() => $('search-input')?.focus(), 250);
}
function showLegal(tab) { showPageAnimated('legal'); switchLegal(tab, document.querySelector(`.legal-tab[onclick*="${tab}"]`)); }
function switchLegal(tab,btn) {
  document.querySelectorAll('.legal-content').forEach(c=>c.classList.remove('active'));
  document.querySelectorAll('.legal-tab').forEach(b=>b.classList.remove('active'));
  $(`legal-${tab}`)?.classList.add('active'); btn?.classList.add('active');
}

/* ── Sidebar ─────────────────────────────────────────── */
function openSidebar()  { $('sidebar')?.classList.add('open'); $('sidebar-overlay')?.classList.add('active'); document.body.style.overflow='hidden'; }
function closeSidebar() { $('sidebar')?.classList.remove('open'); $('sidebar-overlay')?.classList.remove('active'); document.body.style.overflow=''; }

/* ── Safe Zones ──────────────────────────────────────── */
const SAFE_ZONES=['Main Library Entrance','Student Centre Lobby','Admin Block Ground Floor','Campus Café','ICT Centre Reception','Engineering Common Room','Social Sciences Atrium','School Gate A'];
function populateSafeZones() {
  const sel=$('item-location'); if(!sel||sel.options.length>1) return;
  SAFE_ZONES.forEach(z=>{const o=document.createElement('option');o.value=z;o.textContent=`📍 ${z}`;sel.appendChild(o);});
  const list=$('safe-zones-list');
  if(list) list.innerHTML=SAFE_ZONES.map(z=>`<div class="safe-zone-item"><i class="fa fa-shield-alt"></i>${esc(z)}</div>`).join('');
}

/* ── Load Listings ───────────────────────────────────── */
async function loadListings() {
  renderSkeletons('listings-grid',8);
  const pri=$('pull-refresh-indicator');
  try {
    const r=await fetch(`${API}/listings?limit=100`,{headers:authHdr()});
    const d=await r.json();
    allListings=d.listings||[]; filteredList=[...allListings]; currentPage=1;
    renderListings(); loadStats(); loadAiPicks(); buildStories(); buildCampusFilter(); startLiveFeedCheck();
  } catch {
    showToast('Could not load listings.','error');
    const g=$('listings-grid'); if(g) g.innerHTML='';
  } finally {
    if(pri) pri.classList.remove('visible');
  }
}

function renderSkeletons(gridId,count) {
  const g=$(gridId); if(!g) return;
  g.innerHTML=Array(count).fill('').map(()=>`<div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-body"><div class="skeleton-line" style="height:13px;width:80%"></div><div class="skeleton-line" style="height:11px;width:50%;margin-top:4px"></div><div class="skeleton-line" style="height:17px;width:40%;margin-top:6px"></div></div></div>`).join('');
}

function renderListings() {
  const grid=$('listings-grid'), empty=$('empty-state'), btn=$('load-more-wrap');
  if(!grid) return;
  const slice=filteredList.slice(0,currentPage*PAGE_SIZE);
  if(!filteredList.length){grid.innerHTML='';empty.style.display='';btn.style.display='none';return;}
  empty.style.display='none';
  grid.innerHTML=slice.map(l=>cardHTML(l)).join('');
  btn.style.display=filteredList.length>currentPage*PAGE_SIZE?'':'none';
  const lbl=$('listing-count-label');
  if(lbl) lbl.textContent=`${filteredList.length} item${filteredList.length!==1?'s':''}`;
  initLazyImages();
}

function loadMore() { currentPage++; renderListings(); }

function cardHTML(l) {
  const isMine=currentUser&&(l.seller?._id||l.seller)===currentUser._id;
  const saved=watchlist.includes(l._id);
  const img=l.images?.[0];
  const imgSrc=img?(img.startsWith('/')?SERVER:'')+img:'';
  const budget=l.price<500?'<span class="card-budget-badge">Budget</span>':'';
  const verif=isVerified(l.seller)?'<span class="verified-seller-badge">✓</span>':'';
  return `
  <div class="listing-card${l.isSoldOut?' sold-out':''}" onclick="openDetail('${esc(l._id)}')">
    <div class="card-img-wrap">
      ${imgSrc?`<img class="card-img lazy" data-src="${esc(imgSrc)}" src="" alt="${esc(l.title)}" loading="lazy"/>`:`<img class="card-img lazy" data-src="${catImage(l.category)}" src="" alt="${esc(l.category)}" loading="lazy"/>`}
      ${l.isPromo?`<div class="promo-badge">${esc(l.promoLabel||'OFFER')}</div>`:''}
      ${l.isSoldOut?'<div class="sold-out-overlay">SOLD OUT</div>':''}
      <button class="card-heart${saved?' saved':''}" onclick="event.stopPropagation();toggleWatchlistById('${esc(l._id)}')" aria-label="Save"><i class="fa fa-heart"></i></button>
    </div>
    <div class="card-body">
      <div class="card-title">${esc(l.title)}</div>
      <div class="card-time">${timeAgo(l.createdAt)}</div>
      <div class="card-price">${fmtPrice(l.price)}${budget}</div>
      <div class="card-meta"><span class="card-cat">${catEmoji(l.category)} ${esc(l.category)}</span>${verif}${isMine?'<span class="card-mine-badge">Mine</span>':''}</div>
    </div>
  </div>`;
}

/* ── Lazy Images ─────────────────────────────────────── */
function initLazyImages() {
  const imgs=document.querySelectorAll('img.lazy');
  if('IntersectionObserver' in window){
    const obs=new IntersectionObserver(entries=>{
      entries.forEach(e=>{
        if(e.isIntersecting){const img=e.target;img.src=img.dataset.src;img.classList.remove('lazy');img.style.opacity='0';img.style.transition='opacity .35s';img.onload=()=>img.style.opacity='1';obs.unobserve(img);}
      });
    },{rootMargin:'120px'});
    imgs.forEach(img=>obs.observe(img));
  } else imgs.forEach(img=>img.src=img.dataset.src);
}

/* ── AI Picks ────────────────────────────────────────── */
function loadAiPicks() {
  const carousel=$('ai-carousel'),section=$('ai-picks-section'); if(!carousel||!section) return;
  if(!allListings.length){section.style.display='none';return;}
  section.style.display='';
  const promos=allListings.filter(l=>l.isPromo&&!l.isSoldOut).slice(0,3);
  const cheap=[...allListings].filter(l=>!l.isSoldOut).sort((a,b)=>a.price-b.price).slice(0,3);
  const newest=allListings.filter(l=>!l.isSoldOut).slice(0,4);
  const picks=[...new Map([...promos,...cheap,...newest].map(l=>[l._id,l])).values()].slice(0,10);
  carousel.innerHTML=picks.map(l=>{
    const img=l.images?.[0],imgSrc=img?(img.startsWith('/')?SERVER:'')+img:'';
    return `<div class="ai-card" onclick="openDetail('${esc(l._id)}')">
      ${imgSrc?`<img class="ai-card-img lazy" data-src="${esc(imgSrc)}" src="" alt="${esc(l.title)}" loading="lazy"/>`:`<img class="ai-card-img lazy" data-src="${catImage(l.category)}" src="" alt="${esc(l.category)}" loading="lazy"/>`}
      <div class="ai-card-body"><div class="ai-card-title">${esc(l.title)}</div><div class="ai-card-price">${fmtPrice(l.price)}</div><div class="ai-card-tag">${catEmoji(l.category)} ${esc(l.category)} · ${timeAgo(l.createdAt)}</div></div>
    </div>`;
  }).join('');
  initLazyImages();
}
function refreshAiPicks(){allListings=allListings.sort(()=>Math.random()-.5);loadAiPicks();allListings.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));}

/* ── Stats ───────────────────────────────────────────── */
async function loadStats(){
  try{const r=await fetch(`${API}/listings/stats`,{headers:authHdr()});const d=await r.json();$('stat-count')&&($('stat-count').textContent=d.totalListings||allListings.length);$('stat-sellers')&&($('stat-sellers').textContent=d.totalSellers||'—');$('auth-stat-listings')&&($('auth-stat-listings').textContent=(d.totalListings||0)+'+ listings');}catch{}
}

/* ── Filter / Sort / Search ──────────────────────────── */
function filterCategory(cat) {
  currentCat=cat; currentPage=1;
  filteredList=cat==='all'?[...allListings]:allListings.filter(l=>l.category===cat);
  if(activeCampus!=='all') filteredList=filteredList.filter(l=>(l.seller?.campus||'')===activeCampus);
  applySortToFiltered(); renderListings();
  document.querySelectorAll('.cat-pill').forEach(c=>c.classList.toggle('active',c.dataset.cat===cat));
  document.querySelectorAll('.snav-item[id^="snav-"]').forEach(n=>n.classList.remove('active'));
  $(`snav-${cat}`)?.classList.add('active');
  $('section-label')&&($('section-label').textContent=cat==='all'?'All Listings':cat.charAt(0).toUpperCase()+cat.slice(1));
}

function sortListings(val){currentSort=val;currentPage=1;applySortToFiltered();renderListings();}

function applySortToFiltered(){
  if(currentSort==='price-low') filteredList.sort((a,b)=>a.price-b.price);
  else if(currentSort==='price-high') filteredList.sort((a,b)=>b.price-a.price);
  else filteredList.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
}

function searchListings(){
  clearTimeout(searchDebounce);
  const q=$('search-input')?.value.trim().toLowerCase()||'';
  const clearBtn=$('search-clear'); if(clearBtn) clearBtn.style.display=q?'':'none';
  showSearchSuggestions(q);
  searchDebounce=setTimeout(()=>{
    currentPage=1;
    filteredList=allListings.filter(l=>!q||l.title.toLowerCase().includes(q)||l.desc?.toLowerCase().includes(q)||l.category.toLowerCase().includes(q));
    if(activeCampus!=='all') filteredList=filteredList.filter(l=>(l.seller?.campus||'')===activeCampus);
    applySortToFiltered(); renderListings(); hideSearchSuggestions();
  },300);
}

function clearSearch(){$('search-input')&&($('search-input').value='');searchListings();}
function onSearchKeydown(e){if(e.key==='Escape'){clearSearch();}if(e.key==='Enter'){clearTimeout(searchDebounce);searchListings();}}

function showSearchSuggestions(q){
  const box=$('search-suggestions'); if(!box) return;
  if(!q||q.length<2){box.style.display='none';return;}
  const matches=allListings.filter(l=>l.title.toLowerCase().includes(q)||l.category.toLowerCase().includes(q)).slice(0,7);
  if(!matches.length){box.style.display='none';return;}
  box.innerHTML=matches.map(l=>`<div class="sug-item" onclick="selectSuggestion('${esc(l._id)}','${esc(l.title)}')"><i class="fa fa-search"></i><span>${esc(l.title)}</span><span class="sug-cat">${catEmoji(l.category)} ${esc(l.category)}</span></div>`).join('');
  box.style.display='';
}
function hideSearchSuggestions(){$('search-suggestions')&&($('search-suggestions').style.display='none');}
function selectSuggestion(id,title){$('search-input')&&($('search-input').value=title);hideSearchSuggestions();openDetail(id);}

/* ── Campus Filter ───────────────────────────────────── */
function buildCampusFilter(){
  const bar=$('campus-filter-bar'); if(!bar) return;
  const campuses=[...new Set(allListings.map(l=>l.seller?.campus||'').filter(Boolean))].slice(0,8);
  if(!campuses.length){bar.style.display='none';return;}
  bar.style.display='';
  bar.innerHTML=`<button class="campus-chip${activeCampus==='all'?' active':''}" data-campus="all" onclick="filterByCampus('all',this)">📍 All Campuses</button>`+
    campuses.map(c=>`<button class="campus-chip${activeCampus===c?' active':''}" data-campus="${esc(c)}" onclick="filterByCampus('${esc(c)}',this)">🏫 ${esc(c)}</button>`).join('');
}
function filterByCampus(campus,btn){
  activeCampus=campus;
  document.querySelectorAll('.campus-chip').forEach(c=>c.classList.remove('active'));
  btn?.classList.add('active');
  filteredList=allListings.filter(l=>(currentCat==='all'||l.category===currentCat)&&(campus==='all'||(l.seller?.campus||'')===campus));
  applySortToFiltered(); currentPage=1; renderListings();
}

/* ── Toggle Grid ─────────────────────────────────────── */
function toggleGridView(){$('listings-grid')?.classList.toggle('list-view');}

/* ── Offers ──────────────────────────────────────────── */
function loadOffers(){
  const grid=$('offers-grid'),empty=$('offers-empty'); if(!grid) return;
  const offers=allListings.filter(l=>l.isPromo);
  grid.innerHTML=offers.map(l=>cardHTML(l)).join('');
  empty.style.display=offers.length?'none':''; initLazyImages();
}

/* ── Stores ──────────────────────────────────────────── */
function loadStores(){
  const grid=$('store-grid'),empty=$('stores-empty'),detail=$('store-detail'); if(!grid) return;
  detail.style.display='none'; grid.style.display='';
  const sellerMap={};
  allListings.forEach(l=>{if(!l.seller)return;const sid=l.seller._id||l.seller;if(!sellerMap[sid])sellerMap[sid]={seller:l.seller,count:0};sellerMap[sid].count++;});
  const sellers=Object.values(sellerMap);
  if(!sellers.length){empty.style.display='';grid.innerHTML='';return;}
  empty.style.display='none';
  grid.innerHTML=sellers.map(({seller,count})=>{
    const name=seller.name||'Seller',init=name[0].toUpperCase(),campus=seller.campus?`📍 ${esc(seller.campus)}`:'';
    return `<div class="store-card" onclick="openStore('${esc(seller._id||seller)}')"><div class="store-card-banner" style="background-image:url('${catImage('other')}')"><div class="store-card-av">${init}</div></div><div class="store-card-body"><div class="store-card-name">${esc(name)}</div><div class="store-card-campus">${campus}</div><div class="store-card-count">${count} listing${count!==1?'s':''}</div></div></div>`;
  }).join('');
}
function openStore(sellerId){
  $('store-grid').style.display='none'; $('store-detail').style.display='';
  const listings=allListings.filter(l=>(l.seller?._id||l.seller)===sellerId);
  const seller=listings[0]?.seller||{};
  const name=seller.name||'Seller';
  $('store-detail-avatar').textContent=name[0].toUpperCase();
  $('store-detail-name').textContent=name;
  $('store-detail-meta').textContent=`${seller.campus||''} · ${listings.length} listing${listings.length!==1?'s':''}`;
  $('store-listings-grid').innerHTML=listings.map(l=>cardHTML(l)).join('');
  $('store-listings-empty').style.display=listings.length?'none':'';
  initLazyImages();
}
function toggleFollowStore(){const btn=$('store-follow-btn');if(!btn)return;btn.classList.toggle('following');btn.textContent=btn.classList.contains('following')?'✓ Following':'+ Follow';showToast(btn.classList.contains('following')?'Store followed!':'Unfollowed.','info');}

/* ── Detail (Bottom Sheet) ───────────────────────────── */
function openDetail(id) {
  const listing=allListings.find(l=>l._id===id); if(!listing) return;
  openBottomSheet(listing);
}

function openBottomSheetBase(listing){
  if(!listing) return;
  currentDetail=listing; bsGalleryIndex=0;
  const isMine=currentUser&&(listing.seller?._id||listing.seller)===currentUser._id;
  const seller=typeof listing.seller==='object'?listing.seller:{name:'Seller'};

  $('bs-item-title').textContent=listing.title;
  $('bs-price').textContent=fmtPrice(listing.price);
  $('bs-desc').textContent=listing.desc||'No description provided.';
  $('bs-badge').textContent=`${catEmoji(listing.category)} ${listing.category}`;
  $('bs-condition').textContent=listing.condition||'';
  $('bs-seller-name').textContent=seller.name||'Seller';
  $('bs-seller-bio').textContent=seller.bio||'';
  $('bs-seller-avatar').textContent=(seller.name||'S')[0].toUpperCase();
  $('bs-verified-badge').style.display=isVerified(seller)?'':'none';

  const origEl=$('bs-orig-price');
  if(listing.originalPrice&&listing.originalPrice>listing.price){origEl.style.display='';origEl.textContent=`Was: ${fmtPrice(listing.originalPrice)}`;}else origEl.style.display='none';

  const promoEl=$('bs-promo-banner');
  if(listing.isPromo){promoEl.style.display='';promoEl.textContent=`🏷️ ${listing.promoLabel||'SPECIAL OFFER'}`;}else promoEl.style.display='none';

  $('bs-urgency-row').innerHTML=buildUrgencyRow(listing);
  $('bs-popularity').innerHTML=buildPopularityRow(listing);
  renderReactions(listing._id);

  if(listing.location){$('bs-loc').style.display='';$('bs-location').textContent=listing.location;$('bs-safe-zone').style.display='';}
  else{$('bs-loc').style.display='none';$('bs-safe-zone').style.display='none';}

  const stockEl=$('bs-stock');
  if(listing.isSoldOut)stockEl.innerHTML='<span class="sold-out-badge">SOLD OUT</span>';
  else if(listing.stock!==undefined)stockEl.innerHTML=`<span class="stock-badge${listing.stock<3?' low':''}">${listing.stock} in stock</span>`;
  else stockEl.innerHTML='';

  const phone=listing.contact||seller.phone||'';
  const waText=encodeURIComponent(`Hi! I saw your listing "${listing.title}" (${fmtPrice(listing.price)}) on CampusMart.`);
  $('bs-wa-btn').href=`https://wa.me/${phone.replace(/\D/g,'')}?text=${waText}`;
  $('bs-call-btn').onclick=()=>{window.location.href=`tel:${phone}`;};

  // Gallery
  const mainImg=$('bs-main-img'),noImg=$('bs-no-img'),thumbs=$('bs-thumbs'),fsBtn=$('bs-fullscreen-btn');
  if(listing.images?.length){
    mainImg.style.display='block'; mainImg.src=(listing.images[0].startsWith('/')?SERVER:'')+listing.images[0];
    noImg.style.display='none'; fsBtn.style.display='';
    thumbs.innerHTML=listing.images.map((img,i)=>{const src=(img.startsWith('/')?SERVER:'')+img;return `<img class="thumb${i===0?' active':''}" src="${esc(src)}" onclick="setGalleryImg('${esc(src)}',this)" loading="lazy"/>`;}).join('');
    const counter=$('bs-img-counter'); if(counter) counter.textContent=listing.images.length>1?`1/${listing.images.length}`:'';
  } else {
    mainImg.style.display='block'; mainImg.src=catImage(listing.category);
    noImg.style.display='none'; fsBtn.style.display='none'; thumbs.innerHTML='';
  }

  $('bs-watchlist-btn')?.classList.toggle('saved',watchlist.includes(listing._id));
  $('bs-owner-controls').style.display=isMine?'':'none';
  $('bs-actions').style.display=isMine?'none':'';
  const secActs=document.querySelector('.bs-secondary-actions');if(secActs)secActs.style.display=isMine?'none':'';
  if(isMine&&$('bs-stock-input'))$('bs-stock-input').value=listing.stock||0;

  if(currentUser) fetch(`${API}/auth/viewed/${listing._id}`,{method:'POST',headers:authHdr()}).catch(()=>{});

  $('bs-overlay').classList.add('open');
  $('bottom-sheet').classList.add('open');
  document.body.style.overflow='hidden';
}

function closeBottomSheet(){
  $('bs-overlay')?.classList.remove('open');
  $('bottom-sheet')?.classList.remove('open');
  document.body.style.overflow='';
}

function setGalleryImg(src,thumb){
  $('bs-main-img').src=src;
  document.querySelectorAll('.bs-thumbs .thumb').forEach(t=>t.classList.remove('active'));
  thumb?.classList.add('active');
  const imgs=currentDetail?.images||[];
  const idx=imgs.findIndex(i=>(i.startsWith('/')?SERVER:'')+i===src);
  if(idx>=0){bsGalleryIndex=idx;const c=$('bs-img-counter');if(c)c.textContent=imgs.length>1?`${idx+1}/${imgs.length}`:'';}
}

function bsGalleryNav(dir){
  const imgs=currentDetail?.images||[];if(!imgs.length)return;
  bsGalleryIndex=(bsGalleryIndex+dir+imgs.length)%imgs.length;
  const src=(imgs[bsGalleryIndex].startsWith('/')?SERVER:'')+imgs[bsGalleryIndex];
  $('bs-main-img').src=src;
  document.querySelectorAll('.bs-thumbs .thumb').forEach((t,i)=>t.classList.toggle('active',i===bsGalleryIndex));
  const c=$('bs-img-counter');if(c)c.textContent=imgs.length>1?`${bsGalleryIndex+1}/${imgs.length}`:'';
}

/* ── Fullscreen ──────────────────────────────────────── */
let fsIndex=0;
function openFullscreen(){
  const src=$('bs-main-img')?.src;if(!src)return;
  const imgs=currentDetail?.images||[];
  fsIndex=imgs.findIndex(i=>(i.startsWith('/')?SERVER:'')+i===src);if(fsIndex<0)fsIndex=0;
  $('fullscreen-img').src=src; $('fullscreen-overlay').classList.add('open');
  updateFsCounter(imgs);
}
function closeFullscreen(){$('fullscreen-overlay')?.classList.remove('open');}
function fsNav(dir,e){e?.stopPropagation();const imgs=currentDetail?.images||[];if(!imgs.length)return;fsIndex=(fsIndex+dir+imgs.length)%imgs.length;$('fullscreen-img').src=(imgs[fsIndex].startsWith('/')?SERVER:'')+imgs[fsIndex];updateFsCounter(imgs);}
function updateFsCounter(imgs){$('fs-counter')&&($('fs-counter').textContent=imgs.length>1?`${fsIndex+1} / ${imgs.length}`:'');}

/* ── Watchlist ───────────────────────────────────────── */
function toggleWatchlist(){if(!currentDetail)return;toggleWatchlistById(currentDetail._id);$('bs-watchlist-btn')?.classList.toggle('saved',watchlist.includes(currentDetail._id));}
function toggleWatchlistById(id){const idx=watchlist.indexOf(id);idx>=0?watchlist.splice(idx,1):watchlist.push(id);localStorage.setItem('cm_watchlist',JSON.stringify(watchlist));updateBadges();}
function loadWatchlist(){const grid=$('watchlist-grid'),empty=$('watchlist-empty');if(!grid)return;const saved=allListings.filter(l=>watchlist.includes(l._id));grid.innerHTML=saved.map(l=>cardHTML(l)).join('');empty.style.display=saved.length?'none':'';initLazyImages();}

/* ── Recently Viewed ─────────────────────────────────── */
function loadRecentlyViewed(){const grid=$('recent-grid'),empty=$('recent-empty');if(!grid)return;const ids=currentUser?.recentlyViewed||[];const items=ids.map(id=>allListings.find(l=>l._id===(id._id||id))).filter(Boolean);grid.innerHTML=items.map(l=>cardHTML(l)).join('');empty.style.display=items.length?'none':'';initLazyImages();}

/* ── Profile ─────────────────────────────────────────── */
function loadProfilePageBase(){
  updateUserUI();
  const myListings=allListings.filter(l=>(l.seller?._id||l.seller)===currentUser?._id);
  const g=$('my-listings-grid');if(g){g.innerHTML=myListings.map(l=>cardHTML(l)).join('');initLazyImages();}
  $('my-listings-empty')&&($('my-listings-empty').style.display=myListings.length?'none':'');
  $('my-listing-count')&&($('my-listing-count').textContent=myListings.length);
  $('my-watch-count')&&($('my-watch-count').textContent=watchlist.length);
}
async function saveProfile(){
  const updates={name:$('edit-name')?.value.trim(),phone:$('edit-phone')?.value.trim(),campus:$('edit-campus')?.value.trim(),bio:$('edit-bio')?.value.trim()};
  try{const r=await fetch(`${API}/auth/me`,{method:'PUT',headers:authHdr(),body:JSON.stringify(updates)});const d=await r.json();if(!r.ok)return showToast(d.error||'Update failed.','error');currentUser=d.user;localStorage.setItem('cm_user',JSON.stringify(d.user));updateUserUI();showToast('Profile updated! ✅','success');}
  catch{showToast('Could not save profile.','error');}
}
async function handleAvatarUpload(e){
  const file=e.target.files?.[0];if(!file)return;
  const fd=new FormData();fd.append('avatar',file);
  try{const r=await fetch(`${API}/auth/me`,{method:'PUT',headers:{Authorization:`Bearer ${localStorage.getItem('cm_token')}`},body:fd});const d=await r.json();if(!r.ok)return showToast(d.error||'Upload failed.','error');currentUser=d.user;localStorage.setItem('cm_user',JSON.stringify(d.user));updateUserUI();showToast('Photo updated! 📸','success');}
  catch{showToast('Upload failed.','error');}
}
function openVerifyModal(){$('verify-overlay')?.classList.add('open');}
function closeVerifyModal(){$('verify-overlay')?.classList.remove('open');}
async function submitStudentVerify(){
  const email=$('verify-email')?.value.trim();if(!email)return showToast('Enter your university email.','error');
  const isUni=/\.(ac\.ke|edu|ac\.[a-z]{2})/.test(email.toLowerCase())||email.includes('.ac.');
  if(!isUni)return showToast('Use a valid university email (.ac.ke or .edu)','error');
  showToast('Verification email sent! Check your inbox. ✉️','success');
  if(currentUser){currentUser.isStudentVerified=true;localStorage.setItem('cm_user',JSON.stringify(currentUser));}
  closeVerifyModal();
}

/* ── Sell Modal ──────────────────────────────────────── */
const SCAM_WORDS=['deposit','advance','fare','m-pesa ya','tuma','western union','send money'];
function openModal(){
  uploadedImages=[];editingListing=null;
  $('modal-title-text').textContent='Post a Listing';
  $('post-btn').innerHTML='<i class="fa fa-paper-plane"></i> Post Listing';
  ['item-title','item-desc','item-price','item-contact','item-promo-label','item-original-price'].forEach(id=>$(id)&&($(id).value=''));
  $('item-stock')&&($('item-stock').value='1');
  $('item-is-promo')&&($('item-is-promo').checked=false);
  $('promo-fields')&&($('promo-fields').style.display='none');
  $('upload-previews')&&($('upload-previews').innerHTML='');
  $('upload-placeholder')&&($('upload-placeholder').style.display='');
  $('listing-scam-warning')&&($('listing-scam-warning').classList.remove('visible'));
  if(currentUser?.phone)$('item-contact').value=currentUser.phone;
  $('modal-overlay').classList.add('open');
  $('sell-modal').classList.add('open');
}
function closeModal(){$('modal-overlay')?.classList.remove('open');$('sell-modal')?.classList.remove('open');}
function closeModalOutside(e){if(e.target===$('modal-overlay'))closeModal();}
function togglePromoFields(){$('promo-fields').style.display=$('item-is-promo').checked?'':`none`;}
function checkListingScamWords(val){const w=$('listing-scam-warning');if(!w)return;w.classList.toggle('visible',SCAM_WORDS.some(k=>val.toLowerCase().includes(k)));}
function handleImages(e){
  const files=Array.from(e.target.files).slice(0,5-uploadedImages.length);
  files.forEach(f=>{
    const reader=new FileReader();
    reader.onload=ev=>{
      uploadedImages.push(f);
      const prev=$('upload-previews');
      const wrap=document.createElement('div');wrap.className='preview-wrap';
      const img=document.createElement('img');img.src=ev.target.result;img.className='preview-img';
      const rm=document.createElement('button');rm.innerHTML='<i class="fa fa-times"></i>';rm.className='preview-rm';
      const idx=uploadedImages.length-1;rm.onclick=ev2=>{ev2.stopPropagation();uploadedImages.splice(idx,1);wrap.remove();};
      wrap.appendChild(img);wrap.appendChild(rm);prev.appendChild(wrap);
      $('upload-placeholder')&&($('upload-placeholder').style.display='none');
    };reader.readAsDataURL(f);
  });
}
async function postListing(){
  const title=$('item-title')?.value.trim(),price=$('item-price')?.value,contact=$('item-contact')?.value.trim();
  if(!title||!price||!contact)return showToast('Title, price and contact required.','error');
  const btn=$('post-btn');btn.disabled=true;btn.innerHTML='<i class="fa fa-spinner fa-spin"></i> Posting…';
  const fd=new FormData();
  fd.append('title',title);fd.append('desc',$('item-desc')?.value.trim()||'');fd.append('price',price);fd.append('contact',contact);
  fd.append('category',$('item-category')?.value||'other');fd.append('condition',$('item-condition')?.value||'Good');
  fd.append('location',$('item-location')?.value||'');fd.append('stock',$('item-stock')?.value||'1');
  fd.append('isPromo',$('item-is-promo')?.checked?'true':'false');
  if($('item-is-promo')?.checked){fd.append('promoLabel',$('item-promo-label')?.value||'');fd.append('originalPrice',$('item-original-price')?.value||'');}
  uploadedImages.forEach(f=>fd.append('images',f));
  try{
    const url=editingListing?`${API}/listings/${editingListing._id}`:`${API}/listings`;
    const method=editingListing?'PUT':'POST';
    const r=await fetch(url,{method,headers:{Authorization:`Bearer ${localStorage.getItem('cm_token')}`},body:fd});
    const d=await r.json();
    if(!r.ok)return showToast(d.error||'Post failed.','error');
    if(!editingListing&&!localStorage.getItem('cm_has_posted')){localStorage.setItem('cm_has_posted','1');setTimeout(launchConfetti,500);}
    showToast(editingListing?'Listing updated! ✅':'Listing posted! 🎉','success');
    closeModal();await loadListings();
  }catch{showToast('Could not post listing.','error');}
  finally{btn.disabled=false;btn.innerHTML='<i class="fa fa-paper-plane"></i> Post Listing';}
}
function editListing(){
  if(!currentDetail)return;editingListing=currentDetail;
  $('modal-title-text').textContent='Edit Listing';$('post-btn').innerHTML='<i class="fa fa-save"></i> Save Changes';
  $('item-title').value=currentDetail.title||'';$('item-desc').value=currentDetail.desc||'';$('item-price').value=currentDetail.price||'';
  $('item-contact').value=currentDetail.contact||'';$('item-stock').value=currentDetail.stock||1;
  $('item-category').value=currentDetail.category||'other';$('item-condition').value=currentDetail.condition||'Good';$('item-location').value=currentDetail.location||'';
  closeBottomSheet();$('modal-overlay').classList.add('open');$('sell-modal').classList.add('open');
}
async function deleteCurrentListing(){
  if(!currentDetail||!confirm('Delete this listing?'))return;
  try{const r=await fetch(`${API}/listings/${currentDetail._id}`,{method:'DELETE',headers:authHdr()});if(!r.ok)return showToast('Delete failed.','error');showToast('Listing deleted.','info');closeBottomSheet();allListings=allListings.filter(l=>l._id!==currentDetail._id);filteredList=filteredList.filter(l=>l._id!==currentDetail._id);renderListings();currentDetail=null;}
  catch{showToast('Could not delete.','error');}
}
async function updateStockFromDetail(){if(!currentDetail)return;const stock=parseInt($('bs-stock-input')?.value)||0;try{const r=await fetch(`${API}/listings/${currentDetail._id}`,{method:'PUT',headers:authHdr(),body:JSON.stringify({stock})});const d=await r.json();if(!r.ok)return showToast(d.error||'Failed.','error');showToast('Stock updated!','success');currentDetail.stock=stock;}catch{showToast('Could not update.','error');}}
async function toggleSoldOut(){if(!currentDetail)return;const isSoldOut=!currentDetail.isSoldOut;try{await fetch(`${API}/listings/${currentDetail._id}`,{method:'PUT',headers:authHdr(),body:JSON.stringify({isSoldOut})});currentDetail.isSoldOut=isSoldOut;showToast(isSoldOut?'Marked sold out.':'Marked available.','info');await loadListings();closeBottomSheet();}catch{showToast('Could not update.','error');}}

/* ── Report ──────────────────────────────────────────── */
function openReportModal(){$('report-overlay')?.classList.add('open');}
function closeReportModal(){$('report-overlay')?.classList.remove('open');}
function closeReportOutside(e){if(e.target===$('report-overlay'))closeReportModal();}
async function submitReport(){
  const reason=$('report-reason')?.value,details=$('report-details')?.value.trim();
  if(!reason)return showToast('Select a reason.','error');if(!currentDetail)return;
  try{const r=await fetch(`${API}/reports`,{method:'POST',headers:authHdr(),body:JSON.stringify({reportedUser:currentDetail.seller?._id||currentDetail.seller,listingId:currentDetail._id,reason,details})});const d=await r.json();if(!r.ok)return showToast(d.error||'Report failed.','error');showToast('Report submitted. Thank you! 🛡️','success');closeReportModal();}
  catch{showToast('Could not submit report.','error');}
}

/* ── Share ───────────────────────────────────────────── */
function shareCurrentListing(){if(!currentDetail)return;const text=`Check out "${currentDetail.title}" for ${fmtPrice(currentDetail.price)} on CampusMart!`;if(navigator.share)navigator.share({title:currentDetail.title,text,url:window.location.href});else{navigator.clipboard?.writeText(text);showToast('Listing info copied!','success');}}

/* ── Make Offer ──────────────────────────────────────── */
function openOfferModal(){
  if(!currentDetail)return;
  const price=currentDetail.price;
  $('offer-presets').innerHTML=[.9,.8,.7].map(d=>{const amt=Math.round(price*d);return `<button class="offer-preset-btn" onclick="$('offer-amount').value=${amt};document.querySelectorAll('.offer-preset-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')">KES ${amt.toLocaleString()} (${Math.round((1-d)*100)}% off)</button>`;}).join('');
  $('offer-amount').value=Math.round(price*.8);$('offer-message').value='';
  $('offer-overlay').classList.add('open');
}
function closeOfferModal(){$('offer-overlay')?.classList.remove('open');}
function sendOffer(){
  const amount=$('offer-amount')?.value,message=$('offer-message')?.value.trim();
  if(!amount||isNaN(amount)||Number(amount)<=0)return showToast('Enter a valid offer.','error');
  if(!currentDetail)return;
  const seller=typeof currentDetail.seller==='object'?currentDetail.seller:{_id:currentDetail.seller,name:'Seller'};
  const convoId=makeConvoId(currentUser._id,seller._id,currentDetail._id);
  const offerMsg=`💰 *Offer: KES ${Number(amount).toLocaleString()}* for "${currentDetail.title}"${message?'\n'+message:''}\n_(Original: ${fmtPrice(currentDetail.price)})_`;
  if(!conversations[convoId])conversations[convoId]={conversationId:convoId,otherName:seller.name||'Seller',otherUserId:seller._id,listingId:currentDetail._id,listingTitle:currentDetail.title,lastText:'',unread:false};
  socket?.emit('send_message',{receiverId:seller._id,listingId:currentDetail._id,listingTitle:currentDetail.title,text:offerMsg});
  closeOfferModal();closeBottomSheet();showToast(`Offer of KES ${Number(amount).toLocaleString()} sent! 🤝`,'success');
  setTimeout(()=>{showPageAnimated('messages');openChat(convoId,seller.name||'Seller',seller._id,currentDetail._id,currentDetail.title);},500);
}

/* ── Urgency & Popularity ────────────────────────────── */
function buildUrgencyRow(l){
  const hrs=Math.floor((Date.now()-new Date(l.createdAt))/3600000),views=l.views||Math.floor(Math.random()*60)+3,parts=[];
  if(hrs<2)parts.push(`<div class="urgency-chip"><i class="fa fa-bolt"></i>Just posted</div>`);
  if(views>30)parts.push(`<div class="urgency-chip hot"><i class="fa fa-fire"></i>${views} people viewed</div>`);
  if(l.stock&&l.stock<3&&!l.isSoldOut)parts.push(`<div class="urgency-chip hot"><i class="fa fa-exclamation-triangle"></i>Only ${l.stock} left!</div>`);
  return parts.join('');
}
function buildPopularityRow(l){
  const views=l.views||Math.floor(Math.random()*80)+5,interested=Math.max(1,Math.floor(views*.15)),isHot=views>50;
  return `<div class="pop-stat${isHot?' hot':''}"><i class="fa fa-eye"></i>${views} views</div><div class="pop-stat"><i class="fa fa-users"></i>${interested} interested</div>${isHot?'<div class="pop-stat hot"><i class="fa fa-fire"></i>Trending</div>':''}`;
}

/* ── Reactions ───────────────────────────────────────── */
function reactToListing(emoji){
  if(!currentDetail)return;
  const key=`${currentDetail._id}_${emoji}`;
  reactions[key]=!reactions[key];if(!reactions[key])delete reactions[key];
  localStorage.setItem('cm_reactions',JSON.stringify(reactions));
  renderReactions(currentDetail._id);navigator.vibrate?.(30);
}
function renderReactions(lid){
  const map={'🔥':'fire','😮':'wow','👀':'eyes','💯':'100'};
  Object.entries(map).forEach(([emoji,name])=>{
    const el=$(`react-${name}-count`);if(!el)return;
    const myReacted=reactions[`${lid}_${emoji}`];
    el.textContent=myReacted?1:0;
    el.closest('.react-btn')?.classList.toggle('reacted',!!myReacted);
  });
}

/* ── Notifications ───────────────────────────────────── */
function addNotification(n){notifications.unshift({...n,id:Date.now(),read:false,time:new Date().toISOString()});if(notifications.length>50)notifications.pop();localStorage.setItem('cm_notifs',JSON.stringify(notifications));updateBadges();}
function renderNotifications(){
  const list=$('notif-list'),empty=$('notif-empty');if(!list)return;
  if(!notifications.length){list.innerHTML='';empty.style.display='';return;}
  empty.style.display='none';
  list.innerHTML=notifications.map(n=>`<div class="notif-item${n.read?'':' unread'}"><span class="notif-icon">${n.icon||'🔔'}</span><div class="notif-body"><div class="notif-text">${esc(n.text||'')}</div><div class="notif-time">${timeAgo(n.time)}</div></div></div>`).join('');
  notifications.forEach(n=>n.read=true);localStorage.setItem('cm_notifs',JSON.stringify(notifications));updateBadges();
}
function clearNotifications(){notifications=[];localStorage.setItem('cm_notifs','[]');renderNotifications();updateBadges();}
function updateBadges(){
  const unread=notifications.filter(n=>!n.read).length;
  [$('topbar-notif-count'),$('snav-notif-count')].forEach(el=>{if(!el)return;el.textContent=unread||'';el.style.display=unread?'':'none';});
  const msgs=Object.values(conversations).filter(c=>c.unread).length;
  [$('topbar-msg-count'),$('snav-msg-count'),$('bnav-msg-badge')].forEach(el=>{if(!el)return;el.textContent=msgs||'';el.style.display=msgs?'':'none';});
  $('snav-watch-count')&&($('snav-watch-count').textContent=watchlist.length||'');
}
function toggleBrowserNotifs(){Notification.requestPermission().then(p=>{showToast(p==='granted'?'Notifications enabled! 🔔':'Notifications denied.',p==='granted'?'success':'warning');$('notif-toggle')&&($('notif-toggle').textContent=p==='granted'?'Enabled ✓':'Enable');});}

/* ── Socket.io ───────────────────────────────────────── */
function initSocket(){
  if(socket||!currentUser)return;
  try{
    socket=io(SERVER,{auth:{token:localStorage.getItem('cm_token')},transports:['websocket','polling']});
    socket.on('connect',()=>console.log('🔌 Connected'));
    socket.on('disconnect',()=>console.log('🔌 Disconnected'));
    socket.on('new_message',onNewMessage);
    socket.on('notification',n=>{addNotification(n);showToast(n.text,'info');});
    socket.on('safety_alert',a=>showToast(a.text,'warning',6000));
    socket.on('typing',({userId,isTyping})=>showTypingIndicator(userId,isTyping));
    socket.on('user_online',({userId})=>updateOnlineStatus(userId,true));
    socket.on('user_offline',({userId})=>updateOnlineStatus(userId,false));
  }catch{}
}

/* ── Conversations ───────────────────────────────────── */
async function loadConversations(){
  try{const r=await fetch(`${API}/messages/conversations`,{headers:authHdr()});const d=await r.json();(d.conversations||[]).forEach(c=>{conversations[c.conversationId]=c;});renderConversationList();updateBadges();}catch{}
}

function makeConvoId(a,b,lid){return[a,b].sort().join('_')+'_'+(lid||'general');}

function renderConversationList(){
  const inner=$('chat-list-inner');if(!inner)return;
  const convos=Object.values(conversations);
  if(!convos.length){inner.innerHTML=`<div style="padding:30px 16px;text-align:center;color:var(--muted);font-size:13px"><div style="font-size:36px;margin-bottom:10px">💬</div>No conversations yet.<br/>Chat with a seller to start!</div>`;return;}
  inner.innerHTML=convos.sort((a,b)=>new Date(b.lastTime||0)-new Date(a.lastTime||0)).map(c=>`
    <div class="chat-list-item${c.conversationId===activeChatId?' active':''}" id="cli_${esc(c.conversationId)}"
         onclick="openChat('${esc(c.conversationId)}','${esc(c.otherName||'User')}','${esc(c.otherUserId||'')}','${esc(c.listingId||'')}','${esc(c.listingTitle||'')}')">
      <div class="chat-list-avatar">${(c.otherName||'U')[0].toUpperCase()}</div>
      <div class="chat-list-info"><div class="chat-list-name">${esc(c.otherName||'User')}</div><div class="chat-list-last">${esc((c.lastText||'').substring(0,40))}</div></div>
      <div class="chat-list-meta"><div class="chat-list-time">${c.lastTime?timeAgo(c.lastTime):''}</div>${c.unread?'<div class="chat-unread-dot"></div>':''}</div>
      <div class="chat-delete-reveal" onclick="event.stopPropagation();deleteChat('${esc(c.conversationId)}')"><i class="fa fa-trash"></i></div>
    </div>`).join('');
  addSwipeToDeleteChats();
}

function addSwipeToDeleteChats(){
  document.querySelectorAll('.chat-list-item').forEach(item=>{
    let t;
    item.addEventListener('touchstart',()=>{t=setTimeout(()=>item.classList.toggle('swipe-reveal'),600);},{passive:true});
    item.addEventListener('touchend',()=>clearTimeout(t));
  });
}

function deleteChat(cid){delete conversations[cid];renderConversationList();if(activeChatId===cid){$('chat-window').innerHTML='<div class="chat-placeholder"><i class="fa fa-comment-dots"></i><p>Select a conversation</p></div>';activeChatId=null;}showToast('Conversation deleted.','info');}

async function openChat(convoId,otherName,otherUserId,listingId,listingTitle){
  activeChatId=convoId;
  if(conversations[convoId])conversations[convoId].unread=false;
  updateBadges();renderConversationList();
  socket?.emit('join_conversation',convoId);
  const win=$('chat-window');if(!win)return;
  // On mobile, hide chat list
  if(window.innerWidth<768){$('chat-list')?.classList.add('hidden');}
  win.innerHTML=`
    <div class="chat-header">
      <button class="chat-back-btn" onclick="closeChatWindow()" style="display:flex"><i class="fa fa-arrow-left"></i></button>
      <div class="chat-header-info"><div class="chat-header-name">${esc(otherName)}</div>${listingTitle?`<div class="chat-header-listing">Re: ${esc(listingTitle.substring(0,40))}</div>`:''}</div>
      <div style="width:9px;height:9px;border-radius:50%;transition:.3s" id="online-dot-${esc(otherUserId)}"></div>
    </div>
    <div class="chat-messages" id="chat-messages-${esc(convoId)}"></div>
    <div class="chat-input-bar">
      <button class="chat-attach-btn" onclick="triggerChatPhoto('${esc(convoId)}','${esc(otherUserId)}','${esc(listingId)}','${esc(listingTitle)}')" title="Photo"><i class="fa fa-image"></i></button>
      <input type="file" id="chat-photo-input" accept="image/*" style="display:none"/>
      <input class="chat-input" id="chat-input-${esc(convoId)}" type="text" placeholder="Type a message…" onkeydown="if(event.key==='Enter')sendMessage('${esc(convoId)}','${esc(otherUserId)}','${esc(listingId)}','${esc(listingTitle)}')" oninput="emitTyping('${esc(convoId)}')"/>
      <button class="chat-send-btn" onclick="sendMessage('${esc(convoId)}','${esc(otherUserId)}','${esc(listingId)}','${esc(listingTitle)}')"><i class="fa fa-paper-plane"></i></button>
    </div>`;
  loadMessages(convoId);
}

function closeChatWindow(){activeChatId=null;$('chat-list')?.classList.remove('hidden');$('chat-window').innerHTML='<div class="chat-placeholder"><i class="fa fa-comment-dots"></i><p>Select a conversation</p></div>';}

async function loadMessages(convoId){
  const container=$(`chat-messages-${convoId}`);if(!container)return;
  container.innerHTML='<div style="text-align:center;padding:20px;color:var(--muted)"><i class="fa fa-spinner fa-spin"></i></div>';
  try{const r=await fetch(`${API}/messages/${convoId}`,{headers:authHdr()});const d=await r.json();renderMessages(convoId,d.messages||[]);}
  catch{container.innerHTML='<p style="text-align:center;color:var(--muted);padding:20px">Could not load messages.</p>';}
}

function renderMessages(convoId,msgs){
  const container=$(`chat-messages-${convoId}`);if(!container)return;
  if(!msgs.length){container.innerHTML='<p style="text-align:center;color:var(--muted);padding:20px;font-size:13px">No messages yet. Say hello! 👋</p>';return;}
  let lastDate='';
  container.innerHTML=msgs.map(m=>{
    const mine=(m.sender?._id||m.sender||m.senderId)===currentUser?._id;
    const d=new Date(m.createdAt),dateStr=d.toDateString();
    let dateDiv='';
    if(dateStr!==lastDate){lastDate=dateStr;const label=dateStr===new Date().toDateString()?'Today':dateStr===new Date(Date.now()-86400000).toDateString()?'Yesterday':d.toLocaleDateString('en-KE',{weekday:'short',day:'numeric',month:'short'});dateDiv=`<div class="chat-date-divider">${label}</div>`;}
    const time=d.toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'});
    const imgSrc=m.imageUrl||(m.text?.startsWith('[img]')?m.text.replace('[img]',''):null);
    return `${dateDiv}<div class="chat-msg ${mine?'mine':'theirs'}${m.isFlagged?' flagged':''}">
      ${imgSrc?`<img src="${esc(imgSrc.startsWith('/')?SERVER+imgSrc:imgSrc)}" class="msg-img" onclick="window.open(this.src,'_blank')" alt="photo"/>`:`<div class="msg-bubble">${esc(m.text||'')}</div>`}
      <div class="msg-time">${time}${mine?' ✓':''}</div>
    </div>`;
  }).join('');
  container.scrollTop=container.scrollHeight;
}

function sendMessage(convoId,otherUserId,listingId,listingTitle){
  const inp=$(`chat-input-${convoId}`);if(!inp)return;const text=inp.value.trim();if(!text)return;
  socket?.emit('send_message',{receiverId:otherUserId,listingId,listingTitle,text});inp.value='';
  const c=$(`chat-messages-${convoId}`);
  if(c){const div=document.createElement('div');div.className='chat-msg mine';div.innerHTML=`<div class="msg-bubble">${esc(text)}</div><div class="msg-time">${new Date().toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'})} ✓</div>`;c.appendChild(div);c.scrollTop=c.scrollHeight;}
}

function triggerChatPhoto(convoId,otherUserId,listingId,listingTitle){const inp=$('chat-photo-input');if(!inp)return;inp.onchange=e=>sendChatPhoto(e,convoId,otherUserId,listingId,listingTitle);inp.click();}

async function sendChatPhoto(e,convoId,otherUserId,listingId,listingTitle){
  const file=e.target.files?.[0];if(!file)return;
  const fd=new FormData();fd.append('photo',file);fd.append('receiverId',otherUserId);fd.append('listingId',listingId||'');
  try{const r=await fetch(`${API}/messages/photo`,{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem('cm_token')}`},body:fd});const d=await r.json();if(!r.ok)return showToast(d.error||'Photo failed.','error');const c=$(`chat-messages-${convoId}`);if(c&&d.message?.imageUrl){const div=document.createElement('div');div.className='chat-msg mine';div.innerHTML=`<img src="${esc(SERVER+d.message.imageUrl)}" class="msg-img" onclick="window.open(this.src,'_blank')" alt="photo"/><div class="msg-time">now ✓</div>`;c.appendChild(div);c.scrollTop=c.scrollHeight;}}catch{showToast('Could not send photo.','error');}
  e.target.value='';
}

function onNewMessage(msg){
  if(msg.conversationId===activeChatId){
    const c=$(`chat-messages-${activeChatId}`);
    if(c&&(msg.sender?._id||msg.senderId)!==currentUser?._id){const div=document.createElement('div');div.className='chat-msg theirs';const isImg=msg.imageUrl;div.innerHTML=isImg?`<img src="${esc(SERVER+msg.imageUrl)}" class="msg-img" onclick="window.open(this.src,'_blank')" alt="photo"/><div class="msg-time">${new Date(msg.createdAt).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'})}</div>`:`<div class="msg-bubble">${esc(msg.text||'')}</div><div class="msg-time">${new Date(msg.createdAt).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'})}</div>`;c.appendChild(div);c.scrollTop=c.scrollHeight;}
  } else {
    const ex=conversations[msg.conversationId];
    if(ex){ex.lastText=msg.text||'📷 Photo';ex.lastTime=msg.createdAt;ex.unread=true;}
    else conversations[msg.conversationId]={conversationId:msg.conversationId,otherName:msg.sender?.name||'User',otherUserId:msg.senderId,lastText:msg.text||'📷 Photo',lastTime:msg.createdAt,unread:true};
    renderConversationList();addNotification({icon:'💬',text:`New message: ${(msg.text||'📷 Photo').substring(0,40)}`});
  }
  updateBadges();
}

let typingTimeout;
function emitTyping(convoId){socket?.emit('typing',{conversationId:convoId,isTyping:true});clearTimeout(typingTimeout);typingTimeout=setTimeout(()=>socket?.emit('typing',{conversationId:convoId,isTyping:false}),1500);}
function showTypingIndicator(userId,isTyping){const win=$('chat-window');if(!win)return;let ind=win.querySelector('.typing-indicator');if(isTyping&&!ind){ind=document.createElement('div');ind.className='typing-indicator';ind.innerHTML='<span></span><span></span><span></span>';const msgs=win.querySelector('[id^="chat-messages-"]');msgs?.appendChild(ind);msgs&&(msgs.scrollTop=msgs.scrollHeight);}else if(!isTyping&&ind)ind.remove();}
function updateOnlineStatus(userId,online){const dot=$(`online-dot-${userId}`);if(dot){dot.style.background=online?'#10b981':'transparent';}}

/* ── Start Chat from Listing ─────────────────────────── */
function startChat(){
  if(!currentDetail||!currentUser)return;
  const seller=typeof currentDetail.seller==='object'?currentDetail.seller:{_id:currentDetail.seller,name:'Seller'};
  if(seller._id===currentUser._id)return showToast("You can't chat with yourself.",'warning');
  const convoId=makeConvoId(currentUser._id,seller._id,currentDetail._id);
  if(!conversations[convoId])conversations[convoId]={conversationId:convoId,otherName:seller.name||'Seller',otherUserId:seller._id,listingId:currentDetail._id,listingTitle:currentDetail.title,lastText:'',unread:false};
  closeBottomSheet();showPageAnimated('messages');
  setTimeout(()=>openChat(convoId,seller.name||'Seller',seller._id,currentDetail._id,currentDetail.title),120);
  document.querySelectorAll('.bnav-item').forEach(b=>b.classList.remove('active'));$('bnav-msgs')?.classList.add('active');
}

/* ── Stories ─────────────────────────────────────────── */
function buildStories(){
  const row=$('stories-row');if(!row)return;
  storyListings=allListings.filter(l=>!l.isSoldOut).slice(0,8);
  row.querySelectorAll('.story-item:not(:first-child)').forEach(el=>el.remove());
  const addBtn=row.querySelector('.story-item');
  storyListings.forEach((l,i)=>{
    const seller=typeof l.seller==='object'?l.seller:{name:'Seller'};
    const seen=seenStories.includes(l._id);
    const item=document.createElement('div');item.className='story-item';item.onclick=()=>openStoryViewer(i);
    item.innerHTML=`<div class="story-ring${seen?' seen':''}"><div class="story-avatar">${(seller.name||'S')[0].toUpperCase()}</div><div class="story-price-badge">${fmtPrice(l.price).replace('KES ','')}</div></div><div class="story-name">${esc((seller.name||'Seller').split(' ')[0])}</div>`;
    addBtn.parentNode.insertBefore(item,addBtn.nextSibling);
  });
}

function openStoryViewer(idx){storyIndex=idx;renderStory();$('story-viewer').classList.add('open');document.body.style.overflow='hidden';}
function renderStory(){
  const l=storyListings[storyIndex];if(!l)return closeStoryViewer();
  const seller=typeof l.seller==='object'?l.seller:{name:'Seller'};
  if(!seenStories.includes(l._id))seenStories.push(l._id);localStorage.setItem('cm_seen_stories',JSON.stringify(seenStories));
  $('sv-avatar').textContent=(seller.name||'S')[0].toUpperCase();
  $('sv-name').textContent=seller.name||'Seller';$('sv-time').textContent=timeAgo(l.createdAt);
  $('sv-title').textContent=l.title;$('sv-price').textContent=fmtPrice(l.price);
  const img=l.images?.[0],mainImg=$('sv-main-img'),noImg=$('sv-no-img');
  if(img){mainImg.src=(img.startsWith('/')?SERVER:'')+img;mainImg.style.display='block';noImg.style.display='none';}else{mainImg.src=catImage(l.category);mainImg.style.display='block';noImg.style.display='none';}
  const phone=l.contact||seller.phone||'';const t=encodeURIComponent(`Hi! I saw "${l.title}" for ${fmtPrice(l.price)} on CampusMart!`);
  $('sv-wa-btn').onclick=()=>window.open(`https://wa.me/${phone.replace(/\D/g,'')}?text=${t}`,'_blank');
  const bar=$('story-viewer-bar');
  bar.innerHTML=storyListings.map((_,i)=>`<div class="sv-bar"><div class="sv-bar-fill" id="svf-${i}" style="width:${i<storyIndex?'100%':'0%'}"></div></div>`).join('');
  clearTimeout(storyTimer);const fill=$(`svf-${storyIndex}`);
  if(fill){fill.style.transition='width 5s linear';setTimeout(()=>fill.style.width='100%',50);}
  storyTimer=setTimeout(()=>storyNav(1),5100);
}
function storyNav(dir){clearTimeout(storyTimer);storyIndex+=dir;if(storyIndex<0)storyIndex=0;if(storyIndex>=storyListings.length){closeStoryViewer();return;}renderStory();}
function closeStoryViewer(){clearTimeout(storyTimer);$('story-viewer').classList.remove('open');document.body.style.overflow='';}
function openAddStory(){showToast('Post a listing to add your story! 🌟','info');openModal();}

/* ── Live Feed ───────────────────────────────────────── */
let lastListingCount=0;
function startLiveFeedCheck(){
  lastListingCount=allListings.length;clearInterval(liveCheckInterval);
  liveCheckInterval=setInterval(async()=>{
    try{const r=await fetch(`${API}/listings?limit=1`,{headers:authHdr()});const d=await r.json();const total=d.total||0;if(total>lastListingCount&&lastListingCount>0){const diff=total-lastListingCount;showLivePill(`${diff} new listing${diff>1?'s':''} added!`);lastListingCount=total;}}catch{}
  },30000);
}
function showLivePill(text){const pill=$('live-feed-pill'),txt=$('live-feed-text');if(!pill||!txt)return;txt.textContent=text;pill.classList.add('visible');setTimeout(()=>pill.classList.remove('visible'),8000);}
function refreshAndDismissLivePill(){$('live-feed-pill')?.classList.remove('visible');loadListings();}

/* ── Pull to Refresh ─────────────────────────────────── */
function initPullToRefresh(){
  const main=$('.main-wrap')||document.querySelector('.main-wrap');if(!main)return;
  let startY=0,pulling=false;
  main.addEventListener('touchstart',e=>{if(main.scrollTop===0)startY=e.touches[0].clientY;},{passive:true});
  main.addEventListener('touchmove',e=>{if(!startY)return;if(e.touches[0].clientY-startY>60){pulling=true;$('pull-refresh-indicator')?.classList.add('visible');}},{passive:true});
  main.addEventListener('touchend',async()=>{if(pulling){pulling=false;startY=0;await loadListings();$('pull-refresh-indicator')?.classList.remove('visible');showToast('Refreshed! ✨','success',1500);}startY=0;});
}

/* ── Bottom Sheet Swipe ──────────────────────────────── */
function initBottomSheetSwipe(){
  const sheet=$('bottom-sheet');if(!sheet)return;
  let startY=0;
  sheet.addEventListener('touchstart',e=>{startY=e.touches[0].clientY;},{passive:true});
  sheet.addEventListener('touchend',e=>{if(e.changedTouches[0].clientY-startY>80)closeBottomSheet();});
}

/* ── Confetti ────────────────────────────────────────── */
function launchConfetti(){
  const canvas=$('confetti-canvas');if(!canvas)return;
  const ctx=canvas.getContext('2d');canvas.width=window.innerWidth;canvas.height=window.innerHeight;canvas.style.display='block';
  const pieces=Array.from({length:120},()=>({x:Math.random()*canvas.width,y:Math.random()*canvas.height-canvas.height,r:Math.random()*8+4,d:Math.random()*120+20,color:`hsl(${Math.random()*360},80%,55%)`,tilt:Math.random()*10-10,tiltAngle:0,tiltSpeed:Math.random()*.1+.05}));
  let frame=0;
  function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);pieces.forEach(p=>{ctx.beginPath();ctx.fillStyle=p.color;ctx.ellipse(p.x,p.y,p.r,p.r*.5,p.tilt,0,Math.PI*2);ctx.fill();p.y+=Math.cos(frame+p.d)+2;p.x+=Math.sin(frame)*1.5;p.tiltAngle+=p.tiltSpeed;p.tilt=Math.sin(p.tiltAngle)*15;});frame+=.02;if(frame<5)requestAnimationFrame(draw);else{ctx.clearRect(0,0,canvas.width,canvas.height);canvas.style.display='none';}}
  draw();
}

/* ── Scroll to Top ───────────────────────────────────── */
function scrollToTop(){window.scrollTo({top:0,behavior:'smooth'});}
function initScrollTop(){const btn=$('scroll-top-btn');if(!btn)return;window.addEventListener('scroll',()=>{btn.style.display=window.scrollY>300?'flex':'none';});}

/* ── Help Accordion ──────────────────────────────────── */
function toggleAccordion(btn){const body=btn.nextElementSibling;btn.classList.toggle('open');body?.classList.toggle('open');}

/* ── Newsletter ──────────────────────────────────────── */
async function _subscribe(inputId){const email=$(inputId)?.value.trim();if(!email)return showToast('Enter your email.','error');try{const r=await fetch(`${API}/auth/subscribe`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,name:currentUser?.name||''})});const d=await r.json();if(!r.ok)return showToast(d.error||'Failed.','error');$(inputId)&&($(inputId).value='');showToast(d.message||'Subscribed! 🎉','success');}catch{showToast('Cannot reach server.','error');}}
async function subscribeNewsletter(){await _subscribe('newsletter-email');}
async function subscribeNewsletter2(){await _subscribe('newsletter-email-2');}

/* ── Feedback ────────────────────────────────────────── */
function submitFeedback(){const t=$('feedback-text')?.value.trim();if(!t)return showToast('Enter your feedback.','error');showToast('Feedback sent! Thank you 🙏','success');$('feedback-text').value='';}

/* ── Local Data ──────────────────────────────────────── */
function loadLocalData(){watchlist=JSON.parse(localStorage.getItem('cm_watchlist')||'[]');notifications=JSON.parse(localStorage.getItem('cm_notifs')||'[]');reactions=JSON.parse(localStorage.getItem('cm_reactions')||'{}');}

/* ══════════════════════════════════════
   DOM READY
══════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  initCookieBanner();
  initScrollTop();
  handleGoogleRedirect();
  handleOAuthErrorParam();
  populateSafeZones();

  const t=localStorage.getItem('cm_token'), u=localStorage.getItem('cm_user');
  if(t&&u){
    try{currentUser=JSON.parse(u);loadLocalData();enterMarket();}
    catch{localStorage.removeItem('cm_token');localStorage.removeItem('cm_user');}
  }
  hideLoader();

  // Close search suggestions on outside click
  document.addEventListener('click',e=>{if(!e.target.closest('#search-wrap'))hideSearchSuggestions();});

  // Keyboard shortcuts
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeBottomSheet();closeModal();closeFullscreen();closeStoryViewer();}});

  // Init features
  initPullToRefresh();
  initBottomSheetSwipe();

  // Login form enter key
  $('login-pass')?.addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
});

/* ═══════════════════════════════════════════════════════
   v6 — Trust, Discovery, Seller Tools, Retention features
   ═══════════════════════════════════════════════════════ */

let deferredPWAInstall = null;
let currentMeetup      = null;

/* ── Star Rating Display Helper ─────────────────────── */
function starRatingHTML(avg, count, size='') {
  if (!count) return '';
  const full = Math.round(avg);
  let stars = '';
  for (let i = 1; i <= 5; i++) stars += `<i class="fa fa-star${i>full?' empty':''}"></i>`;
  return `<div class="star-rating">${stars}<span class="star-rating-text">${avg.toFixed(1)} (${count})</span></div>`;
}

/* ── Patch showPageAnimated to handle new pages ─────── */
function showPageAnimatedV6(page) {
  const allViews = ['listings','offers','stores','recent','profile','watchlist','notifications','messages',
    'settings','help','about','legal','saved-searches','leaderboard','dashboard','drafts','referral',
    'housing','jobs','lostfound','schedules'];
  allViews.forEach(v => { const el = $(`view-${v}`); if (el) el.style.display = 'none'; });
  const target = $(`view-${page}`);
  if (target) { target.style.display=''; target.classList.remove('view-transition'); void target.offsetWidth; target.classList.add('view-transition'); }

  if (page==='profile')        loadProfilePage();
  if (page==='offers')         loadOffers();
  if (page==='stores')         loadStores();
  if (page==='recent')         loadRecentlyViewed();
  if (page==='watchlist')      loadWatchlist();
  if (page==='notifications')  renderNotifications();
  if (page==='messages')       renderConversationList();
  if (page==='saved-searches') loadSavedSearches();
  if (page==='leaderboard')    loadLeaderboard();
  if (page==='dashboard')      loadSellerDashboard();
  if (page==='drafts')         loadDrafts();
  if (page==='referral')       loadReferralInfo();
  closeSidebar();
}

/* ── Patch loadProfilePage to show rating/ID badges ──── */
function loadProfilePage() {
  loadProfilePageBase();
  if (!currentUser) return;
  const idBadge = $('ph-id-verified-badge');
  if (idBadge) idBadge.style.display = currentUser.isStudentVerified ? '' : 'none';
  const ratingRow = $('ph-rating-row');
  if (ratingRow) {
    if (currentUser.ratingCount > 0) {
      ratingRow.style.display = '';
      ratingRow.innerHTML = starRatingHTML(currentUser.ratingAvg || 0, currentUser.ratingCount || 0);
    } else ratingRow.style.display = 'none';
  }
}

/* ── Patch openBottomSheet to wire meetup/rating/block/bump/similar ─── */
function openBottomSheetV6(listing) {
  openBottomSheetBase(listing);
  if (!listing) return;
  const isMine = currentUser && (listing.seller?._id || listing.seller) === currentUser._id;
  const seller = typeof listing.seller === 'object' ? listing.seller : {};

  // Seller rating in seller card
  const sellerRatingEl = $('bs-seller-rating');
  if (sellerRatingEl) {
    if (seller.ratingCount > 0) { sellerRatingEl.style.display=''; sellerRatingEl.innerHTML = starRatingHTML(seller.ratingAvg||0, seller.ratingCount||0); }
    else sellerRatingEl.style.display = 'none';
  }

  // Block button — only show for non-owner
  const blockBtn = $('bs-block-btn');
  if (blockBtn) blockBtn.style.display = (!isMine && currentUser) ? '' : 'none';

  // Bump row — owner only (nested inside owner-controls already, but toggle visibility explicitly)
  const bumpRow = $('bs-bump-row');
  if (bumpRow) bumpRow.style.display = isMine ? '' : 'none';

  // Meetup card — non-owner only
  const meetupCard = $('bs-meetup-card');
  if (meetupCard) {
    if (!isMine && currentUser) { meetupCard.style.display=''; loadMeetupStatus(listing, seller); }
    else meetupCard.style.display = 'none';
  }

  // Similar listings
  loadSimilarListings(listing._id);
}

/* ── Similar Listings ─────────────────────────────────── */
async function loadSimilarListings(listingId) {
  const scroll = $('similar-scroll'); if (!scroll) return;
  scroll.innerHTML = '<div style="padding:10px;color:var(--muted);font-size:12px"><i class="fa fa-spinner fa-spin"></i></div>';
  try {
    const r = await fetch(`${API}/listings/${listingId}/similar`, { headers: authHdr() });
    const d = await r.json();
    const similar = d.listings || [];
    if (!similar.length) { scroll.innerHTML = '<p style="font-size:12px;color:var(--muted);padding:8px 0">No similar listings yet.</p>'; return; }
    scroll.innerHTML = similar.map(l => {
      const img = l.images?.[0];
      const src = img ? (img.startsWith('/')?SERVER:'')+img : catImage(l.category);
      return `<div class="similar-card" onclick="openDetail('${esc(l._id)}')">
        <img src="${esc(src)}" alt="${esc(l.title)}" loading="lazy"/>
        <div class="similar-card-body"><div class="similar-card-title">${esc(l.title)}</div><div class="similar-card-price">${fmtPrice(l.price)}</div></div>
      </div>`;
    }).join('');
  } catch { scroll.innerHTML = ''; }
}

/* ── Meetup Confirmation ───────────────────────────────── */
async function loadMeetupStatus(listing, seller) {
  if (!currentUser) return;
  try {
    const r = await fetch(`${API}/meetups/status?listingId=${listing._id}&otherUserId=${seller._id||seller}`, { headers: authHdr() });
    const d = await r.json();
    currentMeetup = d.meetup;
    renderMeetupCard();
  } catch { currentMeetup = null; }
}

function renderMeetupCard() {
  const buyerIcon  = $('meetup-buyer-icon');
  const sellerIcon = $('meetup-seller-icon');
  const confirmBtn = $('btn-confirm-meetup');
  const rateBtn    = $('btn-rate-now');
  if (!buyerIcon) return;

  const buyerConfirmed  = currentMeetup?.buyerConfirmed  || false;
  const sellerConfirmed = currentMeetup?.sellerConfirmed || false;

  buyerIcon.className  = `fa fa-circle${buyerConfirmed?'-check confirmed':' pending'}`;
  sellerIcon.className = `fa fa-circle${sellerConfirmed?'-check confirmed':' pending'}`;

  if (buyerConfirmed) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fa fa-check"></i> You Confirmed';
  } else {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = '<i class="fa fa-check"></i> I Met the Seller';
  }

  rateBtn.style.display = (buyerConfirmed && sellerConfirmed) ? '' : 'none';
}

async function doConfirmMeetup() {
  if (!currentDetail || !currentUser) return;
  const seller = typeof currentDetail.seller === 'object' ? currentDetail.seller : { _id: currentDetail.seller };
  try {
    const r = await fetch(`${API}/meetups/confirm`, { method:'POST', headers: authHdr(), body: JSON.stringify({ listingId: currentDetail._id, otherUserId: seller._id }) });
    const d = await r.json();
    if (!r.ok) return showToast(d.error || 'Could not confirm.', 'error');
    currentMeetup = d.meetup;
    renderMeetupCard();
    showToast(d.message, 'success');
  } catch { showToast('Could not confirm meetup.', 'error'); }
}

/* ── Rating Modal ──────────────────────────────────────── */
let selectedStars = 0;
function openRatingModal() {
  if (!currentDetail) return;
  const seller = typeof currentDetail.seller === 'object' ? currentDetail.seller : {};
  $('rating-seller-name').textContent = seller.name || 'this seller';
  selectedStars = 0;
  document.querySelectorAll('#star-input i').forEach(i => i.classList.remove('active'));
  $('rating-comment').value = '';
  $('rating-overlay').classList.add('open');
}
function closeRatingModal() { $('rating-overlay')?.classList.remove('open'); }
function setRatingStars(val) {
  selectedStars = val;
  document.querySelectorAll('#star-input i').forEach(i => i.classList.toggle('active', parseInt(i.dataset.val) <= val));
}
async function submitRatingNow() {
  if (!selectedStars) return showToast('Select a star rating.', 'error');
  if (!currentDetail) return;
  const seller = typeof currentDetail.seller === 'object' ? currentDetail.seller : { _id: currentDetail.seller };
  try {
    const r = await fetch(`${API}/ratings`, { method:'POST', headers: authHdr(), body: JSON.stringify({
      listingId: currentDetail._id, ratee: seller._id, stars: selectedStars, comment: $('rating-comment')?.value.trim() || ''
    })});
    const d = await r.json();
    if (!r.ok) return showToast(d.error || 'Could not submit rating.', 'error');
    showToast('Thanks for rating! ⭐', 'success');
    closeRatingModal();
  } catch { showToast('Could not submit rating.', 'error'); }
}

/* ── Block User ───────────────────────────────────────── */
function confirmBlockUser() {
  if (!currentDetail) return;
  const seller = typeof currentDetail.seller === 'object' ? currentDetail.seller : {};
  $('block-user-name').textContent = seller.name || 'this user';
  $('block-overlay').classList.add('open');
}
function closeBlockModal() { $('block-overlay')?.classList.remove('open'); }
async function doBlockUser() {
  if (!currentDetail) return;
  const seller = typeof currentDetail.seller === 'object' ? currentDetail.seller : { _id: currentDetail.seller };
  try {
    const r = await fetch(`${API}/meetups/block`, { method:'POST', headers: authHdr(), body: JSON.stringify({ userId: seller._id }) });
    const d = await r.json();
    if (!r.ok) return showToast(d.error || 'Could not block user.', 'error');
    showToast('User blocked.', 'success');
    closeBlockModal();
    closeBottomSheet();
  } catch { showToast('Could not block user.', 'error'); }
}

/* ── Bump Listing ─────────────────────────────────────── */
async function doBumpListing() {
  if (!currentDetail) return;
  const btn = $('bs-bump-btn');
  btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Bumping…';
  try {
    const r = await fetch(`${API}/listings/${currentDetail._id}/bump`, { method:'POST', headers: authHdr() });
    const d = await r.json();
    if (!r.ok) { showToast(d.error || 'Could not bump.', 'error'); return; }
    showToast(d.message, 'success');
    await loadListings();
  } catch { showToast('Could not bump listing.', 'error'); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="fa fa-rocket"></i> Bump to Top (free, once/24h)'; }
}

/* ── Saved Searches ───────────────────────────────────── */
async function createSavedSearch() {
  const query = $('ss-query')?.value.trim();
  const category = $('ss-category')?.value;
  const maxPrice = $('ss-max-price')?.value;
  if (!query && (!category || category === 'all')) return showToast('Enter a keyword or pick a category.', 'error');
  try {
    const r = await fetch(`${API}/auth/saved-searches`, { method:'POST', headers: authHdr(), body: JSON.stringify({ query, category, maxPrice }) });
    const d = await r.json();
    if (!r.ok) return showToast(d.error || 'Could not save search.', 'error');
    showToast(d.message, 'success');
    $('ss-query').value=''; $('ss-max-price').value=''; $('ss-category').value='all';
    loadSavedSearches();
  } catch { showToast('Could not save search.', 'error'); }
}

async function loadSavedSearches() {
  const list = $('saved-searches-list'), empty = $('saved-searches-empty');
  if (!list) return;
  try {
    const r = await fetch(`${API}/auth/saved-searches`, { headers: authHdr() });
    const d = await r.json();
    const searches = d.savedSearches || [];
    if (!searches.length) { list.innerHTML=''; empty.style.display=''; return; }
    empty.style.display = 'none';
    list.innerHTML = searches.map(s => `
      <div class="saved-search-card">
        <div class="saved-search-icon"><i class="fa fa-bell"></i></div>
        <div class="saved-search-info">
          <div class="saved-search-query">${esc(s.query || (s.category!=='all'?s.category:'Any item'))}</div>
          <div class="saved-search-meta">${s.category!=='all'?catEmoji(s.category)+' '+esc(s.category)+' · ':''}${s.maxPrice?'Under '+fmtPrice(s.maxPrice):'Any price'}</div>
        </div>
        <button class="saved-search-del" onclick="deleteSavedSearch('${esc(s._id)}')"><i class="fa fa-trash"></i></button>
      </div>`).join('');
  } catch { list.innerHTML=''; }
}

async function deleteSavedSearch(id) {
  try {
    const r = await fetch(`${API}/auth/saved-searches/${id}`, { method:'DELETE', headers: authHdr() });
    if (!r.ok) return showToast('Could not delete.', 'error');
    showToast('Removed.', 'info');
    loadSavedSearches();
  } catch { showToast('Could not delete.', 'error'); }
}

function quickSaveSearchFromListing() {
  if (!currentDetail) return;
  showPageAnimated('saved-searches');
  closeBottomSheet();
  setTimeout(() => {
    $('ss-category') && ($('ss-category').value = currentDetail.category);
    showToast('Set your keyword and tap "Create Alert" 🔔', 'info');
  }, 300);
}

/* ── Leaderboard ──────────────────────────────────────── */
async function loadLeaderboard() {
  const list = $('leaderboard-list'), empty = $('leaderboard-empty');
  if (!list) return;
  list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)"><i class="fa fa-spinner fa-spin"></i></div>';
  try {
    const r = await fetch(`${API}/auth/leaderboard`);
    const d = await r.json();
    const top = d.topSellers || [];
    $('leaderboard-period') && ($('leaderboard-period').textContent = d.period || 'Last 30 days');
    if (!top.length) { list.innerHTML=''; empty.style.display=''; return; }
    empty.style.display = 'none';
    const rankClass = i => i===0?'gold':i===1?'silver':i===2?'bronze':'';
    list.innerHTML = top.map((s,i) => `
      <div class="leaderboard-item${i===0?' top1':''}">
        <div class="leaderboard-rank ${rankClass(i)}">${i+1}</div>
        <div class="leaderboard-avatar">${(s.user.name||'S')[0].toUpperCase()}</div>
        <div class="leaderboard-info">
          <div class="leaderboard-name">${esc(s.user.name||'Seller')} ${s.user.isStudentVerified?'<i class="fa fa-check-circle" style="color:var(--blue);font-size:11px"></i>':''}</div>
          <div class="leaderboard-meta">${s.user.campus?esc(s.user.campus)+' · ':''}${s.totalViews} total views</div>
        </div>
        <div class="leaderboard-listings"><strong>${s.listingCount}</strong><span>listings</span></div>
      </div>`).join('');
  } catch { list.innerHTML=''; }
}

/* ── Seller Dashboard ─────────────────────────────────── */
async function loadSellerDashboard() {
  const summaryEl = $('dash-summary'), listEl = $('dash-listings-list'), empty = $('dash-empty');
  if (!summaryEl) return;
  try {
    const r = await fetch(`${API}/listings/my/dashboard`, { headers: authHdr() });
    const d = await r.json();
    const s = d.summary || {};
    summaryEl.innerHTML = `
      <div class="dash-stat-card"><div class="dash-stat-num">${s.activeListings||0}</div><div class="dash-stat-lbl">Active</div></div>
      <div class="dash-stat-card"><div class="dash-stat-num">${s.totalViews||0}</div><div class="dash-stat-lbl">Total Views</div></div>
      <div class="dash-stat-card"><div class="dash-stat-num">${s.totalInterested||0}</div><div class="dash-stat-lbl">Interested</div></div>
      <div class="dash-stat-card"><div class="dash-stat-num">${s.soldListings||0}</div><div class="dash-stat-lbl">Sold</div></div>`;
    const listings = d.listings || [];
    if (!listings.length) { listEl.innerHTML=''; empty.style.display=''; return; }
    empty.style.display = 'none';
    listEl.innerHTML = listings.map(l => `
      <div class="dash-listing-row">
        <div class="dash-listing-title">${esc(l.title)}</div>
        <div class="dash-listing-stats">
          <div class="dash-mini-stat"><strong>${l.views||0}</strong>views</div>
          <div class="dash-mini-stat"><strong>${l.interestedCount||0}</strong>interest</div>
        </div>
      </div>`).join('');
  } catch { listEl.innerHTML=''; }
}

/* ── Drafts ───────────────────────────────────────────── */
async function loadDrafts() {
  const list = $('drafts-list'), empty = $('drafts-empty');
  if (!list) return;
  try {
    const r = await fetch(`${API}/listings/my/drafts`, { headers: authHdr() });
    const d = await r.json();
    const drafts = d.drafts || [];
    if (!drafts.length) { list.innerHTML=''; empty.style.display=''; return; }
    empty.style.display = 'none';
    list.innerHTML = drafts.map(dr => `
      <div class="card-box" style="padding:14px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span class="draft-badge">DRAFT</span>
          <strong style="font-size:13px">${esc(dr.title||'Untitled')}</strong>
        </div>
        <div style="font-size:12px;color:var(--muted)">${dr.price?fmtPrice(dr.price):'No price set'} · ${catEmoji(dr.category)} ${esc(dr.category)}</div>
        <div class="draft-actions">
          <button class="btn-publish-draft" onclick="publishDraft('${esc(dr._id)}')"><i class="fa fa-upload"></i> Publish</button>
          <button class="btn-edit-draft" onclick="editDraft('${esc(dr._id)}')"><i class="fa fa-pen"></i> Edit</button>
        </div>
      </div>`).join('');
  } catch { list.innerHTML=''; }
}

async function publishDraft(id) {
  try {
    const r = await fetch(`${API}/listings/${id}`, { method:'PUT', headers: authHdr(), body: JSON.stringify({ isDraft: false }) });
    const d = await r.json();
    if (!r.ok) return showToast(d.error || 'Could not publish.', 'error');
    showToast('Draft published! 🎉', 'success');
    loadDrafts(); loadListings();
  } catch { showToast('Could not publish draft.', 'error'); }
}

function editDraft(id) {
  // Pull from drafts list already fetched, or fetch single listing
  fetch(`${API}/listings/${id}`, { headers: authHdr() }).then(r=>r.json()).then(d => {
    if (!d.listing) return showToast('Could not load draft.', 'error');
    editingListing = d.listing;
    $('modal-title-text').textContent = 'Edit Draft';
    $('post-btn').innerHTML = '<i class="fa fa-save"></i> Save Draft';
    $('item-title').value = d.listing.title||''; $('item-desc').value = d.listing.desc||'';
    $('item-price').value = d.listing.price||''; $('item-contact').value = d.listing.contact||currentUser?.phone||'';
    $('item-stock').value = d.listing.stock||1; $('item-category').value = d.listing.category||'other';
    $('item-condition').value = d.listing.condition||'Good'; $('item-location').value = d.listing.location||'';
    $('item-is-promo') && ($('item-is-promo').checked = false);
    $('modal-overlay').classList.add('open'); $('sell-modal').classList.add('open');
  }).catch(()=>showToast('Could not load draft.', 'error'));
}

/* ── Referral System ──────────────────────────────────── */
async function loadReferralInfo() {
  try {
    const r = await fetch(`${API}/auth/referral`, { headers: authHdr() });
    const d = await r.json();
    $('referral-code-box') && ($('referral-code-box').textContent = d.referralCode || '------');
    $('referral-credits')  && ($('referral-credits').textContent  = d.referralCredits || 0);
    $('referral-count')    && ($('referral-count').textContent    = d.referredCount || 0);
    window._referralShareLink = d.shareLink;
  } catch {}
}
function shareReferral() {
  const link = window._referralShareLink || window.location.href;
  const text = `Join me on CampusMart — the campus marketplace! Use my code when you sign up: ${$('referral-code-box')?.textContent}\n${link}`;
  if (navigator.share) navigator.share({ title: 'Join CampusMart', text, url: link });
  else { navigator.clipboard?.writeText(text); showToast('Referral link copied! 📋', 'success'); }
}
async function applyReferral() {
  const code = $('referral-apply-input')?.value.trim();
  if (!code) return showToast('Enter a referral code.', 'error');
  try {
    const r = await fetch(`${API}/auth/referral/apply`, { method:'POST', headers: authHdr(), body: JSON.stringify({ code }) });
    const d = await r.json();
    if (!r.ok) return showToast(d.error || 'Invalid code.', 'error');
    showToast(d.message, 'success');
    $('referral-apply-input').value = '';
  } catch { showToast('Could not apply code.', 'error'); }
}

/* ── Student ID Upload ────────────────────────────────── */
let studentIdFile = null;
function previewStudentId(e) {
  const file = e.target.files?.[0]; if (!file) return;
  studentIdFile = file;
  const reader = new FileReader();
  reader.onload = ev => { $('student-id-preview').src = ev.target.result; $('student-id-preview').style.display=''; $('submit-id-btn').style.display=''; };
  reader.readAsDataURL(file);
}
async function submitStudentIdUpload() {
  if (!studentIdFile) return showToast('Choose a photo first.', 'error');
  const btn = $('submit-id-btn');
  btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Uploading…';
  const fd = new FormData(); fd.append('idImage', studentIdFile);
  try {
    const r = await fetch(`${API}/auth/verify-student-id`, { method:'POST', headers: { Authorization:`Bearer ${localStorage.getItem('cm_token')}` }, body: fd });
    const d = await r.json();
    if (!r.ok) return showToast(d.error || 'Upload failed.', 'error');
    showToast(d.message, 'success');
    currentUser = d.user; localStorage.setItem('cm_user', JSON.stringify(d.user));
    closeVerifyModal();
    renderIdStatus();
  } catch { showToast('Upload failed.', 'error'); }
  finally { btn.disabled=false; btn.innerHTML='<i class="fa fa-paper-plane"></i> Submit for Review'; }
}
function renderIdStatus() {
  const el = $('id-status-display'); if (!el || !currentUser) return;
  const status = currentUser.studentIdStatus;
  if (status === 'pending') el.innerHTML = '<div class="id-status-banner pending"><i class="fa fa-clock"></i> Your student ID is under review.</div>';
  else if (status === 'approved') el.innerHTML = '<div class="id-status-banner approved"><i class="fa fa-check-circle"></i> Your student ID is verified!</div>';
  else if (status === 'rejected') el.innerHTML = '<div class="id-status-banner rejected"><i class="fa fa-times-circle"></i> ID rejected. Try uploading a clearer photo.</div>';
  else el.innerHTML = '';
}

/* ── PWA Install ──────────────────────────────────────── */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPWAInstall = e;
  if (!localStorage.getItem('cm_pwa_dismissed')) {
    setTimeout(() => $('pwa-install-banner')?.classList.add('visible'), 3000);
  }
});
function installPWA() {
  if (!deferredPWAInstall) return dismissPwaBanner();
  deferredPWAInstall.prompt();
  deferredPWAInstall.userChoice.then(() => { dismissPwaBanner(); });
}
function dismissPwaBanner() {
  $('pwa-install-banner')?.classList.remove('visible');
  localStorage.setItem('cm_pwa_dismissed', '1');
}
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
}

/* ── Hook ID status render into profile load ──────────── */
function updateUserUI() {
  updateUserUIBase();
  renderIdStatus();
}

/* ── Init on DOM ready ─────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  registerServiceWorker();
});

/* ═══════════════════════════════════════════════════════
   v7 — MMUST Hub (Housing/Jobs/Lost&Found), AI Search/Generator,
   Admin role check, Delivery Scheduling, Disputes,
   Server-synced Watchlist, Push Subscriptions
   ═══════════════════════════════════════════════════════ */

let mmustTaxonomy = { schools: [], hostels: [] };
let currentListingTypeInModal = 'marketplace';
let currentLostFoundKind = 'lost';
let currentLostFoundFilter = 'all';
let smartSearchEnabled = false;

/* ── Load MMUST taxonomy and populate all selects ────── */
async function loadMmustTaxonomy() {
  try {
    const r = await fetch(`${API}/listings/taxonomy`);
    const d = await r.json();
    mmustTaxonomy = { schools: d.schools || [], hostels: d.hostels || [] };

    const schoolSelects = ['item-school', 'edit-school'];
    const hostelSelects = ['item-hostel-general', 'housing-hostel', 'edit-hostel'];

    schoolSelects.forEach(id => {
      const sel = $(id); if (!sel) return;
      mmustTaxonomy.schools.forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o); });
    });
    hostelSelects.forEach(id => {
      const sel = $(id); if (!sel) return;
      mmustTaxonomy.hostels.forEach(h => { const o = document.createElement('option'); o.value = h; o.textContent = h; sel.appendChild(o); });
    });

    // Housing filter chips on the Housing page
    const filterBar = $('housing-hostel-filter');
    if (filterBar) {
      filterBar.innerHTML = `<button class="campus-chip active" data-hostel="" onclick="filterHousingByHostel('',this)">📍 All Areas</button>` +
        mmustTaxonomy.hostels.map(h => `<button class="campus-chip" data-hostel="${esc(h)}" onclick="filterHousingByHostel('${esc(h)}',this)">🏠 ${esc(h)}</button>`).join('');
    }
  } catch {}
}

/* ── Listing Type Switching (Sell Modal) ─────────────── */
function switchListingType(type) {
  currentListingTypeInModal = type;
  document.querySelectorAll('.lt-tab').forEach(t => t.classList.toggle('active', t.dataset.type === type));
  ['marketplace','housing','job','lostfound'].forEach(t => {
    const el = $(`fields-${t}`); if (el) el.style.display = t === type ? '' : 'none';
  });
  // Marketplace fields hold price/category which are needed for all types in the backend's
  // generic `price` field — for housing we mirror housing-price into item-price on submit.
  const hostelWrap = $('item-hostel-wrap');
  if (hostelWrap) hostelWrap.style.display = type === 'housing' ? 'none' : ''; // housing has its own hostel select
}

function setLostFoundKind(kind) {
  currentLostFoundKind = kind;
  document.querySelectorAll('.lf-toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.kind === kind));
}

/* ── AI Listing Generator ─────────────────────────────── */
async function aiGenerateListingNow() {
  const blurb = $('ai-blurb')?.value.trim();
  if (!blurb || blurb.length < 3) return showToast('Type a short description first.', 'error');
  const btn = document.querySelector('.btn-ai-generate');
  btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Generating…';
  try {
    const r = await fetch(`${API}/listings/ai-generate`, { method:'POST', headers: authHdr(), body: JSON.stringify({ input: blurb, listingType: currentListingTypeInModal }) });
    const d = await r.json();
    if (!r.ok) return showToast(d.error || 'Could not generate.', 'error');
    $('item-title').value = d.title;
    $('item-desc').value  = d.desc;
    if (currentListingTypeInModal === 'marketplace') {
      $('item-category').value  = d.category;
      $('item-condition').value = d.condition;
    }
    showToast('✨ Generated! Review and edit as needed.', 'success');
  } catch { showToast('Could not generate listing.', 'error'); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="fa fa-wand-magic-sparkles"></i> Generate Title, Description & Category'; }
}

/* ── Smart (AI) Search Toggle ─────────────────────────── */
function toggleSmartSearch() {
  smartSearchEnabled = !smartSearchEnabled;
  $('search-ai-toggle')?.classList.toggle('active', smartSearchEnabled);
  showToast(smartSearchEnabled ? '✨ Smart search on — try "bedsitter under KES 5000"' : 'Smart search off', 'info', 2500);
  searchListings();
}

/* ── Patch searchListings to support smart mode via API ──── */
function searchListingsBase() {
  clearTimeout(searchDebounce);
  const q = $('search-input')?.value.trim().toLowerCase() || '';
  const clearBtn = $('search-clear'); if (clearBtn) clearBtn.style.display = q ? '' : 'none';
  showSearchSuggestions(q);
  searchDebounce = setTimeout(() => {
    currentPage = 1;
    filteredList = allListings.filter(l => !q || l.title.toLowerCase().includes(q) || l.desc?.toLowerCase().includes(q) || l.category.toLowerCase().includes(q));
    if (activeCampus !== 'all') filteredList = filteredList.filter(l => (l.seller?.campus || '') === activeCampus);
    applySortToFiltered(); renderListings(); hideSearchSuggestions();
  }, 300);
}

async function searchListings() {
  const q = $('search-input')?.value.trim() || '';
  const clearBtn = $('search-clear'); if (clearBtn) clearBtn.style.display = q ? '' : 'none';

  if (!smartSearchEnabled || q.length < 4) { searchListingsBase(); return; }

  clearTimeout(searchDebounce);
  hideSearchSuggestions();
  searchDebounce = setTimeout(async () => {
    try {
      const r = await fetch(`${API}/listings?search=${encodeURIComponent(q)}&smart=true&limit=50`, { headers: authHdr() });
      const d = await r.json();
      filteredList = d.listings || [];
      currentPage = 1;
      renderListings();
      if (d.interpretedAs) {
        const parts = [];
        if (d.interpretedAs.maxPrice) parts.push(`under ${fmtPrice(d.interpretedAs.maxPrice)}`);
        if (d.interpretedAs.categoryHint) parts.push(catEmoji(d.interpretedAs.categoryHint) + ' ' + d.interpretedAs.categoryHint);
        if (d.interpretedAs.listingTypeHint) parts.push(d.interpretedAs.listingTypeHint);
        if (parts.length) showToast(`✨ Searching: ${parts.join(', ')}`, 'info', 3000);
      }
    } catch { searchListingsBase(); }
  }, 400);
}

/* ── Housing Page ─────────────────────────────────────── */
let currentHousingHostelFilter = '';
async function loadHousingPage() {
  const grid = $('housing-grid'), empty = $('housing-empty'); if (!grid) return;
  try {
    const url = `${API}/listings?listingType=housing&limit=50${currentHousingHostelFilter ? '&hostel=' + encodeURIComponent(currentHousingHostelFilter) : ''}`;
    const r = await fetch(url, { headers: authHdr() });
    const d = await r.json();
    const listings = d.listings || [];
    if (!listings.length) { grid.innerHTML = ''; empty.style.display = ''; return; }
    empty.style.display = 'none';
    grid.innerHTML = listings.map(l => housingCardHTML(l)).join('');
    initLazyImages();
  } catch { grid.innerHTML = ''; }
}
function filterHousingByHostel(hostel, btn) {
  currentHousingHostelFilter = hostel;
  document.querySelectorAll('#housing-hostel-filter .campus-chip').forEach(c => c.classList.remove('active'));
  btn?.classList.add('active');
  loadHousingPage();
}
function housingCardHTML(l) {
  const img = l.images?.[0], imgSrc = img ? (img.startsWith('/')?SERVER:'')+img : catImage('other');
  const h = l.housing || {};
  return `<div class="listing-card" onclick="openDetail('${esc(l._id)}')">
    <div class="card-img-wrap"><img class="card-img lazy" data-src="${esc(imgSrc)}" src="" alt="${esc(l.title)}" loading="lazy"/></div>
    <div class="card-body">
      <div class="card-title">${esc(l.title)}</div>
      <div class="card-time">${esc(l.hostel||'')}</div>
      <div class="card-price">${fmtPrice(l.price)}<span style="font-size:10px;color:var(--muted);font-weight:600"> /${esc(h.rentPeriod||'month')}</span></div>
      <div class="housing-card-meta">
        <span class="housing-rent-badge">${esc(h.propertyType||'Room')}</span>
        ${h.vacanciesCount ? `<span class="housing-vacancy-badge">${h.vacanciesCount} vacancy</span>` : ''}
      </div>
    </div>
  </div>`;
}

/* ── Jobs Page ─────────────────────────────────────────── */
async function loadJobsPage() {
  const grid = $('jobs-grid'), empty = $('jobs-empty'); if (!grid) return;
  try {
    const r = await fetch(`${API}/listings?listingType=job&limit=50`, { headers: authHdr() });
    const d = await r.json();
    const listings = d.listings || [];
    if (!listings.length) { grid.innerHTML = ''; empty.style.display = ''; return; }
    empty.style.display = 'none';
    grid.innerHTML = listings.map(l => jobCardHTML(l)).join('');
    initLazyImages();
  } catch { grid.innerHTML = ''; }
}
function jobCardHTML(l) {
  const img = l.images?.[0], imgSrc = img ? (img.startsWith('/')?SERVER:'')+img : catImage('services');
  const j = l.job || {};
  const payText = j.payType === 'negotiable' ? 'Negotiable' : `${fmtPrice(j.payAmount||l.price)} ${j.payType==='hourly'?'/hr':j.payType==='monthly'?'/mo':''}`;
  return `<div class="listing-card" onclick="openDetail('${esc(l._id)}')">
    <div class="card-img-wrap"><img class="card-img lazy" data-src="${esc(imgSrc)}" src="" alt="${esc(l.title)}" loading="lazy"/></div>
    <div class="card-body">
      <div class="card-title">${esc(l.title)}</div>
      <div class="card-time">${timeAgo(l.createdAt)}</div>
      <div class="card-price">${payText}</div>
      <div class="housing-card-meta">
        <span class="job-pay-badge">${esc(j.jobType||'Job')}</span>
        ${j.isRemote ? '<span class="job-pay-badge">🌐 Remote</span>' : ''}
      </div>
    </div>
  </div>`;
}

/* ── Lost & Found Page ────────────────────────────────── */
async function loadLostFoundPage() {
  const grid = $('lostfound-grid'), empty = $('lostfound-empty'); if (!grid) return;
  try {
    const r = await fetch(`${API}/listings?listingType=lostfound&limit=50`, { headers: authHdr() });
    const d = await r.json();
    let listings = d.listings || [];
    if (currentLostFoundFilter !== 'all') listings = listings.filter(l => l.lostfound?.kind === currentLostFoundFilter);
    if (!listings.length) { grid.innerHTML = ''; empty.style.display = ''; return; }
    empty.style.display = 'none';
    grid.innerHTML = listings.map(l => lostFoundCardHTML(l)).join('');
    initLazyImages();
  } catch { grid.innerHTML = ''; }
}
function filterLostFound(kind, btn) {
  currentLostFoundFilter = kind;
  document.querySelectorAll('.lf-filter-tabs .cat-pill').forEach(c => c.classList.remove('active'));
  btn?.classList.add('active');
  loadLostFoundPage();
}
function lostFoundCardHTML(l) {
  const img = l.images?.[0], imgSrc = img ? (img.startsWith('/')?SERVER:'')+img : catImage('other');
  const lf = l.lostfound || {};
  return `<div class="listing-card" onclick="openDetail('${esc(l._id)}')">
    <div class="card-img-wrap"><img class="card-img lazy" data-src="${esc(imgSrc)}" src="" alt="${esc(l.title)}" loading="lazy"/>
      ${lf.isClaimed ? '<div class="sold-out-overlay">CLAIMED</div>' : ''}
    </div>
    <div class="card-body">
      <div class="card-title">${esc(l.title)}</div>
      <div class="card-time">${esc(lf.locationLost||l.location||'')} · ${timeAgo(l.createdAt)}</div>
      <div class="housing-card-meta">
        <span class="lf-kind-badge ${lf.kind}">${lf.kind==='lost'?'😟 Lost':'🙌 Found'}</span>
        ${lf.isClaimed ? '<span class="lf-claimed-badge">Claimed</span>' : ''}
      </div>
    </div>
  </div>`;
}

async function markLostFoundClaimedNow() {
  if (!currentDetail) return;
  if (!confirm('Mark this item as claimed/returned?')) return;
  try {
    const r = await fetch(`${API}/listings/${currentDetail._id}/claim`, { method:'POST', headers: authHdr() });
    const d = await r.json();
    if (!r.ok) return showToast(d.error || 'Could not update.', 'error');
    showToast('Marked as claimed! 🎉', 'success');
    closeBottomSheet();
    loadLostFoundPage();
  } catch { showToast('Could not update.', 'error'); }
}

/* ── Delivery Scheduling ──────────────────────────────── */
function openScheduleModal() {
  if (!currentDetail) return;
  populateSafeZonesInto('schedule-location');
  $('schedule-time').value = '';
  $('schedule-notes').value = '';
  $('schedule-overlay').classList.add('open');
}
function closeScheduleModal() { $('schedule-overlay')?.classList.remove('open'); }
function populateSafeZonesInto(selectId) {
  const sel = $(selectId); if (!sel || sel.options.length > 1) return;
  SAFE_ZONES.forEach(z => { const o = document.createElement('option'); o.value = z; o.textContent = `📍 ${z}`; sel.appendChild(o); });
}
async function sendScheduleProposal() {
  if (!currentDetail) return;
  const meetupLocation = $('schedule-location')?.value;
  const meetupTime = $('schedule-time')?.value;
  const notes = $('schedule-notes')?.value.trim();
  if (!meetupLocation || !meetupTime) return showToast('Select a location and time.', 'error');
  const seller = typeof currentDetail.seller === 'object' ? currentDetail.seller : { _id: currentDetail.seller };
  try {
    const r = await fetch(`${API}/delivery/propose`, { method:'POST', headers: authHdr(), body: JSON.stringify({ listingId: currentDetail._id, otherUserId: seller._id, meetupLocation, meetupTime, notes }) });
    const d = await r.json();
    if (!r.ok) return showToast(d.error || 'Could not propose meetup.', 'error');
    showToast('Meetup proposed! 📅', 'success');
    closeScheduleModal();
  } catch { showToast('Could not propose meetup.', 'error'); }
}

async function loadSchedules() {
  const list = $('schedules-list'), empty = $('schedules-empty'); if (!list) return;
  try {
    const r = await fetch(`${API}/delivery/mine`, { headers: authHdr() });
    const d = await r.json();
    const schedules = d.schedules || [];
    if (!schedules.length) { list.innerHTML = ''; empty.style.display = ''; return; }
    empty.style.display = 'none';
    list.innerHTML = schedules.map(s => {
      const isMineProposed = s.proposedBy === currentUser._id;
      const otherParty = s.buyer._id === currentUser._id ? s.seller : s.buyer;
      return `<div class="schedule-card">
        <div class="schedule-card-title"><i class="fa fa-box"></i> ${esc(s.listing?.title||'Listing')}</div>
        <div class="schedule-meta"><i class="fa fa-user"></i> With ${esc(otherParty?.name||'User')}</div>
        <div class="schedule-meta"><i class="fa fa-map-marker-alt"></i> ${esc(s.meetupLocation)}</div>
        <div class="schedule-meta"><i class="fa fa-clock"></i> ${new Date(s.meetupTime).toLocaleString('en-KE',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
        <span class="schedule-status-badge ${s.status}">${esc(s.status)}</span>
        ${s.status === 'proposed' && !isMineProposed ? `
          <div class="schedule-actions">
            <button style="background:var(--brand);color:#fff" onclick="respondSchedule('${s._id}','accept')">Accept</button>
            <button style="background:var(--red);color:#fff" onclick="respondSchedule('${s._id}','decline')">Decline</button>
          </div>` : ''}
      </div>`;
    }).join('');
  } catch { list.innerHTML = ''; }
}
async function respondSchedule(scheduleId, action) {
  try {
    const r = await fetch(`${API}/delivery/respond`, { method:'POST', headers: authHdr(), body: JSON.stringify({ scheduleId, action }) });
    if (!r.ok) return showToast('Action failed.', 'error');
    showToast(`Meetup ${action}ed.`, 'success');
    loadSchedules();
  } catch { showToast('Action failed.', 'error'); }
}

/* ── Disputes ──────────────────────────────────────────── */
function openDisputeModal() {
  if (!currentDetail) return;
  $('dispute-reason').value = '';
  $('dispute-overlay').classList.add('open');
}
function closeDisputeModal() { $('dispute-overlay')?.classList.remove('open'); }
async function submitDispute() {
  const reason = $('dispute-reason')?.value.trim();
  if (!reason || reason.length < 10) return showToast('Describe the issue (10+ characters).', 'error');
  if (!currentDetail) return;
  const seller = typeof currentDetail.seller === 'object' ? currentDetail.seller : { _id: currentDetail.seller };
  try {
    const r = await fetch(`${API}/disputes`, { method:'POST', headers: authHdr(), body: JSON.stringify({ listingId: currentDetail._id, against: seller._id, reason }) });
    const d = await r.json();
    if (!r.ok) return showToast(d.error || 'Could not submit dispute.', 'error');
    showToast(d.message, 'success', 5000);
    closeDisputeModal();
  } catch { showToast('Could not submit dispute.', 'error'); }
}

/* ── Server-synced Watchlist (replaces localStorage-only) ──── */
async function syncWatchlistFromServer() {
  if (!currentUser) return;
  try {
    const r = await fetch(`${API}/auth/watchlist`, { headers: authHdr() });
    const d = await r.json();
    watchlist = (d.watchlist || []).map(l => l._id);
    localStorage.setItem('cm_watchlist', JSON.stringify(watchlist));
    updateBadges();
  } catch {}
}

async function toggleWatchlistByIdServer(id) {
  // Optimistic local update first (instant UI feedback)
  const idx = watchlist.indexOf(id);
  if (idx >= 0) watchlist.splice(idx, 1); else watchlist.push(id);
  localStorage.setItem('cm_watchlist', JSON.stringify(watchlist));
  updateBadges();
  // Then sync with server in background
  if (!currentUser) return;
  try {
    await fetch(`${API}/auth/watchlist/toggle`, { method:'POST', headers: authHdr(), body: JSON.stringify({ listingId: id }) });
  } catch {}
}
// Override the localStorage-only version with the server-synced one
function toggleWatchlistById(id) { toggleWatchlistByIdServer(id); }

/* ── MMUST Profile Fields (school/hostel/regNumber) ──────── */
async function saveMmustProfileFields() {
  const school = $('edit-school')?.value;
  const hostel = $('edit-hostel')?.value;
  const regNumber = $('edit-reg-number')?.value.trim();
  try {
    if (school !== undefined || hostel !== undefined) {
      await fetch(`${API}/auth/mmust-profile`, { method:'PUT', headers: authHdr(), body: JSON.stringify({ school, hostel }) });
    }
    if (regNumber) {
      const r = await fetch(`${API}/auth/reg-number`, { method:'POST', headers: authHdr(), body: JSON.stringify({ regNumber, school }) });
      const d = await r.json();
      if (!r.ok) showToast(d.error, 'warning');
    }
  } catch {}
}

/* ── Patch saveProfile to also save MMUST fields ──────────── */
function saveProfile() {
  saveProfileBase();
  saveMmustProfileFields();
}

/* ── Patch updateUserUI to populate MMUST select values ───── */
function populateMmustProfileSelects() {
  if (!currentUser) return;
  $('edit-school') && ($('edit-school').value = currentUser.school || '');
  $('edit-hostel') && ($('edit-hostel').value = currentUser.hostel || '');
  $('edit-reg-number') && ($('edit-reg-number').value = currentUser.regNumber || '');
}

/* ── Patch postListing to handle housing/job/lostfound payloads ─── */
async function postListing() {
  const title = $('item-title')?.value.trim();
  if (!title) return showToast('Title is required.', 'error');

  const type = currentListingTypeInModal;
  let price = $('item-price')?.value;
  let contact = $('item-contact')?.value.trim();

  if (type === 'housing') price = $('housing-price')?.value;
  if (type === 'job') price = $('job-pay-amount')?.value || '0';
  if (type === 'lostfound') price = '0';

  if (!contact) return showToast('Contact is required.', 'error');
  if (type !== 'lostfound' && !price) return showToast('Price is required.', 'error');

  const btn = $('post-btn');
  btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Posting…';

  const fd = new FormData();
  fd.append('title', title);
  fd.append('desc', $('item-desc')?.value.trim() || '');
  fd.append('price', price || '0');
  fd.append('contact', contact);
  fd.append('listingType', type);
  fd.append('location', $('item-location')?.value || '');
  fd.append('school', $('item-school')?.value || '');

  if (type === 'marketplace') {
    fd.append('category', $('item-category')?.value || 'other');
    fd.append('condition', $('item-condition')?.value || 'Good');
    fd.append('stock', $('item-stock')?.value || '1');
    fd.append('hostel', $('item-hostel-general')?.value || '');
    fd.append('isPromo', $('item-is-promo')?.checked ? 'true' : 'false');
    if ($('item-is-promo')?.checked) {
      fd.append('promoLabel', $('item-promo-label')?.value || '');
      fd.append('originalPrice', $('item-original-price')?.value || '');
    }
  } else if (type === 'housing') {
    fd.append('hostel', $('housing-hostel')?.value || '');
    fd.append('housing', JSON.stringify({
      propertyType: $('housing-property-type')?.value || '',
      rentPeriod: $('housing-rent-period')?.value || 'monthly',
      deposit: parseFloat($('housing-deposit')?.value) || 0,
      distanceToMmust: $('housing-distance')?.value || '',
      roommatesWanted: $('housing-roommates')?.checked || false,
      vacanciesCount: parseInt($('housing-vacancies')?.value) || 1,
      amenities: ($('housing-amenities')?.value || '').split(',').map(a => a.trim()).filter(Boolean),
    }));
  } else if (type === 'job') {
    fd.append('job', JSON.stringify({
      jobType: $('job-type')?.value || '',
      payType: $('job-pay-type')?.value || 'negotiable',
      payAmount: parseFloat($('job-pay-amount')?.value) || 0,
      duration: $('job-duration')?.value || '',
      skillsNeeded: ($('job-skills')?.value || '').split(',').map(s => s.trim()).filter(Boolean),
      isRemote: $('job-remote')?.checked || false,
    }));
  } else if (type === 'lostfound') {
    fd.append('lostfound', JSON.stringify({
      kind: currentLostFoundKind,
      itemDateLost: $('lf-date')?.value || null,
      locationLost: $('lf-location')?.value || '',
    }));
  }

  uploadedImages.forEach(f => fd.append('images', f));

  try {
    const url = editingListing ? `${API}/listings/${editingListing._id}` : `${API}/listings`;
    const method = editingListing ? 'PUT' : 'POST';
    const r = await fetch(url, { method, headers: { Authorization: `Bearer ${localStorage.getItem('cm_token')}` }, body: fd });
    const d = await r.json();
    if (!r.ok) return showToast(d.error || 'Post failed.', 'error');
    if (!editingListing && !localStorage.getItem('cm_has_posted')) { localStorage.setItem('cm_has_posted', '1'); setTimeout(launchConfetti, 500); }
    showToast(editingListing ? 'Listing updated! ✅' : 'Listing posted! 🎉', 'success');
    closeModal();
    await loadListings();
  } catch { showToast('Could not post listing.', 'error'); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="fa fa-paper-plane"></i> Post Listing'; }
}

/* ── Push Notification Subscription ───────────────────────── */
async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      // No VAPID key configured yet — this is a no-op until you add one server-side.
      // Kept here so the wiring is ready the moment a VAPID key is added.
      return;
    }
    await fetch(`${API}/auth/push-subscribe`, { method:'POST', headers: authHdr(), body: JSON.stringify({ subscription: sub }) });
  } catch {}
}

/* ── Final showPageAnimated wrapper — calls v6 then adds v7 pages ────── */
function showPageAnimated(page) {
  showPageAnimatedV6(page);
  if (page === 'housing')   loadHousingPage();
  if (page === 'jobs')      loadJobsPage();
  if (page === 'lostfound') loadLostFoundPage();
  if (page === 'schedules') loadSchedules();
  if (page === 'profile')   populateMmustProfileSelects();
}
window.showPage = showPageAnimated;

/* ── Add lost&found claim button to bottom sheet owner controls ─── */
function openBottomSheet(listing) {
  openBottomSheetV6(listing);
  if (!listing) return;
  const isMine = currentUser && (listing.seller?._id || listing.seller) === currentUser._id;
  if (listing.listingType === 'lostfound' && isMine && !listing.lostfound?.isClaimed) {
    const ownerControls = $('bs-owner-controls');
    if (ownerControls && !$('bs-claim-btn')) {
      const btn = document.createElement('button');
      btn.id = 'bs-claim-btn'; btn.className = 'btn-confirm-meetup'; btn.style.marginTop = '8px';
      btn.innerHTML = '<i class="fa fa-check"></i> Mark as Claimed';
      btn.onclick = markLostFoundClaimedNow;
      ownerControls.appendChild(btn);
    }
  } else {
    $('bs-claim-btn')?.remove();
  }
}

/* ── Rename original saveProfile for the patch above ──────── */
function saveProfileBase() {
  const updates = { name: $('edit-name')?.value.trim(), phone: $('edit-phone')?.value.trim(), campus: $('edit-campus')?.value.trim(), bio: $('edit-bio')?.value.trim() };
  fetch(`${API}/auth/me`, { method:'PUT', headers: authHdr(), body: JSON.stringify(updates) })
    .then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
      if (!ok) return showToast(d.error || 'Update failed.', 'error');
      currentUser = d.user; localStorage.setItem('cm_user', JSON.stringify(d.user));
      updateUserUI();
      showToast('Profile updated! ✅', 'success');
    })
    .catch(() => showToast('Could not save profile.', 'error'));
}

/* ── Init v7 features ──────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  loadMmustTaxonomy();
});

function enterMarket() {
  enterMarketBase();
  syncWatchlistFromServer();
}
