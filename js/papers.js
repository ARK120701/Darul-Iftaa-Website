/* ============================================================
   Research Papers — text pages in the same format as the fataawas.

   Firestore collection "articles", one document per paper (document id =
   slug):  { slug, title, author, date, category (topic), summary,
             keywords[], body (HTML), references (HTML), added, id }

   Shared by articles.html (list) and article.html (detail). Only the
   signed-in admin (the same Firebase Auth account used on the Iftaa page)
   sees the Add / Edit / Delete controls.
   ============================================================ */
(function (root) {
  const COLL = 'articles';
  let db = null, auth = null, currentUser = null;
  const authListeners = [];

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function formatDate(str) {
    if (!str) return '';
    const d = new Date(str + 'T12:00:00');
    return isNaN(d) ? str : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  function stripHtml(html) {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    return d.textContent || '';
  }
  function toSlug(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  }

  /* Keep only simple formatting in rich text (drops pasted fonts, colours, sizes). */
  function cleanHtml(html) {
    const KEEP = new Set(['P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'H2', 'H3', 'UL', 'OL', 'LI']);
    const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'IMG', 'LINK', 'META', 'SVG', 'MATH']);
    // an inert document: nothing in the pasted markup can run or load while we clean it
    const box = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html').body;
    (function walk(node) {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 1) {
          if (DROP.has(child.tagName.toUpperCase())) { node.removeChild(child); continue; }
          walk(child);
          if (!KEEP.has(child.tagName)) {
            while (child.firstChild) node.insertBefore(child.firstChild, child);
            node.removeChild(child);
          } else {
            for (const a of Array.from(child.attributes)) child.removeAttribute(a.name);
          }
        } else if (child.nodeType !== 3) {
          node.removeChild(child);
        }
      }
    })(box);
    return box.innerHTML.replace(/(<div><br><\/div>\s*){2,}/g, '<div><br></div>').trim();
  }

  /* ---------- firebase ---------- */
  function init() {
    if (db) return true;
    if (typeof FIREBASE_ENABLED === 'undefined' || !FIREBASE_ENABLED) return false;
    if (typeof firebase === 'undefined') return false;
    try {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
      auth = firebase.auth();
      auth.onAuthStateChanged(user => {
        if (user && !isAllowedAdmin(user)) { auth.signOut(); return; }
        currentUser = user;
        document.body.classList.toggle('lib-is-admin', !!user);
        authListeners.forEach(fn => fn(user));
      });
      return true;
    } catch (e) {
      console.warn('[DUNY] Firebase init failed:', e.message);
      db = auth = null;
      return false;
    }
  }

  async function loadAll() {
    if (!init()) throw new Error('Firebase is not available.');
    const snap = await db.collection(COLL).get();
    return snap.docs.map(d => Object.assign({}, d.data(), { slug: d.id }));
  }
  async function loadOne(slug) {
    if (!init()) throw new Error('Firebase is not available.');
    const doc = await db.collection(COLL).doc(slug).get();
    return doc.exists ? Object.assign({}, doc.data(), { slug: doc.id }) : null;
  }
  async function removePaper(p) {
    if (!confirm('Delete "' + p.title + '"? This cannot be undone.')) return false;
    await db.collection(COLL).doc(p.slug).delete();
    return true;
  }

  /* ---------- admin: lock button + login ---------- */
  function ensureAdminButton() {
    if (document.getElementById('lib-admin-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'lib-admin-fab';
    fab.title = 'Admin';
    fab.innerHTML = '<i class="fas fa-lock"></i>';
    fab.addEventListener('click', () => {
      if (currentUser) { if (confirm('Signed in as ' + currentUser.email + '.\nSign out?')) auth.signOut(); }
      else openLogin();
    });
    document.body.appendChild(fab);
    authListeners.push(user => {
      fab.classList.toggle('signed-in', !!user);
      fab.innerHTML = user ? '<i class="fas fa-lock-open"></i>' : '<i class="fas fa-lock"></i>';
    });
  }

  function modal(html, wide) {
    const ov = document.createElement('div');
    ov.className = 'lib-overlay';
    ov.innerHTML = '<div class="lib-modal' + (wide ? ' lib-modal-wide' : '') + '">' + html + '</div>';
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
      } catch (ex) { err.textContent = 'Sign-in failed: ' + ex.message; err.hidden = false; }
    });
  }

  /* ---------- import: turn Word / text lines into paper fields ---------- */
  const GREGORIAN_DATE_RE = /^[A-Za-z]+\.?\s+\d{1,2},?\s+\d{4}$/;
  const LABEL = {
    author:   /^\s*(author|by|written\s*by|prepared\s*by)\s*[:\-]\s*(.*)$/i,
    date:     /^\s*date\s*[:\-]\s*(.*)$/i,
    topic:    /^\s*(topic|category|subject)\s*[:\-]\s*(.*)$/i,
    summary:  /^\s*(summary|abstract)\s*[:\-]\s*(.*)$/i,
    keywords: /^\s*keywords?\s*[:\-]\s*(.*)$/i,
    refs:     /^\s*(references?|sources?|bibliography|footnotes)\s*[:\-]?\s*(.*)$/i
  };

  function runsToHtml(runs) {
    let html = '', i = 0;
    while (i < runs.length) {
      const { bold, underline } = runs[i];
      let chunk = '';
      while (i < runs.length && runs[i].bold === bold && runs[i].underline === underline) { chunk += runs[i].str; i++; }
      if (!chunk) continue;
      let piece = esc(chunk);
      if (underline) piece = '<u>' + piece + '</u>';
      if (bold) piece = '<strong>' + piece + '</strong>';
      html += piece;
    }
    return html;
  }

  // lineObjs: [{ text, size, runs:[{str,bold,underline}] }]
  function parsePaper(lineObjs) {
    const lines = lineObjs.filter(l => l.text && l.text.trim());
    const out = { title: '', author: '', date: '', category: '', summary: '', keywords: [], body: '', references: '' };
    if (!lines.length) return out;

    // title = the largest line (a Heading 1); if everything is one size, the first line
    const maxSize = Math.max(...lines.map(l => l.size || 0));
    let tIdx = lines.findIndex(l => (l.size || 0) >= maxSize - 0.5);
    if (maxSize <= 13) tIdx = 0;
    out.title = lines[tIdx].text.trim();
    lines.splice(tIdx, 1);

    const body = [], refs = [];
    let section = 'body', pending = null;
    for (const l of lines) {
      const t = l.text.trim();
      let m;
      if (pending) {
        if (pending === 'author') out.author = t;
        else if (pending === 'summary') out.summary = t;
        else if (pending === 'topic') out.category = t;
        pending = null;
        continue;
      }
      const take = (key, rest) => {
        rest = (rest || '').trim();
        if (rest) { if (key === 'author') out.author = rest; else if (key === 'summary') out.summary = rest; else out.category = rest; }
        else pending = key;
      };
      if ((m = t.match(LABEL.author)) && t.length < 120) { take('author', m[2]); continue; }
      if ((m = t.match(LABEL.topic)) && t.length < 120)  { take('topic', m[2]); continue; }
      if ((m = t.match(LABEL.summary)))                  { take('summary', m[2]); continue; }
      if ((m = t.match(LABEL.keywords))) { out.keywords = m[1].split(/[,;،]/).map(s => s.trim()).filter(Boolean); continue; }
      if ((m = t.match(LABEL.date)) && !isNaN(new Date(m[1]))) { out.date = new Date(m[1]).toISOString().split('T')[0]; continue; }
      if (GREGORIAN_DATE_RE.test(t) && !body.length && !out.date) {
        const d = new Date(t.replace(/,/g, ''));
        if (!isNaN(d)) { out.date = d.toISOString().split('T')[0]; continue; }
      }
      if ((m = t.match(LABEL.refs)) && t.length < 60) {
        section = 'refs';
        if (m[2].trim()) refs.push('<p>' + esc(m[2].trim()) + '</p>');
        continue;
      }
      const html = runsToHtml(l.runs);
      if (!html.trim()) continue;
      const isHeading = section === 'body' && (l.size || 0) >= 15 && t.length < 140;
      (section === 'refs' ? refs : body).push(isHeading ? '<h3>' + esc(t) + '</h3>' : '<p>' + html + '</p>');
    }
    out.body = body.join('');
    out.references = refs.join('');
    return out;
  }

  async function linesFromFile(file) {
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.docx')) {
      if (typeof mammoth === 'undefined') throw new Error('The Word reader failed to load — reload the page.');
      const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, { styleMap: ['u => u'] });
      return DunyDocxLines.toLines(value);
    }
    if (name.endsWith('.txt') || file.type === 'text/plain') {
      const buf = new Uint8Array(await file.arrayBuffer());
      let enc = 'utf-8';
      if (buf[0] === 0xFF && buf[1] === 0xFE) enc = 'utf-16le';
      else if (buf[0] === 0xFE && buf[1] === 0xFF) enc = 'utf-16be';
      const text = new TextDecoder(enc).decode(buf).replace(/^﻿/, '');
      let first = true;
      return text.split(/\r\n|\n|\r/).map(raw => {
        const t = raw.replace(/\s+$/, '');
        const size = first && t.trim() ? 24 : 12;
        if (t.trim()) first = false;
        return { text: t, size, runs: t ? [{ str: t, bold: false, underline: false }] : [] };
      });
    }
    throw new Error('Please choose a Word (.docx) or text (.txt) file.');
  }

  /* ---------- admin: add / edit dialog ---------- */
  function richBox(id, label, html, hint) {
    return `<div class="paper-field"><span class="paper-label">${label}</span>
      <div class="paper-toolbar">
        <button type="button" data-cmd="bold" title="Bold"><i class="fas fa-bold"></i></button>
        <button type="button" data-cmd="underline" title="Underline"><i class="fas fa-underline"></i></button>
        <button type="button" data-cmd="heading" title="Heading"><i class="fas fa-heading"></i></button>
      </div>
      <div class="paper-editor" id="${id}" contenteditable="true" dir="auto">${html || ''}</div>
      ${hint ? '<p class="lib-hint">' + hint + '</p>' : ''}</div>`;
  }

  function openEditor(existing, topics, onSaved) {
    const p = existing || {};
    const ov = modal(`
      <button class="lib-x" type="button" aria-label="Close">&times;</button>
      <h3>${existing ? 'Edit' : 'Add'} Research Paper</h3>
      <form>
        <div class="paper-import">
          <label for="paper-import-input"><i class="fas fa-file-import"></i> Import from Word (.docx) or text (.txt) — fills the fields below for review</label>
          <input type="file" id="paper-import-input" accept=".docx,.txt,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
          <p class="lib-hint">Title as Heading 1 · optional lines <b>Author:</b>, <b>Date:</b>, <b>Topic:</b>, <b>Summary:</b>, <b>Keywords:</b> · a <b>References</b> heading before the sources. Google Docs: File → Download → Microsoft Word.</p>
        </div>
        <label>Title *<input type="text" name="title" required dir="auto" value="${esc(p.title)}" /></label>
        <div class="paper-row">
          <label>Author *<input type="text" name="author" required value="${esc(p.author)}" /></label>
          <label>Date *<input type="date" name="date" required value="${esc(p.date || new Date().toISOString().split('T')[0])}" /></label>
        </div>
        <label>Topic *<input type="text" name="category" required list="paper-topics" value="${esc(p.category)}" placeholder="e.g. Fiqh, Hadith, History" />
          <datalist id="paper-topics">${(topics || []).map(t => '<option value="' + esc(t) + '">').join('')}</datalist></label>
        <label>Summary (shown on the card)<textarea name="summary" rows="3" dir="auto">${esc(p.summary)}</textarea></label>
        <label>Keywords (comma separated)<input type="text" name="keywords" value="${esc((p.keywords || []).join(', '))}" /></label>
        ${richBox('paper-body', 'Paper text *', p.body, '')}
        ${richBox('paper-refs', 'References', p.references, 'One reference per line.')}
        <p class="lib-err" hidden></p>
        <button class="btn btn-gold" type="submit">${existing ? 'Save Changes' : 'Publish Paper'}</button>
      </form>`, true);
    ov.querySelector('.lib-x').onclick = () => ov.remove();
    const form = ov.querySelector('form');
    const err = ov.querySelector('.lib-err');
    const showErr = m => { err.textContent = m; err.hidden = false; };

    // editors: plain-text paste, simple toolbar
    ov.querySelectorAll('.paper-editor').forEach(ed => {
      ed.addEventListener('paste', e => {
        e.preventDefault();
        const t = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, t);
      });
    });
    ov.querySelectorAll('.paper-toolbar button').forEach(btn => {
      btn.addEventListener('mousedown', e => e.preventDefault());       // keep the text selection
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;
        if (cmd === 'heading') document.execCommand('formatBlock', false, 'H3');
        else document.execCommand(cmd, false, null);
      });
    });

    // import
    form.querySelector('#paper-import-input').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const parsed = parsePaper(await linesFromFile(file));
        form.elements.title.value = parsed.title || form.elements.title.value;
        if (parsed.author) form.author.value = parsed.author;
        if (parsed.date) form.date.value = parsed.date;
        if (parsed.category) form.category.value = parsed.category;
        if (parsed.summary) form.summary.value = parsed.summary;
        if (parsed.keywords.length) form.keywords.value = parsed.keywords.join(', ');
        form.querySelector('#paper-body').innerHTML = parsed.body;
        form.querySelector('#paper-refs').innerHTML = parsed.references;
        err.hidden = true;
      } catch (ex) { showErr('Could not read that file: ' + ex.message); }
      e.target.value = '';
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      err.hidden = true;
      const body = cleanHtml(form.querySelector('#paper-body').innerHTML);
      const refs = cleanHtml(form.querySelector('#paper-refs').innerHTML);
      if (!stripHtml(body).trim()) { showErr('Please add the paper text.'); return; }
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        const data = {
          title: form.elements.title.value.trim(),
          author: form.author.value.trim(),
          date: form.date.value,
          category: form.category.value.trim(),
          summary: form.summary.value.trim(),
          keywords: form.keywords.value.split(',').map(s => s.trim()).filter(Boolean),
          body, references: refs
        };
        let slug = existing ? existing.slug : toSlug(data.title) || ('paper-' + Date.now());
        if (!existing) {
          if ((await db.collection(COLL).doc(slug).get()).exists) slug += '-' + Date.now().toString(36);
          data.added = Date.now();
          data.id = Date.now();
        } else {
          if (existing.added) data.added = existing.added;
          if (existing.id) data.id = existing.id;
        }
        data.slug = slug;
        await db.collection(COLL).doc(slug).set(data);
        ov.remove();
        onSaved && onSaved(slug);
      } catch (ex) {
        showErr('Could not save: ' + ex.message + ' (are you signed in, and are the Firestore rules published?)');
        btn.disabled = false;
      }
    });
  }

  root.DunyPapers = {
    init, loadAll, loadOne, removePaper, openEditor, ensureAdminButton,
    esc, formatDate, stripHtml, parsePaper, cleanHtml,
    onAuth: fn => authListeners.push(fn),
    isAdmin: () => !!currentUser
  };
})(window);
