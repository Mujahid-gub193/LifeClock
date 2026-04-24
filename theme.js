// Apply saved theme immediately (before render to avoid flash)
(function() {
  if (localStorage.getItem('lc_theme') === 'light') {
    document.documentElement.classList.add('light');
  }
})();
