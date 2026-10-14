/* ============================================================
   Page-level nav bar — a sticky strip under the main navbar with
   jump links to the sections of the current page (scroll-spied).
   Targets: every <section> after the page hero that has a heading,
   plus the syllabus periods on the Iftāʾ Course page.
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const hero = document.querySelector('.page-hero');
  if (!hero) return;

  const clean = t => t.replace(/\s+/g, ' ').replace(/^[^A-Za-zĀ-ſ0-9]+/, '').trim();
  const items = [];
  const add = (el, label) => {
    if (!el || !label) return;
    if (!el.id) el.id = 'sec-' + (items.length + 1);
    items.push({ el, label });
  };

  let n = hero.nextElementSibling;
  while (n) {
    if (n.tagName === 'SECTION' && !n.classList.contains('verse-section')) {
      const h = n.querySelector('h2, h3');
      if (n.querySelector('.syl-item')) {
        add(n.querySelector('.program-detail-card'), 'Overview');
        n.querySelectorAll('details.syl-item').forEach(d => {
          const s = d.querySelector('.syl-sum-en strong');
          add(d, s ? clean(s.textContent) : '');
        });
      } else if (h) {
        add(n, h.closest('.program-card') ? 'Our Services' : clean(h.textContent).replace(/^Ready to Specialize in Iftāʾ\?$/, 'Apply'));
      }
    }
    n = n.nextElementSibling;
  }
  if (items.length < 2) return;

  const bar = document.createElement('nav');
  bar.className = 'subnav';
  bar.setAttribute('aria-label', 'On this page');
  const inner = document.createElement('div');
  inner.className = 'subnav-inner';
  items.forEach(it => {
    it.el.classList.add('subnav-target');
    const a = document.createElement('a');
    a.href = '#' + it.el.id;
    a.textContent = it.label;
    a.addEventListener('click', e => {
      e.preventDefault();
      if (it.el.tagName === 'DETAILS') it.el.open = true;
      it.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', '#' + it.el.id);
    });
    it.link = a;
    inner.appendChild(a);
  });
  bar.appendChild(inner);
  hero.after(bar);

  const spy = () => {
    const y = window.scrollY + 140;
    let cur = null;
    items.forEach(it => { if (it.el.getBoundingClientRect().top + window.scrollY <= y) cur = it; });
    items.forEach(it => {
      const on = it === cur;
      it.link.classList.toggle('active', on);
      if (on) it.link.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
  };
  window.addEventListener('scroll', spy, { passive: true });
  spy();
});
