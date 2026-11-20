const index = document.querySelector("[data-page-index]");
if (index) {
  const links = [...index.querySelectorAll("a")];
  const sections = links.map((link) => document.getElementById(link.hash.slice(1)));
  const update = () => {
    let active = 0;
    sections.forEach((section, i) => { if (section && section.getBoundingClientRect().top <= innerHeight * 0.4) active = i; });
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 1) active = links.length - 1;
    links.forEach((link, i) => { if (i === active) link.setAttribute("aria-current", "location"); else link.removeAttribute("aria-current"); });
  };
  addEventListener("scroll", update, { passive: true });
  addEventListener("resize", update);
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName ?? "") || event.target?.isContentEditable) return;
    const n = Number(event.key);
    if (n >= 1 && n <= 9 && links[n - 1]) { event.preventDefault(); links[n - 1].click(); }
  });
  update();
}
