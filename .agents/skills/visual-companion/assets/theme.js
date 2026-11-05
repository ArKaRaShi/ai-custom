/* Apply the saved companion theme before stylesheets can paint. */
(function () {
  try {
    const theme = localStorage.getItem("visual-companion-theme");
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-vc-theme", theme);
    }
  } catch {
    // Storage may be unavailable; the system palette remains the default.
  }
})();
