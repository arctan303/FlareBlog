(function () {
  if (window.__blogEntryInitialized) return;
  window.__blogEntryInitialized = true;

  var root = document.documentElement;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var firstVisit = true;
  try {
    firstVisit = sessionStorage.getItem('site:entry-seen') !== '1';
    if (firstVisit) sessionStorage.setItem('site:entry-seen', '1');
  } catch {}
  if (!firstVisit) return;

  root.classList.add('site-entry-pending');
  var released = false;
  var delay = function (milliseconds) {
    return new Promise(function (resolve) { setTimeout(resolve, milliseconds); });
  };
  var release = function () {
    if (released) return;
    released = true;
    root.classList.add('site-entry-ready');
    setTimeout(function () {
      root.classList.remove('site-entry-pending', 'site-entry-ready');
    }, 360);
  };
  var waitForPage = function () {
    var fontsReady = document.fonts && document.fonts.ready
      ? Promise.race([document.fonts.ready.catch(function () {}), delay(800)])
      : Promise.resolve();
    Promise.all([delay(240), fontsReady]).then(release, release);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForPage, { once: true });
  } else {
    waitForPage();
  }
  setTimeout(release, 1200);
})();
