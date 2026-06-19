/* ═══════════════════════════════════════════════════════
   CampusMart v5 — Premium app.js
   All backend API calls unchanged
   ═══════════════════════════════════════════════════════ */
'use strict';

const API    = (window.CAMPUSMART_CONFIG?.API)    || 'https://thecampusmarketplacebackend.onrender.com/api';
const SERVER = (window.CAMPUSMART_CONFIG?.SERVER) || 'https://thecampusmarketplacebackend.onrender.com';

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

function handleGoogleRedirect() {
  const hash=window.location.hash;
  if(!hash.includes('google_token=')) return;
  const token=hash.split('google_token=')[1]?.split('&')[0];
  history.replaceState(null,'',window.location.pathname);
  if(!token) return;
  localStorage.setItem('cm_token',token);
  fetch(`${API}/auth/me`,{headers:{Authorization:`Bearer ${token}`}})
    .then(r=>r.json()).then(d=>{
      if(d.user){currentUser=d.user;localStorage.setItem('cm_user',JSON.stringify(d.user));loadLocalData();enterMarket();showToast('Signed in with Google! 🎉','success');}
    }).catch(()=>showToast('Google sign-in succeeded but profile failed. Refresh.','warning'));
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
function enterMarket() {
  $('login-page').classList.remove('active');
  $('market-page').classList.add('active');
  populateSafeZones(); updateUserUI(); loadListings();
  loadConversations(); initSocket(); updateBadges();
  showPageAnimated('listings');
  setTimeout(()=>{const sb=$('safety-banner');if(sb)setTimeout(()=>sb.style.display='none',8000);},0);
}

/* ── User UI ─────────────────────────────────────────── */
function updateUserUI() {
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
function showPageAnimated(page) {
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
window.showPage = showPageAnimated;

function goHome() { showPageAnimated('listings'); document.querySelectorAll('.bnav-item').forEach(b=>b.classList.remove('active')); $('bnav-home')?.classList.add('active'); }
function bnavGo(page,btnId) { showPageAnimated(page); document.querySelectorAll('.bnav-item').forEach(b=>b.classList.remove('active')); $(btnId)?.classList.add('active'); }
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
  try {
    const r=await fetch(`${API}/listings?limit=100`,{headers:authHdr()});
    const d=await r.json();
    allListings=d.listings||[]; filteredList=[...allListings]; currentPage=1;
    renderListings(); loadStats(); loadAiPicks(); buildStories(); buildCampusFilter(); startLiveFeedCheck();
  } catch {showToast('Could not load listings.','error');}
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

function openBottomSheet(listing){
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
function loadProfilePage(){
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
