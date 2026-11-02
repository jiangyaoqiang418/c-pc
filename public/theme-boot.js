// Restore the approved dark or light palette before the first paint.
(function () {
  var themes = ["web3-meme", "navy-coral"];
  var theme = 'web3-meme';
  try {
    var saved = localStorage.getItem('um.uiTheme');
    if (themes.indexOf(saved) >= 0) theme = saved;
  } catch (_) {}
  document.documentElement.dataset.uiTheme = 'web3-meme';
  document.documentElement.dataset.uiLayout = 'v47';
  document.documentElement.dataset.uiPalette = theme;
})();
