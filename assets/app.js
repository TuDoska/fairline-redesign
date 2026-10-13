/* Fairline — логіка вітрини. Без фреймворків і збірки. */
(function () {
  'use strict';
  const FL = window.FL;

  /* ---------- утиліти ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const params = new URLSearchParams(location.search);
  FL.esc = esc;

  // Єдиний формат ціни: «4 540 ₴» — цілі гривні.
  FL.price = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₴';

  FL.byId = (id) => FL.products.find((p) => p.id === Number(id));
  FL.cat = (id) => FL.categories.find((c) => c.id === id);
  FL.section = (id) => FL.sections.find((s) => s.id === id);
  FL.sectionOf = (cat) => FL.section(cat.section);

  FL.totalStock = (p) => (p.sizes ? Object.values(p.sizes).reduce((a, b) => a + b, 0) : p.stock || 0);
  FL.stockFor = (p, size) => (p.sizes ? (p.sizes[size] || 0) : FL.totalStock(p));
  FL.stockState = (p) => {
    const n = FL.totalStock(p);
    if (n > 3) return { cls: 'in', text: 'В наявності' };
    if (n > 0) return { cls: 'low', text: 'Закінчується' };
    if (p.expected) return { cls: 'wait', text: 'Очікується' };
    return { cls: 'out', text: 'Немає в наявності' };
  };
  const plural = (n, f = ['товар', 'товари', 'товарів']) => {
    const a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return f[0];
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return f[1];
    return f[2];
  };
  FL.plural = plural;

  /* ---------- збереження (з запасним варіантом у пам’яті) ---------- */
  const mem = {};
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : (k in mem ? mem[k] : d); } catch (e) { return k in mem ? mem[k] : d; } },
    set(k, v) { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* приватний режим */ } },
  };

  /* ---------- кошик ---------- */
  FL.cart = {
    items: () => store.get('fl-cart', []).filter((i) => FL.byId(i.id)),
    save(items) { store.set('fl-cart', items); renderCartCount(); },
    count() { return this.items().reduce((a, i) => a + i.qty, 0); },
    lines() { return this.items().map((i) => ({ ...i, p: FL.byId(i.id) })); },
    total() { return this.lines().reduce((a, l) => a + l.p.price * l.qty, 0); },
    add(id, size, qty) {
      const p = FL.byId(id), items = this.items();
      const hit = items.find((i) => i.id === id && i.size === size);
      const max = FL.stockFor(p, size);
      const now = hit ? hit.qty : 0;
      if (now + qty > max) { FL.toast(`Можна замовити не більше ${max} шт.`); return false; }
      if (hit) hit.qty += qty; else items.push({ id, size, qty });
      this.save(items);
      return true;
    },
    setQty(id, size, qty) {
      const items = this.items(), hit = items.find((i) => i.id === id && i.size === size);
      if (!hit) return;
      hit.qty = Math.max(1, Math.min(qty, FL.stockFor(FL.byId(id), size)));
      this.save(items);
    },
    remove(id, size) { this.save(this.items().filter((i) => !(i.id === id && i.size === size))); },
    clear() { this.save([]); },
  };

  // Після додавання в кошик: анімація й міні-кошик (motion.js) або просте повідомлення
  FL.added = (p, size, fromEl) => {
    if (FL.onAdded) FL.onAdded(p, size, fromEl);
    else FL.toast(`Додано в кошик: ${p.name}${size ? `, ${size}` : ''}`, { href: 'cart.html', text: 'Оформити' });
  };

  let toastTimer;
  FL.toast = (msg, link) => {
    $('.toast')?.remove();
    const t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status');
    t.innerHTML = `<span>${esc(msg)}</span>${link ? `<a href="${link.href}">${esc(link.text)}</a>` : ''}`;
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 3200);
  };

  /* ---------- шапка й підвал ---------- */
  function renderCartCount() {
    const el = $('#cart-count');
    if (!el) return;
    const n = FL.cart.count();
    el.hidden = n === 0; // порожній лічильник не показуємо — жодного «0» на вітрині
    el.textContent = n;
  }

  function currentSection() {
    if (params.get('sale') === '1') return 'sale';
    if (params.get('section')) return params.get('section');
    const c = params.get('cat') && FL.cat(params.get('cat'));
    if (c) return c.section;
    const p = document.body.dataset.page === 'product' && FL.byId(params.get('id'));
    if (p) return FL.cat(p.cat).section;
    return null;
  }

  function renderChrome() {
    const header = $('#site-header');
    if (header) {
      const q = params.get('q') || '';
      const cur = currentSection();
      header.innerHTML = `
        <a class="vh" href="#main">Перейти до вмісту</a>
        <div class="topbar"><div class="wrap">
          <span>Кривий Ріг · доставка по всій Україні</span>
          <nav aria-label="Інформація"><a href="info.html?p=delivery">Доставка і оплата</a><a href="info.html?p=returns">Обмін і повернення</a><a href="info.html?p=contacts">Контакти</a></nav>
        </div></div>
        <header class="header">
          <div class="wrap header__row">
            <a class="logo" href="index.html" aria-label="Fairline — на головну">
              ${FL.logoMark}
              <span class="logo__text">Fairline</span>
            </a>
            <form class="search" role="search" action="catalog.html" autocomplete="off">
              <label class="vh" for="q">Пошук товарів</label>
              <svg class="search__ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
              <input id="q" name="q" type="search" value="${esc(q)}" placeholder="Назва, бренд або артикул" aria-controls="suggest" aria-expanded="false">
              <button type="submit" class="search__btn" aria-label="Знайти"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
              <div class="suggest" id="suggest" hidden></div>
            </form>
            <div class="hphone">
              <a href="tel:+380636779692">063 677 9692</a>
              <button type="button" class="hphone__cb" data-callback>Передзвоніть мені</button>
            </div>
            <div class="hicons">
              <a class="hicon hicon--tel" href="tel:+380636779692" aria-label="Подзвонити: 063 677 9692">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/></svg>
              </a>
              <a class="hicon" href="account.html" id="acc-link" data-account aria-label="Увійти в кабінет">
                <span class="hicon__ava" id="acc-ava" hidden></span>
                <svg id="acc-ico" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>
                <span class="hicon__label" id="acc-label">Увійти</span>
              </a>
              <a class="hicon" href="account.html?tab=fav" aria-label="Обране">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-9-9.1C1.7 7.6 4 4.5 7.3 4.5c2 0 3.4 1.1 4.7 2.8 1.3-1.7 2.7-2.8 4.7-2.8 3.3 0 5.6 3.1 4.3 6.4C19 15.6 12 20 12 20z"/></svg>
                <span class="hicon__count" id="fav-count" hidden></span>
              </a>
              <a class="hicon cart-link" href="cart.html" aria-label="Кошик">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>
                <span class="hicon__label cart-link__label">Кошик</span>
                <span class="cart-link__count" id="cart-count" hidden></span>
              </a>
            </div>
          </div>
          <nav class="nav" aria-label="Розділи каталогу"><div class="wrap"><ul>
            <li><a href="catalog.html?sale=1" class="is-sale" ${cur === 'sale' ? 'aria-current="page"' : ''}>Акції</a></li>
            ${FL.sections.map((s) => `<li><a href="catalog.html?section=${s.id}" ${cur === s.id ? 'aria-current="page"' : ''}>${s.name}</a></li>`).join('')}
          </ul></div></nav>
        </header>`;
      renderCartCount();
      initSuggest();
      FL.onChrome?.(); // акаунт і обране (account.js)
    }
    const footer = $('#site-footer');
    if (footer) {
      footer.innerHTML = `
        <footer class="footer">
          <div class="wrap footer__grid">
            <div><b>Каталог</b>${FL.sections.map((s) => `<a href="catalog.html?section=${s.id}">${s.name}</a>`).join('')}<a href="catalog.html?sale=1">Акції</a></div>
            <div><b>Покупцям</b><a href="info.html?p=delivery">Доставка і оплата</a><a href="info.html?p=returns">Обмін і повернення</a><a href="info.html?p=warranty">Гарантія</a><a href="cart.html">Кошик</a></div>
            <div><b>Fairline</b><a href="account.html">Особистий кабінет</a><a href="info.html?p=about">Про магазин</a><a href="info.html?p=contacts">Контакти</a><a href="admin.html">Кабінет менеджера</a></div>
            <div><b>Зв’язок</b><a href="tel:+380636779692">063 677 9692</a><a href="#" data-callback>Передзвоніть мені</a><a href="info.html?p=contacts">Кривий Ріг</a><a href="info.html?p=contacts">Пн–Сб, 9:00–19:00</a></div>
          </div>
          <div class="wrap footer__bottom"><span>© 2026 Fairline</span><span>Прототип оновленої вітрини · <a href="https://github.com/TuDoska/fairline-redesign">код на GitHub</a></span></div>
        </footer>`;
    }
  }

  /* ---------- підказки пошуку ---------- */
  const norm = (s) => String(s).toLowerCase().replace(/[\s\-–’']/g, '');
  FL.search = (q) => {
    const nq = norm(q);
    if (!nq) return [];
    return FL.products.filter((p) => [p.name, p.brand, p.sku, FL.cat(p.cat).name].some((f) => norm(f).includes(nq)));
  };
  function initSuggest() {
    const input = $('#q'), box = $('#suggest');
    let active = -1;
    const close = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
    const show = () => {
      const q = input.value.trim();
      if (q.length < 2) return close();
      const res = FL.search(q);
      box.innerHTML = res.length
        ? res.slice(0, 5).map((p) => `<a href="product.html?id=${p.id}">${FL.art(p)}<span>${esc(p.name)}<small>${FL.price(p.price)} · ${FL.stockState(p).text}</small></span></a>`).join('') +
          `<a class="suggest__all" href="catalog.html?q=${encodeURIComponent(q)}">Усі результати (${res.length})</a>`
        : `<div class="suggest__empty">Нічого не знайшли. Спробуйте назву бренду чи артикул.</div>`;
      box.hidden = false; input.setAttribute('aria-expanded', 'true'); active = -1;
    };
    input.addEventListener('input', show);
    input.addEventListener('focus', show);
    input.addEventListener('keydown', (e) => {
      const links = $$('a', box);
      if (box.hidden || !links.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
        links.forEach((l, i) => l.classList.toggle('is-active', i === active));
      } else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); links[active].click(); }
      else if (e.key === 'Escape') close();
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) close(); });
  }

  /* ---------- картка товару в лістингу ---------- */
  FL.card = (p, opts = {}) => {
    const st = FL.stockState(p);
    const off = p.old ? Math.round((1 - p.price / p.old) * 100) : 0;
    const n = FL.totalStock(p);
    const buy = n === 0
      ? `<button class="btn btn--ghost btn--sm card__buy" data-notify="${p.id}">Повідомити</button>`
      : p.sizes
        ? `<a class="btn btn--ghost btn--sm card__buy" href="product.html?id=${p.id}">Обрати розмір</a>`
        : `<button class="btn btn--sm card__buy" data-add="${p.id}">У кошик</button>`;
    return `
      <article class="card ${n === 0 ? 'is-out' : ''}" style="--i:${opts.i || 0}">
        ${off && n ? `<span class="discount">−${off}%</span>` : ''}
        ${opts.pinned ? '<span class="card__pin mark mark--yellow" title="Закріплено менеджером"></span>' : ''}
        ${FL.favBtn ? FL.favBtn(p) : ''}
        <a class="card__link" href="product.html?id=${p.id}">
          <div class="card__img">${FL.art(p)}</div>
          <div class="card__body">
            <span class="card__brand">${esc(p.brand)}</span>
            <span class="card__name">${esc(p.name)}</span>
          </div>
        </a>
        <div class="card__body" style="padding-top:0;flex:0">
          <span class="stock stock--${st.cls}">${st.text}</span>
          <div class="card__foot">
            <span><span class="price ${off ? 'price--sale' : ''}">${FL.price(p.price)}</span>${off ? `<span class="price-old">${FL.price(p.old)}</span>` : ''}</span>
            ${buy}
          </div>
        </div>
      </article>`;
  };

  // Кнопки на картках працюють на будь-якій сторінці
  document.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) {
      const p = FL.byId(add.dataset.add);
      if (FL.cart.add(p.id, null, 1)) FL.added(p, null, add.closest('.card')?.querySelector('.card__img svg'));
    }
    const nt = e.target.closest('[data-notify]');
    if (nt) {
      const subs = store.get('fl-notify', []);
      if (!subs.includes(Number(nt.dataset.notify))) store.set('fl-notify', [...subs, Number(nt.dataset.notify)]);
      nt.textContent = 'Повідомимо'; nt.disabled = true;
      FL.toast('Напишемо, щойно товар з’явиться на складі');
    }
  });

  /* ---------- модуль рекомендацій ---------- */
  const md = (d) => (d.getMonth() + 1) * 100 + d.getDate();
  const parseMD = (s) => { const [m, d] = s.split('-').map(Number); return m * 100 + d; };
  FL.isActive = (c, today = new Date()) => {
    const t = md(today), a = parseMD(c.from), b = parseMD(c.to);
    return a <= b ? t >= a && t <= b : t >= a || t <= b; // діапазон через Новий рік
  };
  FL.recommend = (c, today = new Date()) => {
    const ok = (p) => FL.totalStock(p) > 0 && p.price > 0 && !p.excluded; // лише в наявності, з ціною
    const pinned = c.pinned.map(FL.byId).filter((p) => p && ok(p));
    const seed = today.getFullYear() * 1000 + md(today);
    const pool = FL.products
      .filter((p) => ok(p) && p.tags.includes(c.tag) && !pinned.includes(p))
      .map((p) => ({ p, k: ((p.id * 9301 + seed * 49297) % 233280) / 233280 })) // щоденна ротація незакріпленої частини
      .sort((a, b) => a.k - b.k).map((x) => x.p);
    return { pinned, items: [...pinned, ...pool].slice(0, c.count) };
  };

  /* ---------- сторінки ---------- */
  const pages = {};

  pages.home = () => {
    $('#hero-art').innerHTML = FL.heroArt();
    const active = FL.collections.filter((c) => FL.isActive(c));
    const seasonal = active.filter((c) => c.from !== '01-01');
    const hero = seasonal[0] || active[0] || FL.collections[0];
    const rest = active.filter((c) => c !== hero);
    const r = FL.recommend(hero);
    $('#season').innerHTML = `
      <div class="wrap season__inner">
        <div class="season__head">
          <h2>${esc(hero.title)}</h2>
          <p>Те, що зараз найчастіше беруть у гори: перевірено за наявністю на складі сьогодні.</p>
          <span class="season__note"><i class="mark mark--yellow"></i>Вибір команди Fairline</span>
          <a class="btn btn--light" style="align-self:start" href="catalog.html?section=tourism">Усе для туризму</a>
        </div>
        <div class="grid" data-reveal>${r.items.map((p, i) => FL.card(p, { pinned: r.pinned.includes(p), i })).join('')}</div>
      </div>`;

    $('#cats').innerHTML = FL.categories.map((c) => {
      const n = FL.products.filter((p) => p.cat === c.id).length;
      return `<a class="cat-tile" style="--i:${FL.categories.indexOf(c)}" href="catalog.html?cat=${c.id}"><div class="cat-tile__img">${FL.catArt(c)}</div>
        <span class="cat-tile__name"><i class="mark mark--${c.mark}"></i><span>${c.name}<small>${n} ${plural(n)}</small></span></span></a>`;
    }).join('');

    $('#collections').innerHTML = rest.map((c) => {
      const items = FL.recommend(c).items;
      if (!items.length) return '';
      return `<section class="section" data-reveal><div class="section__head"><h2>${esc(c.title)}</h2><a href="catalog.html?section=${c.id === 'city' ? 'bags' : 'tourism'}">Дивитися ще</a></div><div class="grid">${items.map((p, i) => FL.card(p, { i })).join('')}</div></section>`;
    }).join('');

    // Промо-плитки
    const nextMonday = () => { const d = new Date(); d.setHours(24, 0, 0, 0); while (d.getDay() !== 1) d.setDate(d.getDate() + 1); return d; };
    const saleCount = FL.products.filter((p) => p.old && FL.totalStock(p) > 0).length;
    const P = (id) => FL.byId(id);
    $('#promos').innerHTML = `
      <a class="promo promo--winter" href="catalog.html?cat=jackets" data-reveal>
        <div class="promo__text"><span class="promo__tag">Зима близько</span><h3>Пуховики та мембрани</h3><p>Тепло на хребті й у місті. Розміри з реальною наявністю.</p><span class="promo__cta">Обрати куртку</span></div>
        <div class="promo__art">${FL.art(P(17))}</div>
      </a>
      <a class="promo promo--light" href="catalog.html?section=light" data-reveal style="--i:1">
        <div class="promo__text"><span class="promo__tag">Світло і заряд</span><h3>Коли вимикають світло</h3><p>Павербанки, налобні й кемпінгові ліхтарі.</p><span class="promo__cta">До розділу</span></div>
        <div class="promo__art promo__art--duo">${FL.art(P(24))}${FL.art(P(13))}</div>
      </a>
      <a class="promo promo--sale" href="catalog.html?sale=1" data-reveal style="--i:2">
        <div class="promo__text"><span class="promo__tag">Акції тижня</span><h3>${saleCount} ${plural(saleCount, ['товар', 'товари', 'товарів'])} зі знижкою</h3>
          <p>До кінця акції</p><div class="countdown" data-until="${nextMonday().getTime()}" aria-live="off"></div><span class="promo__cta">Дивитися акції</span></div>
      </a>`;

    // Стрічка брендів (дублюється для безшовної прокрутки)
    const brands = [...new Set(FL.products.map((p) => p.brand))];
    const marks = ['red', 'blue', 'green', 'yellow', 'red'];
    const item = (b, i) => `<a class="brand" href="catalog.html?brand=${encodeURIComponent(b)}"><i class="mark mark--${marks[i % 5]}"></i>${esc(b)}<small>${FL.products.filter((p) => p.brand === b).length} ${plural(FL.products.filter((p) => p.brand === b).length)}</small></a>`;
    const row = brands.map(item).join('');
    $('#brands').innerHTML = `<div class="marquee__track">${row}${row}${row}${row}</div>`;
    $$('#brands .marquee__track a').forEach((a, i) => { if (i >= brands.length) { a.setAttribute('aria-hidden', 'true'); a.tabIndex = -1; } });
  };

  pages.catalog = () => {
    const q = (params.get('q') || '').trim();
    const sale = params.get('sale') === '1';
    const section = !q && !sale && params.get('section') ? FL.section(params.get('section')) : null;
    const cat = !q && !sale && !section ? FL.cat(params.get('cat') || '') : null;

    let base = FL.products, title, groups, crumbs = ['<a href="index.html">Головна</a>'];
    if (cat) {
      base = base.filter((p) => p.cat === cat.id);
      title = cat.name; groups = cat.filters;
      const s = FL.sectionOf(cat);
      crumbs.push(`<a href="catalog.html?section=${s.id}">${esc(s.name)}</a>`, `<span>${esc(cat.name)}</span>`);
    } else if (section) {
      base = base.filter((p) => section.cats.includes(p.cat));
      title = section.name; groups = ['category', 'brand', 'price'];
      crumbs.push(`<span>${esc(section.name)}</span>`);
    } else if (sale) {
      base = base.filter((p) => p.old && p.old > p.price && FL.totalStock(p) > 0); // лише реальні активні знижки
      title = 'Акції'; groups = ['category', 'brand', 'price'];
      crumbs.push('<span>Акції</span>');
    } else if (q) {
      base = FL.search(q);
      title = `Пошук: «${q}»`; groups = ['category', 'brand', 'price'];
      crumbs.push('<span>Пошук</span>');
    } else {
      base = FL.products; title = 'Усі товари'; groups = ['category', 'brand', 'price'];
      crumbs.push('<span>Усі товари</span>');
    }

    const labels = { ...FL.filterLabels, category: 'Категорія' };
    const state = {};
    groups.forEach((g) => { state[g] = new Set(); });
    let pmin = null, pmax = null;

    const valuesOf = (p, g) => {
      if (g === 'brand') return [p.brand];
      if (g === 'category') return [FL.cat(p.cat).name];
      if (g === 'size') return p.sizes ? Object.keys(p.sizes).filter((s) => p.sizes[s] > 0) : [];
      return p.attrs[g] ? [p.attrs[g]] : [];
    };
    const passes = (p, skip) => {
      for (const g of groups) {
        if (g === 'price' || g === skip || !state[g].size) continue;
        if (!valuesOf(p, g).some((v) => state[g].has(v))) return false; // OR усередині групи
      }
      if (skip !== 'price') {
        if (pmin != null && p.price < pmin) return false;
        if (pmax != null && p.price > pmax) return false;
      }
      return true; // AND між групами
    };

    $('#crumbs').innerHTML = crumbs.join('<span>/</span>');
    const mark = cat ? `<i class="mark mark--${cat.mark}"></i>` : '';
    $('#cat-head').innerHTML = `<div class="cat-title">${mark}<h1>${esc(title)}</h1></div>`;
    const siblings = cat ? FL.sectionOf(cat).cats : section ? section.cats : [];
    $('#subcats').innerHTML = siblings.map(FL.cat).map((c) => `<a href="catalog.html?cat=${c.id}" ${cat && c.id === cat.id ? 'aria-current="page"' : ''}><i class="mark mark--${c.mark}"></i>${c.name}</a>`).join('');
    document.title = `${title} — Fairline`;

    const filtersEl = $('#filters'), listEl = $('#list');
    const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    const countResults = () => base.filter((p) => passes(p)).length;

    function renderFilters() {
      const html = groups.map((g) => {
        if (g === 'price') {
          return `<details class="fgroup" open><summary>Ціна, ₴</summary>
            <div class="prange"><label class="vh" for="pmin">Ціна від</label><input id="pmin" inputmode="numeric" placeholder="від" value="${pmin ?? ''}">
            <label class="vh" for="pmax">Ціна до</label><input id="pmax" inputmode="numeric" placeholder="до" value="${pmax ?? ''}"></div></details>`;
        }
        const counts = new Map();
        base.filter((p) => passes(p, g)).forEach((p) => valuesOf(p, g).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1)));
        state[g].forEach((v) => { if (!counts.has(v)) counts.set(v, 0); });
        const opts = [...counts.entries()]
          .filter(([v, n]) => n > 0 || state[g].has(v)) // значення з 0 товарів не показуємо
          .sort((a, b) => g === 'size' && SIZES.includes(a[0]) ? SIZES.indexOf(a[0]) - SIZES.indexOf(b[0]) : a[0].localeCompare(b[0], 'uk', { numeric: true }));
        if (!opts.length) return '';
        return `<details class="fgroup" open><summary>${labels[g]}</summary><ul>
          ${opts.map(([v, n]) => `<li><label class="fopt"><input type="checkbox" data-g="${g}" value="${esc(v)}" ${state[g].has(v) ? 'checked' : ''}><span>${esc(v)}</span><span class="n">${n}</span></label></li>`).join('')}
        </ul></details>`;
      }).join('');
      filtersEl.innerHTML = `
        <div class="filters__head"><h3>Фільтри</h3><button class="linkbtn" data-reset>Скинути все</button>
          <button class="linkbtn filters__close" data-fclose>Закрити</button></div>
        ${html}
        <div class="filters__apply"><button class="btn" data-fclose>Показати ${countResults()} ${plural(countResults())}</button></div>`;
    }

    function renderList() {
      const sort = $('#sort').value;
      const items = base.filter((p) => passes(p));
      const inStock = (p) => (FL.totalStock(p) > 0 ? 0 : 1);
      items.sort((a, b) => inStock(a) - inStock(b) || (sort === 'cheap' ? a.price - b.price : sort === 'dear' ? b.price - a.price : sort === 'new' ? b.id - a.id : 0));
      $('#found').textContent = `${items.length} ${plural(items.length)}`;
      listEl.innerHTML = items.length
        ? `<div class="grid list-anim">${items.map((p, i) => FL.card(p, { i: Math.min(i, 8) })).join('')}</div>`
        : base.length
          ? `<div class="empty"><p>За цими фільтрами товарів немає. Приберіть один із фільтрів або скиньте всі.</p><button class="btn btn--ghost" data-reset>Скинути фільтри</button></div>`
          : `<div class="empty"><p>${q ? 'За цим запитом нічого не знайшли. Перевірте написання або шукайте за брендом чи артикулом.' : 'Тут поки порожньо.'}</p><a class="btn btn--ghost" href="catalog.html?section=tourism">Перейти до каталогу</a></div>`;
      const chips = [];
      groups.forEach((g) => state[g].forEach((v) => chips.push(`<button class="chip" data-g="${g}" data-v="${esc(v)}" aria-label="Прибрати фільтр ${esc(v)}">${esc(v)}</button>`)));
      if (pmin != null || pmax != null) chips.push(`<button class="chip" data-g="price">${pmin ?? 0}–${pmax ?? '∞'} ₴</button>`);
      $('#chips').innerHTML = chips.join('');
      // Стан фільтрів у URL — щоб посиланням можна було поділитися; такі URL закриваються від індексації.
      const qs = new URLSearchParams(location.search);
      groups.forEach((g) => { if (g !== 'price') { qs.delete(g); if (state[g].size) qs.set(g, [...state[g]].join('|')); } });
      history.replaceState(null, '', '?' + qs.toString());
    }

    const update = () => { renderFilters(); renderList(); };
    const resetAll = () => { groups.forEach((g) => state[g].clear()); pmin = pmax = null; update(); };
    groups.forEach((g) => { const v = params.get(g); if (v && g !== 'price') v.split('|').forEach((x) => state[g].add(x)); });

    filtersEl.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.g) { t.checked ? state[t.dataset.g].add(t.value) : state[t.dataset.g].delete(t.value); update(); }
      if (t.id === 'pmin' || t.id === 'pmax') {
        const v = parseInt(t.value.replace(/\D/g, ''), 10);
        if (t.id === 'pmin') pmin = Number.isFinite(v) ? v : null; else pmax = Number.isFinite(v) ? v : null;
        update();
      }
    });
    function openDrawer(on) {
      filtersEl.classList.toggle('is-open', on);
      $('.scrim')?.remove();
      if (on) { const s = document.createElement('div'); s.className = 'scrim'; document.body.appendChild(s); filtersEl.querySelector('input, button')?.focus(); }
    }
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-reset]')) resetAll();
      if (t.classList.contains('chip')) {
        if (t.dataset.g === 'price') { pmin = pmax = null; } else state[t.dataset.g].delete(t.dataset.v);
        update();
      }
      if (t.closest('#fopen')) openDrawer(true);
      if (t.closest('[data-fclose]') || t.classList.contains('scrim')) openDrawer(false);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') openDrawer(false); });
    $('#sort').addEventListener('change', renderList);
    update();
  };

  pages.product = () => {
    const p = FL.byId(params.get('id')) || FL.products[0];
    const cat = FL.cat(p.cat), sec = FL.sectionOf(cat);
    const off = p.old ? Math.round((1 - p.price / p.old) * 100) : 0;
    const n = FL.totalStock(p), st = FL.stockState(p);
    document.title = `${p.name} — Fairline`;
    $('#crumbs').innerHTML = `<a href="index.html">Головна</a><span>/</span><a href="catalog.html?section=${sec.id}">${esc(sec.name)}</a><span>/</span><a href="catalog.html?cat=${cat.id}">${esc(cat.name)}</a>`;

    let size = null;
    const sizes = p.sizes ? Object.entries(p.sizes) : null;
    const ctaText = n ? 'Додати в кошик' : 'Повідомити про наявність';

    $('#product').innerHTML = `
      <div class="gallery">
        <div class="gallery__main" id="gmain">${off && n ? `<span class="discount">−${off}%</span>` : ''}${FL.art(p, 0)}</div>
        <div class="thumbs" role="group" aria-label="Фото товару">${[0, 1, 2].map((i) => `<button aria-label="Фото ${i + 1}" aria-pressed="${i === 0}" data-i="${i}">${FL.art(p, i)}</button>`).join('')}</div>
      </div>
      <div class="buy">
        <div>
          <a class="card__brand" href="catalog.html?cat=${cat.id}&brand=${encodeURIComponent(p.brand)}">${esc(p.brand)}</a>
          <h1>${esc(p.name)}</h1>
        </div>
        <div class="buy__meta"><span>Артикул: ${esc(p.sku)}</span><span class="stock stock--${st.cls}">${st.text}</span></div>
        <div class="buy__price">
          <span class="price ${off ? 'price--sale' : ''}">${FL.price(p.price)}</span>
          ${off ? `<span class="price-old">${FL.price(p.old)}</span><span class="save">−${off}% · економія ${FL.price(p.old - p.price)}</span>` : ''}
        </div>
        ${sizes ? `
          <div>
            <p class="hint" id="size-hint">Оберіть розмір. Закреслені — немає в наявності.</p>
            <div class="sizes" role="group" aria-label="Розмір">
              ${sizes.map(([s, k]) => `<button class="size" data-s="${s}" aria-pressed="false" ${k ? '' : 'disabled'} title="${k ? `В наявності: ${k} шт.` : 'Немає в наявності'}">${s}</button>`).join('')}
            </div>
          </div>` : ''}
        <div class="qty-row">
          ${n ? `<div class="qty"><button type="button" data-d="-1" aria-label="Менше">−</button><input id="qty" value="1" inputmode="numeric" aria-label="Кількість"><button type="button" data-d="1" aria-label="Більше">+</button></div>` : ''}
          <button class="btn ${n ? '' : 'btn--ghost'}" id="add" ${n ? '' : `data-notify="${p.id}"`}>${ctaText}</button>
          ${FL.favBtn ? FL.favBtn(p, true) : ''}
        </div>
        <ul class="perks">
          <li><i class="mark mark--green"></i>Відправка в день замовлення до 16:00</li>
          <li><i class="mark mark--blue"></i>Безкоштовна доставка від 3 000 ₴</li>
          <li><i class="mark mark--yellow"></i>14 днів на обмін і повернення · <a href="info.html?p=returns">умови</a></li>
        </ul>
        <div class="panel desc"><h3>Опис</h3><p>${esc(p.desc)}</p></div>
        <div class="panel"><h3 style="margin-bottom:6px">Характеристики</h3>
          <table class="specs"><tbody>
            <tr><th scope="row">Бренд</th><td>${esc(p.brand)}</td></tr>
            ${Object.entries(p.specs).map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}
            ${Object.entries(p.attrs).filter(([k]) => FL.filterLabels[k] && !p.specs[FL.filterLabels[k]]).map(([k, v]) => `<tr><th scope="row">${FL.filterLabels[k]}</th><td>${esc(v)}</td></tr>`).join('')}
          </tbody></table>
        </div>
      </div>`;

    $('.thumbs').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      $$('.thumbs button').forEach((x) => x.setAttribute('aria-pressed', x === b));
      $('#gmain').innerHTML = (off && n ? `<span class="discount">−${off}%</span>` : '') + FL.art(p, Number(b.dataset.i));
    });
    $('.qty')?.addEventListener('click', (e) => {
      const d = Number(e.target.dataset.d); if (!d) return;
      const i = $('#qty'), max = size ? p.sizes[size] : (sizes ? Math.max(...Object.values(p.sizes)) : n);
      i.value = Math.min(max, Math.max(1, (parseInt(i.value, 10) || 1) + d));
    });
    $$('.size').forEach((b) => b.addEventListener('click', () => {
      size = b.dataset.s;
      $$('.size').forEach((x) => x.setAttribute('aria-pressed', x === b));
      const k = p.sizes[size];
      $('#size-hint').className = 'hint';
      $('#size-hint').textContent = `Розмір ${size}: ${k > 3 ? 'в наявності' : `залишилось ${k} шт.`}`;
      const i = $('#qty'); if (i && Number(i.value) > k) i.value = k;
    }));
    if (n) {
      $('#add').addEventListener('click', () => {
        if (sizes && !size) {
          $('#size-hint').className = 'hint hint--warn';
          $('#size-hint').textContent = 'Спершу оберіть розмір';
          $('.size:not(:disabled)')?.focus();
          return;
        }
        const qty = Math.max(1, parseInt($('#qty').value, 10) || 1);
        if (FL.cart.add(p.id, size, qty)) FL.added(p, size, $('#gmain svg'));
      });
    }

    const similar = FL.products.filter((x) => x.cat === p.cat && x.id !== p.id && FL.totalStock(x) > 0);
    const more = similar.length < 4 ? FL.products.filter((x) => x.id !== p.id && FL.totalStock(x) > 0 && !similar.includes(x) && x.tags.some((t) => p.tags.includes(t))) : [];
    const list = [...similar, ...more].slice(0, 4);
    $('#similar').innerHTML = list.length ? `<section class="section" data-reveal><div class="section__head"><h2>Схожі товари</h2><a href="catalog.html?cat=${cat.id}">Усі: ${esc(cat.name.toLowerCase())}</a></div><div class="grid">${list.map((x, i) => FL.card(x, { i })).join('')}</div></section>` : '';
  };

  pages.cart = () => {
    const root = $('#cart');
    const FREE = 3000;

    function render() {
      const lines = FL.cart.lines();
      if (!lines.length) {
        root.innerHTML = `<div class="empty" style="margin:24px 0 48px"><h1 style="font-size:26px">Кошик порожній</h1><p>Додайте щось для наступного виходу в гори.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"><a class="btn" href="catalog.html?section=tourism">До каталогу</a><a class="btn btn--ghost" href="catalog.html?sale=1">Акції</a></div></div>`;
        return;
      }
      const total = FL.cart.total(), count = FL.cart.count();
      const delivery = total >= FREE ? 'безкоштовно' : 'за тарифами перевізника';
      root.innerHTML = `
        <h1 style="margin:8px 0 18px">Кошик</h1>
        <div class="cartpage">
          <div>
            <div class="cart-items">
              ${lines.map((l) => {
                const max = FL.stockFor(l.p, l.size);
                return `<div class="citem">
                  <a class="citem__img" href="product.html?id=${l.p.id}" aria-label="${esc(l.p.name)}">${FL.art(l.p)}</a>
                  <div><a class="citem__name" href="product.html?id=${l.p.id}">${esc(l.p.name)}</a>
                    <div class="citem__meta">${l.size ? `Розмір: ${esc(l.size)} · ` : ''}${FL.price(l.p.price)} / шт.${max <= 3 ? ` · залишилось ${max}` : ''}</div>
                    <div class="citem__row">
                      <div class="qty qty--sm"><button type="button" data-q="-1" data-id="${l.p.id}" data-size="${l.size ?? ''}" aria-label="Менше">−</button><input value="${l.qty}" readonly aria-label="Кількість"><button type="button" data-q="1" data-id="${l.p.id}" data-size="${l.size ?? ''}" aria-label="Більше" ${l.qty >= max ? 'disabled' : ''}>+</button></div>
                      <button class="linkbtn" data-rm="${l.p.id}" data-size="${l.size ?? ''}">Видалити</button>
                    </div>
                  </div>
                  <div class="citem__side"><span class="price">${FL.price(l.p.price * l.qty)}</span></div>
                </div>`;
              }).join('')}
            </div>

            <form class="panel form" id="checkout" novalidate style="margin-top:18px">
              <h2 style="font-size:22px">Оформлення замовлення</h2>
              <div class="row2">
                <div class="field"><label for="f-name">Ім’я та прізвище</label><input id="f-name" name="name" autocomplete="name" required></div>
                <div class="field"><label for="f-phone">Телефон</label><input id="f-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+380 __ ___ __ __" required></div>
              </div>
              <div class="field"><label for="f-email">Email для чека <span style="color:var(--muted);font-weight:400">(необов’язково)</span></label><input id="f-email" name="email" type="email" autocomplete="email"></div>
              <fieldset class="field" style="border:0;padding:0;margin:0"><legend style="font-weight:500;margin-bottom:6px">Доставка</legend>
                <div class="radios">
                  <label class="radio"><input type="radio" name="ship" value="np" checked><span>Нова пошта — відділення або поштомат<small>1–2 дні, ${delivery}</small></span></label>
                  <label class="radio"><input type="radio" name="ship" value="courier"><span>Кур’єр Нової пошти<small>1–2 дні, до дверей</small></span></label>
                  <label class="radio"><input type="radio" name="ship" value="pickup"><span>Самовивіз у Кривому Розі<small>Сьогодні після підтвердження, безкоштовно</small></span></label>
                </div>
              </fieldset>
              <div class="row2" id="np-fields">
                <div class="field"><label for="f-city">Місто</label><select id="f-city" name="city" required><option value="">Оберіть місто</option>${FL.npCities.map((c) => `<option>${c}</option>`).join('')}</select></div>
                <div class="field"><label for="f-branch" id="f-branch-l">Номер відділення</label><input id="f-branch" name="branch" inputmode="numeric" required></div>
              </div>
              <fieldset class="field" style="border:0;padding:0;margin:0"><legend style="font-weight:500;margin-bottom:6px">Оплата</legend>
                <div class="radios">
                  <label class="radio"><input type="radio" name="pay" value="cod" checked><span>Під час отримання<small>Накладений платіж Нової пошти</small></span></label>
                  <label class="radio"><input type="radio" name="pay" value="card"><span>Карткою онлайн<small>Visa, Mastercard, Apple Pay, Google Pay</small></span></label>
                  <label class="radio"><input type="radio" name="pay" value="iban"><span>За реквізитами<small>Для ФОП і компаній</small></span></label>
                </div>
              </fieldset>
              <div class="field"><label for="f-note">Коментар</label><textarea id="f-note" name="note" placeholder="Наприклад, зручний час для дзвінка"></textarea></div>
              <button class="btn" type="submit">Підтвердити замовлення на ${FL.price(total)}</button>
            </form>
          </div>

          <aside class="panel summary" aria-label="Підсумок">
            <h3>Разом</h3>
            <div class="summary__row"><span>${count} ${plural(count)}</span><span>${FL.price(total)}</span></div>
            <div class="summary__row"><span>Доставка</span><span>${delivery}</span></div>
            ${total < FREE ? `<p class="hint" style="margin:0">До безкоштовної доставки бракує ${FL.price(FREE - total)}</p>` : ''}
            <div class="summary__row summary__total"><span>До сплати</span><span>${FL.price(total)}</span></div>
            <a class="btn" href="#checkout">Оформити замовлення</a>
            <a class="btn btn--ghost" href="catalog.html?section=tourism">Продовжити покупки</a>
          </aside>
        </div>`;
      bindForm();
    }

    function bindForm() {
      const form = $('#checkout');
      const phone = $('#f-phone');
      // Увійшли в кабінет — підставляємо дані
      const u = FL.auth?.user();
      if (u) {
        form.name.value = u.name || '';
        form.phone.value = u.phone || '';
        form.email.value = u.email || '';
        if (u.city && [...form.city.options].some((o) => o.value === u.city || o.text === u.city)) form.city.value = u.city;
      } else {
        form.insertAdjacentHTML('afterbegin', `<p class="hint" style="margin:0">Вже купували? <a href="#" data-auth="login" style="color:var(--ember)">Увійдіть</a> — дані підставляться самі, а замовлення збережеться в кабінеті.</p>`);
      }
      phone.addEventListener('input', () => {
        let d = phone.value.replace(/\D/g, '');
        if (d.startsWith('0')) d = '38' + d;
        if (!d.startsWith('380')) d = '380' + d.replace(/^3?8?0?/, '');
        d = d.slice(0, 12);
        const p = [d.slice(0, 3), d.slice(3, 5), d.slice(5, 8), d.slice(8, 10), d.slice(10, 12)].filter(Boolean);
        phone.value = '+' + p.join(' ');
      });
      form.addEventListener('change', (e) => {
        if (e.target.name !== 'ship') return;
        const v = e.target.value;
        $('#np-fields').hidden = v === 'pickup';
        $('#f-branch-l').textContent = v === 'courier' ? 'Вулиця, будинок, квартира' : 'Номер відділення';
        $('#f-branch').inputMode = v === 'courier' ? 'text' : 'numeric';
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        $$('.field__err', form).forEach((x) => x.remove());
        $$('.has-error', form).forEach((x) => x.classList.remove('has-error'));
        const fail = (id, msg) => {
          const f = $(id, form).closest('.field');
          f.classList.add('has-error');
          f.insertAdjacentHTML('beforeend', `<span class="field__err">${msg}</span>`);
        };
        const ship = form.ship.value;
        if (form.name.value.trim().length < 3) fail('#f-name', 'Вкажіть ім’я та прізвище');
        if (form.phone.value.replace(/\D/g, '').length !== 12) fail('#f-phone', 'Вкажіть номер у форматі +380 XX XXX XX XX');
        if (form.email.value && !/^\S+@\S+\.\S+$/.test(form.email.value)) fail('#f-email', 'Перевірте email');
        if (ship !== 'pickup' && !form.city.value) fail('#f-city', 'Оберіть місто');
        if (ship !== 'pickup' && !form.branch.value.trim()) fail('#f-branch', ship === 'courier' ? 'Вкажіть адресу' : 'Вкажіть номер відділення');
        const bad = $('.has-error input, .has-error select', form);
        if (bad) { bad.focus(); return; }

        const num = 'FL-' + String(Date.now()).slice(-6);
        const total = FL.cart.total();
        FL.saveOrder?.({ num, total, date: Date.now(), ship, lines: FL.cart.lines().map((l) => ({ id: l.p.id, size: l.size, qty: l.qty, price: l.p.price })) });
        FL.cart.clear();
        root.innerHTML = `<div class="panel success" style="margin:24px auto 48px;max-width:560px">
          <div class="success__badge"><i class="mark mark--green" style="transform:scale(1.6)"></i></div>
          <h1 style="font-size:26px">Замовлення ${num} прийнято</h1>
          <p style="margin:0">Сума ${FL.price(total)}. Менеджер зателефонує на ${esc(form.phone.value)} протягом робочої години, щоб підтвердити доставку.</p>
          <p class="hint" style="margin:0">Це прототип вітрини: дані замовлення нікуди не надсилаються.</p>
          <a class="btn" href="index.html">На головну</a>
        </div>`;
        window.scrollTo(0, 0);
      });
    }

    root.addEventListener('click', (e) => {
      const q = e.target.closest('[data-q]');
      if (q) {
        const id = Number(q.dataset.id), size = q.dataset.size || null;
        const line = FL.cart.items().find((i) => i.id === id && i.size === size);
        FL.cart.setQty(id, size, line.qty + Number(q.dataset.q));
        render();
      }
      const rm = e.target.closest('[data-rm]');
      if (rm) {
        const p = FL.byId(rm.dataset.rm);
        FL.cart.remove(p.id, rm.dataset.size || null);
        render();
        FL.toast(`Видалено: ${p.name}`);
      }
    });
    render();
    if (location.hash === '#checkout') setTimeout(() => $('#checkout')?.scrollIntoView({ block: 'start' }), 50);
  };

  pages.info = () => {
    const P = {
      delivery: ['Доставка і оплата', `
        <p>Відправляємо замовлення в день оформлення, якщо ви підтвердили його до 16:00. Решту — наступного робочого дня.</p>
        <h2>Доставка</h2>
        <table><thead><tr><th>Спосіб</th><th>Строк</th><th>Вартість</th></tr></thead><tbody>
          <tr><td>Нова пошта, відділення чи поштомат</td><td>1–2 дні</td><td>за тарифами перевізника, від 3 000 ₴ — безкоштовно</td></tr>
          <tr><td>Кур’єр Нової пошти</td><td>1–2 дні</td><td>за тарифами перевізника</td></tr>
          <tr><td>Самовивіз у Кривому Розі</td><td>у день замовлення</td><td>безкоштовно</td></tr>
        </tbody></table>
        <h2>Оплата</h2>
        <ul><li>Під час отримання — накладений платіж Нової пошти.</li><li>Карткою онлайн — Visa, Mastercard, Apple Pay, Google Pay.</li><li>За реквізитами — для ФОП і компаній, з рахунком.</li></ul>`],
      returns: ['Обмін і повернення', `
        <p>Маєте 14 днів, щоб обміняти або повернути товар, який не підійшов: розмір, колір, модель.</p>
        <h2>Як повернути</h2>
        <ol><li>Напишіть нам номер замовлення й причину.</li><li>Відправте товар Новою поштою — у повній комплектації, без слідів використання.</li><li>Повернемо гроші протягом 3 робочих днів після отримання.</li></ol>
        <p>Доставку при поверненні оплачує покупець, якщо товар без дефектів.</p>`],
      warranty: ['Гарантія', `<p>На все спорядження діє гарантія виробника — від 6 місяців до 2 років, строк указаний у картці товару.</p>
        <h2>Якщо щось зламалось</h2><p>Напишіть нам з фото дефекту й номером замовлення. Ми передамо товар у сервіс постачальника або замінимо його.</p>`],
      contacts: ['Контакти', `<p>Магазин і склад — у Кривому Розі. Відповідаємо з понеділка по суботу, з 9:00 до 19:00.</p>
        <h2>Як з нами зв’язатися</h2><ul><li>Телефон і месенджери — вказані в шапці робочого сайту.</li><li>Instagram — @fairline</li><li>Самовивіз — за адресою, яку менеджер надішле після підтвердження замовлення.</li></ul>
        <form class="form panel" id="contact-form" novalidate style="margin-top:16px">
          <h2 style="margin:0;font-size:20px">Написати нам</h2>
          <div class="field"><label for="c-name">Ім’я</label><input id="c-name" required></div>
          <div class="field"><label for="c-msg">Повідомлення</label><textarea id="c-msg" required></textarea></div>
          <button class="btn" type="submit" style="justify-self:start">Надіслати</button>
        </form>`],
      about: ['Про магазин', `<p>Fairline — магазин спорядження для туризму, спорту, саду й дому з Кривого Рогу. Працюємо напряму з українськими дистриб’юторами, тож ціни й наявність на сайті оновлюються автоматично кілька разів на день.</p>
        <h2>Чому нам довіряють</h2><ul><li>Перевіряємо наявність перед відправкою.</li><li>Допомагаємо підібрати намет, спальник чи розмір взуття.</li><li>14 днів на обмін і повернення.</li></ul>`],
    };
    const key = P[params.get('p')] ? params.get('p') : 'delivery';
    document.title = `${P[key][0]} — Fairline`;
    $('#crumbs').innerHTML = `<a href="index.html">Головна</a><span>/</span><span>${P[key][0]}</span>`;
    $('#info').innerHTML = `
      <nav class="info__nav" aria-label="Інформація для покупців">${Object.entries(P).map(([k, v]) => `<a href="info.html?p=${k}" ${k === key ? 'aria-current="page"' : ''}>${v[0]}</a>`).join('')}</nav>
      <article class="info__body"><h1>${P[key][0]}</h1>${P[key][1]}</article>`;
    $('#contact-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      if (!$('#c-name').value.trim() || !$('#c-msg').value.trim()) { FL.toast('Заповніть ім’я та повідомлення'); return; }
      f.innerHTML = '<h2 style="margin:0;font-size:20px">Дякуємо!</h2><p style="margin:0">Відповімо протягом робочого дня.</p>';
    });
  };

  document.addEventListener('DOMContentLoaded', () => {
    renderChrome();
    const fn = pages[document.body.dataset.page];
    if (fn) fn();
  });
})();
