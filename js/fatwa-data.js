/* ============================================================
   Shared fatwa data loading + canonical numbering
   Used by fatwa.html for full-archive lookups (serial number,
   previous/next navigation). iftaa.html has its own copy of the
   read/write localStorage helpers (it needs the write side for
   the admin CMS) but computes serial numbers with the exact same
   sort rule below, so numbers stay consistent between pages.
   ============================================================ */
(function (window) {
  function getLocal()     { try { return JSON.parse(localStorage.getItem('duny_fatwas')    || '[]'); } catch (e) { return []; } }
  function getOverrides() { try { return JSON.parse(localStorage.getItem('duny_overrides') || '{}'); } catch (e) { return {}; } }
  function getDeleted()   { try { return JSON.parse(localStorage.getItem('duny_deleted')   || '[]'); } catch (e) { return []; } }
  function getHidden()    { try { return JSON.parse(localStorage.getItem('duny_hidden')    || '[]'); } catch (e) { return []; } }

  let _db = null;
  function initFirebase() {
    if (_db) return _db;
    if (typeof FIREBASE_ENABLED === 'undefined' || !FIREBASE_ENABLED) return null;
    if (typeof firebase === 'undefined') return null;
    try {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      _db = firebase.firestore();
    } catch (e) { console.warn('[DUNY] Firebase init failed:', e.message); _db = null; }
    return _db;
  }

  async function fbLoadFatwas() {
    const db = initFirebase();
    if (!db) return null;
    try {
      const snap = await db.collection('fatwas').get();
      return snap.docs.map(d => d.data());
    } catch (e) { console.warn('[DUNY] Firestore load failed:', e); return null; }
  }

  /* Full merged list: Firestore/local admin uploads + seed data/fatwas.json
     (with saved edit overrides applied), minus anything marked deleted.
     Still includes hidden fatwas — filter those out with canonicalOrder(). */
  async function loadAllFatwas() {
    let jsonFatwas = [];
    try {
      const res = await fetch('data/fatwas.json');
      const json = await res.json();
      jsonFatwas = json.fatwas || [];
    } catch (e) { jsonFatwas = []; }

    const fbFatwas = await fbLoadFatwas();
    const local = fbFatwas || getLocal();
    const deleted = getDeleted();
    const overrides = getOverrides();
    const localSlugs = new Set(local.map(f => f.slug));

    const processedJson = jsonFatwas
      .filter(f => !deleted.includes(f.slug) && !localSlugs.has(f.slug))
      .map(f => (overrides[f.slug] ? { ...f, ...overrides[f.slug] } : f));

    return [...local, ...processedJson];
  }

  /* Canonical, stable ordering used for serial numbers and prev/next:
     oldest fatwa first, tie-broken alphabetically by slug. Hidden
     fatwas are excluded from the public sequence. */
  function canonicalOrder(all) {
    const hidden = getHidden();
    return all
      .filter(f => !hidden.includes(f.slug))
      .slice()
      .sort((a, b) => {
        const d = new Date(a.date) - new Date(b.date);
        if (d !== 0) return d;
        return (a.slug || '').localeCompare(b.slug || '');
      });
  }

  window.DunyFatwaData = { getLocal, getOverrides, getDeleted, getHidden, loadAllFatwas, canonicalOrder };
})(window);
