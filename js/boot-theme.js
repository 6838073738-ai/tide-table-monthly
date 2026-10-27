// Apply the saved theme and Still pictures before first paint. A classic script (not a module) loaded from
// <head>, so the page needs no inline JavaScript (CSP script-src 'self'). The app writes "ttm:theme" when the
// theme changes ("auto" or nothing follows the system) and "ttm:still" when Still pictures is turned on or off.
try {
  var t = localStorage.getItem("ttm:theme");
  if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
  if (localStorage.getItem("ttm:still") === "1") document.documentElement.setAttribute("data-motion", "still");
} catch (e) { /* storage blocked: follow the system, pictures move */ }
try {
  document.documentElement.setAttribute("data-tab", document.hidden ? "hidden" : "shown");
} catch (e) { /* nothing more to do */ }

// The watchdog. The app sets <html data-stage> as soon as it has the plan. If that has not happened after
// 15 seconds (a file that did not load, for example while a new version is being published), the loading
// line says so instead of waiting for ever. When the app already shows what went wrong, it is left alone.
setTimeout(function () {
  try {
    if (document.documentElement.dataset.stage) return;
    var main = document.getElementById("main");
    if (!main || main.querySelector(".is-error")) return;
    var text = "Tide Table is taking a while to open. If nothing changes, reload the page in a few minutes.";
    var boot = main.querySelector("[data-boot]");
    var line = boot && boot.querySelector("p");
    if (line) line.textContent = text;
    else {
      var p = document.createElement("p");
      p.setAttribute("role", "status");
      p.textContent = text;
      main.appendChild(p);
    }
  } catch (e) { /* nothing more to do */ }
}, 15000);
