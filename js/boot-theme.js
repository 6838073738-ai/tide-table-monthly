// Apply the saved theme before first paint. A classic script (not a module) loaded from <head>, so the
// page needs no inline JavaScript (CSP script-src 'self'). The app writes "ttm:theme" when the theme
// changes; "auto" or nothing follows the system.
try {
  var t = localStorage.getItem("ttm:theme");
  if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
} catch (e) { /* storage blocked: follow the system */ }
