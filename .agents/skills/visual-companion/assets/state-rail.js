/* Companion-owned controls; preview documents cannot affect this UI. */
(() => {
  const rail = document.querySelector('.vc-rail');
  const buttons = [...rail.querySelectorAll('[data-state-index]')];
  const frames = [...document.querySelectorAll('main iframe')];
  const select = document.querySelector('.vc-mobile select');
  if (!buttons.length || !select) return;

  const card = document.createElement('div');
  card.className = 'vc-preview';
  card.hidden = true;
  card.setAttribute('aria-hidden', 'true');
  const title = document.createElement('div');
  title.className = 'vc-preview-title';
  const viewport = document.createElement('div');
  viewport.className = 'vc-preview-viewport';
  const miniature = document.createElement('iframe');
  miniature.setAttribute('sandbox', 'allow-same-origin');
  miniature.tabIndex = -1;
  miniature.title = 'State preview';
  viewport.append(miniature);
  card.append(title, viewport);
  rail.append(card);

  let selected = 0;
  function show(index) {
    selected = index;
    frames.forEach((frame, i) => { frame.hidden = i !== index; });
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    select.value = String(index);
  }
  function preview(index) {
    buttons.forEach((button, i) => {
      const distance = Math.abs(i - index);
      button.dataset.distance = String(Math.min(distance, 3));
    });
    title.textContent = buttons[index].textContent;
    if (miniature.getAttribute('src') !== frames[index].getAttribute('src')) {
      miniature.src = frames[index].getAttribute('src');
    }
    card.hidden = false;
    const box = buttons[index].getBoundingClientRect();
    const height = card.offsetHeight;
    const center = Math.max(height / 2 + 8, Math.min(innerHeight - height / 2 - 8, box.top + box.height / 2));
    card.style.top = `${center - rail.getBoundingClientRect().top}px`;
  }
  function clear() {
    card.hidden = true;
    buttons.forEach((button) => delete button.dataset.distance);
  }
  buttons.forEach((button, index) => {
    button.addEventListener('pointerenter', (event) => { if (event.pointerType !== 'touch') preview(index); });
    button.addEventListener('focus', () => preview(index));
    button.addEventListener('click', () => show(index));
    button.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % buttons.length;
      else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index + buttons.length - 1) % buttons.length;
      else return;
      event.preventDefault();
      buttons[next].focus();
    });
  });
  rail.addEventListener('pointerleave', () => {
    const focused = buttons.indexOf(document.activeElement);
    if (focused >= 0) preview(focused); else clear();
  });
  rail.addEventListener('focusout', (event) => {
    if (!rail.contains(event.relatedTarget)) clear();
  });
  select.addEventListener('change', () => show(Number(select.value)));
  document.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLSelectElement || event.target.isContentEditable || /^(INPUT|TEXTAREA)$/.test(event.target.tagName)) return;
    if (!/^[1-9]$/.test(event.key) || Number(event.key) > buttons.length) return;
    event.preventDefault();
    show(Number(event.key) - 1);
  });
})();
