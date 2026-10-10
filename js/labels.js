/* Display labels for fatwa categories.
   The category values stored in the database (and used by the filters) stay in plain
   ASCII, e.g. "Salah"; this only changes how they are shown on screen. */
(function (root) {
  const LABELS = {
    'Salah': 'Ṣalāh',
    'Zakaat': 'Zakāt',
    'Sawm': 'Ṣawm',
    'Sawm (Fasting)': 'Ṣawm (Fasting)',
    'Hajj & Umrah': 'Ḥajj & ʿUmrah'
  };
  root.catLabel = c => LABELS[c] || c;
})(window);
