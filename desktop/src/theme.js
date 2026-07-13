const THEME_STORAGE_KEY = 'ai-cockpit-theme-mode';
const THEME_MODES = new Set(['system', 'light', 'dark']);

function readStoredTheme() {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_MODES.has(stored) ? stored : 'light';
  } catch {
    return 'light';
  }
}

function resolveTheme(mode, mediaQuery) {
  if (mode === 'light' || mode === 'dark') return mode;
  return mediaQuery.matches ? 'dark' : 'light';
}

function applyTheme(mode, mediaQuery) {
  const resolvedTheme = resolveTheme(mode, mediaQuery);
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.style.colorScheme = resolvedTheme;
}

export function initializeTheme(control) {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const buttons = [...control.querySelectorAll('[data-theme-mode]')];
  let mode = readStoredTheme();

  const renderSelection = () => {
    buttons.forEach(button => {
      const selected = button.dataset.themeMode === mode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  };

  renderSelection();
  applyTheme(mode, mediaQuery);

  buttons.forEach(button => {
    button.addEventListener('click', () => {
      mode = THEME_MODES.has(button.dataset.themeMode) ? button.dataset.themeMode : 'light';
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, mode);
      } catch {
        // The selected theme still applies for this session when storage is unavailable.
      }
      renderSelection();
      applyTheme(mode, mediaQuery);
    });
  });

  const handleSystemThemeChange = () => {
    if (mode === 'system') applyTheme(mode, mediaQuery);
  };

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handleSystemThemeChange);
  } else {
    mediaQuery.addListener(handleSystemThemeChange);
  }
}
