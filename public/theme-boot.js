// Apply only the six approved PC themes before CSS paints. Storage may be unavailable.
(function () {
  var themes = ['forest', 'navy-coral', 'ocean', 'clay', 'graphite', 'plum'];
  var theme = 'forest';
  try {
    var saved = localStorage.getItem('um.uiTheme');
    if (themes.indexOf(saved) >= 0) theme = saved;
  } catch (_) {}
  document.documentElement.dataset.uiTheme = theme;
})();
