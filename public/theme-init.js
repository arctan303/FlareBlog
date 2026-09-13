(function () {
  if (window.__blogRuntimeInitialized) return;
  window.__blogRuntimeInitialized = true;

  const themeColors = { light: '#f5f4ed', dark: '#181714' };
  const SEARCH_ORIGIN_KEY = 'navigation:search-origin';
  const PENDING_SCROLL_KEY = 'navigation:pending-scroll';
  const SEARCH_RETURN_KEY = 'search:return-state';

  function readSessionJson(key) {
    try {
      const value = sessionStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch {
      sessionStorage.removeItem(key);
      return null;
    }
  }

  function restorePendingScroll() {
    const state = readSessionJson(PENDING_SCROLL_KEY);
    if (!state || typeof state.url !== 'string' || !Number.isFinite(state.scrollY)) return;
    const target = new URL(state.url, location.origin);
    if (target.pathname !== location.pathname || target.search !== location.search) return;
    sessionStorage.removeItem(PENDING_SCROLL_KEY);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        scrollTo(0, Number(state.scrollY));
      });
    });
  }

  function setThemeColor(theme) {
    const meta = document.getElementById('theme-color-meta');
    if (meta) meta.setAttribute('content', themeColors[theme]);
  }

  let volatileTheme = null;

  function removeStoredThemePreference() {
    try {
      localStorage.removeItem('theme_pref');
    } catch {}
  }

  function persistTheme(theme) {
    volatileTheme = theme;
    try {
      localStorage.setItem('theme_pref', JSON.stringify({
        value: theme,
        expires: Date.now() + 6 * 60 * 60 * 1000,
      }));
    } catch {}
  }

  function readThemePreference() {
    try {
      const stored = localStorage.getItem('theme_pref');
      if (!stored) return volatileTheme;
      if (stored === 'dark' || stored === 'light') {
        persistTheme(stored);
        return stored;
      }
      const data = JSON.parse(stored);
      if (data.expires > Date.now() && (data.value === 'dark' || data.value === 'light')) {
        volatileTheme = data.value;
        return data.value;
      }
      volatileTheme = null;
      removeStoredThemePreference();
    } catch {
      return volatileTheme;
    }
    return null;
  }

  function syncThemeControls(theme) {
    const isDark = theme === 'dark';
    const label = isDark ? '切换到浅色模式' : '切换到深色模式';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (control) {
      control.setAttribute('aria-label', label);
      control.setAttribute('title', label);
    });
  }

  function applyTheme(explicitTheme) {
    const savedTheme = explicitTheme || readThemePreference();
    const theme = savedTheme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    setThemeColor(theme);
    syncThemeControls(theme);
    return theme;
  }

  let activeThemeTransition = null;

  function clearThemeTransitionStyles() {
    const root = document.documentElement;
    root.classList.remove('theme-transitioning');
    root.removeAttribute('data-theme-to');
    root.style.removeProperty('--vt-x');
    root.style.removeProperty('--vt-y');
    root.style.removeProperty('--vt-end-radius');
  }

  function stopThemeTransition() {
    const transition = activeThemeTransition;
    activeThemeTransition = null;
    try {
      transition?.skipTransition?.();
    } catch {}
    clearThemeTransitionStyles();
  }

  function getThemeOrigin(event, control) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let x;
    let y;

    if (event instanceof MouseEvent && event.detail > 0) {
      x = event.clientX;
      y = event.clientY;
    } else {
      const rect = control.getBoundingClientRect();
      const visible = rect.width > 0 || rect.height > 0;
      x = visible ? rect.left + rect.width / 2 : viewportWidth / 2;
      y = visible ? rect.top + rect.height / 2 : viewportHeight / 2;
    }

    x = Math.min(viewportWidth, Math.max(0, x));
    y = Math.min(viewportHeight, Math.max(0, y));

    return {
      x,
      y,
      radius: Math.ceil(Math.hypot(
        Math.max(x, viewportWidth - x),
        Math.max(y, viewportHeight - y),
      )) + 1,
    };
  }

  function toggleTheme(event, control) {
    if (activeThemeTransition) return;

    const nextTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    const commit = function () {
      persistTheme(nextTheme);
      applyTheme(nextTheme);
    };
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (typeof document.startViewTransition !== 'function' || reduceMotion) {
      commit();
      return;
    }

    const origin = getThemeOrigin(event, control);
    const root = document.documentElement;
    root.style.setProperty('--vt-x', `${origin.x}px`);
    root.style.setProperty('--vt-y', `${origin.y}px`);
    root.style.setProperty('--vt-end-radius', `${origin.radius}px`);
    root.setAttribute('data-theme-to', nextTheme);
    root.classList.add('theme-transitioning');

    let committed = false;
    const update = function () {
      committed = true;
      commit();
    };

    try {
      const transition = document.startViewTransition(update);
      activeThemeTransition = transition;
      const finish = function () {
        if (activeThemeTransition !== transition) return;
        activeThemeTransition = null;
        clearThemeTransitionStyles();
      };
      void transition.finished.then(finish, finish);
    } catch {
      activeThemeTransition = null;
      clearThemeTransitionStyles();
      if (!committed) update();
    }
  }

  window.loadTurnstileScript = function () {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (window.__turnstileScriptPromise) return window.__turnstileScriptPromise;
    window.__turnstileScriptPromise = new Promise(function (resolve, reject) {
      const existing = document.querySelector('script[data-turnstile-loader]');
      if (existing) {
        existing.addEventListener('load', function () { resolve(window.turnstile); }, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.turnstileLoader = 'true';
      script.onload = function () { resolve(window.turnstile); };
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return window.__turnstileScriptPromise;
  };

  document.addEventListener('click', function (event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const themeControl = target.closest('[data-theme-toggle]');
    if (themeControl) {
      toggleTheme(event, themeControl);
      return;
    }

    const link = target.closest('a[href]');
    if (
      link &&
      !event.defaultPrevented &&
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      const destination = new URL(link.href, location.origin);
      if (destination.origin === location.origin && destination.pathname === '/search' && location.pathname !== '/search') {
        sessionStorage.setItem(SEARCH_ORIGIN_KEY, JSON.stringify({
          url: location.pathname + location.search + location.hash,
          scrollY: scrollY
        }));
      }
    }

  function navigateSpa(targetUrl) {
    if (!targetUrl) return;
    try {
      var target = new URL(targetUrl, location.origin);
      if (target.origin === location.origin) {
        var link = document.createElement('a');
        link.href = target.href;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
        return;
      }
      location.assign(target.href);
    } catch (e) {
      location.assign(targetUrl);
    }
  }

    const backButton = target.closest('[data-back-button]');
    if (backButton) {
      if (backButton.hasAttribute('data-search-back')) {
        const origin = readSessionJson(SEARCH_ORIGIN_KEY);
        if (origin && typeof origin.url === 'string' && Number.isFinite(origin.scrollY)) {
          sessionStorage.setItem(PENDING_SCROLL_KEY, JSON.stringify(origin));
          history.length > 1 ? history.back() : navigateSpa(origin.url);
          return;
        }
      }

      if (backButton.hasAttribute('data-article-back')) {
        const searchState = readSessionJson(SEARCH_RETURN_KEY);
        if (
          searchState &&
          searchState.articlePath === location.pathname &&
          typeof searchState.searchUrl === 'string'
        ) {
          history.length > 1 ? history.back() : navigateSpa(searchState.searchUrl);
          return;
        }
      }

      history.length > 1 ? history.back() : navigateSpa('/');
      return;
    }
    const card = target.closest('[data-card-url]');
    if (card && !target.closest('a, button, input, textarea, select')) {
      navigateSpa(card.getAttribute('data-card-url'));
    }
  });

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
    if (!readThemePreference()) applyTheme();
  });
  document.addEventListener('astro:before-preparation', stopThemeTransition);
  document.addEventListener('astro:after-swap', function () {
    stopThemeTransition();
    applyTheme();
  });
  document.addEventListener('astro:page-load', function () {
    applyTheme();
    restorePendingScroll();
  });
  applyTheme();
  restorePendingScroll();
})();
