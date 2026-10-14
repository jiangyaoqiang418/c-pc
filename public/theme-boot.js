// Restore any valid v47 or existing PC palette before the first paint.
(function () {
  var themes = ["web3-meme", "navy-coral", "forest", "ocean", "clay", "graphite", "plum", "matcha", "mint", "cocoa", "oat", "canyon", "cobalt", "navy", "teal", "indigo", "cherry", "blush", "apricot", "lavender", "sky", "citron", "web3-aurora", "web3-cyber", "web3-electric", "web3-ember", "web3-prism"];
  var theme = 'web3-meme';
  try {
    var saved = localStorage.getItem('um.uiTheme');
    if (themes.indexOf(saved) >= 0) theme = saved;
  } catch (_) {}
  document.documentElement.dataset.uiTheme = theme;
})();
