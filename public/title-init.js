(function () {
  function applyTabTitle() {
    var path = location.pathname.replace(/\/+$/, '') || '/';
    if (path === '/' || /^\/\d+$/.test(path) || /^\/page\/\d+$/.test(path)) {
      document.title = 'FlareBlog';
    }
  }
  document.addEventListener('astro:page-load', applyTabTitle);
  if (document.readyState === 'loading') {
    window.addEventListener('load', function () { setTimeout(applyTabTitle, 2000); });
  } else {
    setTimeout(applyTabTitle, 2000);
  }
})();
