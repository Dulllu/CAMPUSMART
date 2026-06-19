// ═══════════════════════════════════════════════════════
//  CampusMart — Server Configuration
//  ✏️  ONLY EDIT THIS FILE when deploying
// ═══════════════════════════════════════════════════════

const CAMPUSMART_CONFIG = (function() {
  const hostname = window.location.hostname;
  const isLocal  = hostname === 'localhost' || hostname === '127.0.0.1';

  // ─────────────────────────────────────────────────────
  //  🚀 PRODUCTION: paste your Render backend URL below
  //     e.g. 'https://campusmart-backend.onrender.com'
  //     Leave empty ('') and it will try to auto-detect
  // ─────────────────────────────────────────────────────
  const PRODUCTION_BACKEND_URL = 'https://thecampusmarketplacebackend.onrender.com';   // ← PASTE YOUR RENDER BACKEND URL HERE

  let server;
  if (isLocal) {
    server = 'http://localhost:5000';
  } else if (PRODUCTION_BACKEND_URL) {
    server = PRODUCTION_BACKEND_URL.replace(/\/$/, ''); // remove trailing slash
  } else {
    // Fallback: won't work unless frontend & backend share a domain
    server = window.location.origin;
  }

  console.log(`[CampusMart] Backend: ${server}`);
  return { SERVER: server, API: server + '/api' };
})();
