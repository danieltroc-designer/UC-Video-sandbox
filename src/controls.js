// Builds the sidebar from the SECTIONS schema and keeps it in sync with state.

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c != null) node.append(c);
  return node;
}

const CHEVRON = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function formatValue(c, v) {
  const decimals = c.step >= 1 ? 0 : c.step >= 0.1 ? 1 : 2;
  return `${Number(v).toFixed(decimals)}${c.unit ?? ''}`;
}

export function buildSidebar(root, { sections, state, defaults, onChange, onImage, imageNote }) {
  const syncers = [];
  const conditionals = [];

  const set = (key, value) => {
    state[key] = value;
    onChange(key);
    syncAll();
  };

  function switchEl(key, label) {
    const btn = el('button', {
      class: 'switch', type: 'button', role: 'switch', 'aria-label': label,
      onclick: () => set(key, !state[key]),
    }, el('span', { class: 'switch-knob' }));
    syncers.push(() => btn.setAttribute('aria-checked', String(!!state[key])));
    return btn;
  }

  function head(c, extra) {
    return el('div', { class: 'field-head' }, [el('span', { class: 'field-label', text: c.label }), extra]);
  }

  function colorInput(key) {
    const input = el('input', { type: 'color', 'aria-label': key, oninput: (e) => set(key, e.target.value) });
    syncers.push(() => { if (input.value !== state[key]) input.value = state[key]; });
    return input;
  }

  const builders = {
    textarea(c) {
      const ta = el('textarea', { rows: c.rows ?? 2, spellcheck: 'false', oninput: (e) => set(c.key, e.target.value) });
      const field = el('div', { class: 'field' }, [
        head(c, c.toggle && switchEl(c.toggle, `Show ${c.label}`)),
        ta,
        c.hint && el('p', { class: 'hint', text: c.hint }),
      ]);
      syncers.push(() => {
        if (document.activeElement !== ta) ta.value = state[c.key];
        field.classList.toggle('is-off', c.toggle ? !state[c.toggle] : false);
      });
      return field;
    },

    text(c) {
      const input = el('input', { type: 'text', spellcheck: 'false', oninput: (e) => set(c.key, e.target.value) });
      const field = el('div', { class: 'field' }, [head(c, c.toggle && switchEl(c.toggle, `Show ${c.label}`)), input]);
      syncers.push(() => {
        if (document.activeElement !== input) input.value = state[c.key];
        field.classList.toggle('is-off', c.toggle ? !state[c.toggle] : false);
      });
      return field;
    },

    range(c) {
      const out = el('button', { class: 'field-value', type: 'button', title: 'Reset', onclick: () => set(c.key, defaults[c.key]) });
      const input = el('input', {
        type: 'range', min: c.min, max: c.max, step: c.step, 'aria-label': c.label,
        oninput: (e) => set(c.key, Number(e.target.value)),
      });
      syncers.push(() => {
        const v = state[c.key];
        if (Number(input.value) !== v) input.value = v;
        input.style.setProperty('--p', `${((v - c.min) / (c.max - c.min)) * 100}%`);
        out.textContent = formatValue(c, v);
        out.classList.toggle('is-changed', v !== defaults[c.key]);
      });
      return el('div', { class: 'field' }, [head(c, out), input]);
    },

    color(c) {
      const swatches = el('div', { class: 'swatches' }, [colorInput(c.key), c.pair && colorInput(c.pair)]);
      return el('div', { class: 'field row' }, [el('span', { class: 'field-label', text: c.label }), swatches]);
    },

    switch(c) {
      return el('div', { class: 'field row' }, [el('span', { class: 'field-label', text: c.label }), switchEl(c.key, c.label)]);
    },

    segmented(c) {
      const buttons = c.options.map(([value, label]) =>
        el('button', { type: 'button', text: label, onclick: () => set(c.key, value) }));
      syncers.push(() => buttons.forEach((b, i) => b.classList.toggle('is-active', c.options[i][0] === state[c.key])));
      return el('div', { class: 'field' }, [head(c), el('div', { class: 'segmented' }, buttons)]);
    },

    select(c) {
      const select = el('select', { onchange: (e) => set(c.key, e.target.value) },
        c.options.map(([value, label]) => el('option', { value, text: label })));
      syncers.push(() => { select.value = state[c.key]; });
      return el('div', { class: 'field row' }, [
        el('span', { class: 'field-label', text: c.label }),
        el('div', { class: 'select' }, select),
      ]);
    },

    image(c) {
      const file = el('input', {
        type: 'file', accept: 'image/*', hidden: true,
        onchange: (e) => { const f = e.target.files?.[0]; if (f) onImage(f); e.target.value = ''; },
      });
      const upload = el('button', { class: 'btn small', type: 'button', onclick: () => file.click() });
      const remove = el('button', { class: 'btn small ghost', type: 'button', text: 'Remove', onclick: () => onImage(null) });
      const note = el('p', { class: 'hint' });
      syncers.push(() => {
        const text = imageNote?.();
        note.textContent = text || '';
        note.hidden = remove.hidden = !text;
        upload.textContent = text ? 'Replace…' : 'Upload…';
      });
      return el('div', { class: 'field' }, [
        head(c, el('div', { class: 'btn-row' }, [remove, upload, file])),
        note,
      ]);
    },
  };

  for (const sec of sections) {
    const summary = el('summary', {}, [el('span', { text: sec.title })]);
    summary.insertAdjacentHTML('beforeend', CHEVRON);
    const body = el('div', { class: 'section-body' }, sec.controls.map((c) => {
      const node = builders[c.type](c);
      if (c.when) conditionals.push(() => { node.hidden = !c.when(state); });
      return node;
    }));
    const details = el('details', { class: 'section', open: true }, [summary, body]);
    if (sec.when) conditionals.push(() => { details.hidden = !sec.when(state); });
    root.append(details);
  }

  function syncAll() {
    syncers.forEach((f) => f());
    conditionals.forEach((f) => f());
  }
  syncAll();
  return { sync: syncAll };
}
