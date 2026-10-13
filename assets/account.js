/* Fairline — акаунт, вхід/реєстрація, обране, зворотний дзвінок.
   Демо без сервера: дані зберігаються лише в браузері покупця (localStorage).
   У робочому проєкті це замінюється на кабінет покупця OpenCart. */
(function () {
  'use strict';
  const FL = window.FL;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const params = new URLSearchParams(location.search);

  const mem = {};
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : (k in mem ? mem[k] : d); } catch (e) { return k in mem ? mem[k] : d; } },
    set(k, v) { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* приватний режим */ } },
    del(k) { delete mem[k]; try { localStorage.removeItem(k); } catch (e) { /* */ } },
  };

  /* ---------- логотип: гори + вогник ---------- */
  FL.logoMark = `<svg class="logo__mark" width="40" height="30" viewBox="0 0 40 30" aria-hidden="true">
    <path class="lm-a" d="M3 26 15 7l7.5 11.5"/>
    <path class="lm-b" d="M17 26 27 11l10 15"/>
    <path class="lm-base" d="M2 26h36"/>
    <circle class="lm-fire" cx="32" cy="5.5" r="2.6"/>
  </svg>`;

  /* ---------- телефон: маска +380 XX XXX XX XX ---------- */
  FL.maskPhone = (input) => {
    input.addEventListener('input', () => {
      let d = input.value.replace(/\D/g, '');
      if (!d) { input.value = ''; return; }
      if (d.startsWith('0')) d = '38' + d;
      if (!d.startsWith('380')) d = '380' + d.replace(/^3?8?0?/, '');
      d = d.slice(0, 12);
      input.value = '+' + [d.slice(0, 3), d.slice(3, 5), d.slice(5, 8), d.slice(8, 10), d.slice(10, 12)].filter(Boolean).join(' ');
    });
  };
  const phoneOk = (v) => String(v).replace(/\D/g, '').length === 12;
  const emailOk = (v) => /^\S+@\S+\.\S+$/.test(String(v).trim());

  /* ---------- модальне вікно ---------- */
  let lastFocus = null;
  FL.modal = (html, opts = {}) => {
    FL.closeModal();
    lastFocus = document.activeElement;
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = `<div class="modal__scrim" data-mclose></div>
      <div class="modal__box ${opts.wide ? 'modal__box--wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(opts.label || '')}" tabindex="-1">
        <button class="modal__x" type="button" data-mclose aria-label="Закрити">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
        <div class="modal__body">${html}</div>
      </div>`;
    document.body.appendChild(m);
    document.documentElement.classList.add('has-modal');
    requestAnimationFrame(() => m.classList.add('is-open'));
    setTimeout(() => ($('input', m) || $('.modal__box', m)).focus(), 60);
    return m;
  };
  FL.closeModal = () => {
    const m = $('.modal');
    if (!m) return;
    m.classList.remove('is-open');
    document.documentElement.classList.remove('has-modal');
    setTimeout(() => m.remove(), 220);
    lastFocus?.focus?.();
  };
  document.addEventListener('click', (e) => { if (e.target.closest('[data-mclose]')) FL.closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') FL.closeModal(); });

  const fieldErr = (form, name, msg) => {
    const f = form.elements[name].closest('.field');
    f.classList.add('has-error');
    f.insertAdjacentHTML('beforeend', `<span class="field__err">${msg}</span>`);
  };
  const clearErr = (form) => {
    $$('.field__err', form).forEach((x) => x.remove());
    $$('.has-error', form).forEach((x) => x.classList.remove('has-error'));
  };

  /* ---------- акаунт ---------- */
  // Демо-хеш, щоб не тримати пароль відкритим текстом. На сервері — password_hash().
  const hash = (s) => { let h = 5381; for (const c of String(s)) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return 'h' + h.toString(36); };
  FL.auth = {
    users: () => store.get('fl-users', []),
    user() { const email = store.get('fl-session', null); return email ? this.users().find((u) => u.email === email) || null : null; },
    register({ name, email, phone, pass }) {
      const users = this.users();
      email = email.trim().toLowerCase();
      if (users.some((u) => u.email === email)) return 'Акаунт з таким email вже існує — увійдіть.';
      users.push({ name: name.trim(), email, phone, pass: hash(pass), city: '', created: Date.now() });
      store.set('fl-users', users);
      store.set('fl-session', email);
      this.mergeGuest(email);
      return null;
    },
    login(email, pass) {
      email = email.trim().toLowerCase();
      const u = this.users().find((x) => x.email === email);
      if (!u || u.pass !== hash(pass)) return 'Невірний email або пароль.';
      store.set('fl-session', email);
      this.mergeGuest(email);
      return null;
    },
    logout() { store.del('fl-session'); },
    update(patch) {
      const users = this.users(), me = this.user();
      if (!me) return;
      Object.assign(users.find((u) => u.email === me.email), patch);
      store.set('fl-users', users);
    },
    // обране, зібране до входу, переходить в акаунт
    mergeGuest(email) {
      const guest = store.get('fl-fav', []);
      const key = 'fl-fav:' + email;
      store.set(key, [...new Set([...store.get(key, []), ...guest])]);
      store.set('fl-fav', []);
    },
  };
  const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  /* ---------- обране ---------- */
  const favKey = () => { const u = FL.auth.user(); return u ? 'fl-fav:' + u.email : 'fl-fav'; };
  FL.fav = {
    ids: () => store.get(favKey(), []).filter((id) => FL.byId(id)),
    has(id) { return this.ids().includes(Number(id)); },
    toggle(id) {
      id = Number(id);
      const ids = this.ids();
      const on = !ids.includes(id);
      store.set(favKey(), on ? [...ids, id] : ids.filter((x) => x !== id));
      renderFavCount(true);
      return on;
    },
  };
  const heart = `<svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-9-9.1C1.7 7.6 4 4.5 7.3 4.5c2 0 3.4 1.1 4.7 2.8 1.3-1.7 2.7-2.8 4.7-2.8 3.3 0 5.6 3.1 4.3 6.4C19 15.6 12 20 12 20z"/></svg>`;
  FL.favBtn = (p, big) => {
    const on = FL.fav.has(p.id);
    return `<button type="button" class="fav ${big ? 'fav--big' : ''} ${on ? 'is-on' : ''}" data-fav="${p.id}" aria-pressed="${on}" aria-label="${on ? 'Прибрати з обраного' : 'Додати в обране'}">${heart}</button>`;
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fav]');
    if (!b) return;
    e.preventDefault();
    const on = FL.fav.toggle(b.dataset.fav);
    $$(`[data-fav="${b.dataset.fav}"]`).forEach((x) => {
      x.classList.toggle('is-on', on);
      x.setAttribute('aria-pressed', on);
      x.setAttribute('aria-label', on ? 'Прибрати з обраного' : 'Додати в обране');
    });
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    const p = FL.byId(b.dataset.fav);
    FL.toast(on ? `В обраному: ${p.name}` : 'Прибрано з обраного', on ? { href: 'account.html?tab=fav', text: 'Обране' } : null);
    if (document.body.dataset.page === 'account' && !on) renderAccount();
  });

  /* ---------- замовлення в кабінеті ---------- */
  FL.saveOrder = (o) => {
    const u = FL.auth.user();
    const key = u ? 'fl-orders:' + u.email : 'fl-orders';
    store.set(key, [o, ...store.get(key, [])]);
  };
  const orders = () => { const u = FL.auth.user(); return u ? store.get('fl-orders:' + u.email, []) : []; };

  /* ---------- шапка ---------- */
  function renderFavCount(bump) {
    const el = $('#fav-count');
    if (!el) return;
    const n = FL.fav.ids().length;
    el.hidden = n === 0;
    el.textContent = n;
    if (bump && n) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }
  function renderAccountBtn() {
    const u = FL.auth.user(), link = $('#acc-link');
    if (!link) return;
    $('#acc-ava').hidden = !u;
    $('#acc-ico').style.display = u ? 'none' : '';
    $('#acc-ava').textContent = u ? initials(u.name) : '';
    $('#acc-label').textContent = u ? 'Кабінет' : 'Увійти';
    link.setAttribute('aria-label', u ? `Кабінет: ${u.name}` : 'Увійти в кабінет');
  }
  FL.onChrome = () => { renderFavCount(); renderAccountBtn(); };

  // Іконка акаунта: гість — вікно входу, покупець — кабінет
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-account]');
    if (a && !FL.auth.user()) { e.preventDefault(); openAuth('login'); }
    const t = e.target.closest('[data-auth]');
    if (t) { e.preventDefault(); openAuth(t.dataset.auth); }
    const cb = e.target.closest('[data-callback]');
    if (cb) { e.preventDefault(); openCallback(); }
  });

  /* ---------- вхід і реєстрація ---------- */
  const authForm = (mode, inline) => `
    <div class="auth ${inline ? 'auth--inline' : ''}">
      <div class="auth__head">
        ${FL.logoMark}
        <h2>${mode === 'login' ? 'Вхід у кабінет' : 'Створити акаунт'}</h2>
        <p>${mode === 'login' ? 'Замовлення, обране й дані доставки — в одному місці.' : 'Реєстрація займе хвилину. Обране, яке ви вже зібрали, збережеться.'}</p>
      </div>
      <div class="seg" role="tablist">
        <button type="button" role="tab" aria-selected="${mode === 'login'}" data-mode="login">Вхід</button>
        <button type="button" role="tab" aria-selected="${mode === 'reg'}" data-mode="reg">Реєстрація</button>
      </div>
      <form class="form" data-authform="${mode}" novalidate>
        ${mode === 'reg' ? `
          <div class="field"><label for="a-name">Ім’я та прізвище</label><input id="a-name" name="name" autocomplete="name" required></div>
          <div class="field"><label for="a-phone">Телефон</label><input id="a-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+380 __ ___ __ __" required></div>` : ''}
        <div class="field"><label for="a-email">Email</label><input id="a-email" name="email" type="email" autocomplete="email" placeholder="name@gmail.com" required></div>
        <div class="field">
          <label for="a-pass">Пароль</label>
          <div class="pass"><input id="a-pass" name="pass" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" placeholder="${mode === 'reg' ? 'Щонайменше 6 символів' : ''}" required>
            <button type="button" class="pass__eye" data-eye aria-label="Показати пароль"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button>
          </div>
        </div>
        ${mode === 'login'
          ? `<button type="button" class="linkbtn auth__forgot" data-forgot>Забули пароль?</button>`
          : `<label class="check"><input type="checkbox" name="agree"><span>Погоджуюсь з <a href="info.html?p=about">умовами</a> та обробкою персональних даних</span></label>`}
        <div class="auth__err" role="alert" hidden></div>
        <button class="btn btn--lg" type="submit">${mode === 'login' ? 'Увійти' : 'Зареєструватися'}</button>
        <p class="hint auth__demo">Демо-версія: акаунт зберігається лише в цьому браузері.</p>
      </form>
    </div>`;

  function bindAuth(root, inline) {
    root.addEventListener('click', (e) => {
      const m = e.target.closest('[data-mode]');
      if (m) {
        if (inline) { root.innerHTML = authForm(m.dataset.mode, true); bindAuthForm(root, inline); }
        else openAuth(m.dataset.mode);
      }
      const eye = e.target.closest('[data-eye]');
      if (eye) { const i = eye.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; eye.setAttribute('aria-label', i.type === 'password' ? 'Показати пароль' : 'Сховати пароль'); }
      if (e.target.closest('[data-forgot]')) FL.toast('Посилання для відновлення надішлемо на email (у робочій версії)');
    });
    bindAuthForm(root, inline);
  }
  function bindAuthForm(root, inline) {
    const form = $('[data-authform]', root);
    if (form.phone) FL.maskPhone(form.phone);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      clearErr(form);
      const errBox = $('.auth__err', form);
      errBox.hidden = true;
      const reg = form.dataset.authform === 'reg';
      if (reg && form.name.value.trim().length < 2) fieldErr(form, 'name', 'Вкажіть ім’я');
      if (reg && !phoneOk(form.phone.value)) fieldErr(form, 'phone', 'Формат: +380 XX XXX XX XX');
      if (!emailOk(form.email.value)) fieldErr(form, 'email', 'Перевірте email');
      if (form.pass.value.length < (reg ? 6 : 1)) fieldErr(form, 'pass', reg ? 'Щонайменше 6 символів' : 'Введіть пароль');
      if (reg && !form.agree.checked) { errBox.textContent = 'Потрібна згода з умовами.'; errBox.hidden = false; }
      if ($('.has-error', form) || !errBox.hidden) { $('.has-error input', form)?.focus(); return; }
      const err = reg
        ? FL.auth.register({ name: form.name.value, email: form.email.value, phone: form.phone.value, pass: form.pass.value })
        : FL.auth.login(form.email.value, form.pass.value);
      if (err) { errBox.textContent = err; errBox.hidden = false; return; }
      FL.closeModal();
      renderAccountBtn(); renderFavCount();
      FL.toast(reg ? `Вітаємо, ${FL.auth.user().name.split(' ')[0]}! Акаунт створено` : `З поверненням, ${FL.auth.user().name.split(' ')[0]}!`, { href: 'account.html', text: 'Кабінет' });
      if (document.body.dataset.page === 'account') renderAccount();
      if (document.body.dataset.page === 'cart') location.reload();
    });
  }
  function openAuth(mode) {
    const m = FL.modal(authForm(mode), { label: mode === 'login' ? 'Вхід' : 'Реєстрація' });
    bindAuth($('.modal__body', m));
  }
  FL.openAuth = openAuth;

  /* ---------- передзвоніть мені ---------- */
  function openCallback() {
    const u = FL.auth.user();
    const m = FL.modal(`
      <div class="auth">
        <div class="auth__head">
          <span class="cb-ico"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/></svg></span>
          <h2>Передзвонимо вам</h2>
          <p>Залиште номер — допоможемо підібрати спорядження чи оформити замовлення. Пн–Сб, 9:00–19:00.</p>
        </div>
        <form class="form" id="cb-form" novalidate>
          <div class="field"><label for="cb-name">Ім’я</label><input id="cb-name" name="name" autocomplete="name" value="${esc(u?.name || '')}"></div>
          <div class="field"><label for="cb-phone">Телефон</label><input id="cb-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+380 __ ___ __ __" value="${esc(u?.phone || '')}" required></div>
          <div class="field"><label for="cb-topic">Питання <span style="color:var(--muted);font-weight:400">(необов’язково)</span></label>
            <select id="cb-topic" name="topic"><option>Допомогти з вибором</option><option>Наявність і розміри</option><option>Доставка й оплата</option><option>Обмін або повернення</option></select></div>
          <button class="btn btn--lg" type="submit">Чекаю дзвінка</button>
          <p class="hint" style="margin:0;text-align:center">Або подзвоніть самі: <a href="tel:+380636779692" style="color:var(--ember)">063 677 9692</a></p>
        </form>
      </div>`, { label: 'Зворотний дзвінок' });
    const form = $('#cb-form', m);
    FL.maskPhone(form.phone);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      clearErr(form);
      if (!phoneOk(form.phone.value)) { fieldErr(form, 'phone', 'Формат: +380 XX XXX XX XX'); form.phone.focus(); return; }
      store.set('fl-callbacks', [...store.get('fl-callbacks', []), { name: form.name.value, phone: form.phone.value, topic: form.topic.value, at: Date.now() }]);
      $('.modal__body', m).innerHTML = `<div class="auth success-mini">
        <div class="success__badge"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color:var(--ok)"><path d="m5 12 5 5 9-10"/></svg></div>
        <h2>Дякуємо!</h2><p>Менеджер передзвонить на ${esc(form.phone.value)} протягом робочої години.</p>
        <button class="btn" type="button" data-mclose>Добре</button></div>`;
    });
  }

  /* ---------- сторінка кабінету ---------- */
  const TABS = [['orders', 'Мої замовлення'], ['fav', 'Обране'], ['profile', 'Особисті дані']];
  let tab = TABS.some((t) => t[0] === params.get('tab')) ? params.get('tab') : 'orders';
  const fmtDate = (t) => new Date(t).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
  const shipName = { np: 'Нова пошта', courier: 'Кур’єр Нової пошти', pickup: 'Самовивіз' };

  function renderAccount() {
    const root = $('#account');
    if (!root) return;
    const u = FL.auth.user();
    const crumbs = $('#crumbs');
    if (!u) {
      crumbs.innerHTML = '<a href="index.html">Головна</a><span>/</span><span>Особистий кабінет</span>';
      const favN = FL.fav.ids().length;
      root.innerHTML = `
        <div class="acc-guest">
          <div class="panel acc-guest__form"></div>
          <aside class="acc-perks">
            <span class="promo__tag">Кабінет Fairline</span>
            <h2>Купуйте швидше</h2>
            <ul>
              <li><b>Оформлення без зайвого</b><span>Ім’я, телефон і місто підставляються самі</span></li>
              <li><b>Історія замовлень</b><span>Усі покупки й суми в одному місці</span></li>
              <li><b>Обране на потім</b><span>${favN ? `Ви вже зберегли ${favN} ${FL.plural(favN)} — вони перейдуть в акаунт` : 'Зберігайте товари сердечком на картці'}</span></li>
              <li><b>Передзвонимо, коли треба</b><span>Без повторного введення номера</span></li>
            </ul>
          </aside>
        </div>`;
      const box = $('.acc-guest__form', root);
      box.innerHTML = authForm(params.get('mode') === 'reg' ? 'reg' : 'login', true);
      bindAuth(box, true);
      return;
    }

    crumbs.innerHTML = `<a href="index.html">Головна</a><span>/</span><span>Кабінет</span><span>/</span><span>${TABS.find((t) => t[0] === tab)[1]}</span>`;
    const os = orders(), favs = FL.fav.ids().map(FL.byId);
    let body = '';
    if (tab === 'orders') {
      body = os.length
        ? `<div class="orders">${os.map((o) => {
            const n = o.lines.reduce((a, l) => a + l.qty, 0);
            return `<article class="order">
              <div class="order__head"><div><b>Замовлення ${esc(o.num)}</b><span>${fmtDate(o.date)} · ${n} ${FL.plural(n)} · ${shipName[o.ship] || ''}</span></div>
                <span class="order__st">Прийнято</span></div>
              <div class="order__items">${o.lines.map((l) => { const p = FL.byId(l.id); return p ? `<a href="product.html?id=${p.id}" class="order__item" title="${esc(p.name)}">${FL.art(p)}</a>` : ''; }).join('')}</div>
              <div class="order__foot"><span class="price">${FL.price(o.total)}</span>
                <button class="btn btn--ghost btn--sm" data-repeat="${esc(o.num)}">Повторити замовлення</button></div>
            </article>`;
          }).join('')}</div>`
        : `<div class="empty"><p>Замовлень поки немає. Оформлені після входу замовлення з’являться тут.</p><a class="btn" href="catalog.html?section=tourism">До каталогу</a></div>`;
    } else if (tab === 'fav') {
      body = favs.length
        ? `<div class="grid list-anim">${favs.map((p, i) => FL.card(p, { i })).join('')}</div>`
        : `<div class="empty"><p>Тут з’являться товари, які ви збережете сердечком на картці.</p><a class="btn" href="catalog.html">Перейти до каталогу</a></div>`;
    } else {
      body = `<form class="panel form profile" id="profile" novalidate>
          <div class="row2">
            <div class="field"><label for="p-name">Ім’я та прізвище</label><input id="p-name" name="name" value="${esc(u.name)}" autocomplete="name"></div>
            <div class="field"><label for="p-phone">Телефон</label><input id="p-phone" name="phone" type="tel" value="${esc(u.phone)}" autocomplete="tel"></div>
          </div>
          <div class="row2">
            <div class="field"><label for="p-email">Email</label><input id="p-email" value="${esc(u.email)}" disabled></div>
            <div class="field"><label for="p-city">Місто доставки</label><select id="p-city" name="city"><option value="">Не вказано</option>${FL.npCities.map((c) => `<option ${c === u.city ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" type="submit">Зберегти</button></div>
        </form>`;
    }

    root.innerHTML = `
      <div class="acc">
        <aside class="acc__side panel">
          <div class="acc__me"><span class="acc__ava">${esc(initials(u.name))}</span><div><b>${esc(u.name)}</b><span>${esc(u.email)}</span></div></div>
          <nav class="acc__nav" aria-label="Розділи кабінету">
            ${TABS.map(([k, n]) => `<a href="account.html?tab=${k}" data-tab="${k}" ${k === tab ? 'aria-current="page"' : ''}>${n}${k === 'orders' && os.length ? `<small>${os.length}</small>` : ''}${k === 'fav' && favs.length ? `<small>${favs.length}</small>` : ''}</a>`).join('')}
            <button type="button" data-logout>Вийти</button>
          </nav>
        </aside>
        <section class="acc__main">
          <h1>${TABS.find((t) => t[0] === tab)[1]}</h1>
          ${body}
        </section>
      </div>`;

    const pf = $('#profile');
    if (pf) {
      FL.maskPhone(pf.phone);
      pf.addEventListener('submit', (e) => {
        e.preventDefault();
        clearErr(pf);
        if (pf.name.value.trim().length < 2) fieldErr(pf, 'name', 'Вкажіть ім’я');
        if (pf.phone.value && !phoneOk(pf.phone.value)) fieldErr(pf, 'phone', 'Формат: +380 XX XXX XX XX');
        if ($('.has-error', pf)) return;
        FL.auth.update({ name: pf.name.value.trim(), phone: pf.phone.value, city: pf.city.value });
        renderAccountBtn();
        renderAccount();
        FL.toast('Дані збережено');
      });
    }
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t && document.body.dataset.page === 'account') {
      e.preventDefault();
      tab = t.dataset.tab;
      history.replaceState(null, '', 'account.html?tab=' + tab);
      renderAccount();
    }
    if (e.target.closest('[data-logout]')) {
      FL.auth.logout();
      renderAccountBtn(); renderFavCount();
      FL.toast('Ви вийшли з кабінету');
      renderAccount();
    }
    const rep = e.target.closest('[data-repeat]');
    if (rep) {
      const o = orders().find((x) => x.num === rep.dataset.repeat);
      let ok = 0;
      o?.lines.forEach((l) => { const p = FL.byId(l.id); if (p && FL.stockFor(p, l.size) > 0 && FL.cart.add(p.id, l.size, Math.min(l.qty, FL.stockFor(p, l.size)))) ok++; });
      FL.toast(ok ? 'Товари додано в кошик' : 'Цих товарів зараз немає в наявності', ok ? { href: 'cart.html', text: 'До кошика' } : null);
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    if (document.body.dataset.page === 'account') renderAccount();
  });
})();
