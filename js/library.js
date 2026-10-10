/* ============================================================
   Shared "library" logic for the Research Papers, Monthly
   Magazine and Events pages (and the PDF reader).

   Data lives in Firebase:
     - Firestore collections: articles, magazine, events
     - Storage folders:       articles/, magazine/, events/, fatawaas/
   Everyone can read; only a signed-in admin (the same Firebase Auth
   account used for the Iftaa admin panel) can upload, edit or delete.
   ============================================================ */
(function (window) {
  const KINDS = {
    articles: {
      collection: 'articles', folder: 'articles', pdf: 'required',
      singular: 'Research Paper', plural: 'Research Papers',
      fields: [
        { key: 'title', label: 'Title', type: 'text', required: true },
        { key: 'author', label: 'Author', type: 'text', required: true },
        { key: 'date', label: 'Date', type: 'date', required: true },
        { key: 'description', label: 'Short summary', type: 'textarea' }
      ],
      sort: (a, b) => (b.date || '').localeCompare(a.date || ''),
      meta: d => [d.author, fmtDate(d.date)].filter(Boolean).join(' · ')
    },
    magazine: {
      collection: 'magazine', folder: 'magazine', pdf: 'required',
      singular: 'Magazine Issue', plural: 'Magazine Issues',
      fields: [
        { key: 'title', label: 'Title (e.g. "Ramadan 2026 Issue")', type: 'text', required: true },
        { key: 'issue', label: 'Issue month', type: 'month', required: true },
        { key: 'description', label: 'What is in this issue', type: 'textarea' }
      ],
      sort: (a, b) => (b.issue || '').localeCompare(a.issue || ''),
      meta: d => fmtMonth(d.issue)
    },
    // Source PDFs attached to fatwas (stored on the fatwa document itself; no list page).
    fatawaas: {
      collection: 'fatwas', folder: 'fatawaas', pdf: 'required',
      singular: 'Fatwā', plural: 'Fatāwā', fields: [],
      sort: () => 0,
      meta: d => fmtDate(d.date)
    },
    events: {
      collection: 'events', folder: 'events', pdf: 'optional',
      singular: 'Event', plural: 'Events',
      fields: [
        { key: 'title', label: 'Event title', type: 'text', required: true },
        { key: 'date', label: 'Date', type: 'date', required: true },
        { key: 'time', label: 'Time (e.g. 7:00 PM)', type: 'text' },
        { key: 'location', label: 'Location', type: 'text' },
        { key: 'description', label: 'Details', type: 'textarea' }
      ],
      sort: (a, b) => (a.date || '').localeCompare(b.date || '')
    }
  };

  // Firebase Storage is optional (Blaze plan). Without it the admin form takes a PDF path/link.
  const STORAGE_ON = typeof STORAGE_ENABLED === 'undefined' || STORAGE_ENABLED;

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  function fmtMonth(ym) {
    if (!ym) return '';
    const d = new Date(ym + '-01T00:00:00');
    return isNaN(d) ? ym : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  }
  function todayIso() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function safeName(name) {
    return String(name || 'file').toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
  }

  /* ---------- firebase ---------- */
  let db = null, auth = null, storage = null, currentUser = null;
  const authListeners = [];

  function init() {
    if (db) return true;
    if (typeof FIREBASE_ENABLED === 'undefined' || !FIREBASE_ENABLED) return false;
    if (typeof firebase === 'undefined') return false;
    try {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
      auth = firebase.auth();
      storage = firebase.storage ? firebase.storage() : null;
      auth.onAuthStateChanged(user => {
        if (user && !isAllowedAdmin(user)) { auth.signOut(); return; }
        currentUser = user;
        authListeners.forEach(fn => fn(user));
      });
      return true;
    } catch (e) {
      console.warn('[DUNY] Firebase init failed:', e.message);
      db = auth = storage = null;
      return false;
    }
  }

  async function loadAll(kind) {
    if (!init()) throw new Error('Firebase is not available.');
    const snap = await db.collection(KINDS[kind].collection).get();
    return snap.docs.map(d => Object.assign({ id: d.id }, d.data())).sort(KINDS[kind].sort);
  }
  async function loadOne(kind, id) {
    if (!init()) throw new Error('Firebase is not available.');
    const doc = await db.collection(KINDS[kind].collection).doc(id).get();
    if (!doc.exists) return null;
    const data = Object.assign({ id: doc.id }, doc.data());
    if (kind === 'fatawaas') { data.pdfUrl = data.pdf_url; data.storagePath = data.pdf_path; }
    return data;
  }

  function uploadPdf(file, folder, onProgress) {
    return new Promise((resolve, reject) => {
      if (!storage) return reject(new Error('Firebase Storage is not available.'));
      const path = folder + '/' + Date.now() + '-' + safeName(file.name);
      const task = storage.ref(path).put(file, { contentType: file.type || 'application/pdf' });
      task.on('state_changed',
        snap => onProgress && onProgress(snap.bytesTransferred / snap.totalBytes),
        reject,
        async () => resolve({ path, url: await task.snapshot.ref.getDownloadURL() }));
    });
  }
  async function deleteStored(path) {
    if (!path || !storage) return;
    try { await storage.ref(path).delete(); } catch (e) { console.warn('[DUNY] Storage delete failed:', e.message); }
  }

  /* ---------- download ---------- */
  async function downloadFile(url, filename) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      // Cross-origin fetch blocked (CORS) — open the file so the browser can save it.
      window.open(url, '_blank', 'noopener');
    }
  }

  /* ---------- admin UI (login + upload dialogs) ---------- */
  function ensureAdminDom() {
    if (document.getElementById('lib-admin-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'lib-admin-fab';
    fab.title = 'Admin';
    fab.innerHTML = '<i class="fas fa-lock"></i>';
    fab.addEventListener('click', () => {
      if (currentUser) {
        if (confirm('Signed in as ' + currentUser.email + '.\nSign out?')) auth.signOut();
      } else openLogin();
    });
    document.body.appendChild(fab);
    authListeners.push(user => {
      fab.classList.toggle('signed-in', !!user);
      fab.innerHTML = user ? '<i class="fas fa-lock-open"></i>' : '<i class="fas fa-lock"></i>';
    });
  }

  function modal(html) {
    const ov = document.createElement('div');
    ov.className = 'lib-overlay';
    ov.innerHTML = '<div class="lib-modal">' + html + '</div>';
    ov.addEventListener('mousedown', e => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    return ov;
  }

  function openLogin() {
    if (!init()) { alert('Admin login unavailable — Firebase not connected.'); return; }
    const ov = modal(`
      <button class="lib-x" type="button" aria-label="Close">&times;</button>
      <h3>Admin Login</h3>
      <form>
        <label>Email<input type="email" name="email" required autocomplete="username" /></label>
        <label>Password<input type="password" name="pass" required autocomplete="current-password" /></label>
        <p class="lib-err" hidden></p>
        <button class="btn btn-gold" type="submit">Sign In</button>
      </form>`);
    ov.querySelector('.lib-x').onclick = () => ov.remove();
    const form = ov.querySelector('form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const err = ov.querySelector('.lib-err');
      err.hidden = true;
      try {
        const cred = await auth.signInWithEmailAndPassword(form.email.value.trim(), form.pass.value);
        if (!isAllowedAdmin(cred.user)) { await auth.signOut(); throw new Error('This account is not authorized for admin access.'); }
        ov.remove();
      } catch (ex) {
        err.textContent = 'Sign-in failed: ' + ex.message;
        err.hidden = false;
      }
    });
  }

  function openEditor(kind, existing, onSaved) {
    const cfg = KINDS[kind];
    const isEdit = !!existing;
    const fieldHtml = cfg.fields.map(f => {
      const val = esc(existing ? existing[f.key] : '');
      const req = f.required ? ' required' : '';
      const input = f.type === 'textarea'
        ? `<textarea name="${f.key}" rows="4">${val}</textarea>`
        : `<input type="${f.type}" name="${f.key}" value="${val}"${req} />`;
      return `<label>${esc(f.label)}${f.required ? ' *' : ''}${input}</label>`;
    }).join('');
    const pdfLabel = cfg.pdf === 'required'
      ? 'PDF file' + (isEdit ? ' (leave empty to keep the current one)' : ' *')
      : 'Flyer (PDF or image, optional)';
    const accept = cfg.pdf === 'required' ? 'application/pdf' : 'application/pdf,image/*';
    const linkLabel = (cfg.pdf === 'required' ? 'PDF path or link *' : 'Flyer path or link (optional)');
    const linkHint = 'Add the file to the GitHub repo in <code>uploads/' + cfg.folder + '/</code> and enter its path, e.g. <code>uploads/' + cfg.folder + '/my-file.pdf</code> — or paste a full link.';
    const fileHtml = STORAGE_ON
      ? `<label>${pdfLabel}<input type="file" name="file" accept="${accept}" /></label>`
      : `<label>${linkLabel}<input type="text" name="pdfLink" value="${esc(existing ? existing.pdfUrl : '')}"${cfg.pdf === 'required' ? ' required' : ''} /></label>
         <p class="lib-hint">${linkHint}</p>`;
    const ov = modal(`
      <button class="lib-x" type="button" aria-label="Close">&times;</button>
      <h3>${isEdit ? 'Edit' : 'Add'} ${esc(cfg.singular)}</h3>
      <form>
        ${fieldHtml}
        ${fileHtml}
        <div class="lib-progress" hidden><span></span></div>
        <p class="lib-err" hidden></p>
        <button class="btn btn-gold" type="submit">${isEdit ? 'Save Changes' : 'Upload'}</button>
      </form>`);
    ov.querySelector('.lib-x').onclick = () => ov.remove();
    const form = ov.querySelector('form');
    const err = ov.querySelector('.lib-err');
    const bar = ov.querySelector('.lib-progress');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      err.hidden = true;
      const file = STORAGE_ON ? form.file.files[0] : null;
      if (cfg.pdf === 'required' && STORAGE_ON && !isEdit && !file) { err.textContent = 'Please choose a PDF.'; err.hidden = false; return; }
      if (file && file.size > 50 * 1024 * 1024) { err.textContent = 'File is larger than 50 MB.'; err.hidden = false; return; }
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        const data = {};
        cfg.fields.forEach(f => { data[f.key] = form[f.key].value.trim(); });
        if (!STORAGE_ON) {
          const link = form.pdfLink.value.trim();
          if (link) { data.pdfUrl = link; data.storagePath = ''; data.fileType = /\.(png|jpe?g|webp|gif)$/i.test(link) ? 'image' : 'application/pdf'; }
        }
        if (file) {
          bar.hidden = false;
          const up = await uploadPdf(file, cfg.folder, p => { bar.firstElementChild.style.width = Math.round(p * 100) + '%'; });
          if (existing && existing.storagePath) await deleteStored(existing.storagePath);
          data.pdfUrl = up.url;
          data.storagePath = up.path;
          data.fileType = file.type;
        }
        const col = db.collection(cfg.collection);
        if (isEdit) await col.doc(existing.id).set(data, { merge: true });
        else { data.createdAt = firebase.firestore.FieldValue.serverTimestamp(); await col.add(data); }
        ov.remove();
        onSaved && onSaved();
      } catch (ex) {
        err.textContent = 'Could not save: ' + ex.message;
        err.hidden = false;
        btn.disabled = false;
      }
    });
  }

  async function removeItem(kind, item) {
    if (!confirm('Delete "' + item.title + '"? This cannot be undone.')) return false;
    await db.collection(KINDS[kind].collection).doc(item.id).delete();
    await deleteStored(item.storagePath);
    return true;
  }

  /* ---------- list pages ---------- */
  function readerUrl(kind, id) { return 'reader.html?type=' + kind + '&id=' + encodeURIComponent(id); }

  function cardHtml(kind, d) {
    const cfg = KINDS[kind];
    const meta = cfg.meta ? cfg.meta(d) : '';
    const read = d.pdfUrl && kind !== 'events'
      ? `<a class="btn btn-navy lib-btn" href="${readerUrl(kind, d.id)}"><i class="fas fa-book-open"></i> Read</a>
         <button class="btn btn-outline-gold lib-btn" data-act="download" data-id="${esc(d.id)}"><i class="fas fa-download"></i> Download</button>`
      : '';
    return `<article class="lib-card" data-id="${esc(d.id)}">
      <div class="lib-card-icon"><i class="fas fa-file-pdf"></i></div>
      <div class="lib-card-body">
        ${meta ? `<div class="lib-meta">${esc(meta)}</div>` : ''}
        <h3>${esc(d.title)}</h3>
        ${d.description ? `<p>${esc(d.description)}</p>` : ''}
        <div class="lib-actions">${read}
          <span class="lib-admin-only">
            <button class="lib-link" data-act="edit" data-id="${esc(d.id)}"><i class="fas fa-pen"></i> Edit</button>
            <button class="lib-link lib-danger" data-act="delete" data-id="${esc(d.id)}"><i class="fas fa-trash"></i> Delete</button>
          </span>
        </div>
      </div></article>`;
  }

  function eventHtml(d) {
    const dt = new Date((d.date || '') + 'T00:00:00');
    const valid = !isNaN(dt);
    const flyer = d.pdfUrl
      ? `<a class="btn btn-outline-gold lib-btn" href="${esc(d.pdfUrl)}" target="_blank" rel="noopener"><i class="fas fa-file-lines"></i> View flyer</a>` : '';
    return `<article class="lib-event" data-id="${esc(d.id)}">
      <div class="lib-date"><strong>${valid ? dt.getDate() : ''}</strong><span>${valid ? dt.toLocaleDateString('en-US', { month: 'short' }) : ''}</span><em>${valid ? dt.getFullYear() : ''}</em></div>
      <div class="lib-card-body">
        <h3>${esc(d.title)}</h3>
        <div class="lib-meta">
          ${d.time ? `<span><i class="far fa-clock"></i> ${esc(d.time)}</span>` : ''}
          ${d.location ? `<span><i class="fas fa-location-dot"></i> ${esc(d.location)}</span>` : ''}
        </div>
        ${d.description ? `<p>${esc(d.description)}</p>` : ''}
        <div class="lib-actions">${flyer}
          <span class="lib-admin-only">
            <button class="lib-link" data-act="edit" data-id="${esc(d.id)}"><i class="fas fa-pen"></i> Edit</button>
            <button class="lib-link lib-danger" data-act="delete" data-id="${esc(d.id)}"><i class="fas fa-trash"></i> Delete</button>
          </span>
        </div>
      </div></article>`;
  }

  function mountList(kind, opts) {
    opts = opts || {};
    const cfg = KINDS[kind];
    const root = document.getElementById('lib-root');
    const toolbar = document.getElementById('lib-toolbar');
    let items = [];
    let query = '';

    ensureAdminDom();
    init();

    function render() {
      const q = query.toLowerCase();
      const shown = items.filter(d => !q || [d.title, d.author, d.description, d.location].join(' ').toLowerCase().includes(q));
      if (!shown.length) {
        root.innerHTML = `<div class="lib-empty"><i class="fas fa-folder-open"></i>
          <p>${items.length ? 'No matches found.' : (opts.empty || 'Nothing has been posted yet — please check back soon, in sha Allah.')}</p></div>`;
        return;
      }
      if (kind === 'events') {
        const today = todayIso();
        const upcoming = shown.filter(d => (d.date || '') >= today);
        const past = shown.filter(d => (d.date || '') < today).reverse();
        root.innerHTML =
          (upcoming.length ? '<h2 class="lib-heading">Upcoming Events</h2><div class="lib-list">' + upcoming.map(eventHtml).join('') + '</div>' :
            '<div class="lib-empty"><i class="fas fa-calendar"></i><p>No upcoming events right now — please check back soon.</p></div>') +
          (past.length ? '<h2 class="lib-heading lib-past">Past Events</h2><div class="lib-list">' + past.map(eventHtml).join('') + '</div>' : '');
      } else {
        root.innerHTML = '<div class="lib-grid">' + shown.map(d => cardHtml(kind, d)).join('') + '</div>';
      }
    }

    async function refresh() {
      root.innerHTML = '<div class="lib-empty"><i class="fas fa-circle-notch fa-spin"></i><p>Loading…</p></div>';
      try {
        items = await loadAll(kind);
        render();
      } catch (e) {
        console.warn('[DUNY] load failed:', e);
        root.innerHTML = '<div class="lib-empty"><i class="fas fa-triangle-exclamation"></i><p>Could not load content right now. Please try again later.</p></div>';
      }
    }

    if (toolbar) {
      toolbar.innerHTML = `
        ${kind !== 'events' ? '<input class="lib-search" type="search" placeholder="Search…" aria-label="Search" />' : ''}
        <button class="btn btn-gold lib-admin-only" data-act="add"><i class="fas fa-plus"></i> Add ${esc(cfg.singular)}</button>`;
      const s = toolbar.querySelector('.lib-search');
      if (s) s.addEventListener('input', () => { query = s.value.trim(); render(); });
    }

    document.addEventListener('click', async e => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const act = el.dataset.act;
      const item = items.find(d => d.id === el.dataset.id);
      if (act === 'add') openEditor(kind, null, refresh);
      else if (act === 'edit' && item) openEditor(kind, item, refresh);
      else if (act === 'delete' && item) { try { if (await removeItem(kind, item)) refresh(); } catch (ex) { alert('Could not delete: ' + ex.message); } }
      else if (act === 'download' && item) downloadFile(item.pdfUrl, safeName(item.title) + '.pdf');
    });

    authListeners.push(user => document.body.classList.toggle('lib-is-admin', !!user));
    refresh();
  }

  /* ---------- reader page ---------- */
  async function mountReader() {
    const params = new URLSearchParams(location.search);
    const kind = params.get('type');
    const id = params.get('id');
    const head = document.getElementById('reader-head');
    const body = document.getElementById('reader-body');
    const fail = msg => { body.innerHTML = '<div class="lib-empty"><i class="fas fa-triangle-exclamation"></i><p>' + esc(msg) + '</p></div>'; };

    if (!KINDS[kind] || kind === 'events' || !id) return fail('This document could not be found.');
    let item;
    try { item = await loadOne(kind, id); } catch (e) { return fail('Could not load this document right now.'); }
    if (!item || !item.pdfUrl) return fail('This document could not be found.');

    document.title = item.title + ' — Darul Iftaa New York';
    const meta = KINDS[kind].meta ? KINDS[kind].meta(item) : '';
    const backHref = kind === 'articles' ? 'articles.html' : kind === 'fatawaas' ? 'fatwa.html?slug=' + encodeURIComponent(item.slug || id) : 'magazine.html';
    head.innerHTML = `
      <a class="fatwa-back-link" href="${backHref}"><i class="fas fa-arrow-left"></i> ${kind === 'fatawaas' ? 'Back to the Fatwā' : 'Back to ' + esc(KINDS[kind].plural)}</a>
      <h1>${esc(item.title)}</h1>
      ${meta ? `<p class="lib-meta">${esc(meta)}</p>` : ''}
      <div class="lib-actions">
        <button class="btn btn-gold" id="reader-dl"><i class="fas fa-download"></i> Download PDF</button>
        <a class="btn btn-outline-gold" href="${esc(item.pdfUrl)}" target="_blank" rel="noopener"><i class="fas fa-up-right-from-square"></i> Open in new tab</a>
      </div>`;
    document.getElementById('reader-dl').onclick = () => downloadFile(item.pdfUrl, safeName(item.title) + '.pdf');
    renderPdf(item.pdfUrl, body);
  }

  async function renderPdf(url, container) {
    // Fallback: the browser's own PDF viewer (works without CORS, less polished on phones).
    const useFrame = () => {
      container.innerHTML = `<iframe class="reader-frame" src="${esc(url)}" title="PDF document"></iframe>`;
    };
    if (typeof pdfjsLib === 'undefined') return useFrame();
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    try {
      const pdf = await pdfjsLib.getDocument({ url }).promise;
      container.innerHTML = '';
      const width = Math.min(container.clientWidth || 800, 900);
      const ratio = window.devicePixelRatio || 1;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (width / base.width) * ratio });
        const canvas = document.createElement('canvas');
        canvas.className = 'reader-page';
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = (viewport.width / ratio) + 'px';
        canvas.style.height = (viewport.height / ratio) + 'px';
        container.appendChild(canvas);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      }
    } catch (e) {
      console.warn('[DUNY] PDF.js render failed, falling back to browser viewer:', e.message);
      useFrame();
    }
  }

  window.DunyLib = { STORAGE_ON, mountList, mountReader, downloadFile, init, fmtDate };
})(window);
