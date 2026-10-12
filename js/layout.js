/* ============================================================
   Shared site layout — navbar + footer, written once for every page.
   Loaded synchronously in place (document.write) so main.js finds the
   markup exactly as before. Usage: <script src="js/layout.js"></script>
   then layoutNav() / layoutFooter() at the spot each belongs.
   ============================================================ */
(function () {
  var LOGO = '<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M20 4C20 4 8 10 8 20C8 26.627 13.373 32 20 32C26.627 32 32 26.627 32 20C32 10 20 4 20 4Z" fill="white" opacity="0.9"/>' +
    '<path d="M20 8L21.5 14H28L22.5 17.5L24.5 24L20 20.5L15.5 24L17.5 17.5L12 14H18.5Z" fill="#B08D3B"/>' +
    '<circle cx="30" cy="8" r="4" fill="white" opacity="0.85"/>' +
    '<path d="M30 5.5C31.5 6.5 32 8 30 9C28.5 7.5 28 5.5 30 5.5Z" fill="#B08D3B"/></svg>';

  /* Pages that belong under another nav item (so it stays highlighted). */
  var SECTION = {
    'faculty-bio.html': 'faculty.html',
    'fatwa.html': 'iftaa.html',
    'article.html': 'articles.html',
    'reader.html': 'articles.html',
    'magazine.html': 'articles.html',
    'events.html': 'articles.html'
  };
  var page = location.pathname.split('/').pop() || 'index.html';
  var current = SECTION[page] || page;
  function act(href) { return href === current ? ' class="active"' : ''; }

  var LINKS = [
    ['index.html', 'Home'], ['about.html', 'About Us'], ['faculty.html', 'Faculty'],
    ['services.html', 'Services'], ['iftaa-course.html', 'Iftāʾ Course'], ['iftaa.html', 'Fatāwā']
  ];

  window.layoutNav = function () {
    var desktop = LINKS.map(function (l) { return '<li><a href="' + l[0] + '"' + act(l[0]) + '>' + l[1] + '</a></li>'; }).join('\n        ');
    var mobile = LINKS.map(function (l) { return '<a href="' + l[0] + '"' + act(l[0]) + '>' + l[1] + '</a>'; }).join('\n      ');
    document.write(
'<nav class="navbar">\n' +
'    <div class="nav-inner">\n' +
'      <a href="index.html" class="nav-brand">\n' +
'        <div class="nav-logo">' + LOGO + '</div>\n' +
'        <div class="nav-title">\n' +
'          <span>Darul Iftaa New York</span>\n' +
'          <span>Dept. of Darul Uloom New York</span>\n' +
'        </div>\n' +
'      </a>\n' +
'      <ul class="nav-links">\n        ' + desktop + '\n' +
'        <li class="nav-dropdown">\n' +
'          <a href="articles.html">Resources <i class="fas fa-chevron-down nav-caret"></i></a>\n' +
'          <div class="nav-dropdown-menu">\n' +
'            <a href="articles.html"><i class="fas fa-file-lines"></i> Research Papers</a>\n' +
'            <a href="magazine.html"><i class="fas fa-book-open"></i> Monthly Magazine</a>\n' +
'            <a href="events.html"><i class="fas fa-calendar-days"></i> Events</a>\n' +
'          </div>\n' +
'        </li>\n' +
'        <li><a href="donate.html"' + act('donate.html') + '>Donate</a></li>\n' +
'        <li><a href="contact.html?subject=fatwa" class="nav-donate-btn">Ask A Question</a></li>\n' +
'      </ul>\n' +
'      <button class="hamburger" aria-label="Toggle menu"><span></span><span></span><span></span></button>\n' +
'    </div>\n' +
'    <nav class="mobile-nav">\n      ' + mobile + '\n' +
'      <a href="articles.html"' + act('articles.html') + '>Research Papers</a>\n' +
'      <a href="magazine.html"' + (page === 'magazine.html' ? ' class="active"' : '') + '>Monthly Magazine</a>\n' +
'      <a href="events.html"' + (page === 'events.html' ? ' class="active"' : '') + '>Events</a>\n' +
'      <a href="donate.html"' + act('donate.html') + '>Donate</a>\n' +
'      <a href="contact.html?subject=fatwa">Ask A Question</a>\n' +
'    </nav>\n' +
'  </nav>');
  };

  window.layoutFooter = function () {
    var year = new Date().getFullYear();
    var links = LINKS.concat([['articles.html', 'Research Papers'], ['magazine.html', 'Monthly Magazine'], ['events.html', 'Events']])
      .map(function (l) { return '<li><a href="' + l[0] + '"><i class="fas fa-chevron-right"></i> ' + l[1] + '</a></li>'; }).join('\n            ');
    document.write(
'<footer class="footer">\n' +
'    <div class="container">\n' +
'      <div class="footer-grid">\n' +
'        <div class="footer-brand">\n' +
'          <div class="nav-logo" style="width:52px;height:52px;margin-bottom:1rem;">' + LOGO + '</div>\n' +
'          <h3>Darul Iftaa New York</h3>\n' +
'          <p class="tagline">Dept. of Darul Uloom New York</p>\n' +
'          <p>Providing free, confidential, and authentic Islamic legal rulings to the Muslim community of New York, rooted in the Qurʾān and Sunnah.</p>\n' +
'        </div>\n' +
'        <div class="footer-col">\n' +
'          <h4>Quick Links</h4>\n' +
'          <ul>\n            ' + links + '\n          </ul>\n' +
'        </div>\n' +
'        <div class="footer-col">\n' +
'          <h4>Get Involved</h4>\n' +
'          <ul>\n' +
'            <li><a href="contact.html?subject=fatwa"><i class="fas fa-chevron-right"></i> Ask A Question</a></li>\n' +
'            <li><a href="contact.html"><i class="fas fa-chevron-right"></i> Contact Us</a></li>\n' +
'            <li><a href="donate.html"><i class="fas fa-chevron-right"></i> Donate</a></li>\n' +
'          </ul>\n' +
'        </div>\n' +
'        <div class="footer-col">\n' +
'          <h4>Contact Info</h4>\n' +
'          <div class="footer-contact-item"><i class="fas fa-map-marker-alt"></i><span>150-11 Hillside Avenue, Jamaica, NY 11432</span></div>\n' +
'          <div class="footer-contact-item"><i class="fas fa-envelope"></i><a href="mailto:fatwa@duny.us">fatwa@duny.us</a></div>\n' +
'          <div class="footer-contact-item"><i class="fas fa-clock"></i><span>Mon&ndash;Fri: 9:00 AM &ndash; 5:00 PM</span></div>\n' +
'        </div>\n' +
'      </div>\n' +
'    </div>\n' +
'    <div class="footer-bottom">\n' +
'      <div class="container">\n' +
'        <p>&copy; ' + year + ' <span>Darul Iftaa New York</span>. All rights reserved. &nbsp;|&nbsp; A department of Darul Uloom New York.</p>\n' +
'      </div>\n' +
'    </div>\n' +
'  </footer>');
  };
})();
