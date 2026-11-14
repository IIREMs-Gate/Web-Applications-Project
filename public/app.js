// All user-generated text reaches the page as a child of h(), which makes text nodes.
// Never use innerHTML here: that is the stored-XSS defence for descriptions, reviews and messages.
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  el.append(...kids.flat().filter((c) => c != null && c !== false));
  return el;
}

// Icons are built from path data with createElementNS, never from markup strings.
const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONS = {
  tag: ['M4 4h8.5L21 12.5 12.5 21 4 12.5z', 'M8.5 8.5h.01'],
  gem: ['M6 4h12l4 5-10 11L2 9z', 'M2 9h20', 'M9 4l-2 5 5 11 5-11-2-5'],
  bell: ['M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7', 'M10 20a2 2 0 0 0 4 0'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M21 21l-4.5-4.5'],
  chevron: ['M6 9l6 6 6-6'],
  lock: ['M5 11h14v9H5z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  check: ['M5 12.5l4.5 4.5L19 7'],
};
function icon(name, size = 22) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
  for (const d of ICONS[name]) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

const $main = document.getElementById('main');
const $nav = document.getElementById('nav');
const $actions = document.getElementById('actions');
let user = null;
let waiting = 0; // offers on my listings that still need an answer

const show = (...kids) => { $main.replaceChildren(h('div', { class: 'wrap page' }, ...kids.flat().filter((c) => c))); window.scrollTo(0, 0); };
const fmt = (cents) => `£${(cents / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const toCents = (v) => Math.round(Number(v) * 100);
const day = (s) => s.slice(0, 10);
const field = (label, input) => h('label', {}, label, input);
const act = (fn) => async () => { try { await fn(); } catch (e) { alert(e.message); } };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const dash = () => h('span', { class: 'muted' }, '—');

// A person or object keeps one pale tint of their own, derived from the name.
function tinted(el, name) {
  let hue = 0;
  for (const c of name) hue = (hue * 31 + c.charCodeAt(0)) % 360;
  el.style.background = `hsl(${hue} 55% 88%)`;
  el.style.color = `hsl(${hue} 50% 24%)`;
  return el;
}
const initial = (name) => [...name][0].toUpperCase();
const avatar = (name, size = '') => tinted(h('span', { class: `avatar ${size}`, 'aria-hidden': 'true' }, initial(name)), name);
const picture = (l, cls = '') => l.photo
  ? h('img', { class: cls, src: '/uploads/' + l.photo, alt: l.title })
  : tinted(h('div', { class: 'pic ' + cls, role: 'img', 'aria-label': 'No photo' }, initial(l.title)), l.title);
const pill = (text, kind) => h('span', { class: 'pill ' + kind }, text);
const OFFER_PILL = { pending: 'warning', accepted: 'positive', rejected: 'negative' };

async function api(path, { method = 'GET', body, form } = {}) {
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  if (form) opts.body = form;
  const res = await fetch('/api' + path, opts);
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const details = data?.details?.map((d) => `${d.field} ${d.message}`).join('; ');
    throw new Error((data?.error || 'Request failed') + (details ? `: ${details}` : ''));
  }
  return data;
}

// A form whose submit handler gets the FormData; thrown errors are shown under the form.
function formEl(fn, ...kids) {
  const err = h('p', { class: 'error', role: 'alert' });
  return h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      try { await fn(new FormData(e.target)); } catch (x) { err.textContent = x.message; }
    },
  }, ...kids, err);
}

function route() {
  const [path, query] = (location.hash.slice(1) || '/').split('?');
  return { path, params: new URLSearchParams(query || '') };
}
function go(path) {
  if (location.hash === '#' + path) render(); else location.hash = path;
}

const titleRow = (title, sub, ...actions) => h('div', { class: 'titlerow' },
  h('div', {}, h('h1', {}, title), sub && h('p', { class: 'sub' }, sub)),
  actions.length ? h('div', {}, actions) : null);
const card = (title, ...kids) => h('section', { class: 'card' }, h('h2', {}, title), ...kids);

// ---------- top nav ----------

function renderNav() {
  const { path } = route();
  const link = (to, text, current) => h('a', { href: '#' + to, 'aria-current': current ? 'page' : false }, text);
  $nav.replaceChildren(...[
    link('/browse', 'Browse', path === '/browse' || path.startsWith('/listing')),
    user && link('/offers', 'My offers', path === '/offers'),
    user?.role === 'admin' && link('/admin', 'Users', path === '/admin'),
  ].filter((c) => c));

  const sell = h('a', { class: 'btn gold', href: user ? '#/sell' : '#/login' }, icon('tag', 20), h('span', {}, 'Sell an item'));
  $actions.replaceChildren(...(user ? [
    sell,
    h('a', { class: 'bell', href: '#/offers', 'aria-label': waiting ? `${plural(waiting, 'offer', 'offers')} waiting for your answer` : 'My offers' },
      icon('bell'), waiting > 0 && h('span', { class: 'badge' }, waiting)),
    h('details', { class: 'account' },
      h('summary', { 'aria-label': 'Account menu' }, avatar(user.username, 'lg'), icon('chevron', 18)),
      h('div', { class: 'menu-panel' },
        h('div', {}, h('strong', {}, user.username), h('span', { class: 'muted' }, user.role === 'admin' ? 'Admin' : 'Member')),
        h('button', { class: 'ghost small', onclick: act(logout) }, 'Log out'))),
  ] : [
    sell,
    h('a', { href: '#/login', class: 'btn ghost' }, 'Log in'),
    h('a', { href: '#/register', class: 'btn' }, 'Register'),
  ]));
}

async function refreshWaiting() {
  waiting = 0;
  if (user) {
    try { waiting = (await api('/offers')).filter((o) => o.seller_id === user.id && o.status === 'pending').length; } catch { /* nav still works */ }
  }
  renderNav();
}

async function logout() {
  await api('/auth/logout', { method: 'POST' });
  user = null;
  go('/');
}

// ---------- views ----------

const listingCard = (l) => h('a', { class: 'item', href: '#/listing/' + l.id },
  h('div', { class: 'frame' }, picture(l), l.status === 'sold' && h('span', { class: 'tag' }, pill('Sold', 'neutral'))),
  h('h3', {}, l.title),
  h('p', { class: 'price' }, fmt(l.price_cents)),
  h('p', { class: 'muted' }, `${l.seller} · ${day(l.created_at)}`));

const POPULAR = ['guitar', 'camera', 'bike', 'laptop', 'desk'];

async function homeView() {
  const active = await api('/listings?status=active');
  const sellers = new Map(active.map((l) => [l.seller_id, l.seller]));
  const newest = active[0];
  const reviews = newest ? await api(`/users/${newest.seller_id}/reviews`) : [];
  const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;

  const q = h('input', { name: 'q', type: 'search', placeholder: 'Try “film camera” or “bike”', maxlength: 100, 'aria-label': 'Search listings' });
  const how = (n, title, text, ic) => h('div', {}, h('span', { class: 'step' }, icon(ic)), h('h3', {}, `${n}. ${title}`), h('p', {}, text));

  $main.replaceChildren(
    h('section', { class: 'hero' }, h('div', { class: 'hero-in' },
      h('div', {},
        h('p', { class: 'new-badge' }, h('b', {}, icon('gem', 14), 'New'), `${plural(active.length, 'item', 'items')} for sale right now`),
        h('h1', {}, 'Pre-loved finds, from people ', h('span', { class: 'accent' }, 'everywhere'), '.'),
        h('p', { class: 'hero-sub' }, 'Buy and sell second-hand with people around the world: honest reviews, and private offers you stay in control of.'),
        h('form', { class: 'searchbar', role: 'search', onsubmit: (e) => { e.preventDefault(); go('/browse' + (q.value.trim() ? '?q=' + encodeURIComponent(q.value.trim()) : '')); } },
          icon('search', 26), q, h('button', {}, 'Search')),
        h('div', { class: 'chips' }, 'Popular:', POPULAR.map((w) => h('a', { class: 'chip', href: '#/browse?q=' + w }, w))),
        sellers.size > 0 && h('div', { class: 'trust' },
          h('div', { class: 'discs' }, [...sellers.values()].slice(0, 4).map((n) => avatar(n))),
          h('p', { class: 'muted' }, `${plural(sellers.size, 'seller is', 'sellers are')} listing ${plural(active.length, 'item', 'items')} right now`))),
      h('div', { class: 'art' },
        h('img', { class: 'big-photo', src: '/photos/hero-rack.jpg', alt: 'Racks of second-hand clothes and bags in a shop' }),
        h('img', { class: 'small-photo', src: '/photos/hero-vinyl.webp', alt: 'A turntable with a white vinyl record' }),
        newest && h('div', { class: 'float seller' }, avatar(newest.seller, 'lg'),
          h('div', {}, h('strong', {}, newest.seller),
            h('span', { class: 'muted' }, avg ? `${avg} / 5 · ${plural(reviews.length, 'review', 'reviews')}` : 'New seller'))),
        h('div', { class: 'float offer' },
          h('span', { class: 'ok' }, 'Offer accepted'),
          h('div', { class: 'row' }, tinted(h('span', { class: 'avatar lg', 'aria-hidden': 'true' }, 'S'), 'Standing desk'),
            h('div', {}, h('strong', {}, 'Standing desk'), h('strong', {}, '£210.00 ', h('s', {}, '£220.00')))),
          h('span', { class: 'muted' }, 'An example from the demo data'))))),

    h('div', { class: 'wrap' },
      h('section', { class: 'section' },
        h('div', { class: 'section-head' },
          h('div', {}, h('h2', {}, 'Fresh finds'), h('p', { class: 'sub' }, 'The newest things people are selling')),
          h('a', { class: 'btn ghost', href: '#/browse' }, 'See all listings')),
        h('div', { class: 'grid four' }, active.length ? active.slice(0, 8).map(listingCard) : [h('p', { class: 'empty' }, 'Nothing is for sale yet.')])),
      h('section', { class: 'section' },
        h('div', { class: 'section-head' }, h('h2', {}, 'How Trove works')),
        h('div', { class: 'how' },
          how(1, 'List it', 'Add a photo, a price and an honest description. It goes live for buyers everywhere.', 'gem'),
          how(2, 'Get private offers', 'Only you and the buyer can see an offer. Accept the one you like, or reject the rest.', 'lock'),
          how(3, 'Hand it over', 'Agree how to hand it over, mark it sold, and leave a review for the seller.', 'check')))));
  window.scrollTo(0, 0);
}

async function browseView(params) {
  const state = { q: params.get('q') || '', status: params.get('status') === 'sold' ? 'sold' : 'active', max: params.get('max') || '' };
  const query = (status) => {
    const p = new URLSearchParams({ status });
    if (state.q) p.set('q', state.q);
    if (state.max) p.set('max_price', toCents(state.max));
    return api('/listings?' + p);
  };
  const [active, sold] = await Promise.all([query('active'), query('sold')]);
  const rows = state.status === 'active' ? active : sold;

  const q = h('input', { type: 'search', value: state.q, placeholder: 'Search listings', maxlength: 100, 'aria-label': 'Search listings' });
  const max = h('input', { type: 'number', min: '0.01', step: '0.01', value: state.max, placeholder: 'No limit' });
  const apply = (status) => {
    const p = new URLSearchParams();
    if (q.value.trim()) p.set('q', q.value.trim());
    if (status === 'sold') p.set('status', 'sold');
    if (max.value) p.set('max', max.value);
    go('/browse' + (String(p) ? '?' + p : ''));
  };
  const seg = (label, n, status) => h('button', { type: 'button', 'aria-pressed': String(state.status === status), onclick: () => apply(status) }, `${label} (${n})`);

  show(titleRow('Browse listings', state.q ? `Results for “${state.q}”` : 'Things people are selling'),
    h('form', { class: 'filters', role: 'search', onsubmit: (e) => { e.preventDefault(); apply(state.status); } },
      h('div', { class: 'grow' }, q),
      h('label', {}, 'Up to £', max),
      h('button', {}, 'Search'),
      h('div', { class: 'seg' }, seg('Available', active.length, 'active'), seg('Sold', sold.length, 'sold'))),
    h('div', { class: 'grid' }, rows.length ? rows.map(listingCard)
      : [h('p', { class: 'empty' }, state.q || state.max ? 'Nothing matches. Try a different search or price.' : 'Nothing here yet.')]));
}

function loginView() {
  show(h('div', { class: 'narrow' }, titleRow('Log in', 'Welcome back to Trove.'),
    formEl(async (fd) => {
      user = await api('/auth/login', { method: 'POST', body: { username: fd.get('username'), password: fd.get('password') } });
      go('/');
    },
    field('Username', h('input', { name: 'username', required: true, maxlength: 30, autocomplete: 'username' })),
    field('Password', h('input', { name: 'password', type: 'password', required: true, maxlength: 72, autocomplete: 'current-password' })),
    h('button', { class: 'big' }, 'Log in'))));
}

function registerView() {
  show(h('div', { class: 'narrow' }, titleRow('Create an account', 'Buy and sell second-hand with people around the world.'),
    formEl(async (fd) => {
      const body = { username: fd.get('username'), email: fd.get('email'), password: fd.get('password') };
      if (fd.get('phone')) body.phone = fd.get('phone');
      await api('/auth/register', { method: 'POST', body });
      user = await api('/auth/login', { method: 'POST', body: { username: body.username, password: body.password } });
      go('/');
    },
    field('Username (letters, numbers, _)', h('input', { name: 'username', required: true, minlength: 3, maxlength: 30, autocomplete: 'username' })),
    field('Email', h('input', { name: 'email', type: 'email', required: true, maxlength: 254, autocomplete: 'email' })),
    field('Phone (optional, only you and admins see it)', h('input', { name: 'phone', type: 'tel', maxlength: 20, autocomplete: 'tel' })),
    field('Password (8+ characters)', h('input', { name: 'password', type: 'password', required: true, minlength: 8, maxlength: 72, autocomplete: 'new-password' })),
    h('button', { class: 'big' }, 'Register'))));
}

const photoInput = () => h('input', { name: 'photo', type: 'file', accept: 'image/jpeg,image/png,image/webp' });
const uploadPhoto = (id, file) => {
  const form = new FormData();
  form.append('photo', file);
  return api(`/listings/${id}/photo`, { method: 'POST', form });
};

function sellView() {
  if (!user) return go('/login');
  show(h('div', { class: 'narrow' }, titleRow('Sell an item', 'Add a clear photo and an honest description.'),
    formEl(async (fd) => {
      const l = await api('/listings', { method: 'POST', body: {
        title: fd.get('title'), description: fd.get('description'), price_cents: toCents(fd.get('price')),
      } });
      const file = fd.get('photo');
      if (file.size) {
        try { await uploadPhoto(l.id, file); } catch (e) { alert(`Listing created, but the photo failed: ${e.message}`); }
      }
      go('/listing/' + l.id);
    },
    field('Title', h('input', { name: 'title', required: true, minlength: 3, maxlength: 100 })),
    field('Description', h('textarea', { name: 'description', required: true, maxlength: 2000, rows: 5 })),
    field('Price (£)', h('input', { name: 'price', type: 'number', min: '0.01', step: '0.01', required: true })),
    field('Photo (optional, JPEG, PNG or WebP, up to 2 MB)', photoInput()),
    h('button', { class: 'big' }, 'Publish listing'))));
}

const answer = async (id, status) => {
  await api('/offers/' + id, { method: 'PATCH', body: { status } });
  render();
};

// One table for every list of offers. `from` adds the buyer column (what a seller needs to see).
function offerTable(rows, { from }) {
  if (!rows.length) return h('p', { class: 'muted' }, 'No offers here yet.');
  const actions = (o) => {
    const canAnswer = o.status === 'pending' && (user.id === o.seller_id || user.role === 'admin');
    const canWithdraw = user.id === o.buyer_id || user.role === 'admin';
    return h('td', { class: 'act' },
      canAnswer && h('button', { class: 'small', onclick: act(() => answer(o.id, 'accepted')) }, 'Accept'),
      canAnswer && h('button', { class: 'ghost small', onclick: act(() => answer(o.id, 'rejected')) }, 'Reject'),
      canWithdraw && h('button', { class: 'danger small', onclick: act(async () => {
        await api('/offers/' + o.id, { method: 'DELETE' });
        render();
      }) }, 'Withdraw'));
  };
  return h('div', { class: 'table-wrap' }, h('table', {},
    h('thead', {}, h('tr', {},
      h('th', {}, 'Item'), from && h('th', {}, 'From'), h('th', { class: 'num' }, 'Offer'),
      h('th', {}, 'Status'), h('th', { class: 'num' }, 'Date'), h('th', {}, h('span', { class: 'sr' }, 'Actions')))),
    h('tbody', {}, rows.map((o) => h('tr', {},
      h('td', {}, h('a', { href: '#/listing/' + o.listing_id }, o.listing_title),
        o.message && h('span', { class: 'sub2' }, o.message)),
      from && h('td', {}, h('span', { class: 'person' }, avatar(o.buyer, 'sm'), o.buyer)),
      h('td', { class: 'num' }, fmt(o.amount_cents)),
      h('td', {}, pill(o.status[0].toUpperCase() + o.status.slice(1), OFFER_PILL[o.status])),
      h('td', { class: 'num' }, day(o.created_at)),
      actions(o))))));
}

async function listingView(params, id) {
  const l = await api('/listings/' + id);
  const [reviews, offers] = await Promise.all([
    api(`/users/${l.seller_id}/reviews`),
    user ? api('/offers') : [],
  ]);
  const mine = user?.id === l.seller_id;
  const canEdit = user && (mine || user.role === 'admin');
  const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;
  const incoming = offers.filter((o) => o.listing_id === l.id);

  show(
    h('a', { class: 'back', href: '#/browse' }, '← Back to listings'),
    h('div', { class: 'detail' },
      picture(l, 'hero-img'),
      h('div', { class: 'info' },
        h('h1', {}, l.title),
        h('div', {}, pill(l.status === 'sold' ? 'Sold' : 'Available', l.status === 'sold' ? 'neutral' : 'positive')),
        h('p', { class: 'price' }, fmt(l.price_cents)),
        h('p', { class: 'desc' }, l.description),
        h('div', { class: 'seller' }, avatar(l.seller, 'lg'),
          h('div', {}, h('strong', {}, l.seller),
            h('p', { class: 'muted' }, (avg ? `${avg} / 5 from ${plural(reviews.length, 'review', 'reviews')}` : 'No reviews yet') + ` · listed ${day(l.created_at)}`))))),

    canEdit && card('Offers on this listing', offerTable(incoming, { from: true })),

    h('div', { class: 'cards two' },
      !mine && l.status === 'active' && card('Make an offer', user ? formEl(async (fd) => {
        const body = { amount_cents: toCents(fd.get('amount')) };
        if (fd.get('message')) body.message = fd.get('message');
        await api(`/listings/${id}/offers`, { method: 'POST', body });
        go('/offers');
      },
      field('Your offer (£)', h('input', { name: 'amount', type: 'number', min: '0.01', step: '0.01', required: true })),
      field('Message (optional, only the seller sees it)', h('textarea', { name: 'message', maxlength: 500, rows: 3 })),
      h('button', {}, 'Send offer'))
        : h('p', {}, h('a', { href: '#/login' }, 'Log in'), ' to make an offer.')),

      canEdit && card('Manage listing',
        formEl(async (fd) => {
          await api('/listings/' + id, { method: 'PUT', body: {
            title: fd.get('title'), description: fd.get('description'),
            price_cents: toCents(fd.get('price')), status: fd.get('status'),
          } });
          render();
        },
        field('Title', h('input', { name: 'title', value: l.title, required: true, minlength: 3, maxlength: 100 })),
        field('Description', h('textarea', { name: 'description', required: true, maxlength: 2000, rows: 4 }, l.description)),
        field('Price (£)', h('input', { name: 'price', type: 'number', min: '0.01', step: '0.01', value: (l.price_cents / 100).toFixed(2), required: true })),
        field('Status', h('select', { name: 'status' },
          h('option', { value: 'active', selected: l.status === 'active' }, 'Available'),
          h('option', { value: 'sold', selected: l.status === 'sold' }, 'Sold'))),
        h('button', {}, 'Save changes')),
        formEl(async (fd) => {
          if (!fd.get('photo').size) throw new Error('Choose a file first');
          await uploadPhoto(id, fd.get('photo'));
          render();
        }, field('Photo (JPEG, PNG or WebP, up to 2 MB)', photoInput()), h('button', { class: 'ghost' }, 'Upload photo')),
        h('button', { class: 'danger', onclick: act(async () => {
          if (!confirm('Delete this listing?')) return;
          await api('/listings/' + id, { method: 'DELETE' });
          go('/browse');
        }) }, 'Delete listing')),

      card(avg ? `Reviews of ${l.seller} · ${avg} / 5` : `Reviews of ${l.seller}`,
        reviews.length ? h('ul', { class: 'reviews' }, reviews.map((r) => h('li', {},
          avatar(r.author),
          h('div', {}, h('strong', {}, r.author), ' ', h('span', { class: 'muted' }, `${r.rating} / 5 · ${day(r.created_at)}`),
            h('p', { class: 'desc' }, r.body)),
          user && (user.id === r.author_id || user.role === 'admin') && h('button', { class: 'danger small', onclick: act(async () => {
            await api('/reviews/' + r.id, { method: 'DELETE' });
            render();
          }) }, 'Delete'))))
          : h('p', { class: 'muted' }, 'No reviews yet.'),
        user && !mine && formEl(async (fd) => {
          await api(`/users/${l.seller_id}/reviews`, { method: 'POST', body: { rating: Number(fd.get('rating')), body: fd.get('body') } });
          render();
        },
        field('Rating', h('select', { name: 'rating' }, [5, 4, 3, 2, 1].map((n) => h('option', { value: n }, `${n} out of 5`)))),
        field('Your review', h('textarea', { name: 'body', required: true, maxlength: 1000, rows: 3 })),
        h('button', {}, 'Post review')))));
}

async function offersView() {
  if (!user) return go('/login');
  const offers = await api('/offers');
  const received = offers.filter((o) => o.seller_id === user.id);
  const others = offers.filter((o) => o.buyer_id !== user.id && o.seller_id !== user.id);
  const open = received.filter((o) => o.status === 'pending').length;
  show(titleRow('My offers', open ? `${plural(open, 'offer is', 'offers are')} waiting for your answer.` : 'Nothing is waiting for your answer.'),
    h('div', { class: 'cards' },
      card('Offers I received', offerTable(received, { from: true })),
      card('Offers I made', offerTable(offers.filter((o) => o.buyer_id === user.id), { from: false })),
      user.role === 'admin' && card('Everyone else’s offers', offerTable(others, { from: true }))));
}

async function adminView() {
  if (!user) return go('/login');
  const users = await api('/admin/users');
  const admins = users.filter((u) => u.role === 'admin').length;
  show(titleRow('Users', `${users.length} accounts, ${admins} of them admins.`),
    h('div', { class: 'card' }, h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {},
        h('th', {}, 'Username'), h('th', {}, 'Email'), h('th', {}, 'Phone'), h('th', {}, 'Role'),
        h('th', { class: 'num' }, 'Joined'), h('th', {}, h('span', { class: 'sr' }, 'Actions')))),
      h('tbody', {}, users.map((u) => h('tr', {},
        h('td', {}, h('span', { class: 'person' }, avatar(u.username, 'sm'), u.username)),
        h('td', {}, u.email),
        h('td', {}, u.phone || dash()),
        h('td', {}, pill(u.role === 'admin' ? 'Admin' : 'Member', u.role === 'admin' ? 'warning' : 'neutral')),
        h('td', { class: 'num' }, day(u.created_at)),
        h('td', { class: 'act' }, u.id !== user.id && h('button', { class: 'danger small', onclick: act(async () => {
          if (!confirm(`Delete ${u.username} and all their data?`)) return;
          await api('/admin/users/' + u.id, { method: 'DELETE' });
          render();
        }) }, 'Delete')))))))));
}

async function creditsView() {
  const credits = await (await fetch('/photos/credits.json')).json();
  show(titleRow('Photo credits', 'Photographs are used under open licences. Thank you to the photographers.'),
    h('ul', { class: 'credits' }, credits.map((c) => h('li', {},
      c.page?.startsWith('https://') ? h('a', { href: c.page, rel: 'noopener' }, c.title) : c.title,
      c.creator && ` by ${c.creator}`, ', ',
      c.licenseUrl?.startsWith('https://') ? h('a', { href: c.licenseUrl, rel: 'noopener' }, c.license) : c.license,
      c.via && `, via ${c.via}`))));
}

// ---------- router ----------

const routes = [
  [/^\/$/, homeView],
  [/^\/browse$/, browseView],
  [/^\/listing\/(\d+)$/, listingView],
  [/^\/login$/, loginView],
  [/^\/register$/, registerView],
  [/^\/sell$/, sellView],
  [/^\/offers$/, offersView],
  [/^\/admin$/, adminView],
  [/^\/credits$/, creditsView],
];

async function render() {
  renderNav();
  const { path, params } = route();
  for (const [re, view] of routes) {
    const m = path.match(re);
    if (!m) continue;
    try { await view(params, ...m.slice(1)); } catch (e) { show(h('p', { class: 'error' }, e.message)); }
    refreshWaiting();
    return;
  }
  show(titleRow('Page not found'));
}

async function loadUser() {
  try { user = await api('/auth/me'); } catch { user = null; }
}

window.addEventListener('hashchange', render);
loadUser().then(render);
