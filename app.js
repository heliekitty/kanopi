(() => {
  'use strict';

  const SAMPLE = window.KANOPI_SAMPLE;
  const Store = window.KanopiStore;
  let D = SAMPLE;
  const V = window.KANOPI_VERSION || { version: 'unknown', released: 'unknown' };
  const WINDOW_DAYS = 30;

  // ---- Family members (editable in Settings) -------------------------------

  // Ring and initial-circle colors. Each gives white text at least 4.5:1.
  const COLORS = [
    ['#A8502A', 'Terracotta'], ['#4F5F67', 'Slate'], ['#7B4B7A', 'Plum'], ['#3F5FA0', 'Indigo'],
    ['#1F7A5A', 'Forest'], ['#8A6A12', 'Ochre'], ['#A8465E', 'Rose']
  ];
  const AVATAR_CHOICES = [
    ['redpanda', 'Red panda'], ['koala', 'Koala'], ['fox', 'Fox'], ['bear', 'Bear'],
    ['rabbit', 'Rabbit'], ['owl', 'Owl'], ['frog', 'Frog'], ['cat', 'Cat'], ['initial', 'Initial only']
  ];
  const MAX_MEMBERS = 6;
  const MAX_NAME = 20;
  const MEMBERS_KEY = 'kanopi-members';

  const DEFAULT_MEMBERS = [
    { id: 'redpanda', label: 'Red Panda', color: '#A8502A', avatar: 'redpanda', updatedAt: 1 },
    { id: 'koala', label: 'Koala', color: '#4F5F67', avatar: 'koala', updatedAt: 1 }
  ];

  function loadMembers() {
    try {
      const raw = JSON.parse(localStorage.getItem(MEMBERS_KEY) || 'null');
      if (Array.isArray(raw)) {
        const seen = {};
        const list = raw.filter((m) => m && typeof m.id === 'string' && /^[a-z0-9]{1,24}$/.test(m.id)
          && typeof m.label === 'string' && m.label.trim() && !seen[m.id] && (seen[m.id] = true))
          .slice(0, MAX_MEMBERS)
          .map((m) => ({
            id: m.id,
            label: m.label.trim().slice(0, MAX_NAME),
            color: COLORS.some((c) => c[0] === m.color) ? m.color : COLORS[1][0],
            avatar: AVATAR_CHOICES.some((c) => c[0] === m.avatar) ? m.avatar : 'initial',
            updatedAt: Number(m.updatedAt) || 1
          }));
        if (list.length) return list;
      }
    } catch (e) { /* storage may be unavailable; use the defaults */ }
    return DEFAULT_MEMBERS.map((m) => ({ ...m }));
  }

  // ---- On-device storage (IndexedDB, see store.js) ---------------------------------

  let records = [];        // every stored record, including removed ones (tombstones)
  let dataMode = 'sample'; // 'sample' or 'mine'
  let storeReady = false;
  let storeError = '';

  const isSample = () => dataMode !== 'mine';

  function cacheRecords(list) {
    const byId = new Map(records.map((r) => [r.id, r]));
    list.forEach((r) => byId.set(r.id, r));
    records = Array.from(byId.values());
  }

  function writeRecords(list) {
    cacheRecords(list);
    return Store.putRecords(list).catch(() => { storeError = 'Could not save to this device. Export a backup to be safe.'; });
  }

  function refreshData() {
    D = dataMode === 'mine' ? Store.build(records, SAMPLE, startOfToday()) : SAMPLE;
  }

  function membersFromRecords(list) {
    return list.filter((r) => r.kind === 'member' && !r.deleted).slice(0, MAX_MEMBERS).map((r) => ({
      id: r.id,
      label: (r.label || 'Member').slice(0, MAX_NAME),
      color: COLORS.some((c) => c[0] === r.color) ? r.color : COLORS[1][0],
      avatar: AVATAR_CHOICES.some((c) => c[0] === r.avatar) ? r.avatar : 'initial',
      updatedAt: r.updatedAt
    }));
  }

  const memberRecord = (m) => ({ id: m.id, kind: 'member', updatedAt: m.updatedAt || 1, label: m.label, color: m.color, avatar: m.avatar });

  // prev is the list before the change, so only edited or removed members are written.
  function saveMembers(prev) {
    if (isSample()) { sampleMembers = memberList; return; }
    if (!storeReady) return;
    const now = Date.now();
    const out = [];
    memberList.forEach((m) => {
      const p = prev.find((x) => x.id === m.id);
      if (!p || p.label !== m.label || p.color !== m.color || p.avatar !== m.avatar) {
        m.updatedAt = now;
        out.push(memberRecord(m));
      }
    });
    prev.forEach((p) => {
      if (!memberList.some((m) => m.id === p.id)) out.push({ id: p.id, kind: 'member', updatedAt: now, deleted: true });
    });
    if (out.length) writeRecords(out);
  }

  // Sample data has two example members. Your own data starts with none.
  let sampleMembers = DEFAULT_MEMBERS.map((m) => ({ ...m }));
  let memberList = sampleMembers;
  let MEMBERS = {};

  function rebuildMembers() {
    MEMBERS = { together: { label: 'Together' } };
    memberList.forEach((m) => {
      MEMBERS[m.id] = { label: m.label, initial: (m.label.trim()[0] || '?').toUpperCase(), color: m.color, avatar: m.avatar };
    });
  }
  rebuildMembers();

  // Sample mode shows the example family; your own data shows the members saved on this device.
  function syncMembers() {
    memberList = isSample() ? sampleMembers : membersFromRecords(records);
    rebuildMembers();
    if (!MEMBERS[who]) setWho('together');
  }

  const ownerLabel = (o) => (o === 'shared' ? 'Joint' : (MEMBERS[o] ? MEMBERS[o].label : String(o)));

  const money = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  });

  const money2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
  // Whole dollars when there are no cents, otherwise with cents.
  // Always with cents (the planner).
  const fmtc = (n) => money2.format(n);
  const fmt = (n) => (Math.abs(n - Math.round(n)) < 0.005 ? money.format(n) : money2.format(n));

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const clampPct = (n) => Math.max(0, Math.min(100, Math.round(n)));
  const pctOf = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);
  const sumOf = (list) => list.reduce((t, n) => t + n, 0);
  const signed = (n) => (n < 0 ? '−' : '+');
  const signedMoney = (n) => `${n < 0 ? '−' : ''}${money.format(Math.abs(n))}`;
  const pctText = (n, digits) => `${n.toFixed(digits === undefined ? 1 : digits)}%`;
  const signedPctText = (n) => `${signed(n)}${Math.abs(n).toFixed(1)}%`;

  // ---- Who is being viewed -----------------------------------------------

  let who = 'together';
  let groupBy = 'type';
  let period = '1Y';

  try {
    const saved = localStorage.getItem('kanopi-who');
    if (saved && Object.prototype.hasOwnProperty.call(MEMBERS, saved)) who = saved;
  } catch (e) { /* storage may be unavailable; stay on Together */ }

  function setWho(id) {
    if (!Object.prototype.hasOwnProperty.call(MEMBERS, id)) return;
    who = id;
    resetBudgetTools();
    try { localStorage.setItem('kanopi-who', id); } catch (e) { /* ignore */ }
  }

  const inView = (owner) => who === 'together' || owner === who;
  const ownersInView = () => (who === 'together' ? memberList.map((m) => m.id).concat('shared') : [who]);

  // ---- Dates -------------------------------------------------------------

  function startOfToday() {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  const daysBetween = (from, to) => Math.round((to - from) / 86400000);

  function dateFromDaysAgo(n) {
    const t = startOfToday();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate() - n);
  }

  function nextMonthly(day, today) {
    let d = new Date(today.getFullYear(), today.getMonth(), day);
    if (d < today) d = new Date(today.getFullYear(), today.getMonth() + 1, day);
    return d;
  }

  function formatDate(d) {
    const sameYear = d.getFullYear() === startOfToday().getFullYear();
    return d.toLocaleDateString('en-US', sameYear
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function relative(days) {
    if (days === 0) return 'today';
    if (days === 1) return 'tomorrow';
    return `in ${days} days`;
  }

  const monthLabel = () => startOfToday().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // ---- Data in view ------------------------------------------------------

  function balances() {
    return ownersInView().reduce((t, k) => {
      const b = D.balances[k] || { assets: 0, liabilities: 0 };
      t.assets += b.assets;
      t.liabilities += b.liabilities;
      return t;
    }, { assets: 0, liabilities: 0 });
  }

  // One row per category, summed across the owners in view.
  function budgetRows() {
    const acc = {};
    ownersInView().forEach((o) => {
      const own = D.budget[o] || {};
      Object.keys(own).forEach((c) => {
        const pair = own[c];
        if (!acc[c]) acc[c] = { key: c, label: D.categories[c], spent: 0, budget: 0 };
        acc[c].spent += pair[0];
        acc[c].budget += pair[1];
      });
    });
    return Object.keys(acc).map((c) => acc[c]);
  }

  function budgetTotals() {
    const rows = budgetRows();
    return { spent: sumOf(rows.map((r) => r.spent)), budget: sumOf(rows.map((r) => r.budget)) };
  }

  function holdingsInView() {
    return D.holdings
      .map((h) => ({ ...h, value: h.shares * h.price, owner: D.accounts[h.account].owner }))
      .filter((h) => inView(h.owner))
      .sort((a, b) => b.value - a.value);
  }

  // ---- Upcoming payments (taxes + bills), sorted by due date -------------

  function upcomingPayments() {
    const today = startOfToday();
    const items = [];

    D.taxPayments.filter((q) => q.status === 'Upcoming').forEach((q) => {
      const date = new Date(q.due[0], q.due[1] - 1, q.due[2]);
      items.push({ kind: 'Tax', name: 'Federal estimated tax', amount: q.federal, date, owner: 'shared' });
      items.push({ kind: 'Tax', name: 'State estimated tax', amount: q.state, date, owner: 'shared' });
    });

    D.bills.forEach((b) => {
      items.push({ kind: 'Bill', name: b.name, amount: b.amount, date: nextMonthly(b.day, today), owner: b.owner });
    });

    return items
      .filter((p) => inView(p.owner))
      .map((p) => ({ ...p, days: daysBetween(today, p.date) }))
      .filter((p) => p.days >= 0)
      .sort((a, b) => a.date - b.date || a.name.localeCompare(b.name));
  }

  function splitPayments() {
    const all = upcomingPayments();
    return {
      soon: all.filter((p) => p.days <= WINDOW_DAYS),
      later: all.filter((p) => p.days > WINDOW_DAYS)
    };
  }

  const sumPayments = (list) => sumOf(list.map((p) => p.amount));

  // ---- Leaf meter and tree ----------------------------------------------

  // Ten leaves, filled to the nearest tenth. The wrapper carries the progressbar semantics.
  const LEAF_PATH = 'M20.89 2.3C20.46 2.22 10.42.55 5.07 5.9c-.71.71-1.33 1.54-1.85 2.47C1.23 11.94 1.71 16.06 4.4 19c1.78-4.44 5.26-8.02 9.6-10c-3.86 2.73-6.71 7.2-7.21 11.89c1.32.73 2.78 1.11 4.26 1.11s3.11-.4 4.58-1.22c.93-.52 1.76-1.14 2.47-1.85c5.35-5.35 3.67-15.39 3.6-15.82a.99.99 0 0 0-.81-.81';

  const POOP_PATH = 'M19.58 14.17c.27-.5.42-1.06.42-1.67c0-1.64-1.14-3.02-2.67-3.4c.07-.5.02-.97-.14-1.42c-.49-1.33-1.9-2.06-3.21-2.61c-1.69-.7-1.78-1.95-1.78-2.08c0-.34-.18-.66-.47-.85c-.29-.18-.66-.2-.97-.05c-.15.07-3.77 1.85-4.47 4.72a4.1 4.1 0 0 0 .12 2.35a3.506 3.506 0 0 0-2 5a3.505 3.505 0 0 0-2.42 3.33c0 1.93 1.57 3.5 3.5 3.5h13c1.93 0 3.5-1.57 3.5-3.5c0-1.55-1.02-2.88-2.42-3.33Z';

  function leafMeter(label, pct, over) {
    const p = clampPct(pct);
    const filled = Math.round(p / 10);
    // Over budget, the leaves turn into piles of poop.
    const leaves = Array.from({ length: 10 }, (_, i) => (over
      ? `<svg class="leaf poop" viewBox="0 0 24 24" aria-hidden="true"><path d="${POOP_PATH}"></path></svg>`
      : `<svg class="leaf ${i < filled ? 'on' : 'off'}" viewBox="0 0 24 24" aria-hidden="true"><path d="${LEAF_PATH}"></path></svg>`)
    ).join('');
    return `<div class="leaves${over ? ' over' : ''}" role="progressbar" aria-label="${esc(label)}"
              aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"${over ? ' aria-valuetext="Over budget"' : ''}>${leaves}</div>`;
  }

  // Decorative tree on the net worth card.
  function treeSvg() {
    return `<svg class="tree" viewBox="0 0 128 128" aria-hidden="true" focusable="false"><path fill="#1F7A5A" d="M32 24.66s2.43-7.3 8.16-11.88s58.85 15.04 58.85 15.04s9.28 3.31 14.77 12.08c3.69 5.9 5.75 14.62 1.84 25.15c-9.32 25.08-33.5 22.18-39.8 20.75c-2.96-.67-10.17-2.58-10.17-2.58s-16.47 13.6-36.29 3.17c-15.09-7.94-13.22-19.81-13.22-19.81S5.98 56.42 10.38 42.27C15.68 25.23 32 24.66 32 24.66"/><path fill="#2E9E76" d="M66.37 55.01c13.75-2.29 18.04-8.16 21.77-13.6c4.11-6 3.01-11.03 5.87-11.17s5.14 5.02 2 14.03c-4.44 12.74-13.57 14.61-13.75 18.04c-.14 2.72 9.72 2.91 18.62-1.43c12.89-6.3 12.89-21.05 12.89-21.05s-2.29-4.73-6.73-8.02s-7.74-5.01-7.74-5.01S94 6.9 69.95 3.6S36.01 17.07 36.01 17.07s.86 5.44 5.01 11.74c3.31 5.03 6.73 4.87 6.44 7.73c-.19 1.86-6.16 2.43-12.46-.29c-5.74-2.48-7.16-5.87-8.73-5.87S11.68 37.63 17.11 53c4.3 12.17 18.51 14.45 21.05 14.89c7.45 1.29 11.74-3.58 6.44-7.45s-11.17-6.16-9.88-10.02c1.39-4.18 6.35.18 12.31 2.76c5.89 2.55 13.02 2.89 19.34 1.83"/><path fill="#5E4429" d="M39.03 70.97s3.3-.19 4.66-.58s3.2-1.55 3.2-1.55S59.64 82.18 60.96 83.3c1.29 1.09 2.81-15.53 2.81-15.53s2.91.45 5.63.02c3.58-.57 6.02-1.71 6.02-1.71S73.68 76.31 73 80.19c-.43 2.49-.58 9.41-.58 9.41l-9.32 7.76l-7.09-4.76s-.02-1.87-1.07-3.14c-3.26-3.94-15.91-18.49-15.91-18.49m32.51 22.81l7.09-8.54s2.52.19 4.37.19c1.84 0 5.05-.39 5.05-.39s-5.82 7.86-8.93 11.74s-7.18 8.74-7.18 8.74l-3.88-11.26z"/><path fill="#7A5A3C" d="M66.5 86.98c-2.9.26-10.48 5.63-10.48 5.63s.39 9.12.1 14.27s-2.32 13.56-.45 15.69c1.62 1.84 15.24 2.19 17.27.05c2.04-2.14.06-10.98.06-16.71s-.58-16.31-.58-16.31s-2.62-2.91-5.92-2.62"/></svg>`;
  }

  // ---- Charts (plain HTML, one green for marks, gray for context) --------

  // Horizontal bars, one row per item: name and figure on top, bar below.
  // rows: [{ label, value, text, muted?, over? }]. value is compared with opts.max (default: the largest value).
  // opts.meter draws a full-width track, so a row reads as "this much of its own limit".
  function bars(rows, ariaLabel, opts) {
    const o = opts || {};
    const max = o.max || Math.max.apply(null, rows.map((r) => r.value).concat([0])) || 1;
    const items = rows.map((r) => {
      const w = Math.max(0, Math.min(100, (r.value / max) * 100));
      const cls = `bar-fill${r.muted ? ' muted' : ''}${r.over ? ' over' : ''}${w === 0 ? ' zero' : ''}`;
      return `
        <li class="bar-item" title="${esc(r.label)}: ${esc(r.text)}">
          <div class="bar-top"><span class="bar-name">${esc(r.label)}</span><span class="bar-text">${esc(r.text)}</span></div>
          <div class="bar-track"><span class="${cls}" style="width:${w.toFixed(1)}%"></span></div>
        </li>`;
    }).join('');
    return `<ul class="bars${o.meter ? ' bars-meter' : ''}" role="list" aria-label="${esc(ariaLabel)}">${items}</ul>`;
  }

  // Vertical columns with the value on the cap.
  function columns(items, ariaLabel) {
    const max = Math.max.apply(null, items.map((i) => i.value).concat([0])) || 1;
    const cols = items.map((i) => `
      <div class="col" title="${esc(i.label)}: ${esc(i.text)}">
        <span class="col-val">${esc(i.text)}</span>
        <span class="col-bar" style="height:${Math.max(2, (i.value / max) * 130).toFixed(0)}px"></span>
        <span class="col-label">${esc(i.label)}</span>
      </div>`).join('');
    return `<div class="cols" role="group" aria-label="${esc(ariaLabel)}">${cols}</div>`;
  }


  // Pie chart with a legend. items: [{ label, value, color }]. Values of zero are left out.
  // Expenses never use green: green is reserved for income and savings elsewhere.
  const PIE_COLORS = ['#2a78d6', '#eb6834', '#8C5E34', '#eda100', '#e87ba4', '#5E6B8C', '#6250d6', '#e34948'];
  const PIE_OTHER = '#8A8F93';
  // Income types, shaded in greys for the income bar. Paycheck is the darkest.
  const INCOME_TYPES = [['paycheck', 'Paycheck', '#1F7A5A'], ['investments', 'Investments', '#2E9E76'], ['other-income', 'Other', '#A8E6CF']];
  const incomeTypeOf = (p) => (INCOME_TYPES.some((t) => t[0] === p.incomeType) ? p.incomeType : 'other-income');
  const incomeTypeLabel = (p) => INCOME_TYPES.find((t) => t[0] === incomeTypeOf(p))[1];

  function pie(items, ariaLabel) {
    const list = items.filter((i) => i.value > 0);
    const total = sumOf(list.map((i) => i.value));
    if (!total) return '<p class="muted">Nothing spent yet this month.</p>';
    const R = 90; const C = 100;
    let angle = -Math.PI / 2;
    const pt = (a) => `${(C + R * Math.cos(a)).toFixed(2)} ${(C + R * Math.sin(a)).toFixed(2)}`;
    const slices = list.map((i) => {
      const share = i.value / total;
      const tip = `${i.label}: ${money.format(i.value)} · ${pctText(share * 100, 0)}`;
      if (share >= 0.9999) return `<circle cx="${C}" cy="${C}" r="${R}" fill="${i.color}"><title>${esc(tip)}</title></circle>`;
      const a0 = angle; const a1 = angle + share * Math.PI * 2;
      angle = a1;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      return `<path d="M${C} ${C} L${pt(a0)} A${R} ${R} 0 ${large} 1 ${pt(a1)} Z" fill="${i.color}"><title>${esc(tip)}</title></path>`;
    }).join('');
    const legend = list.map((i) => `
      <li class="pie-item" title="${esc(i.label)}: ${esc(money.format(i.value))}">
        <span class="pie-swatch" style="background:${i.color}" aria-hidden="true"></span>
        <span class="pie-name">${esc(i.label)}</span>
        <span class="pie-val">${money.format(i.value)} · ${pctText((i.value / total) * 100, 0)}</span>
      </li>`).join('');
    return `
      <div class="pie-wrap">
        <svg class="pie" viewBox="0 0 200 200" aria-hidden="true" focusable="false">${slices}</svg>
        <ul class="pie-legend" role="list" aria-label="${esc(ariaLabel)}">${legend}</ul>
      </div>`;
  }

  // Plain table. head: [{ t, num }]. rows: arrays of ready-to-insert HTML, or { cells, strong }.
  // Mobile card list built from the same rows. A head entry's `card` role decides where its cell goes:
  // title (bold line), meta (small line joined by dots), block (own line, e.g. avatar),
  // amount (large, right), secondary (small, right, under the amount), actions (icon buttons beside the title).
  function cardList(caption, head, rows) {
    const role = (i) => (head[i] && head[i].card) || 'meta';
    const roleOf = (c, i) => (String(c).indexOf('row-actions') !== -1 ? 'act' : role(i));
    const filled = (cells, name) => cells.map((c, i) => [c, i]).filter(([c, i]) => roleOf(c, i) === name && String(c).trim() !== '');
    const items = rows.map((r) => {
      const cells = Array.isArray(r) ? r : r.cells;
      const strong = !Array.isArray(r) && r.strong;
      const acts = cells.filter((c) => String(c).indexOf('row-actions') !== -1);
      const titles = filled(cells, 'title');
      const metas = filled(cells, 'meta');
      const blocks = filled(cells, 'block');
      const amounts = filled(cells, 'amount');
      const secs = filled(cells, 'secondary');
      const titleHtml = titles.length ? titles.map(([c]) => c).join(' ') : (metas.length ? metas.shift()[0] : '');
      const amountRaw = amounts.length ? amounts[0][0] : (secs.length ? secs[0][0] : '');
      const amountHtml = String(amountRaw).indexOf('tx-amt') !== -1 ? amountRaw : `<span class="tx-amt">${amountRaw}</span>`;
      const secHtml = amounts.length && secs.length ? `<span class="tx-sec">${esc(head[secs[0][1]].t)}: ${secs[0][0]}</span>` : '';
      return `
        <li class="tx-row${strong ? ' strong' : ''}">
          <div class="tx-main">
            <span class="tx-title"><span class="tx-name">${titleHtml}</span>${acts.join('')}</span>
            ${metas.length ? `<span class="tx-meta">${metas.map(([c]) => c).join(' · ')}</span>` : ''}
            ${blocks.map(([c]) => `<span class="tx-block">${c}</span>`).join('')}
          </div>
          ${amountRaw !== '' || secHtml ? `<div class="tx-side">${amountHtml}${secHtml}</div>` : ''}
        </li>`;
    }).join('');
    return `<ul class="tx-list tbl-cards" aria-label="${esc(caption)}">${items}</ul>`;
  }

  function table(caption, head, rows, cards) {
    const th = head.map((h) => `<th scope="col"${h.num ? ' class="num"' : ''}${h.aria ? ` aria-sort="${h.aria}"` : ''}>${h.html || esc(h.t)}</th>`).join('');
    const body = rows.map((r) => {
      const cells = Array.isArray(r) ? r : r.cells;
      const strong = !Array.isArray(r) && r.strong;
      const cls = [strong ? 'strong' : '', !Array.isArray(r) && r.cls ? r.cls : ''].filter(Boolean).join(' ');
      // A cell holding row actions (icon buttons) is tagged, so mobile can put it on the row's title line.
      const act = cells.some((c) => String(c).indexOf('row-actions') !== -1);
      const rowCls = [cls, act ? 'has-act' : ''].filter(Boolean).join(' ');
      return `<tr${rowCls ? ` class="${rowCls}"` : ''}>${cells.map((c, i) => {
        const isAct = String(c).indexOf('row-actions') !== -1;
        const tdCls = [head[i] && head[i].num ? 'num' : '', isAct ? 'act-cell' : ''].filter(Boolean).join(' ');
        return `<td${tdCls ? ` class="${tdCls}"` : ''} data-label="${head[i] ? esc(head[i].t) : ''}">${c}</td>`;
      }).join('')}</tr>`;
    }).join('');
    const tableHtml = `
      <div class="tbl-wrap${cards ? ' tbl-desktop' : ''}">
        <table class="tbl">
          <caption class="sr-only">${esc(caption)}</caption>
          <thead><tr>${th}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
    // With cards set, phones get the card list instead of the stacked table.
    return cards ? tableHtml + cardList(caption, head, rows) : tableHtml;
  }

  function card(id, title, body, cls) {
    return `
      <section class="card${cls ? ' ' + cls : ''}" aria-labelledby="${id}">
        <h2 id="${id}" class="card-label">${esc(title)}</h2>
        ${body}
      </section>`;
  }

  function toggles(attr, current, options, ariaLabel) {
    const buttons = options.map(([id, label]) =>
      `<button type="button" class="seg plain" data-${attr}="${esc(id)}" aria-pressed="${id === current}">${esc(label)}</button>`
    ).join('');
    return `<div class="switcher" role="group" aria-label="${esc(ariaLabel)}">${buttons}</div>`;
  }

  function subnav(links, current) {
    return `<nav class="subnav" aria-label="Sections">${links.map(([id, label]) =>
      `<a href="#${id}"${id === current ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('')}</nav>`;
  }

  // ---- Family switcher ---------------------------------------------------

  // Avatars come from avatars.js. An empty slot falls back to a placeholder with the initial.
  // Each avatar may appear only once per page, because ids inside an SVG must stay unique.
  let avatarCount = 0;

  function avatarSvgFor(key) {
    const A = window.KANOPI_AVATARS || {};
    const S = window.KANOPI_AVATAR_SET || {};
    const svg = key === 'redpanda' ? A.redpanda : key === 'koala' ? A.koala : S[key];
    return svg && String(svg).trim() ? String(svg) : '';
  }

  // One avatar circle. ring: draw a colored ring (used where the member is shown by name).
  function avatarFor(key, color, label, ring) {
    let svg = key === 'initial' ? '' : avatarSvgFor(key);
    if (svg) {
      // Give every copy its own ids, so the page and the top-bar menu can both show it.
      const n = ++avatarCount;
      const ids = Array.from(svg.matchAll(/\bid="([^"]+)"/g)).map((m) => m[1]);
      ids.forEach((x) => { svg = svg.split(x).join(`${x}-${n}`); });
    } else {
      const initial = (String(label).trim()[0] || '?').toUpperCase();
      svg = `<svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
           <circle cx="18" cy="18" r="18" fill="${esc(color)}"></circle>
           <text x="18" y="24" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF">${esc(initial)}</text>
         </svg>`;
    }
    return `<span class="avatar"${ring ? ` style="--ring:${esc(color)}"` : ''} aria-hidden="true">${svg}</span>`;
  }

  function avatarHtml(id) {
    const m = MEMBERS[id];
    return avatarFor(m.avatar, m.color, m.label, true);
  }

  const TOGETHER_ICON = `
    <span class="avatar avatar-together" aria-hidden="true">
      <svg viewBox="0 0 36 36" focusable="false">
        <circle cx="13" cy="18" r="9" style="fill:var(--leaf)"></circle>
        <circle cx="23" cy="18" r="9" style="fill:var(--leaf-deep);fill-opacity:0.85"></circle>
      </svg>
    </span>`;

  function switcher() {
    const buttons = ['together'].concat(memberList.map((m) => m.id)).map((id) => `
      <button type="button" class="seg" data-who="${id}" aria-pressed="${id === who}">
        ${id === 'together' ? TOGETHER_ICON : avatarHtml(id)}
        <span>${esc(MEMBERS[id].label)}</span>
      </button>`).join('');
    return `<div class="switcher who-switcher" role="group" aria-label="Show finances for">${buttons}</div>`;
  }

  const pageTop = (sub) => `${switcher()}${sub || ''}`;

  // ---- Top-bar member menu (phones) ----------------------------------------

  const whoMenu = document.getElementById('who-menu');

  function whoIcon(id) { return id === 'together' ? TOGETHER_ICON : avatarHtml(id); }

  function renderWhoMenu() {
    if (!whoMenu) return;
    const items = ['together'].concat(memberList.map((m) => m.id)).map((id) => `
      <li role="none">
        <button type="button" class="who-item" role="menuitemradio" aria-checked="${id === who}" data-menu-who="${id}">
          ${whoIcon(id)}<span>${esc(MEMBERS[id].label)}</span>
          <svg class="who-check" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8.5l3.2 3.2L13 5"/></svg>
        </button>
      </li>`).join('');
    whoMenu.innerHTML = `
      <button type="button" class="who-btn" id="who-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="who-list"
              aria-label="Viewing: ${esc(MEMBERS[who].label)}. Change view">
        ${whoIcon(who)}
        <svg class="who-chev" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 6l4 4 4-4"/></svg>
      </button>
      <ul class="who-list" id="who-list" role="menu" aria-label="Show finances for" hidden>${items}</ul>`;
  }

  function closeWhoMenu(returnFocus) {
    const btn = document.getElementById('who-btn');
    const list = document.getElementById('who-list');
    if (!btn || !list || list.hidden) return;
    list.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (returnFocus) btn.focus();
  }

  if (whoMenu) {
    whoMenu.addEventListener('click', (event) => {
      const item = event.target.closest('[data-menu-who]');
      if (item) {
        setWho(item.dataset.menuWho);
        route({ keepPlace: true });
        const btn = document.getElementById('who-btn');
        if (btn) btn.focus();
        return;
      }
      const btn = event.target.closest('#who-btn');
      if (!btn) return;
      const list = document.getElementById('who-list');
      const open = list.hidden;
      list.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      if (open) {
        const cur = list.querySelector('[aria-checked="true"]');
        if (cur) cur.focus();
      }
    });
    whoMenu.addEventListener('keydown', (event) => {
      const list = document.getElementById('who-list');
      if (!list || list.hidden) return;
      if (event.key === 'Escape') { event.preventDefault(); closeWhoMenu(true); return; }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const els = Array.from(list.querySelectorAll('.who-item'));
        const i = els.indexOf(document.activeElement);
        const next = event.key === 'ArrowDown' ? (i + 1) % els.length : (i - 1 + els.length) % els.length;
        els[next].focus();
      }
    });
    document.addEventListener('click', (event) => {
      if (!whoMenu.contains(event.target)) closeWhoMenu(false);
    });
  }

  // ---- Home --------------------------------------------------------------

  function paymentsCard() {
    const { soon, later } = splitPayments();
    const next = soon[0] || later[0];

    let body;
    if (soon.length) {
      const noun = soon.length === 1 ? 'payment' : 'payments';
      body = `
        <p class="big">${money.format(sumPayments(soon))}</p>
        <p class="muted">${soon.length} ${noun} due in the next ${WINDOW_DAYS} days</p>
        <p class="muted">Next: ${esc(next.name)} · ${esc(formatDate(next.date))} (${relative(next.days)})</p>`;
    } else if (next) {
      body = `
        <p class="big">Nothing due</p>
        <p class="muted">No payments in the next ${WINDOW_DAYS} days</p>
        <p class="muted">Next: ${esc(next.name)} · ${money.format(next.amount)} · ${esc(formatDate(next.date))}</p>`;
    } else {
      body = `<p class="big">Nothing due</p><p class="muted">No upcoming payments.</p>`;
    }

    return `
      <a class="card card-link" href="#payments" aria-labelledby="pay-title">
        <span class="card-head">
          <h2 id="pay-title" class="card-label">Upcoming payments</h2>
          <span class="chev" aria-hidden="true">&rsaquo;</span>
        </span>
        ${body}
      </a>`;
  }

  function renderHome() {
    const b = balances();
    const bt = budgetTotals();
    const netWorth = b.assets - b.liabilities;
    const afterExpenses = netWorth - bt.spent;
    const tripPct = pctOf(D.trip.saved, D.trip.target);
    const budgetPct = pctOf(bt.spent, bt.budget);

    const signals = D.signals.length
      ? `<ul class="signal-list">${D.signals.map((s) => `
            <li><a href="#portfolio">
              <span class="pill">${esc(s.label)}</span>
              <span>${esc(s.detail)}</span>
            </a></li>`).join('')}
         </ul>`
      : '<p class="muted">No pending signals.</p>';

    return `
      ${pageTop()}
      <div class="stack">
        <section class="card wide nw-card" aria-labelledby="nw-title">
          <div class="nw-text">
            <h2 id="nw-title" class="card-label">Net worth</h2>
            <p class="big">${money.format(netWorth)}</p>
            <p class="muted">After this month's expenses: ${money.format(afterExpenses)}</p>
          </div>
          ${treeSvg()}
        </section>

        <section class="card" aria-labelledby="trip-title">
          <h2 id="trip-title" class="card-label">Trip goal</h2>
          <p class="row"><span>${esc(D.trip.name)}</span><span>${clampPct(tripPct)}%</span></p>
          ${leafMeter('Trip goal progress', tripPct)}
          <p class="muted">${money.format(D.trip.saved)} saved of ${money.format(D.trip.target)} · ${esc(D.trip.targetDate)}</p>
        </section>

        <section class="card" aria-labelledby="budget-title">
          <h2 id="budget-title" class="card-label">Budget this month</h2>
          <p class="row"><span>${esc(monthLabel())}</span><span>${money.format(bt.spent)} of ${money.format(bt.budget)}</span></p>
          ${leafMeter('Budget spent', budgetPct, bt.budget > 0 && bt.spent > bt.budget)}
          ${bt.budget > 0 && bt.spent > bt.budget ? `<p class="over-note">Over budget by ${money.format(bt.spent - bt.budget)}</p>` : ''}
        </section>

        ${paymentsCard()}

        <section class="card wide-lg" aria-labelledby="signals-title">
          <h2 id="signals-title" class="card-label">Pending rebalance signals</h2>
          ${signals}
        </section>
      </div>`;
  }

  // ---- Payments detail ---------------------------------------------------

  function paymentRow(p) {
    return `
      <li class="pay-row">
        <span class="pill">${esc(p.kind)}</span>
        <span class="pay-main">
          <span class="pay-name">${esc(p.name)}</span>
          <span class="pay-meta">${esc(formatDate(p.date))} · ${relative(p.days)}</span>
        </span>
        <span class="pay-amt">${money.format(p.amount)}</span>
      </li>`;
  }

  function paymentSection(id, title, list, emptyText) {
    const noun = list.length === 1 ? 'payment' : 'payments';
    return `
      <section class="card" aria-labelledby="${id}">
        <div class="section-head">
          <h2 id="${id}" class="card-label">${esc(title)}</h2>
          <span class="section-total">${list.length} ${noun} · ${money.format(sumPayments(list))}</span>
        </div>
        ${list.length
          ? `<ul class="pay-list">${list.map(paymentRow).join('')}</ul>`
          : `<p class="muted">${esc(emptyText)}</p>`}
      </section>`;
  }

  function renderPayments() {
    const { soon, later } = splitPayments();
    return `
      <div class="detail">
        <a class="back-link" href="#home">&lsaquo; Home</a>
        <p class="muted scope-note">Showing: ${esc(MEMBERS[who].label)}. Change the view with the switcher.</p>
        ${paymentSection('soon-title', `Next ${WINDOW_DAYS} days`, soon, `Nothing due in the next ${WINDOW_DAYS} days.`)}
        <div class="divider" role="separator" aria-label="Later than ${WINDOW_DAYS} days"><span><svg class="rings" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8"></circle><circle cx="10" cy="10" r="5"></circle><circle cx="10" cy="10" r="2"></circle></svg>Later</span></div>
        ${paymentSection('later-title', `Beyond ${WINDOW_DAYS} days`, later, 'No later payments on file.')}
        <p class="muted">${isSample() ? 'Tax amounts are sample estimates. ' : ''}Bills repeat monthly on their usual day.</p>
      </div>`;
  }

  // ---- Portfolio ---------------------------------------------------------

  const PORTFOLIO_LINKS = [
    ['portfolio', 'Composition'],
    ['portfolio-holdings', 'Holdings'],
    ['portfolio-activity', 'Activity'],
    ['portfolio-performance', 'Performance'],
    ['portfolio-accounts', 'Accounts']
  ];

  const priceNote = () => (isSample() ? 'Sample holdings and prices. Not live quotes.' : 'Prices come from your data, not live quotes.');

  function renderPortfolio() {
    const hs = holdingsInView();
    const total = sumOf(hs.map((h) => h.value));

    const keyFn = {
      type: (h) => h.type,
      account: (h) => D.accounts[h.account].name,
      member: (h) => ownerLabel(h.owner)
    }[groupBy];

    const groups = {};
    hs.forEach((h) => { const k = keyFn(h); groups[k] = (groups[k] || 0) + h.value; });
    const rows = Object.keys(groups)
      .map((k) => ({ label: k, value: groups[k], text: `${money.format(groups[k])} · ${pctText(pctOf(groups[k], total), 0)}` }))
      .sort((a, b) => b.value - a.value);

    const titleBy = { type: 'type', account: 'account', member: 'member' }[groupBy];

    return `
      ${pageTop(subnav(PORTFOLIO_LINKS, 'portfolio'))}
      <div class="stack">
        <section class="card wide" aria-labelledby="pv-title">
          <h2 id="pv-title" class="card-label">Portfolio value</h2>
          <p class="big">${money.format(total)}</p>
          <p class="muted">${hs.length} holdings across ${new Set(hs.map((h) => h.account)).size} ${new Set(hs.map((h) => h.account)).size === 1 ? 'account' : 'accounts'}. ${esc(priceNote())}</p>
        </section>
        ${card('comp-title', `Composition by ${titleBy}`,
          toggles('group', groupBy, [['type', 'By type'], ['account', 'By account'], ['member', 'By member']], 'Group composition by')
          + bars(rows, `Portfolio value by ${titleBy}`), 'wide')}
      </div>`;
  }

  // ---- Portfolio: accounts, holdings, activity, closed positions ------------------------

  const CLASS_LABEL = { personal: 'Personal', pretax: 'Retirement · Traditional IRA (pre-tax)', posttax: 'Retirement · Roth IRA (post-tax)', k401: 'Retirement · 401k' };
  const clsLabel = (c) => CLASS_LABEL[c] || 'Personal';
  const clsType = (c) => (c && c !== 'personal' ? 'Retirement' : 'Personal');
  const clsKind = (c) => ({ pretax: 'Traditional IRA (pre-tax)', posttax: 'Roth IRA (post-tax)', k401: '401k' }[c] || '—');
  const BROKERS = ['Fidelity', 'Vanguard', 'Charles Schwab', 'E*TRADE', 'Merrill', 'Robinhood', 'Interactive Brokers', 'T. Rowe Price', 'Empower', 'Principal'];

  let holdSort = { key: 'value', dir: 'desc' };
  let holdGroup = 'none';
  let groupsPanel = false;
  let groupsDraft = null;
  let holdNote = '';
  let closedYear = null;
  let acctPanel = false;
  let acctDraft = null;
  let acctEditing = null;
  let acctConfirm = null;
  let acctError = '';
  let acctNote = '';
  let lotTrigger = '';

  function ledgerNow() {
    const accts = {};
    Object.keys(D.accounts).forEach((k) => { accts[k] = { cls: D.accounts[k].cls || 'personal' }; });
    return KanopiPortfolio.ledger({ accounts: accts, holdings: D.holdings, transactions: D.transactions, today: startOfToday() });
  }

  // One row per ticker. Cost is unknown (null) when any of its lots has no cost on file.
  function buildPositions(hs, lots) {
    const byT = {};
    hs.forEach((h) => {
      const p = byT[h.ticker] || (byT[h.ticker] = { ticker: h.ticker, name: h.name, type: h.type, shares: 0, value: 0, accounts: [], byOwner: {} });
      p.shares += h.shares; p.value += h.value;
      if (p.accounts.indexOf(h.account) === -1) p.accounts.push(h.account);
      p.byOwner[h.owner] = (p.byOwner[h.owner] || 0) + h.value;
    });
    return Object.keys(byT).map((t) => {
      const p = byT[t];
      p.cash = p.ticker === 'CASH' || p.type === 'Cash';
      const mine = lots.filter((l) => l.ticker === t && p.accounts.indexOf(l.account) !== -1);
      p.cost = p.cash || !mine.length || mine.some((l) => l.cost == null) ? null : round2(sumOf(mine.map((l) => l.cost)));
      p.price = p.shares ? p.value / p.shares : 0;
      p.avg = p.cost == null || !p.shares ? null : p.cost / p.shares;
      p.gain = p.cost == null ? null : p.value - p.cost;
      p.gainPct = p.cost ? (p.gain / p.cost) * 100 : null;
      return p;
    });
  }

  const GROUP_OPTIONS = [['none', 'No grouping'], ['asset', 'Asset type'], ['acct', 'Account type'], ['member', 'Family member'], ['custom', 'My groups']];
  function groupKeyOf(h) {
    if (holdGroup === 'asset') return h.type || 'Other';
    if (holdGroup === 'acct') return clsLabel(D.accounts[h.account].cls);
    if (holdGroup === 'member') return ownerLabel(h.owner);
    if (holdGroup === 'custom') return (D.tgroups || {})[h.ticker] || 'Ungrouped';
    return '';
  }

  const gainText = (gain, pct) => (gain == null ? '—' : `${signedMoney(gain)}${pct == null ? '' : ` (${signedPctText(pct)})`}`);

  const SORT_VALUE = {
    ticker: (p) => p.ticker, shares: (p) => (p.cash ? null : p.shares), price: (p) => (p.cash ? null : p.price),
    avg: (p) => p.avg, cost: (p) => p.cost, value: (p) => p.value, gain: (p) => p.gain, share: (p) => p.value, my: (p) => p.value
  };
  function sortList(list, valueOf) {
    const dir = holdSort.dir === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
      const x = valueOf(a); const y = valueOf(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === 'string') return x.localeCompare(y) * dir;
      return (x - y) * dir;
    });
  }

  function splitBar(byOwner, total) {
    const ids = Object.keys(byOwner).filter((o) => byOwner[o] > 0);
    const color = (o) => (o === 'shared' ? PIE_OTHER : (MEMBERS[o] ? MEMBERS[o].color : PIE_OTHER));
    const label = ids.map((o) => `${ownerLabel(o)} ${pctText(pctOf(byOwner[o], total), 0)}`).join(', ');
    return `<span class="split" role="img" aria-label="${esc(label)}" title="${esc(label)}">${ids.map((o) =>
      `<span style="flex:${byOwner[o]} 1 0;background:${color(o)}"></span>`).join('')}</span>`;
  }

  function accountsText(p) {
    const names = p.accounts.map((a) => D.accounts[a].name);
    return names.length > 1 ? `${names[0]} +${names.length - 1}` : (names[0] || '');
  }

  // Group names in the order you chose; groups not yet placed come last, A to Z.
  function groupNames() {
    const live = Array.from(new Set(Object.keys(D.tgroups || {}).map((k) => D.tgroups[k])));
    const placed = (D.gorder || []).filter((n) => live.indexOf(n) !== -1);
    return placed.concat(live.filter((n) => placed.indexOf(n) === -1).sort());
  }

  function saveGroupOrder(names) {
    if (isSample()) { SAMPLE.gorder = names; D.gorder = names; }
    else { writeRecords([{ id: 'gorder', kind: 'gorder', updatedAt: Date.now(), names }]); refreshData(); }
  }

  function moveGroup(name, delta) {
    const names = groupNames();
    const i = names.indexOf(name);
    const j = i + delta;
    if (i === -1 || j < 0 || j >= names.length) return;
    names.splice(j, 0, names.splice(i, 1)[0]);
    saveGroupOrder(names);
  }

  function renderHoldings() {
    const hs = holdingsInView();
    const L = ledgerNow();
    const lots = L.lots.filter((l) => D.accounts[l.account] && inView(D.accounts[l.account].owner));
    const total = sumOf(hs.map((h) => h.value));
    const together = who === 'together';

    const groups = {};
    hs.forEach((h) => { const k = groupKeyOf(h); (groups[k] = groups[k] || []).push(h); });
    const built = Object.keys(groups).map((k) => {
      const ps = sortList(buildPositions(groups[k], lots), SORT_VALUE[holdSort.key] || SORT_VALUE.value);
      const known = ps.filter((p) => p.cost != null);
      return {
        label: k, ps, value: sumOf(ps.map((p) => p.value)),
        cost: known.length ? round2(sumOf(known.map((p) => p.cost))) : null,
        gain: known.length ? sumOf(known.map((p) => p.gain)) : null
      };
    });
    const groupKey = { ticker: (g) => g.label, cost: (g) => g.cost, gain: (g) => g.gain }[holdSort.key] || ((g) => g.value);
    const mine = holdGroup === 'custom' && holdSort.key === 'my';
    const names = groupNames();
    const rank = (g) => (names.indexOf(g.label) === -1 ? 999 : names.indexOf(g.label));
    const ordered = holdGroup === 'none' ? built
      : (mine ? built.slice().sort((x, y) => rank(x) - rank(y)) : sortList(built, groupKey))
        .sort((x, y) => (x.label === 'Ungrouped') - (y.label === 'Ungrouped'));

    const arrow = (k) => (holdSort.key === k ? (holdSort.dir === 'asc' ? ' ▲' : ' ▼') : '');
    const th = (k, text, num) => ({
      t: text, num, aria: holdSort.key === k ? (holdSort.dir === 'asc' ? 'ascending' : 'descending') : 'none',
      html: `<button type="button" class="sort-btn" data-hold-sort="${k}">${esc(text)}<span aria-hidden="true">${arrow(k)}</span></button>`
    });
    const head = [th('ticker', 'Holding'), { t: together ? 'Split' : 'Account' }, th('shares', 'Shares', true), th('price', 'Price', true),
      th('avg', 'Avg cost', true), th('cost', 'Total cost', true), th('value', 'Value', true), th('gain', 'Gain / loss', true), th('share', 'Share', true)];

    const posRow = (p) => [
      p.cash ? `<strong>${esc(p.ticker)}</strong><span class="cell-sub">${esc(p.name)}</span>`
        : `<button type="button" class="text-link link-btn tick-btn" data-open-lots="${esc(p.ticker)}" aria-haspopup="dialog"><strong>${esc(p.ticker)}</strong></button><span class="cell-sub">${esc(p.name)}</span>`,
      together ? splitBar(p.byOwner, p.value) : esc(accountsText(p)),
      p.cash ? '—' : p.shares.toLocaleString('en-US'),
      p.cash ? '—' : money2.format(p.price),
      p.avg == null ? '—' : money2.format(p.avg),
      p.cost == null ? '—' : money.format(p.cost),
      money.format(p.value),
      gainText(p.gain, p.gainPct),
      pctText(pctOf(p.value, total), 1)
    ];

    const rows = [];
    ordered.forEach((g) => {
      if (holdGroup !== 'none') {
        rows.push({
          cls: 'grp', strong: true,
          cells: [`${esc(g.label)}<span class="cell-sub">${g.ps.length} ${g.ps.length === 1 ? 'position' : 'positions'}</span>`, '', '', '', '',
            g.cost == null ? '—' : money.format(g.cost), money.format(g.value),
            gainText(g.gain, g.cost ? (g.gain / g.cost) * 100 : null), pctText(pctOf(g.value, total), 1)]
        });
      }
      g.ps.forEach((p) => rows.push(posRow(p)));
    });
    const allPs = buildPositions(hs, lots).filter((p) => p.cost != null);
    const allCost = allPs.length ? round2(sumOf(allPs.map((p) => p.cost))) : null;
    const allGain = allPs.length ? sumOf(allPs.map((p) => p.gain)) : null;
    rows.push({ strong: true, cells: ['Total', '', '', '', '', allCost == null ? '—' : money.format(allCost), money.format(total), gainText(allGain, allCost ? (allGain / allCost) * 100 : null), '100%'] });

    const splitKey = together
      ? `<p class="muted split-key">Split: ${Array.from(new Set(hs.map((h) => h.owner))).map((o) => `<span class="split-dot" style="background:${o === 'shared' ? PIE_OTHER : (MEMBERS[o] ? MEMBERS[o].color : PIE_OTHER)}"></span>${esc(ownerLabel(o))}`).join(' ')}</p>`
      : '';

    const tickers = Array.from(new Set(hs.filter((h) => h.ticker !== 'CASH' && h.type !== 'Cash').map((h) => h.ticker))).sort();
    const groupsForm = groupsPanel ? `
      <form class="member-form data-panel" data-groups-form novalidate>
        <h3 class="sub-label">My groups</h3>
        <p class="muted">Type a group name for each holding, such as Core or Growth. Leave it empty for no group. Positions in the same group are added up.</p>
        <datalist id="group-names">${names.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
        ${names.length ? `<h4 class="sub-label">Order of groups</h4>
          <ol class="plain-list order-list">${groupNames().map((n, i, all) => `
            <li class="member-row"><span class="pay-main"><span class="pay-name">${esc(n)}</span></span>
              <button type="button" class="btn" data-group-move="${esc(n)}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(n)} up">Move up</button>
              <button type="button" class="btn" data-group-move="${esc(n)}" data-dir="1" ${i === all.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(n)} down">Move down</button></li>`).join('')}</ol>
          <p class="muted">The order shows when My order is selected. Clicking a column heading sorts instead.</p>` : ''}
        ${tickers.map((t, i) => `<div class="field"><label for="grp-${i}">${esc(t)}</label>
          <input id="grp-${i}" type="text" maxlength="30" list="group-names" autocomplete="off" data-group-input="${esc(t)}" value="${esc((groupsDraft && groupsDraft[t] !== undefined) ? groupsDraft[t] : ((D.tgroups || {})[t] || ''))}"></div>`).join('')}
        ${sampleNote()}
        <div class="btn-row"><button type="submit" class="btn btn-primary">Save groups</button><button type="button" class="btn" data-groups-cancel>Cancel</button></div>
      </form>` : '';

    return `
      ${pageTop(subnav(PORTFOLIO_LINKS, 'portfolio-holdings'))}
      <div class="stack">
        ${card('hold-title', 'Holdings', `
          <div class="filters hold-controls">
            <div class="field"><label for="hold-group">Group by</label>
              <select id="hold-group" data-hold-group>${GROUP_OPTIONS.map(([v, l]) => `<option value="${v}"${v === holdGroup ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
            ${holdGroup === 'custom' ? `<div class="btn-row"><button type="button" class="seg plain" data-hold-sort="my" aria-pressed="${holdSort.key === 'my'}">My order</button></div>` : ''}
            <div class="btn-row"><button type="button" class="btn" data-open-groups aria-expanded="${groupsPanel}">Edit my groups</button></div>
          </div>
          ${holdNote ? `<p class="tool-note" role="status">${esc(holdNote)}</p>` : ''}
          ${groupsForm}
          ${table('Holdings in view', head, rows)}
          ${splitKey}
          <p class="muted">Select a holding to see its lots. Cash, and any holding without a known cost, is left out of cost and gain totals. ${esc(priceNote())}</p>
          ${L.problems.length ? `<ul class="plain-list">${L.problems.map((p) => `<li class="muted">${esc(p)}</li>`).join('')}</ul>` : ''}`, 'wide')}
      </div>`;
  }

  function saveGroups(values) {
    const cur = D.tgroups || {};
    const changes = [];
    Object.keys(values).forEach((t) => {
      const v = values[t].trim().replace(/\s+/g, ' ').slice(0, 30);
      if (v !== (cur[t] || '')) changes.push([t, v]);
    });
    if (!changes.length) { holdNote = 'No changes.'; return; }
    if (isSample()) {
      if (!SAMPLE.tgroups) SAMPLE.tgroups = {};
      changes.forEach(([t, v]) => { if (v) SAMPLE.tgroups[t] = v; else delete SAMPLE.tgroups[t]; });
      D.tgroups = SAMPLE.tgroups;
    } else {
      const now = Date.now();
      writeRecords(changes.map(([t, v]) => ({ id: `tg-${t.toLowerCase().replace(/[^a-z0-9]/g, '')}`, kind: 'tgroup', updatedAt: now, ticker: t, group: v, deleted: v ? undefined : true })));
      refreshData();
    }
    holdGroup = 'custom';
    holdNote = `Saved ${changes.length} group ${changes.length === 1 ? 'change' : 'changes'}.`;
  }

  // ---- Lots popup

  const termPill = (term) => (term === 'long' ? '<span class="pill pill-long" title="Held more than 1 year">Long-term</span>'
    : term === 'short' ? '<span class="pill pill-short" title="Held 1 year or less">Short-term</span>' : '<span class="muted">—</span>');
  const washBadge = '<span class="wash" title="Wash sale: a loss on a recent sale was added to this lot\'s cost" aria-label="Wash sale">W</span>';

  function lotsDialog(ticker) {
    const hs = holdingsInView().filter((h) => h.ticker === ticker);
    if (!hs.length) return '';
    const L = ledgerNow();
    const lots = L.lots.filter((l) => l.ticker === ticker && D.accounts[l.account] && inView(D.accounts[l.account].owner));
    const pos = buildPositions(hs, lots)[0];
    let anyWash = false;
    const sections = hs.slice().sort((a, b) => b.value - a.value).map((h) => {
      const acct = D.accounts[h.account];
      const mine = lots.filter((l) => l.account === h.account).sort((a, b) => (b.acquired ? b.acquired.getTime() : -1) - (a.acquired ? a.acquired.getTime() : -1));
      const known = mine.filter((l) => l.cost != null);
      const cost = mine.length && known.length === mine.length ? sumOf(mine.map((l) => l.cost)) : null;
      const gain = cost == null ? null : h.value - cost;
      const rows = mine.map((l) => {
        const value = l.qty * h.price;
        const g = l.cost == null ? null : value - l.cost;
        if (l.wash) anyWash = true;
        return [
          l.acquired ? esc(formatDate(l.acquired)) : 'Unknown',
          l.qty.toLocaleString('en-US', { maximumFractionDigits: 4 }),
          l.cost == null ? '—' : money2.format(l.cost / l.qty),
          l.cost == null ? '—' : money2.format(l.cost),
          money2.format(value),
          g == null ? '—' : `${signedMoney(g)}${l.cost ? ` (${signedPctText((g / l.cost) * 100)})` : ''}`,
          termPill(l.term) + (l.wash ? ` ${washBadge}` : '')
        ];
      });
      const detail = acct.last4 ? ` ····${acct.last4}` : '';
      return `
        <details class="lot-acc" open>
          <summary><span>${esc(acct.name)}</span><span class="muted">${esc(clsLabel(acct.cls))}${acct.broker ? ` · ${esc(acct.broker)}${esc(detail)}` : ''} · ${h.shares.toLocaleString('en-US')} shares · ${esc(gain == null ? 'gain unknown' : signedMoney(gain))}</span></summary>
          <div class="lot-scroll${rows.length > 15 ? ' scroll' : ''}"${rows.length > 15 ? ' tabindex="0" role="region" aria-label="Lots, scrollable"' : ''}>
            ${table(`Lots of ${ticker} in ${acct.name}`, [{ t: 'Acquired' }, { t: 'Shares', num: true }, { t: 'Cost / share', num: true }, { t: 'Cost', num: true }, { t: 'Value', num: true }, { t: 'Gain / loss', num: true }, { t: 'Term' }], rows)}
          </div>
        </details>`;
    }).join('');
    return `
      <div class="dlg-body">
        <div class="dlg-head">
          <div><h2 id="lot-title" class="dlg-title">${esc(ticker)}</h2><p class="muted">${esc(pos.name)}</p></div>
          <button type="button" class="btn" data-close-lots>Close</button>
        </div>
        <p class="row"><span>Shares · price</span><span>${pos.shares.toLocaleString('en-US')} · ${money2.format(pos.price)}</span></p>
        <p class="row"><span>Average cost · total cost</span><span>${pos.avg == null ? '—' : money2.format(pos.avg)} · ${pos.cost == null ? '—' : money.format(pos.cost)}</span></p>
        <p class="row"><span>Value · gain / loss</span><span>${money.format(pos.value)} · ${esc(gainText(pos.gain, pos.gainPct))}</span></p>
        ${sections}
        <p class="muted">Short-term means held 1 year or less. Long-term means held more than 1 year. Newest lots first.</p>
        ${anyWash ? `<p class="muted">${washBadge} Wash sale: you sold this holding at a loss within 30 days of buying it. The loss is added to this lot's cost, and its holding period carries over.</p>` : ''}
      </div>`;
  }

  // ---- Activity (trades, dividends, contributions)

  function renderActivity() {
    const txs = D.transactions
      .filter((t) => inView(D.accounts[t.account].owner))
      .map((t) => ({ ...t, date: dateFromDaysAgo(t.daysAgo) }))
      .sort((a, b) => b.date - a.date);

    const rows = txs.map((t) => {
      const detail = t.qty ? `${t.type} ${t.qty} ${t.ticker}` : (t.ticker ? `${t.type} · ${t.ticker}` : t.type);
      return [
        esc(formatDate(t.date)),
        `<span class="pill">${esc(t.type)}</span>`,
        esc(detail),
        esc(D.accounts[t.account].name),
        money.format(t.amount)
      ];
    });

    return `
      ${pageTop(subnav(PORTFOLIO_LINKS, 'portfolio-activity'))}
      <div class="stack">
        ${card('tx-title', 'Recent activity',
          (rows.length
            ? table('Recent activity', [{ t: 'Date' }, { t: 'Type' }, { t: 'Detail' }, { t: 'Account' }, { t: 'Amount', num: true }], rows)
            : '<p class="muted">No activity in this view.</p>')
          + '<p class="muted">Trades, dividends and contributions in your investment accounts. Spending is under Budget.</p>', 'wide')}
      </div>`;
  }

  // ---- Closed positions (Performance)

  function closedCard() {
    const L = ledgerNow();
    const inV = (a) => !!(D.accounts[a] && inView(D.accounts[a].owner));
    const thisYear = startOfToday().getFullYear();
    const years = Array.from(new Set(L.closed.filter((c) => inV(c.account)).map((c) => c.date.getFullYear()).concat(thisYear))).sort((a, b) => b - a);
    const yr = years.indexOf(closedYear) !== -1 ? closedYear : thisYear;
    const S = KanopiPortfolio.yearSummary(L.closed, yr, inV);
    const sumRows = [
      ['Short-term (1 year or less)', money.format(S.short.proceeds), money.format(S.short.basis), signedMoney(S.short.gain)],
      ['Long-term (over 1 year)', money.format(S.long.proceeds), money.format(S.long.basis), signedMoney(S.long.gain)],
      { strong: true, cells: ['Total', money.format(S.total.proceeds), money.format(S.total.basis), signedMoney(S.total.gain)] }
    ];
    const detail = S.rows.map((c) => {
      const acct = D.accounts[c.account];
      const gain = c.allowed == null ? '—' : `${signedMoney(c.allowed)}${c.wash ? `<span class="cell-sub">${money.format(c.disallowed)} disallowed${c.permanent ? ', lost for good' : ', added to the new lot'}</span>` : ''}`;
      return [
        esc(formatDate(c.date)), `<strong>${esc(c.ticker)}</strong>`, esc(acct.name),
        c.qty.toLocaleString('en-US', { maximumFractionDigits: 4 }), money.format(c.proceeds), c.basis == null ? '—' : money.format(c.basis), gain,
        termPill(c.term) + (c.wash ? ` ${washBadge}` : '')
      ];
    });
    return card('closed-title', 'Closed positions', `
      ${years.length > 1 ? toggles('cyear', String(yr), years.map((y) => [String(y), String(y)]), 'Year') : ''}
      <p class="muted">Gains and losses on shares sold in ${yr}. Oldest shares are sold first.</p>
      ${table('Closed positions by term', [{ t: 'Term' }, { t: 'Proceeds', num: true }, { t: 'Cost', num: true }, { t: 'Gain / loss', num: true }], sumRows)}
      ${S.disallowed > 0 ? `<p class="muted">${washBadge} Not counted above: ${money.format(S.disallowed)} of losses disallowed by wash sales.</p>` : ''}
      ${S.unknown > 0 ? `<p class="muted">${S.unknown} ${S.unknown === 1 ? 'sale has' : 'sales have'} no cost on file and ${S.unknown === 1 ? 'is' : 'are'} left out.</p>` : ''}
      ${detail.length ? `<h3 class="sub-label">Sales in ${yr}</h3><div class="lot-scroll${detail.length > 15 ? ' scroll' : ''}"${detail.length > 15 ? ' tabindex="0" role="region" aria-label="Sales, scrollable"' : ''}>${table(`Sales in ${yr}`, [{ t: 'Sold' }, { t: 'Holding' }, { t: 'Account' }, { t: 'Shares', num: true }, { t: 'Proceeds', num: true }, { t: 'Cost', num: true }, { t: 'Gain / loss', num: true }, { t: 'Term' }], detail)}</div>` : `<p class="muted">No sales in ${yr}.</p>`}
      <p class="muted">Includes sales inside retirement accounts, which are not taxed there. Wash sales are checked only for losses in personal accounts, but a buy in any account of the household counts as the repurchase.</p>`, 'wide');
  }

  function renderPerformance() {
    if (!D.perf.portfolio[who]) {
      return `
        ${pageTop(subnav(PORTFOLIO_LINKS, 'portfolio-performance'))}
        <div class="stack">
          ${card('perf-title', 'Returns', '<p class="muted">No holdings yet, so there are no returns to show.</p>', 'wide')}
          ${closedCard()}
        </div>`;
    }
    const idx = D.periods.indexOf(period);
    const mine = D.perf.portfolio[who][idx];
    const entries = [{ label: who === 'together' ? 'Portfolio' : `${MEMBERS[who].label}'s portfolio`, value: mine, muted: false }]
      .concat(Object.keys(D.perf.benchmarks).map((k) => ({ label: k, value: D.perf.benchmarks[k][idx], muted: true })));

    const top = Math.max.apply(null, entries.map((e) => Math.abs(e.value))) || 1;
    const rows = entries.map((e) => ({
      label: e.label, value: Math.max(0, e.value), muted: e.muted, text: pctText(e.value, 1)
    }));

    const spy = D.perf.benchmarks.SPY[idx];
    const gap = mine - spy;
    const annual = idx >= 4 ? ' per year' : '';

    const head = [{ t: 'Return' }].concat(D.periods.map((p) => ({ t: p, num: true })));
    const tableRows = [{ cells: [esc(entries[0].label)].concat(D.perf.portfolio[who].map((v) => pctText(v, 1))), strong: true }]
      .concat(Object.keys(D.perf.benchmarks).map((k) => [esc(k)].concat(D.perf.benchmarks[k].map((v) => pctText(v, 1)))));

    return `
      ${pageTop(subnav(PORTFOLIO_LINKS, 'portfolio-performance'))}
      <div class="stack">
        ${card('perf-title', `Return over ${period}`,
          toggles('period', period, D.periods.map((p) => [p, p]), 'Time period')
          + bars(rows, `Return over ${period}`, { max: top })
          + `<p class="muted">Compared with SPY over ${esc(period)}: ${signed(gap)}${Math.abs(gap).toFixed(1)} percentage points${annual}.</p>`, 'wide')}
        ${card('perf-table-title', 'All periods',
          table('Returns by period', head, tableRows)
          + `<p class="muted">3Y and 5Y are annualized. ${isSample() ? 'Sample numbers. ' : 'Index returns are sample numbers. '}SPY, QQQ and DIA stand in for the market indexes. The history source is still to be chosen.</p>`, 'wide')}
        ${closedCard()}
      </div>`;
  }

  // ---- Accounts (Portfolio > Accounts)

  function acctActions(id) {
    if (acctConfirm === id) {
      return `<span class="row-actions"><span class="pay-meta">Delete?</span>
        <button type="button" class="btn" data-acct-keep>Cancel</button>
        <button type="button" class="btn btn-danger" data-acct-delete-confirm="${esc(id)}">Delete</button></span>`;
    }
    const a = D.accounts[id];
    return `<span class="row-actions">
      <button type="button" class="btn" data-acct-edit="${esc(id)}" aria-label="Edit ${esc(a.name)}">Edit</button>
      <button type="button" class="btn" data-acct-delete="${esc(id)}" aria-label="Delete ${esc(a.name)}">Delete</button></span>`;
  }

  const acctInUse = (id) => D.holdings.some((h) => h.account === id) || D.transactions.some((t) => t.account === id);

  function renderAccounts() {
    const ids = Object.keys(D.accounts).filter((id) => inView(D.accounts[id].owner));
    const rows = ids.map((id) => {
      const a = D.accounts[id];
      return [esc(a.name), esc(ownerLabel(a.owner)), esc(clsType(a.cls)), esc(clsKind(a.cls)), esc(a.broker || '—'), a.last4 ? `•••• ${esc(a.last4)}` : '—', acctActions(id)];
    });
    return `
      ${pageTop(subnav(PORTFOLIO_LINKS, 'portfolio-accounts'))}
      <div class="btn-row tool-row"><button type="button" class="btn btn-primary" data-open-acct aria-expanded="${acctPanel}">Add an account</button></div>
      ${acctNote ? `<p class="tool-note" role="status">${esc(acctNote)}</p>` : ''}
      <div class="stack">
        ${acctPanel ? card('acct-form-title', acctEditing ? 'Edit account' : 'Add an account', acctForm(), 'wide') : ''}
        ${card('acct-title', 'Accounts',
          (rows.length ? table('Investment accounts', [{ t: 'Account' }, { t: 'Owner' }, { t: 'Type' }, { t: 'Retirement kind' }, { t: 'Broker' }, { t: 'Number' }, { t: 'Actions' }], rows) : '<p class="muted">No accounts yet. Use Add an account.</p>')
          + '<p class="muted">Kanopi keeps only the last 4 digits of an account number. The type decides how gains are treated: wash sales are checked for losses in personal accounts only.</p>', 'wide')}
      </div>`;
  }

  function openAcct(id) {
    resetBudgetTools(); groupsPanel = false;
    acctPanel = true; acctError = ''; acctEditing = id || null;
    const a = id ? D.accounts[id] : null;
    acctDraft = a
      ? { name: a.name, owner: a.owner, type: clsType(a.cls).toLowerCase(), kind: a.cls && a.cls !== 'personal' ? a.cls : 'pretax', broker: a.broker || '', last4: a.last4 || '' }
      : { name: '', owner: who !== 'together' ? who : (memberList[0] ? memberList[0].id : 'shared'), type: 'personal', kind: 'pretax', broker: '', last4: '' };
  }

  function acctForm() {
    const d = acctDraft;
    const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
    const owners = ownersInView();
    const ownerList = owners.indexOf(d.owner) === -1 ? owners.concat(d.owner) : owners;
    return `
      <form class="member-form" data-acct-form novalidate>
        <div class="field"><label for="acct-name">Account name</label>
          <input id="acct-name" type="text" maxlength="40" autocomplete="off" data-acct="name" value="${esc(d.name)}"></div>
        <div class="field-row">
          <div class="field"><label for="acct-owner">Owner</label>
            <select id="acct-owner" data-acct="owner">${ownerList.map((o) => opt(o, ownerLabel(o), d.owner)).join('')}</select></div>
          <div class="field"><label for="acct-type">Type</label>
            <select id="acct-type" data-acct="type">${opt('personal', 'Personal', d.type)}${opt('retirement', 'Retirement', d.type)}</select></div>
        </div>
        ${d.type === 'retirement' ? `<div class="field"><label for="acct-kind">Retirement kind</label>
          <select id="acct-kind" data-acct="kind">${opt('pretax', 'Traditional IRA (pre-tax)', d.kind)}${opt('posttax', 'Roth IRA (post-tax)', d.kind)}${opt('k401', '401k', d.kind)}</select></div>` : ''}
        <div class="field-row">
          <div class="field"><label for="acct-broker">Broker</label>
            <input id="acct-broker" type="text" maxlength="40" list="broker-list" autocomplete="off" data-acct="broker" value="${esc(d.broker)}">
            <datalist id="broker-list">${BROKERS.map((b) => `<option value="${esc(b)}"></option>`).join('')}</datalist></div>
          <div class="field"><label for="acct-last4">Last 4 digits</label>
            <input id="acct-last4" type="text" inputmode="numeric" maxlength="4" pattern="[0-9]*" autocomplete="off" data-acct="last4" value="${esc(d.last4)}"></div>
        </div>
        <p class="muted">Enter only the last 4 digits. Kanopi never stores a full account number.</p>
        ${acctError ? `<p class="form-error" role="alert">${esc(acctError)}</p>` : ''}
        ${sampleNote()}
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">${acctEditing ? 'Save account' : 'Add account'}</button>
          <button type="button" class="btn" data-acct-cancel>Cancel</button>
        </div>
      </form>`;
  }

  function saveAcct() {
    const d = acctDraft;
    const name = d.name.trim().replace(/\s+/g, ' ');
    const last4 = d.last4.trim();
    let err = '';
    if (!name) err = 'Enter an account name.';
    else if (last4 && !/^\d{4}$/.test(last4)) err = 'The last 4 digits must be exactly 4 numbers, or leave it empty.';
    if (err) { acctError = err; return false; }
    const item = { name, owner: d.owner, cls: d.type === 'retirement' ? d.kind : 'personal', broker: d.broker.trim().slice(0, 40), last4 };
    if (isSample()) {
      const id = acctEditing || newId('a');
      D.accounts[id] = { ...(D.accounts[id] || {}), ...item };
    } else {
      const id = acctEditing || newId('a');
      const old = records.find((r) => r.id === id) || {};
      writeRecords([{ id, kind: 'account', updatedAt: Date.now(), name: item.name, owner: item.owner, acctType: old.acctType || '', balance: old.balance || 0, acctClass: item.cls, broker: item.broker, last4: item.last4 }]);
      refreshData();
    }
    acctNote = acctEditing ? 'Account saved.' : 'Account added.';
    return true;
  }

  function deleteAcct(id) {
    if (acctInUse(id)) { acctNote = 'That account has holdings or activity, so it can not be deleted.'; return; }
    if (isSample()) delete D.accounts[id];
    else { writeRecords([{ id, kind: 'account', updatedAt: Date.now(), deleted: true }]); refreshData(); }
    acctNote = 'Account deleted.';
  }

  // ---- Taxes -------------------------------------------------------------

  function renderTaxes() {
    if (!isSample()) {
      return `
        ${pageTop()}
        <div class="stack">
          ${card('tax-empty-title', 'Taxes', '<p class="muted">Nothing here yet. Income, gains and losses, taxes paid, and estimated payments are not part of your data yet. They come in a later build.</p>', 'wide')}
        </div>`;
    }
    const together = who === 'together';
    const year = startOfToday().getFullYear();

    // Income
    const incHead = together
      ? [{ t: 'Year' }].concat(memberList.map((m) => ({ t: m.label, num: true })))
          .concat(memberList.length > 1 ? [{ t: 'Combined', num: true }] : [])
      : [{ t: 'Year' }, { t: `${MEMBERS[who].label}'s W-2 income`, num: true }];
    const incRows = D.income.map((r) => together
      ? [esc(r.year)].concat(memberList.map((m) => money.format(r[m.id] || 0)))
          .concat(memberList.length > 1 ? [money.format(sumOf(memberList.map((m) => r[m.id] || 0)))] : [])
      : [esc(r.year), money.format(r[who] || 0)]);

    // Taxes paid and CPA fees (joint filing, so shared items)
    const paidRows = D.income.map((r) => [
      esc(r.year), money.format(r.federal), money.format(r.state), money.format(r.federal + r.state),
      r.cpa === null ? '—' : money.format(r.cpa)
    ]);

    // Gains and losses this year
    const sales = D.sales
      .map((s) => ({ ...s, date: dateFromDaysAgo(s.daysAgo), gain: s.proceeds - s.cost }))
      .filter((s) => s.date.getFullYear() === year && inView(s.owner))
      .sort((a, b) => a.date - b.date);
    const netShort = sumOf(sales.filter((s) => s.term === 'Short').map((s) => s.gain));
    const netLong = sumOf(sales.filter((s) => s.term === 'Long').map((s) => s.gain));
    const saleRows = sales.map((s) => [
      esc(formatDate(s.date)), `<strong>${esc(s.ticker)}</strong>`, esc(`${s.term}-term`),
      money.format(s.proceeds), money.format(s.cost), signedMoney(s.gain)
    ]);

    // Estimated payments and the planned-sales forecast (shared, so Together only)
    const rates = D.planRates;
    const addFed = Math.round(sumOf(D.plannedSales.map((p) => p.gain * (p.term === 'Long' ? rates.federalLong : rates.federalShort))));
    const addState = Math.round(sumOf(D.plannedSales.map((p) => p.gain * rates.state)));
    const nextQ = D.taxPayments.find((q) => q.status === 'Upcoming');

    const payRows = D.taxPayments.map((q) => [
      esc(q.label),
      esc(formatDate(new Date(q.due[0], q.due[1] - 1, q.due[2]))),
      money.format(q.federal), money.format(q.state),
      `<span class="pill">${esc(q.status)}</span>`
    ]);

    let shared = '';
    if (together && nextQ) {
      shared = `
        ${card('paid-title', 'Taxes paid and CPA fees',
          table('Taxes paid and CPA fees by year', [{ t: 'Year' }, { t: 'Federal', num: true }, { t: 'State', num: true }, { t: 'Total tax', num: true }, { t: 'CPA fee', num: true }], paidRows)
          + '<p class="muted">Filing jointly. The 2026 figures are year to date and include estimated payments.</p>', 'wide')}
        ${card('est-title', 'Estimated payments',
          table('Quarterly estimated payments', [{ t: 'Quarter' }, { t: 'Due' }, { t: 'Federal', num: true }, { t: 'State', num: true }, { t: 'Status' }], payRows), 'wide')}
        ${card('plan-title', 'Forecast with planned sales',
          `<ul class="plain-list">${D.plannedSales.map((p) => `<li><span>${esc(p.name)}</span><span>${esc(p.term)}-term gain ${money.format(p.gain)}</span></li>`).join('')}</ul>`
          + table('Next payment with planned sales', [{ t: nextQ ? nextQ.label : 'Next payment' }, { t: 'Federal', num: true }, { t: 'State', num: true }], [
              ['Base estimate', money.format(nextQ.federal), money.format(nextQ.state)],
              ['Added by planned sales', `+${money.format(addFed)}`, `+${money.format(addState)}`],
              { cells: ['Forecast', money.format(nextQ.federal + addFed), money.format(nextQ.state + addState)], strong: true }
            ])
          + `<p class="muted">Placeholder rates: ${pctText(rates.federalLong * 100, 0)} federal on long-term gains, ${pctText(rates.federalShort * 100, 0)} on short-term, ${pctText(rates.state * 100, 0)} state. ${isSample() ? 'Sample numbers, not tax advice.' : 'Not tax advice.'}</p>`, 'wide')}`;
    } else if (!together) {
      shared = '<p class="muted scope-note">Tax payments, CPA fees and the payment forecast are joint, so they appear in Together.</p>';
    }

    return `
      ${pageTop()}
      <div class="stack">
        ${card('inc-title', 'W-2 income', table('W-2 income by year', incHead, incRows), 'wide')}
        ${card('gain-title', `Gains and losses, ${year}`,
          saleRows.length
            ? table('Realized gains and losses this year', [{ t: 'Sold' }, { t: 'Holding' }, { t: 'Term' }, { t: 'Proceeds', num: true }, { t: 'Cost', num: true }, { t: 'Gain or loss', num: true }], saleRows)
              + `<p class="row sum-row"><span>Net short-term</span><span>${signedMoney(netShort)}</span></p>
                 <p class="row sum-row"><span>Net long-term</span><span>${signedMoney(netLong)}</span></p>`
            : '<p class="muted">No sales this year in this view.</p>', 'wide')}
        ${shared}
      </div>`;
  }

  // ---- Budget ------------------------------------------------------------

  const BUDGET_LINKS = [['budget', 'Overview'], ['budget-transactions', 'Transactions'], ['budget-planner', 'Planner'], ['budget-stores', 'Stores']];

  const sumOwners = (obj) => sumOf(ownersInView().map((o) => obj[o] || 0));

  function comparison(block) {
    const now = sumOwners(block.thisYear);
    const before = sumOwners(block.lastYear);
    const change = before ? ((now - before) / before) * 100 : 0;
    return {
      rows: [
        { label: block.thisLabel, value: now, text: money.format(now) },
        { label: block.lastLabel, value: before, text: money.format(before), muted: true }
      ],
      max: Math.max(now, before) || 1,
      note: before ? `${signedPctText(change)} compared with ${block.lastLabel}` : `No spending recorded for ${block.lastLabel} to compare with.`
    };
  }

  let historyView = 'quarters'; // 'quarters' or 'yoy'

  function renderBudget() {
    const rows = budgetRows().sort((a, b) => b.spent - a.spent);
    const totals = budgetTotals();
    const meterRows = rows.map((r) => {
      if (!r.budget) return { label: r.label, value: 0, over: false, text: `${money.format(r.spent)} · no limit set` };
      const over = r.spent > r.budget;
      return {
        label: r.label,
        value: pctOf(r.spent, r.budget),
        over,
        text: over ? `${money.format(r.spent)} of ${money.format(r.budget)} · over by ${money.format(r.spent - r.budget)}` : `${money.format(r.spent)} of ${money.format(r.budget)}`
      };
    });

    // Pie slices. A category keeps its color; categories past the eighth, and Other, share gray.
    const keys = Object.keys(D.categories).filter((k) => k !== 'other');
    let otherValue = 0;
    const slices = [];
    rows.forEach((r) => {
      const idx = keys.indexOf(r.key);
      if (idx === -1 || idx >= PIE_COLORS.length) otherValue += r.spent;
      else slices.push({ label: r.label, value: r.spent, color: PIE_COLORS[idx] });
    });
    if (otherValue > 0) slices.push({ label: 'Other', value: otherValue, color: PIE_OTHER });

    const qItems = D.quarters.map((q) => ({ label: q.label, value: sumOwners(q), text: money.format(sumOwners(q)) }));
    const m = comparison(D.yoy.month);
    const q = comparison(D.yoy.quarter);
    const history = historyView === 'yoy'
      ? `<h3 class="sub-label">Month</h3>${bars(m.rows, 'Month compared with last year', { max: m.max })}<p class="muted">${esc(m.note)}</p>`
        + `<h3 class="sub-label">Quarter</h3>${bars(q.rows, 'Quarter compared with last year', { max: q.max })}<p class="muted">${esc(q.note)}</p>`
      : columns(qItems, 'Total spending by quarter') + `<p class="muted">Calendar quarters.${isSample() ? ' Sample history.' : ''}</p>`;

    const bills = upcomingPayments().filter((p) => p.kind === 'Bill').slice(0, 5);
    const billList = bills.length
      ? `<ul class="pay-list">${bills.map(paymentRow).join('')}</ul>`
      : '<p class="muted">No upcoming bills.</p>';

    const totalOver = totals.budget > 0 && totals.spent > totals.budget;

    return `
      ${pageTop(subnav(BUDGET_LINKS, 'budget'))}
      <div class="stack">
        ${card('bud-title', 'This month by category',
          `<p class="row"><span>${esc(monthLabel())}</span><span>${money.format(totals.spent)} of ${money.format(totals.budget)}</span></p>`
          + leafMeter('Total budget spent', pctOf(totals.spent, totals.budget), totalOver)
          + (totalOver ? `<p class="over-note">Over budget by ${money.format(totals.spent - totals.budget)}</p>` : '')
          + bars(meterRows, 'Spending against budget by category', { max: 100, meter: true }), 'wide')}
        ${card('share-title', 'Where the money goes', pie(slices, 'Share of spending by category'))}
        ${card('qtr-title', 'Spending over time',
          toggles('history', historyView, [['quarters', 'Last three quarters'], ['yoy', 'Compared with last year']], 'Spending view') + history)}
        ${card('bills-title', 'Upcoming bills', billList + '<p class="muted"><a class="text-link" href="#payments">See all upcoming payments</a></p>')}
      </div>`;
  }

  // ---- Transactions ---------------------------------------------------------------------

  const TYPE_OPTIONS = [['expense', 'Expense'], ['refund', 'Refund or reimbursement'], ['income', 'Income'], ['transfer', 'Transfer or card payment']];
  const TYPE_LABEL = { expense: 'Expense', refund: 'Refund', income: 'Income', transfer: 'Transfer' };
  const NONE_CAT = '__none__'; // filter value for transactions with no category
  const ICON_PENCIL = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>';
  const ICON_TRASH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg>';
  const RANGES = [['month', 'This month'], ['30', 'Past 30 days'], ['60', 'Past 60 days'], ['90', 'Past 90 days'], ['all', 'All time']];
  const TX_CAP = 200;

  const txFilterDefault = () => ({ q: '', range: '60', type: '', cat: '', paidBy: '', owner: '' });
  let txFilter = txFilterDefault();
  const filtersActive = () => Object.keys(txFilter).some((k) => txFilter[k] !== txFilterDefault()[k]);

  const typeOf = (e) => e.type || 'expense';

  // Amount as shown in the grid: refunds carry the opposite sign of an expense.
  function txAmount(e) {
    return typeOf(e) === 'refund' ? `−${fmt(e.amount)}` : fmt(e.amount);
  }

  function filteredTransactions() {
    const today = startOfToday();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const q = txFilter.q.trim().toLowerCase();
    return D.expenses
      .map((e, i) => ({ ...e, key: e.id || `s${i}` }))
      .filter((e) => inView(e.owner))
      .map((e) => ({ ...e, date: dateFromDaysAgo(e.daysAgo) }))
      .filter((e) => {
        if (txFilter.range === 'month') { if (e.date < first) return false; }
        else if (txFilter.range !== 'all' && e.daysAgo >= Number(txFilter.range)) return false;
        if (txFilter.type && typeOf(e) !== txFilter.type) return false;
        if (txFilter.cat === NONE_CAT) { if (!hasCategory(typeOf(e)) || e.cat) return false; }
        else if (txFilter.cat && e.cat !== txFilter.cat) return false;
        if (txFilter.owner && e.owner !== txFilter.owner) return false;
        if (q && e.name.toLowerCase().indexOf(q) === -1) return false;
        return true;
      })
      .sort((a, b) => b.date - a.date);
  }

  const TX_HEAD = [
    { t: 'Date', card: 'meta' }, { t: 'Description', card: 'title' }, { t: 'Category', card: 'meta' },
    { t: 'Counts in', card: 'block' }, { t: 'Amount', num: true, card: 'amount' }, { t: 'Actions' }
  ];

  function txCells(e) {
    const typed = typeOf(e);
    const catText = hasCategory(typed) ? (e.cat && D.categories[e.cat] ? D.categories[e.cat] : 'No category') : TYPE_LABEL[typed];
    const tone = typed === 'expense' ? 'out' : (typed === 'refund' || typed === 'income') ? 'in' : '';
    const who = e.owner === 'shared'
      ? `<span class="avatar-pair" role="img" aria-label="Joint">${avatarHtml(memberList[0] ? memberList[0].id : 'together')}${memberList[1] ? avatarHtml(memberList[1].id) : ''}</span>`
      : `<span role="img" aria-label="${esc(ownerLabel(e.owner))}">${avatarHtml(e.owner)}</span>`;
    return [
      esc(formatDate(e.date)),
      esc(e.name),
      esc(catText),
      `<span class="tx-who">${who}</span>`,
      `<span class="tx-amt${tone ? ' ' + tone : ''}">${esc(txAmount(e))}</span>`,
      txActions(e)
    ];
  }

  function txResultsHtml() {
    const list = filteredTransactions();
    const spending = sumOf(list.map((e) => Store.spendOf(e)));
    const income = sumOf(list.filter((e) => typeOf(e) === 'income').map((e) => e.amount));
    const shown = list.slice(0, TX_CAP);
    const range = RANGES.find((r) => r[0] === txFilter.range);
    const summary = `<p class="muted tx-summary" role="status">${list.length} ${list.length === 1 ? 'transaction' : 'transactions'} · ${esc(range ? range[1].toLowerCase() : '')} · spending ${fmt(spending)} after refunds · income ${fmt(income)}</p>`;
    if (!list.length) return summary + '<p class="muted">Nothing matches. Clear the filters or widen the date range.</p>';
    return summary
      + table('Transactions', TX_HEAD, shown.map(txCells), true)
      + `<p class="muted">Newest first. Refunds and reimbursements are entered as their own transaction with the opposite sign. Transfers and card payments are not counted as spending.${list.length > shown.length ? ` Showing the first ${shown.length} of ${list.length}. Narrow the filters to see the rest.` : ''}</p>`;
  }

  function txFilterControls() {
    const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
    if (txFilter.owner && ownersInView().indexOf(txFilter.owner) === -1) txFilter.owner = '';
    return `
      <div class="filters" role="search" aria-label="Filter transactions">
        <div class="field filter-q"><label for="f-q">Search by name</label>
          <input id="f-q" type="text" data-txf="q" value="${esc(txFilter.q)}" autocomplete="off" placeholder="Store or description"></div>
        <div class="field"><label for="f-range">Date range</label>
          <select id="f-range" data-txf="range">${RANGES.map((r) => opt(r[0], r[1], txFilter.range)).join('')}</select></div>
        <div class="field"><label for="f-type">Type</label>
          <select id="f-type" data-txf="type">${opt('', 'All types', txFilter.type)}${TYPE_OPTIONS.map((r) => opt(r[0], r[1], txFilter.type)).join('')}</select></div>
        <div class="field"><label for="f-cat">Category</label>
          <select id="f-cat" data-txf="cat">${opt('', 'All categories', txFilter.cat)}${opt(NONE_CAT, 'No category', txFilter.cat)}${Object.keys(D.categories).map((k) => opt(k, D.categories[k], txFilter.cat)).join('')}</select></div>
        <div class="field"><label for="f-owner">Counts in</label>
          <select id="f-owner" data-txf="owner">${opt('', 'Everything', txFilter.owner)}${ownersInView().map((o) => opt(o, ownerLabel(o), txFilter.owner)).join('')}</select></div>
        <div class="field filter-clear"><button type="button" class="btn" data-tx-clear ${filtersActive() ? '' : 'disabled'}>Clear filters</button></div>
      </div>`;
  }

  function updateTxResults() {
    const box = document.getElementById('tx-results');
    if (box) box.innerHTML = txResultsHtml();
    const clear = document.querySelector('[data-tx-clear]');
    if (clear) clear.disabled = !filtersActive();
  }

  function renderTransactions() {
    return `
      ${pageTop(subnav(BUDGET_LINKS, 'budget-transactions'))}
      <div class="btn-row tool-row">
        <button type="button" class="btn btn-primary" data-open-tx aria-expanded="${txDraft !== null}">Add a transaction</button>
      </div>
      ${toolNote ? `<p class="tool-note" role="status">${esc(toolNote)}</p>` : ''}
      <div class="stack">
        ${txDraft ? card('tx-title', txDraft.editKey ? 'Edit a transaction' : 'Add a transaction', txForm(), 'wide') : ''}
        ${card('exp-title', 'Transactions', txFilterControls() + `<div id="tx-results">${txResultsHtml()}</div>`, 'wide')}
      </div>`;
  }

  // ---- Planner ---------------------------------------------------------------------------

  const FREQ = Store.FREQ;
  const freqLabel = (k) => (FREQ.find((f) => f[0] === k) || FREQ[4])[1];
  const monthlyOf = (p) => Store.monthlyOf(p.amount, p.freq);

  // Lighter tint of a hex color (used for the subscription part of a chart segment).
  function tint(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const mix = (c) => Math.round(c + (255 - c) * amount);
    const r = mix((n >> 16) & 255); const g = mix((n >> 8) & 255); const b = mix(n & 255);
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }

  // Colors for the expense bar: fixed order, past the eighth they share gray.
  // Each group has a regular part and a subscription part.
  function colorSegments(groups) {
    const out = [];
    let rest = { regular: 0, subs: 0 };
    groups.forEach((g, i) => {
      if (i < PIE_COLORS.length) out.push({ ...g, color: PIE_COLORS[i] });
      else { rest.regular += g.regular; rest.subs += g.subs; }
    });
    if (rest.regular + rest.subs > 0) out.push({ label: 'Other', regular: round2(rest.regular), subs: round2(rest.subs), color: PIE_OTHER });
    return out;
  }

  // What counts toward totals: everything except cancelled subscriptions.
  const countsInPlan = (p) => p.sub !== 'no';
  const isSubscription = (p) => p.flow === 'expense' && (p.sub === 'yes' || p.sub === 'no');
  const sumMonthly = (list) => round2(sumOf(list.filter(countsInPlan).map(monthlyOf)));

  function planGroups() {
    const plan = (D.plan || []).filter((p) => inView(p.owner));
    const income = plan.filter((p) => p.flow === 'income');
    const expense = plan.filter((p) => p.flow === 'expense');
    const regular = expense.filter((p) => !isSubscription(p));
    const subs = expense.filter(isSubscription);
    const together = who === 'together';
    const catKeys = Object.keys(D.categories);
    const memberGroups = together
      ? memberList.map((m) => ({
        id: m.id, label: m.label,
        regular: sumMonthly(regular.filter((p) => p.owner === m.id)),
        subs: sumMonthly(subs.filter((p) => p.owner === m.id))
      })).filter((g) => g.regular + g.subs > 0)
      : [];
    const listedRegular = together ? regular.filter((p) => p.owner === 'shared') : regular;
    const listedSubs = together ? subs.filter((p) => p.owner === 'shared') : subs;
    const catGroups = catKeys.map((k) => ({
      label: D.categories[k],
      regular: sumMonthly(listedRegular.filter((p) => p.cat === k)),
      subs: sumMonthly(listedSubs.filter((p) => p.cat === k))
    })).filter((g) => g.regular + g.subs > 0);
    return { income, listedRegular, listedSubs, memberGroups, catGroups };
  }

  function planChart(g) {
    const incomeTotal = sumMonthly(g.income);
    const segs = colorSegments(g.memberGroups.map((m) => ({ label: `${m.label} expenses`, regular: m.regular, subs: m.subs })).concat(g.catGroups));
    const expenseTotal = round2(sumOf(segs.map((x) => x.regular + x.subs)));
    const subsTotal = round2(sumOf(segs.map((x) => x.subs)));
    const scale = Math.max(incomeTotal, expenseTotal) || 1;
    const left = round2(incomeTotal - expenseTotal);
    const incomeSegs = INCOME_TYPES.map(([k, label, color]) => ({ k, label, color, total: round2(sumMonthly(g.income.filter((p) => incomeTypeOf(p) === k))) })).filter((x) => x.total > 0);
    const incomeBar = incomeTotal > 0
      ? `<div class="stack-bar" style="width:${(incomeTotal / scale * 100).toFixed(2)}%" role="img" aria-label="Income ${esc(fmtc(incomeTotal))} a month">${incomeSegs.map((x) => `<span class="bar-seg" style="flex:${x.total} 1 0;background:${x.color}" title="${esc(x.label)}: ${esc(fmtc(x.total))}"></span>`).join('')}</div>`
      : '<p class="muted">No income planned yet.</p>';
    const incomeLegend = incomeSegs.map((x) => `
      <li class="pie-item" title="${esc(x.label)}: ${esc(fmtc(x.total))}">
        <span class="pie-swatch" style="background:${x.color}" aria-hidden="true"></span>
        <span class="pie-name">${esc(x.label)}</span>
        <span class="pie-val">${fmtc(x.total)} · ${pctText(pctOf(x.total, incomeTotal), 0)}</span>
      </li>`).join('');
    const pieces = [];
    segs.forEach((x) => {
      if (x.regular > 0) pieces.push(`<span class="bar-seg" style="flex:${x.regular} 1 0;background:${x.color}" title="${esc(x.label)}: ${esc(fmtc(x.regular))}"></span>`);
      if (x.subs > 0) pieces.push(`<span class="bar-seg" style="flex:${x.subs} 1 0;background:${tint(x.color, 0.55)}" title="${esc(x.label)}, subscriptions: ${esc(fmtc(x.subs))}"></span>`);
    });
    const expenseBar = expenseTotal > 0
      ? `<div class="stack-bar" style="width:${(expenseTotal / scale * 100).toFixed(2)}%" role="img" aria-label="Expenses ${esc(fmtc(expenseTotal))} a month, including ${esc(fmtc(subsTotal))} of subscriptions">${pieces.join('')}</div>`
      : '<p class="muted">No expenses planned yet.</p>';
    const legend = segs.map((x) => {
      const total = round2(x.regular + x.subs);
      return `
      <li class="pie-item" title="${esc(x.label)}: ${esc(fmtc(total))}">
        <span class="pie-swatch" style="background:${x.color}" aria-hidden="true"></span>
        <span class="pie-name">${esc(x.label)}${x.subs > 0 ? `<span class="pie-sub"> · ${esc(fmtc(x.subs))} subscriptions</span>` : ''}</span>
        <span class="pie-val">${fmtc(total)} · ${pctText(pctOf(total, expenseTotal), 0)}</span>
      </li>`;
    }).join('');
    const verdict = incomeTotal === 0 && expenseTotal === 0 ? ''
      : left >= 0
        ? `<p class="plan-left">Left over each month: <strong>${fmtc(left)}</strong></p>`
        : `<p class="plan-left over-note">Short by ${fmtc(-left)} each month</p>`;
    return `
      <div class="plan-chart">
        <p class="row"><span>Income</span><span>${fmtc(incomeTotal)} a month</span></p>
        ${incomeBar}
        ${incomeSegs.length ? `<ul class="pie-legend plan-income-legend" role="list" aria-label="Income by type">${incomeLegend}</ul>` : ''}
        <p class="row"><span>Expenses</span><span>${fmtc(expenseTotal)} a month</span></p>
        ${expenseBar}
        ${verdict}
        ${segs.length ? `<ul class="pie-legend plan-legend" role="list" aria-label="Expenses by line">${legend}</ul>` : ''}
        ${subsTotal > 0 ? `<p class="muted plan-key"><span class="pie-swatch pie-swatch-light" aria-hidden="true"></span> The lighter part of a bar is subscriptions: ${fmtc(subsTotal)} a month.</p>` : ''}
      </div>`;
  }

  let planPanel = false;     // the add or edit form is open
  let planDraft = null;
  let planEditing = null;    // null for a new item, or the item id
  let planConfirm = null;

  function planActions(p) {
    if (planConfirm === p.id) {
      return `<span class="row-actions"><span class="pay-meta">Delete?</span>
        <button type="button" class="btn" data-plan-keep>Cancel</button>
        <button type="button" class="btn btn-danger" data-plan-delete-confirm="${esc(p.id)}">Delete</button></span>`;
    }
    return `<span class="row-actions">
      <button type="button" class="act-icon" data-plan-edit="${esc(p.id)}" aria-label="Edit ${esc(p.name)}" title="Edit">${ICON_PENCIL}</button>
      <button type="button" class="act-icon" data-plan-delete="${esc(p.id)}" aria-label="Delete ${esc(p.name)}" title="Delete">${ICON_TRASH}</button></span>`;
  }

  // The next date an item is due: the saved date, moved forward by the frequency until it is today or later.
  function nextDue(p) {
    if (!p.due) return null;
    const base = parseDay(p.due);
    const today = startOfToday();
    if (base >= today) return base;
    const months = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }[p.freq];
    if (months) {
      for (let k = 1; k < 1200; k += 1) {
        const total = base.getMonth() + k * months;
        const y = base.getFullYear() + Math.floor(total / 12);
        const m = ((total % 12) + 12) % 12;
        const last = new Date(y, m + 1, 0).getDate();
        const d = new Date(y, m, Math.min(base.getDate(), last));
        if (d >= today) return d;
      }
      return base;
    }
    const step = { daily: 1, weekly: 7, biweekly: 14, semimonthly: 15 }[p.freq] || 7;
    const jumps = Math.ceil(daysBetween(base, today) / step);
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() + jumps * step);
  }
  const dueText = (p) => { const d = nextDue(p); return d ? esc(formatDate(d)) : '—'; };

  const PLAN_HEAD = [{ t: 'Category', card: 'meta' }, { t: 'Description', card: 'title' }, { t: 'Frequency', card: 'meta' }, { t: 'Due Date', card: 'meta' }, { t: 'Amount', num: true, card: 'amount' }, { t: 'Monthly amount', num: true, card: 'secondary' }, { t: 'Actions' }];
  const SUB_HEAD = [{ t: 'Category', card: 'meta' }, { t: 'Description', card: 'title' }, { t: 'Subscription', card: 'meta' }, { t: 'Frequency', card: 'meta' }, { t: 'Due Date', card: 'meta' }, { t: 'Amount', num: true, card: 'amount' }, { t: 'Monthly amount', num: true, card: 'secondary' }, { t: 'Actions' }];

  function renderPlanner() {
    const g = planGroups();
    const together = who === 'together';
    const catOrder = (a, b) => Object.keys(D.categories).indexOf(a.cat) - Object.keys(D.categories).indexOf(b.cat);
    const monthlyCell = (p) => (countsInPlan(p) ? fmtc(monthlyOf(p)) : '—');

    const incomeTotal = sumMonthly(g.income);
    const incomeRows = g.income.map((p) => [
      esc(together ? `Income · ${ownerLabel(p.owner)}` : 'Income'), `${esc(p.name)} <span class="pay-meta">${esc(incomeTypeLabel(p))}</span>`, esc(freqLabel(p.freq)), dueText(p), fmtc(p.amount), fmtc(monthlyOf(p)), planActions(p)
    ]);
    if (incomeRows.length) incomeRows.push({ cells: ['Total income', '', '', '', '', fmtc(incomeTotal), ''], strong: true });

    // Regular expenses
    const regMembers = g.memberGroups.filter((m) => m.regular > 0).map((m) => [
      esc(`${m.label} expenses`),
      `<button type="button" class="text-link link-btn" data-plan-view="${esc(m.id)}">See ${esc(m.label)}'s items</button>`,
      'Monthly', '—', fmtc(m.regular), fmtc(m.regular), ''
    ]);
    const regItems = g.listedRegular.slice().sort(catOrder).map((p) => [
      esc(D.categories[p.cat]), esc(p.name), esc(freqLabel(p.freq)), dueText(p), fmtc(p.amount), fmtc(monthlyOf(p)), planActions(p)
    ]);
    const regTotal = round2(sumOf(g.memberGroups.map((m) => m.regular)) + sumMonthly(g.listedRegular));
    const regRows = regMembers.concat(regItems);
    if (regRows.length) regRows.push({ cells: ['Total regular expenses', '', '', '', '', fmtc(regTotal), ''], strong: true });

    // Subscriptions
    const yesNo = (p) => `<span class="pill${p.sub === 'no' ? ' pill-off' : ''}">${p.sub === 'no' ? 'No' : 'Yes'}</span>`;
    const subMembers = g.memberGroups.filter((m) => m.subs > 0).map((m) => [
      esc(`${m.label} subscriptions`),
      `<button type="button" class="text-link link-btn" data-plan-view="${esc(m.id)}">See ${esc(m.label)}'s items</button>`,
      '', 'Monthly', '—', fmtc(m.subs), fmtc(m.subs), ''
    ]);
    const subItems = g.listedSubs.slice().sort(catOrder).map((p) => [
      esc(D.categories[p.cat]), esc(p.name), yesNo(p), esc(freqLabel(p.freq)), dueText(p), fmtc(p.amount), monthlyCell(p), planActions(p)
    ]);
    const subTotal = round2(sumOf(g.memberGroups.map((m) => m.subs)) + sumMonthly(g.listedSubs));
    const subRows = subMembers.concat(subItems);
    if (subRows.length) subRows.push({ cells: ['Total subscriptions', '', '', '', '', '', fmtc(subTotal), ''], strong: true });

    return `
      ${pageTop(subnav(BUDGET_LINKS, 'budget-planner'))}
      <div class="btn-row tool-row">
        <button type="button" class="btn btn-primary" data-open-plan aria-expanded="${planPanel}">Add an item</button>
        <button type="button" class="btn" data-open-goals aria-expanded="${budgetPanel === 'goals'}">Set budget goals</button>
        <button type="button" class="btn" data-open-cats aria-expanded="${budgetPanel === 'cats'}">Edit categories</button>
      </div>
      ${toolNote ? `<p class="tool-note" role="status">${esc(toolNote)}</p>` : ''}
      <div class="stack">
        ${budgetPanel === 'goals' ? card('goals-title', 'Set budget goals', goalsForm(), 'wide') : ''}
        ${budgetPanel === 'cats' ? card('cats-title', 'Edit categories', catsForm(), 'wide') : ''}
        ${card('plan-chart-title', 'Monthly income and expenses', planChart(g), 'wide')}
        ${card('plan-income-title', 'Income',
          incomeRows.length ? table('Planned income', PLAN_HEAD, incomeRows, true) : '<p class="muted">No income items yet. Use Add an item.</p>', 'wide')}
        ${card('plan-exp-title', 'Regular Expense',
          (regRows.length ? table('Planned regular expenses', PLAN_HEAD, regRows, true) : '<p class="muted">No expense items yet. Use Add an item.</p>')
          + (together && regMembers.length ? '<p class="muted">Each person\'s items are added up into one line here. Open their view to see and change them.</p>' : ''), 'wide')}
        ${card('plan-sub-title', 'Subscriptions',
          (subRows.length ? table('Planned subscriptions', SUB_HEAD, subRows, true) : '<p class="muted">No subscriptions yet. Use Add an item and choose Subscription.</p>')
          + (subRows.length ? '<p class="muted">A subscription marked No is cancelled. It stays on the list but is left out of the totals, the chart and the budget goals.</p>' : ''), 'wide')}
      </div>`;
  }

  function openPlan(item) {
    resetBudgetTools();
    planPanel = true;
    planEditing = item ? item.id : null;
    const kind = !item ? 'expense' : item.flow === 'income' ? 'income' : isSubscription(item) ? 'subscription' : 'expense';
    planDraft = item
      ? { kind, owner: item.owner, cat: item.cat, name: item.name, freq: item.freq, amount: String(item.amount), due: item.due || '', active: item.sub === 'no' ? 'no' : 'yes' }
      : { kind: 'expense', owner: who !== 'together' ? who : 'shared', cat: '', name: '', freq: 'monthly', amount: '', due: '', active: 'yes' };
  }

  // The planner's add and edit form opens as a modal. It is rebuilt on every page draw, so it always matches the draft.
  function syncPlanDialog(opts) {
    document.querySelectorAll('#plan-dialog').forEach((el) => el.remove());
    if (!planPanel || !planDraft) return;
    const dlg = document.createElement('dialog');
    dlg.id = 'plan-dialog';
    dlg.className = 'modal';
    dlg.setAttribute('aria-labelledby', 'plan-form-title');
    dlg.innerHTML = `<div class="modal-head"><h2 id="plan-form-title" class="card-label">${planEditing ? 'Edit planner item' : 'Add a planner item'}</h2></div><div class="modal-body">${planForm()}</div>`;
    dlg.addEventListener('close', () => {
      if (planPanel) { planPanel = false; planDraft = null; planEditing = null; planConfirm = null; route({ keepPlace: true, focus: '[data-open-plan]' }); }
    });
    view.appendChild(dlg);
    dlg.showModal();
    const want = opts && opts.focus ? dlg.querySelector(opts.focus) : null;
    const first = want || dlg.querySelector('#plan-name');
    if (first) first.focus({ preventScroll: true });
  }

  function planMonthlyText() {
    const n = round2(toDollars(planDraft.amount));
    return Number.isFinite(n) && n > 0 ? `${fmtc(Store.monthlyOf(n, planDraft.freq))} a month` : '—';
  }

  function planForm() {
    const d = planDraft;
    const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
    const owners = ownersInView();
    const ownerList = owners.indexOf(d.owner) === -1 ? owners.concat(d.owner) : owners;
    const cats = `<option value=""${d.cat === '' ? ' selected' : ''} disabled>Choose a category</option>` + Object.keys(D.categories).map((k) => opt(k, D.categories[k], d.cat)).join('');
    const isIncome = d.kind === 'income';
    return `
      <form class="member-form" data-plan-form novalidate>
        <div class="field-row">
          <div class="field"><label for="plan-kind">Type</label>
            <select id="plan-kind" data-plan="kind">${opt('expense', 'Regular expense', d.kind)}${opt('subscription', 'Subscription', d.kind)}${opt('income', 'Income', d.kind)}</select></div>
          <div class="field"><label for="plan-owner">${isIncome ? 'Earned by' : 'Counts in'}</label>
            <select id="plan-owner" data-plan="owner">${ownerList.map((o) => opt(o, ownerLabel(o), d.owner)).join('')}</select></div>
        </div>
        ${isIncome ? `<div class="field"><label for="plan-income-type">Income type</label><select id="plan-income-type" data-plan="incomeType">${INCOME_TYPES.map((t) => opt(t[0], t[1], incomeTypeOf(d))).join('')}</select></div>` : `<div class="field"><label for="plan-cat">Category</label><select id="plan-cat" data-plan="cat">${cats}</select></div>`}
        <div class="field"><label for="plan-name">Description</label>
          <input id="plan-name" type="text" maxlength="60" autocomplete="off" data-plan="name" value="${esc(d.name)}"></div>
        ${d.kind === 'subscription' ? `<div class="field"><label for="plan-active">Subscription</label>
          <select id="plan-active" data-plan="active">${opt('yes', 'Yes (still subscribed)', d.active)}${opt('no', 'No (cancelled)', d.active)}</select></div>` : ''}
        <div class="field-row">
          <div class="field"><label for="plan-freq">Frequency</label>
            <select id="plan-freq" data-plan="freq">${FREQ.map((f) => opt(f[0], f[1], d.freq)).join('')}</select></div>
          <div class="field"><label for="plan-due">Due Date</label>
            <input id="plan-due" type="date" data-plan="due" value="${esc(d.due)}"></div>
        </div>
        <div class="field"><label for="plan-amount">Amount</label>
          <span class="money-input"><span aria-hidden="true">$</span><input id="plan-amount" type="text" inputmode="decimal" autocomplete="off" data-plan="amount" value="${esc(d.amount)}" placeholder="0.00"></span></div>
        <p class="row"><span>Monthly amount</span><span id="plan-monthly" aria-live="polite">${esc(planMonthlyText())}</span></p>
        ${toolError ? `<p class="form-error" role="alert">${esc(toolError)}</p>` : ''}
        ${sampleNote()}
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">${planEditing ? 'Save item' : 'Add item'}</button>
          <button type="button" class="btn" data-tool-cancel>Cancel</button>
        </div>
      </form>`;
  }

  function savePlan() {
    const d = planDraft;
    const name = d.name.trim().replace(/\s+/g, ' ');
    const amount = round2(toDollars(d.amount));
    const isIncome = d.kind === 'income';
    let err = '';
    if (!isIncome && !D.categories[d.cat]) err = 'Choose a category.';
    else if (!name) err = 'Enter a description.';
    else if (!d.amount.trim() || !Number.isFinite(amount) || amount <= 0 || amount > 10000000) err = 'Enter an amount above $0.';
    else if (d.due && (!/^\d{4}-\d{2}-\d{2}$/.test(d.due) || Number.isNaN(parseDay(d.due).getTime()))) err = 'Pick a valid due date, or leave it empty.';
    if (err) { toolError = err; return false; }
    const item = {
      flow: isIncome ? 'income' : 'expense', owner: d.owner, cat: isIncome ? '' : d.cat, name, freq: d.freq, amount,
      sub: d.kind === 'subscription' ? (d.active === 'no' ? 'no' : 'yes') : '', due: d.due || '',
      incomeType: isIncome ? incomeTypeOf(d) : ''
    };
    if (isSample()) {
      if (planEditing) { const i = D.plan.findIndex((p) => p.id === planEditing); if (i !== -1) D.plan[i] = { id: planEditing, ...item }; }
      else D.plan.push({ id: newId('p'), ...item });
      recomputeSampleLimits();
    } else {
      writeRecords([{ id: planEditing || newId('p'), kind: 'plan', updatedAt: Date.now(), ...item }]);
      refreshData();
    }
    toolNote = planEditing ? 'Item saved.' : 'Item added.';
    return true;
  }

  function deletePlan(id) {
    if (isSample()) { D.plan = D.plan.filter((p) => p.id !== id); SAMPLE.plan = D.plan; recomputeSampleLimits(); }
    else { writeRecords([{ id, kind: 'plan', updatedAt: Date.now(), deleted: true }]); refreshData(); }
    toolNote = 'Item deleted.';
  }

  // ---- Budget tools: goals, categories, manual transactions, learned stores -----------------

  let budgetPanel = null;   // null | 'goals' | 'cats'
  let goalsDraft = null;    // { owner: { cat: 'text' } }
  let catDraft = null;      // { names: { catKey: 'text' }, newName: '' }
  let catConfirm = null;
  let toolError = '';
  let txDraft = null;
  let txConfirm = null; // key of the row waiting for a Yes/No delete
  let toolNote = '';
  const sampleOverrides = {}; // typed-in goals while looking at sample data: { owner: { cat: amount } }

  const MAX_CATEGORIES = 20;
  const MAX_CAT_NAME = 40;

  function resetBudgetTools() {
    budgetPanel = null; goalsDraft = null; catDraft = null; catConfirm = null; toolError = ''; txDraft = null; txConfirm = null; toolNote = '';
    planPanel = false; planDraft = null; planEditing = null; planConfirm = null;
    acctPanel = false; acctDraft = null; acctEditing = null; acctConfirm = null; acctError = ''; acctNote = '';
    groupsPanel = false; groupsDraft = null; holdNote = '';
  }

  const pad2 = (n) => String(n).padStart(2, '0');
  const isoDay = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const parseDay = (t) => { const [y, m, d] = t.split('-').map(Number); return new Date(y, m - 1, d); };
  const newId = (prefix) => prefix + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  const round2 = (n) => Math.round(n * 100) / 100;
  const toDollars = (t) => Number(String(t).replace(/[$,\s]/g, ''));
  const titleCase = (t) => t.replace(/\b[a-z]/g, (c) => c.toUpperCase());

  const sampleNote = () => (isSample() ? '<p class="muted">You are looking at sample data. You can try this out, but nothing is saved. It resets when you reload.</p>' : '');

  function categoryUses(key) {
    const planned = (D.plan || []).filter((p) => p.cat === key).length;
    const spent = isSample()
      ? D.expenses.filter((e) => e.cat === key).length
      : records.filter((r) => !r.deleted && r.kind === 'expense' && r.cat === key).length;
    return spent + planned;
  }

  // What the planner adds up to for one person and category.
  const plannedLimit = (o, c) => round2(sumOf((D.plan || []).filter((p) => p.flow === 'expense' && p.sub !== 'no' && p.owner === o && p.cat === c).map(monthlyOf)));

  // A goal typed in by hand, if there is one.
  function goalOverride(o, c) {
    if (isSample()) return sampleOverrides[o] && sampleOverrides[o][c] !== undefined ? sampleOverrides[o][c] : undefined;
    const r = records.find((x) => x.id === `b-${o}-${c}` && !x.deleted);
    return r ? r.limit : undefined;
  }

  // Sample data: limits come from the planner, unless a goal was typed in.
  function recomputeSampleLimits() {
    const owners = {};
    Object.keys(SAMPLE.budget).forEach((o) => { owners[o] = true; });
    SAMPLE.plan.forEach((p) => { owners[p.owner] = true; });
    Object.keys(sampleOverrides).forEach((o) => { owners[o] = true; });
    Object.keys(owners).forEach((o) => {
      if (!SAMPLE.budget[o]) SAMPLE.budget[o] = {};
      const cats = {};
      Object.keys(SAMPLE.budget[o]).forEach((c) => { cats[c] = true; });
      SAMPLE.plan.forEach((p) => { if (p.owner === o && p.flow === 'expense' && p.sub !== 'no') cats[p.cat] = true; });
      Object.keys(sampleOverrides[o] || {}).forEach((c) => { cats[c] = true; });
      Object.keys(cats).forEach((c) => {
        const over = sampleOverrides[o] && sampleOverrides[o][c];
        const limit = over !== undefined ? over : plannedLimit(o, c);
        const row = SAMPLE.budget[o][c];
        if (row) { row[1] = limit; if (row[0] === 0 && limit === 0) delete SAMPLE.budget[o][c]; }
        else if (limit > 0) SAMPLE.budget[o][c] = [0, limit];
      });
    });
  }

  // ---- Goals

  function openGoals() {
    resetBudgetTools();
    budgetPanel = 'goals';
    goalsDraft = {};
    ownersInView().forEach((o) => {
      goalsDraft[o] = {};
      Object.keys(D.categories).forEach((c) => {
        const row = D.budget[o] && D.budget[o][c];
        const limit = row ? row[1] : 0;
        goalsDraft[o][c] = limit > 0 ? String(limit) : (goalOverride(o, c) === 0 ? '0' : '');
      });
    });
  }

  function goalsForm() {
    const groups = ownersInView().map((o) => {
      const rows = Object.keys(D.categories).map((c) => {
        const planned = plannedLimit(o, c);
        return `
        <div class="goal-row">
          <label for="goal-${o}-${c}">${esc(D.categories[c])}</label>
          <span class="money-input"><span aria-hidden="true">$</span>
            <input id="goal-${o}-${c}" type="text" inputmode="decimal" autocomplete="off" data-goal="${o}|${c}" value="${esc(goalsDraft[o][c])}" placeholder="${planned ? 'Planner ' + esc(fmt(planned)) : 'No limit'}">
          </span>
        </div>`;
      }).join('');
      return `<fieldset class="goal-group"><legend>${esc(ownerLabel(o))}</legend>${rows}</fieldset>`;
    }).join('');
    return `
      <form class="member-form" data-goals-form novalidate>
        <p class="muted">Each box starts at the monthly total from your planner. Type a different amount to override it for that category, enter 0 for no limit, or clear the box to follow the planner again.</p>
        ${toolError ? `<p class="form-error" role="alert">${esc(toolError)}</p>` : ''}
        <div class="goal-groups">${groups}</div>
        ${sampleNote()}
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">Save goals</button>
          <button type="button" class="btn" data-tool-cancel>Cancel</button>
        </div>
      </form>`;
  }

  function saveGoals() {
    const changes = [];
    let bad = '';
    Object.keys(goalsDraft).forEach((o) => {
      Object.keys(goalsDraft[o]).forEach((c) => {
        const raw = String(goalsDraft[o][c]).trim();
        const n = raw === '' ? 0 : toDollars(raw);
        if (!Number.isFinite(n) || n < 0 || n > 10000000) { bad = `"${raw}" for ${D.categories[c]} (${ownerLabel(o)}) is not an amount.`; return; }
        // Blank, or the same as the planner, means "follow the planner".
        const want = (raw === '' || round2(n) === plannedLimit(o, c)) ? undefined : round2(n);
        if (want !== goalOverride(o, c)) changes.push({ o, c, want });
      });
    });
    if (bad) { toolError = bad; return false; }
    if (isSample()) {
      changes.forEach(({ o, c, want }) => {
        if (!sampleOverrides[o]) sampleOverrides[o] = {};
        if (want === undefined) delete sampleOverrides[o][c]; else sampleOverrides[o][c] = want;
      });
      recomputeSampleLimits();
    } else {
      const now = Date.now();
      writeRecords(changes.map(({ o, c, want }) => (want === undefined
        ? { id: `b-${o}-${c}`, kind: 'budget', updatedAt: now, deleted: true }
        : { id: `b-${o}-${c}`, kind: 'budget', updatedAt: now, owner: o, cat: c, limit: want })));
      refreshData();
    }
    toolNote = changes.length ? `Saved ${changes.length} budget ${changes.length === 1 ? 'goal' : 'goals'}.` : 'No changes.';
    return true;
  }

  // ---- Categories

  function freshCatDraft(fresh) {
    const names = {};
    Object.keys(D.categories).forEach((k) => { names[k] = D.categories[k]; });
    return { names, newName: '', fresh };
  }

  function openCats() {
    resetBudgetTools();
    budgetPanel = 'cats';
    catDraft = freshCatDraft([]);
  }

  function catsForm() {
    const fresh = catDraft.fresh || [];
    const keys = Object.keys(D.categories).filter((k) => k !== 'other')
      .sort((a, b) => D.categories[a].localeCompare(D.categories[b], undefined, { sensitivity: 'base' }));
    const rows = keys.map((k) => {
      if (catConfirm === k) {
        return `
          <li class="member-row">
            <span class="pay-main">
              <span class="pay-name">Delete ${esc(D.categories[k])}?</span>
              <span class="pay-meta">Its budget goals and learned stores are removed too. This can't be undone.</span>
            </span>
            <span class="member-actions">
              <button type="button" class="btn" data-cat-keep>Cancel</button>
              <button type="button" class="btn btn-danger" data-cat-delete-confirm="${k}">Delete</button>
            </span>
          </li>`;
      }
      const uses = categoryUses(k);
      const isNew = fresh.indexOf(k) !== -1;
      return `
        <li class="member-row cat-row${isNew ? ' cat-fresh' : ''}">
          <div class="cat-line">
            <label class="sr-only" for="cat-${k}">Name</label>
            <input id="cat-${k}" type="text" maxlength="${MAX_CAT_NAME}" autocomplete="off" data-cat-name="${k}" value="${esc(catDraft.names[k] === undefined ? D.categories[k] : catDraft.names[k])}">
            <button type="button" class="act-icon" data-cat-delete="${k}" aria-label="Delete ${esc(D.categories[k])}" title="${uses ? 'In use' : 'Delete'}" ${uses ? 'disabled' : ''}>${ICON_TRASH}</button>
          </div>
          <span class="pay-meta">${isNew ? 'New. ' : ''}${uses ? `Used by ${uses} ${uses === 1 ? 'transaction or planner item' : 'transactions and planner items'}, so it can't be deleted` : 'Not used by anything'}</span>
        </li>`;
    }).join('');
    const full = Object.keys(D.categories).length >= MAX_CATEGORIES;
    return `
      <form class="member-form" data-cats-form novalidate>
        <div class="cat-head" aria-hidden="true">Name</div>
        <ul class="plain-list">${rows}
          ${D.categories.other ? '<li class="member-row"><span class="pay-main"><span class="pay-name">Other</span><span class="pay-meta">Catch-all for anything unsorted. It can\'t be changed.</span></span></li>' : ''}
        </ul>
        <div class="field">
          <label for="cat-new">Add categories</label>
          <input id="cat-new" type="text" maxlength="300" autocomplete="off" value="${esc(catDraft.newName)}" placeholder="${full ? 'Limit reached' : 'For example, Travel, Gifts, Pets'}" ${full ? 'disabled' : ''}>
          <p class="muted">Separate several names with commas. Up to ${MAX_CAT_NAME} characters each.</p>
        </div>
        ${toolError ? `<p class="form-error" role="alert">${esc(toolError)}</p>` : ''}
        ${sampleNote()}
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">Save categories</button>
          <button type="button" class="btn" data-tool-cancel>Close</button>
        </div>
      </form>`;
  }

  function saveCategories() {
    const keys = Object.keys(D.categories).filter((k) => k !== 'other');
    const names = {};
    const seen = new Set(['other']);
    let bad = '';
    keys.forEach((k) => {
      const n = String(catDraft.names[k] === undefined ? D.categories[k] : catDraft.names[k]).trim().replace(/\s+/g, ' ');
      if (!n) { bad = 'Every category needs a name.'; return; }
      if (n.length > MAX_CAT_NAME) { bad = `"${n}" is longer than ${MAX_CAT_NAME} characters.`; return; }
      if (seen.has(n.toLowerCase())) { bad = `There are two categories called "${n}".`; return; }
      seen.add(n.toLowerCase());
      names[k] = n;
    });
    const added = String(catDraft.newName).split(',').map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean);
    if (!bad) {
      added.forEach((n) => {
        if (bad) return;
        if (n.length > MAX_CAT_NAME) bad = `"${n}" is longer than ${MAX_CAT_NAME} characters.`;
        else if (seen.has(n.toLowerCase())) bad = `There is already a category called "${n}".`;
        else seen.add(n.toLowerCase());
      });
    }
    const room = MAX_CATEGORIES - Object.keys(D.categories).length;
    if (!bad && added.length > room) bad = `Up to ${MAX_CATEGORIES} categories. You can add ${Math.max(0, room)} more.`;
    if (bad) { toolError = bad; return false; }

    const now = Date.now();
    const out = [];
    const renamed = keys.filter((k) => names[k] !== D.categories[k]);
    const freshKeys = [];
    if (isSample()) {
      renamed.forEach((k) => { D.categories[k] = names[k]; });
      added.forEach((n) => { const id = newId('c'); D.categories[id] = n; freshKeys.push(id); });
    } else {
      renamed.forEach((k) => out.push({ id: k, kind: 'category', updatedAt: now, label: names[k] }));
      added.forEach((n) => { const id = newId('c'); freshKeys.push(id); out.push({ id, kind: 'category', updatedAt: now, label: n }); });
      if (out.length) { writeRecords(out); refreshData(); }
    }
    catDraft = freshCatDraft(freshKeys);
    toolError = '';
    toolNote = added.length
      ? `Added ${added.length} ${added.length === 1 ? 'category' : 'categories'}.`
      : renamed.length ? `Saved ${renamed.length} ${renamed.length === 1 ? 'change' : 'changes'}.` : 'No changes.';
    return true;
  }

  function deleteCategory(key) {
    if (!D.categories[key] || key === 'other' || categoryUses(key)) return;
    if (isSample()) {
      delete D.categories[key];
      Object.keys(D.budget).forEach((o) => { delete D.budget[o][key]; });
      Object.keys(sampleOverrides).forEach((o) => { delete sampleOverrides[o][key]; });
      Object.keys(D.rules || {}).forEach((v) => { if (D.rules[v] === key) delete D.rules[v]; });
    } else {
      const now = Date.now();
      const out = [{ id: key, kind: 'category', updatedAt: now, deleted: true }];
      records.forEach((r) => {
        if (r.deleted) return;
        if ((r.kind === 'budget' || r.kind === 'rule') && r.cat === key) out.push({ id: r.id, kind: r.kind, updatedAt: now, deleted: true });
      });
      writeRecords(out);
      refreshData();
    }
    if (catDraft) { delete catDraft.names[key]; catDraft.fresh = (catDraft.fresh || []).filter((k) => k !== key); }
    toolNote = 'Category deleted.';
  }

  // ---- Manual transactions

  const txByKey = (key) => {
    const e = D.expenses.map((x, i) => ({ ...x, key: x.id || `s${i}` })).find((x) => x.key === key);
    return e ? { ...e, date: dateFromDaysAgo(e.daysAgo) } : null;
  };

  function txActions(e) {
    const k = esc(e.key);
    if (txConfirm === e.key) {
      return `<span class="row-actions"><span class="muted">Delete this?</span><button type="button" class="btn btn-danger" data-tx-delete-yes="${k}">Yes, delete</button><button type="button" class="btn" data-tx-delete-no>No</button></span>`;
    }
    return `<span class="row-actions"><button type="button" class="act-icon" data-tx-edit="${k}" aria-label="Edit ${esc(e.name)}" title="Edit">${ICON_PENCIL}</button><button type="button" class="act-icon" data-tx-delete="${k}" aria-label="Delete ${esc(e.name)}" title="Delete">${ICON_TRASH}</button></span>`;
  }

  function openTxEdit(key) {
    const e = txByKey(key);
    if (!e) return;
    resetBudgetTools();
    txDraft = {
      type: e.type, date: isoDay(e.date), name: e.name, amount: Number(e.amount).toFixed(2), cat: e.cat || '', catTouched: true,
      paidBy: e.paidBy, owner: e.owner, hint: '', editKey: key
    };
  }

  function deleteTx(key) {
    const e = txByKey(key);
    txConfirm = null;
    if (!e) return;
    if (isSample()) D.expenses.splice(Number(String(key).slice(1)), 1);
    else writeRecords([{ id: key, kind: 'expense', updatedAt: Date.now(), deleted: true }]);
    if (txDraft && txDraft.editKey === key) txDraft = null;
    refreshData();
    toolNote = `Deleted ${e.name}.`;
  }

  function saveTxEdit(d, name, amount, cat, key) {
    if (isSample()) {
      const idx = Number(String(d.editKey).slice(1));
      if (!D.expenses[idx]) { toolError = 'That transaction is no longer here.'; return false; }
      D.expenses[idx] = { daysAgo: daysBetween(parseDay(d.date), startOfToday()), name, type: d.type, cat, amount, paidBy: payerOf(d), owner: d.owner };
      setRule(key, cat);
    } else {
      const old = records.find((r) => r.id === d.editKey && r.kind === 'expense' && !r.deleted);
      if (!old) { toolError = 'That transaction is no longer here.'; return false; }
      const list = [{ ...old, updatedAt: Date.now(), date: d.date, name, type: d.type, cat, amount, paidBy: payerOf(d), owner: d.owner }];
      if (key && cat) list.push({ id: Store.ruleId(key), kind: 'rule', updatedAt: Date.now(), vendor: key, cat });
      writeRecords(list);
      refreshData();
    }
    toolNote = `Saved changes to ${name}.`;
    return true;
  }

  function openTx() {
    resetBudgetTools();
    const people = memberList.map((m) => m.id);
    const payer = who !== 'together' ? who : people[0];
    txDraft = {
      type: 'expense', date: isoDay(startOfToday()), name: '', amount: '', cat: '', catTouched: false,
      paidBy: payer, owner: who !== 'together' ? who : 'shared', hint: ''
    };
  }

  // Paid by is no longer asked: a personal item is paid by its owner, a joint one by whoever is adding it.
  const payerOf = (d) => (d.owner !== 'shared' ? d.owner : d.paidBy);

  const hasCategory = (type) => type === 'expense' || type === 'refund';

  function txForm() {
    const d = txDraft;
    const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
    const cats = `<option value=""${d.cat === '' ? ' selected' : ''}>No category</option>`
      + Object.keys(D.categories).map((k) => opt(k, D.categories[k], d.cat)).join('');
    const owners = ownersInView().map((o) => opt(o, ownerLabel(o), d.owner)).join('');
    const nameLabel = d.type === 'income' ? 'Source or description' : 'Store or description';
    const hint = d.type === 'refund'
      ? 'Enter the amount as a positive number. It is subtracted from that category, so it shows as a negative amount.'
      : d.type === 'transfer' ? 'Card payments and moves between your own accounts are not counted as spending.' : '';
    return `
      <form class="member-form" data-tx-form novalidate>
        <div class="field"><label for="tx-type">Type</label>
          <select id="tx-type" data-tx="type">${TYPE_OPTIONS.map((t) => opt(t[0], t[1], d.type)).join('')}</select>
          ${hint ? `<p class="muted tx-hint">${esc(hint)}</p>` : ''}</div>
        <div class="field-row">
          <div class="field"><label for="tx-date">Date</label>
            <input id="tx-date" type="date" data-tx="date" value="${esc(d.date)}"></div>
          <div class="field"><label for="tx-amount">Amount</label>
            <span class="money-input"><span aria-hidden="true">$</span><input id="tx-amount" type="text" inputmode="decimal" autocomplete="off" data-tx="amount" value="${esc(d.amount)}" placeholder="0.00"></span></div>
        </div>
        <div class="field"><label for="tx-name">${nameLabel}</label>
          <input id="tx-name" type="text" maxlength="60" autocomplete="off" data-tx="name" value="${esc(d.name)}"></div>
        ${hasCategory(d.type) ? `<div class="field"><label for="tx-cat">Category</label>
          <select id="tx-cat" data-tx="cat">${cats}</select>
          <p class="muted tx-hint" id="tx-hint" aria-live="polite">${esc(d.hint)}</p></div>` : ''}
        <div class="field"><label for="tx-owner">Counts in</label><select id="tx-owner" data-tx="owner">${owners}</select></div>
        ${toolError ? `<p class="form-error" role="alert">${esc(toolError)}</p>` : ''}
        ${sampleNote()}
        ${hasCategory(d.type) ? '<p class="muted">Kanopi remembers the category you pick for each store, and fills it in next time.</p>' : ''}
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">${d.editKey ? 'Save changes' : 'Add transaction'}</button>
          <button type="button" class="btn" data-tool-cancel>Cancel</button>
        </div>
      </form>`;
  }

  // Looks up a learned category for the store name and fills it in, unless one was chosen by hand.
  function suggestCategory() {
    if (!txDraft || txDraft.catTouched || !hasCategory(txDraft.type)) return;
    const key = Store.vendorKey(txDraft.name);
    const cat = key && D.rules ? D.rules[key] : '';
    if (cat && D.categories[cat]) {
      txDraft.cat = cat;
      txDraft.hint = `Filled in from a past entry for "${titleCase(key)}".`;
    } else if (txDraft.hint) {
      txDraft.hint = '';
    }
    const sel = document.getElementById('tx-cat');
    if (sel) sel.value = txDraft.cat;
    const hint = document.getElementById('tx-hint');
    if (hint) hint.textContent = txDraft.hint;
  }

  function setRule(key, cat) {
    if (!key || !cat) return; // a blank category teaches nothing
    if (isSample()) { if (!D.rules) D.rules = {}; D.rules[key] = cat; return; }
    writeRecords([{ id: Store.ruleId(key), kind: 'rule', updatedAt: Date.now(), vendor: key, cat }]);
    refreshData();
  }

  function removeRule(key) {
    if (isSample()) { if (D.rules) delete D.rules[key]; return; }
    writeRecords([{ id: Store.ruleId(key), kind: 'rule', updatedAt: Date.now(), deleted: true }]);
    refreshData();
  }

  function saveTx() {
    const d = txDraft;
    const name = d.name.trim().replace(/\s+/g, ' ');
    const amount = round2(toDollars(d.amount));
    const withCat = hasCategory(d.type);
    let err = '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || Number.isNaN(parseDay(d.date).getTime())) err = 'Pick a date.';
    else if (!name) err = 'Enter a store or description.';
    else if (!d.amount.trim() || !Number.isFinite(amount) || amount <= 0 || amount > 10000000) err = 'Enter an amount above $0.';
    else if (withCat && d.cat && !D.categories[d.cat]) err = 'Choose a category from the list.';
    if (err) { toolError = err; return false; }

    const key = withCat ? Store.vendorKey(name) : '';
    const cat = withCat ? d.cat : '';
    if (d.editKey) return saveTxEdit(d, name, amount, cat, key);
    if (isSample()) {
      const when = parseDay(d.date);
      const item = { daysAgo: daysBetween(when, startOfToday()), name, type: d.type, cat, amount, paidBy: payerOf(d), owner: d.owner };
      D.expenses.push(item);
      const today = startOfToday();
      const spend = Store.spendOf(item);
      if (spend && when.getFullYear() === today.getFullYear() && when.getMonth() === today.getMonth()) {
        if (!D.budget[d.owner]) D.budget[d.owner] = {};
        const row = D.budget[d.owner][cat] || (D.budget[d.owner][cat] = [0, 0]);
        row[0] += spend;
      }
      setRule(key, cat);
    } else {
      const rec = { id: newId('e'), kind: 'expense', updatedAt: Date.now(), date: d.date, name, type: d.type, cat, amount, paidBy: payerOf(d), owner: d.owner };
      const list = [rec];
      if (key && cat) list.push({ id: Store.ruleId(key), kind: 'rule', updatedAt: Date.now(), vendor: key, cat });
      writeRecords(list);
      refreshData();
    }
    toolNote = `Added $${amount.toFixed(2)} ${TYPE_LABEL[d.type].toLowerCase()}: ${name}.`;
    return true;
  }

  // ---- Learned stores (Settings)

  function rulesCard() {
    const keys = Object.keys(D.rules || {}).sort();
    const shown = keys;
    const opts = (cur) => Object.keys(D.categories).map((k) => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(D.categories[k])}</option>`).join('');
    const list = shown.length
      ? `<ul class="plain-list">${shown.map((k, i) => `
          <li class="member-row rule-row">
            <span class="pay-main"><span class="pay-name">${esc(titleCase(k))}</span></span>
            <label class="sr-only" for="rule-${i}">Category for ${esc(titleCase(k))}</label>
            <select id="rule-${i}" data-rule-cat="${esc(k)}">${opts(D.rules[k])}</select>
            <button type="button" class="btn" data-rule-remove="${esc(k)}" aria-label="Forget ${esc(titleCase(k))}">Forget</button>
          </li>`).join('')}</ul>${keys.length > shown.length ? `<p class="muted">Showing the first ${shown.length} of ${keys.length}.</p>` : ''}`
      : '<p class="muted">Nothing learned yet. When you add a transaction, Kanopi remembers the category you chose for that store.</p>';
    return card('rules-title', 'Learned stores',
      list + `<p class="muted">When a store name matches, its category is filled in for you. Changing or forgetting a store here never changes past transactions.</p>`);
  }

  function renderStores() {
    return `
      ${pageTop(subnav(BUDGET_LINKS, 'budget-stores'))}
      <div class="stack">${rulesCard()}</div>`;
  }

  // ---- Google Sheets sync (Settings card, menu button) ----------------------

  const SHEETS_KEY = 'kanopi-sheets';
  let sheetsBusy = false;
  let sheetsProblems = [];
  let sheetsFormError = '';

  function sheetsSettings() {
    try { return JSON.parse(localStorage.getItem(SHEETS_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveSheetsSettings(patch) {
    const next = { ...sheetsSettings(), ...patch };
    try { localStorage.setItem(SHEETS_KEY, JSON.stringify(next)); } catch (e) { /* storage unavailable */ }
    return next;
  }
  const sheetsReady = (s) => !!(s.clientId && s.sheetId);

  function updateSyncLabel() {
    const s = sheetsSettings();
    document.querySelectorAll('[data-sync-sheets]').forEach((b) => {
      b.setAttribute('aria-busy', sheetsBusy ? 'true' : 'false');
      b.disabled = sheetsBusy;
    });
    const el = document.getElementById('sync-last');
    if (el) el.textContent = sheetsBusy ? 'Syncing…' : s.lastSync ? `Synced ${new Date(s.lastSync).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Not synced yet';
  }

  const syncBanner = document.getElementById('banner-sync');
  const syncClose = document.getElementById('banner-sync-close');
  if (syncClose) syncClose.addEventListener('click', () => { syncBanner.hidden = true; });
  document.addEventListener('click', (event) => { if (event.target.closest('[data-sync-sheets]')) runSync(); });
  function showSyncBanner(text) {
    if (!syncBanner) return;
    document.getElementById('banner-sync-text').textContent = text;
    syncBanner.hidden = false;
  }

  function syncSummary(res, added, skipped) {
    const parts = [`Added ${added}`, `skipped ${skipped} repeat${skipped === 1 ? '' : 's'}`];
    if (res.unreadable) parts.push(`${res.unreadable} row${res.unreadable === 1 ? '' : 's'} could not be read`);
    if (res.uncategorized) parts.push(`${res.uncategorized} need a category (shown as Other)`);
    return `Sheets sync: ${parts.join(', ')}.`;
  }

  function runSync() {
    if (sheetsBusy) return Promise.resolve();
    if (isSample()) { showSyncBanner('Sheets sync works with your own data. Open Settings, then choose Use my own data.'); return Promise.resolve(); }
    const s = sheetsSettings();
    if (!sheetsReady(s)) { showSyncBanner('Set up Google Sheets first. Opening Settings.'); location.hash = '#preferences'; return Promise.resolve(); }
    if (navigator.onLine === false) { showSyncBanner('You are offline. Nothing changed on this device. Try again when you have internet.'); return Promise.resolve(); }
    sheetsBusy = true; updateSyncLabel();
    return KanopiSheets.pull(s).then((data) => {
      const res = KanopiSheets.importAll(data.config, data.tabs, { members: memberList, categories: D.categories, rules: D.rules || {}, vendorKey: Store.vendorKey });
      const have = new Set(records.filter((r) => r.kind === 'expense').map((r) => r.id));
      const fresh = res.records.filter((r) => !have.has(r.id));
      const stamp = Date.now();
      if (fresh.length) { writeRecords(fresh.map((r) => ({ ...r, updatedAt: stamp }))); refreshData(); }
      sheetsProblems = res.problems;
      const text = syncSummary(res, fresh.length, res.records.length - fresh.length);
      saveSheetsSettings({ lastSync: new Date().toISOString(), lastResult: text });
      showSyncBanner(res.problems.length ? `${text} ${res.problems[0]}${res.problems.length > 1 ? ` (+${res.problems.length - 1} more in Settings)` : ''}` : text);
    }).catch((err) => {
      const msg = err && err.message ? err.message : 'Sync did not finish.';
      saveSheetsSettings({ lastResult: `Last attempt failed: ${msg}` });
      showSyncBanner(msg);
    }).then(() => { sheetsBusy = false; updateSyncLabel(); route({ keepPlace: true }); });
  }

  function sheetsCard() {
    const s = sheetsSettings();
    const field = (id, label, key, hint) => `
      <div class="field"><label for="${id}">${label}</label>
        <input id="${id}" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" data-sheets-field="${key}" value="${esc(s[key] || '')}">
        ${hint ? `<p class="muted">${hint}</p>` : ''}</div>`;
    const status = sheetsReady(s)
      ? `<p class="row"><span>Sheet</span><span>${esc(s.sheetName || 'Chosen Sheet')}</span></p>
         <p class="row"><span>Last sync</span><span>${esc(s.lastSync ? whenText(s.lastSync) : 'None yet')}</span></p>
         ${s.lastResult ? `<p class="muted" role="status">${esc(s.lastResult)}</p>` : ''}
         ${sheetsProblems.length ? `<ul class="plain-list">${sheetsProblems.map((p) => `<li class="muted">${esc(p)}</li>`).join('')}</ul>` : ''}`
      : '<p class="muted">Not connected. Fill in the three values below, then choose your Sheet.</p>';
    return card('sheets-title', 'Google Sheets', `
      ${status}
      <form class="member-form sheets-form" data-sheets-form novalidate>
        ${field('sh-client', 'OAuth client ID', 'clientId')}
        ${field('sh-key', 'API key', 'apiKey')}
        ${field('sh-app', 'Project number', 'appId')}
        ${sheetsFormError ? `<p class="form-error" role="alert">${esc(sheetsFormError)}</p>` : ''}
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">${sheetsReady(s) ? 'Save and choose a different Sheet' : 'Save and choose Sheet'}</button>
          ${sheetsReady(s) ? '<button type="button" class="btn" data-sheets-disconnect>Disconnect</button>' : ''}
        </div>
      </form>
      <details class="how-to"><summary>One-time Google setup</summary>
        <ol class="muted">
          <li>In Google Cloud Console (free), create a project. Copy its project number.</li>
          <li>Turn on the Google Sheets API and the Google Picker API.</li>
          <li>Create an OAuth client ID of type Web. Add this app's web address under authorized JavaScript origins.</li>
          <li>Create an API key. Limit it to this app's web address and to the Picker API.</li>
          <li>On the consent screen, keep the app in testing and add you and your husband as test users.</li>
        </ol>
        <p class="muted">Kanopi asks only for access to the one Sheet you choose, and only reads it. The sign-in lasts about an hour and is never saved on this device. These three values are not passwords, so they are saved here and are not part of backups.</p>
      </details>
      <details class="how-to"><summary>How to lay out the Sheet</summary>
        <p class="muted">Add a tab named <strong>Config</strong>. Row 1 holds these headings. Each following row describes one bank tab.</p>
        <ul class="muted">
          <li><strong>Tab</strong>, <strong>Member</strong>: the bank tab's name, and whose it is (a family member's name).</li>
          <li><strong>Date</strong>, <strong>Description</strong>, <strong>Amount</strong>: the heading text used in row 1 of that bank tab. If the bank splits money in and out, use <strong>Debit</strong> and <strong>Credit</strong> instead of Amount.</li>
          <li>Optional: <strong>Bank</strong>, <strong>Account</strong> (Checking or Card), <strong>Category</strong> and <strong>ID</strong> (a heading in the bank tab), <strong>Date format</strong> (MDY or DMY), <strong>Spending</strong> (negative if charges show as minus, positive if they show as plus), <strong>Counts in</strong> (a name, or Joint).</li>
        </ul>
        <p class="muted">Paste each export over the top of the bank tab, starting at A1. Two identical purchases on the same day are kept as two. If you paste below old rows instead, an overlapping block counts as new purchases. Delete any account-number column before you paste.</p>
      </details>`);
  }

  function chooseSheet() {
    const s = sheetsSettings();
    sheetsFormError = '';
    if (navigator.onLine === false) { sheetsFormError = 'You are offline. Choosing a Sheet needs internet.'; route({ keepPlace: true, focus: '.form-error' }); return; }
    KanopiSheets.pickSheet(s).then((sheet) => {
      saveSheetsSettings({ sheetId: sheet.id, sheetName: sheet.name, lastResult: '' });
      sheetsProblems = [];
      route({ keepPlace: true });
    }).catch((err) => {
      sheetsFormError = err && err.message ? err.message : 'Could not choose a Sheet.';
      route({ keepPlace: true, focus: '.form-error' });
    });
  }

  // ---- Settings ----------------------------------------------------------

  // Family editing state. draft is the form being edited; editing is 'new' or a member id.
  let editing = null;
  let draft = null;
  let confirmingDelete = null;
  let formError = '';

  function memberHasItems(id) {
    if (records.some((r) => !r.deleted && r.kind !== 'member' && (r.owner === id || r.paidBy === id))) return true;
    const b = D.balances[id];
    if (b && (b.assets || b.liabilities)) return true;
    if (D.budget[id] && Object.keys(D.budget[id]).length) return true;
    if (Object.keys(D.accounts).some((k) => D.accounts[k].owner === id)) return true;
    if (D.bills.some((x) => x.owner === id)) return true;
    if (D.expenses.some((e) => e.owner === id || e.paidBy === id)) return true;
    if ((D.plan || []).some((p) => p.owner === id)) return true;
    if (D.sales.some((s) => s.owner === id)) return true;
    if (D.income.some((r) => r[id])) return true;
    return false;
  }

  function resetFamilyEditing() {
    editing = null; draft = null; confirmingDelete = null; formError = '';
  }

  function memberForm() {
    const isNew = editing === 'new';
    const title = isNew ? 'Add a family member' : `Edit ${esc(MEMBERS[editing].label)}`;
    const picks = AVATAR_CHOICES.map(([key, name]) => `
      <button type="button" class="pick" data-pick-avatar="${key}" aria-pressed="${draft.avatar === key}" aria-label="${esc(name)}" title="${esc(name)}">
        ${avatarFor(key, draft.color, draft.label || '?', false)}
      </button>`).join('');
    const swatches = COLORS.map(([hex, name]) => `
      <button type="button" class="swatch" data-pick-color="${hex}" aria-pressed="${draft.color === hex}" aria-label="${esc(name)}" title="${esc(name)}">
        <span style="background:${hex}"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8.5l3.2 3.2L13 5"/></svg></span>
      </button>`).join('');
    return `
      <form class="member-form" data-member-form novalidate>
        <h3 class="sub-label">${title}</h3>
        <div class="field">
          <label for="member-name">Name</label>
          <input id="member-name" type="text" maxlength="${MAX_NAME}" value="${esc(draft.label)}" autocomplete="off"
                 ${formError ? 'aria-invalid="true" aria-describedby="member-error"' : ''}>
          ${formError ? `<p class="form-error" id="member-error" role="alert">${esc(formError)}</p>` : ''}
        </div>
        <div class="field" role="group" aria-label="Avatar"><span class="field-label">Avatar</span><div class="pick-row">${picks}</div></div>
        <div class="field" role="group" aria-label="Color"><span class="field-label">Color</span><div class="pick-row">${swatches}</div></div>
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">${isNew ? 'Add member' : 'Save'}</button>
          <button type="button" class="btn" data-member-cancel>Cancel</button>
        </div>
      </form>`;
  }

  function memberRow(m) {
    if (editing === m.id) return `<li class="member-row member-edit">${memberForm()}</li>`;
    if (confirmingDelete === m.id) {
      return `
        <li class="member-row">
          ${avatarHtml(m.id)}
          <span class="pay-main">
            <span class="pay-name">Delete ${esc(m.label)}?</span>
            <span class="pay-meta">This can't be undone.</span>
          </span>
          <span class="member-actions">
            <button type="button" class="btn" data-member-cancel>Cancel</button>
            <button type="button" class="btn btn-danger" data-member-delete-confirm="${m.id}">Delete</button>
          </span>
        </li>`;
    }
    const has = memberHasItems(m.id);
    const only = memberList.length <= 1;
    const meta = has ? "Has accounts, budget or payments, so can't be deleted"
      : only ? 'Keep at least one member' : 'No accounts, budget or payments yet';
    return `
      <li class="member-row">
        ${avatarHtml(m.id)}
        <span class="pay-main">
          <span class="pay-name">${esc(m.label)}</span>
          <span class="pay-meta">${esc(meta)}</span>
        </span>
        <span class="member-actions">
          <button type="button" class="btn" data-member-edit="${m.id}" aria-label="Edit ${esc(m.label)}">Edit</button>
          <button type="button" class="btn" data-member-delete="${m.id}" aria-label="Delete ${esc(m.label)}" ${has || only ? 'disabled' : ''}>Delete</button>
        </span>
      </li>`;
  }

  // ---- Data: backup, restore, and which data to show ---------------------------------

  let dataPanel = null;     // null | 'export' | 'restore'
  let dataNote = null;      // { text, error }
  let exportError = '';
  let restore = null;       // { stage: 'pick' | 'password' | 'preview', env, fileName, plan, error }
  let lastExport = '';
  let lastRestore = '';

  function whenText(iso) {
    if (!iso) return 'None yet';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? 'None yet'
      : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function resetDataPanel() { dataPanel = null; exportError = ''; restore = null; imp = null; }

  const liveCount = () => records.filter((r) => !r.deleted && r.kind !== 'member').length;

  // ---- File import (Settings > Data) -----------------------------------------------

  let imp = null; // the import in progress

  const IMP_MODULES = {
    budget: 'Budget: bank or card transactions',
    activity: 'Portfolio: trades, dividends and contributions',
    holdings: 'Portfolio: holdings (positions)'
  };

  const savedFormats = (module) => records
    .filter((r) => r.kind === 'fmt' && !r.deleted && r.module === module)
    .map((r) => { let map = {}; try { map = JSON.parse(r.map) || {}; } catch (e) { /* ignore */ } return { id: r.id, name: r.name, map }; });

  const impAccounts = () => Object.keys(D.accounts).filter((id) => D.accounts[id].owner === imp.member || D.accounts[id].owner === 'shared');

  function importPanel() {
    if (!imp) return '';
    const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
    const err = imp.error ? `<p class="form-error" role="alert">${esc(imp.error)}</p>` : '';
    const memberName = (memberList.find((m) => m.id === imp.member) || {}).label || '';

    if (imp.stage === 'setup') {
      const portfolio = imp.module !== 'budget';
      const accts = impAccounts();
      return `
        <form class="member-form data-panel" data-imp-setup novalidate>
          <h3 class="sub-label">Import a bank or brokerage file</h3>
          <div class="field-row">
            <div class="field"><label for="imp-member">Family member</label>
              <select id="imp-member" data-imp="member">${memberList.map((m) => opt(m.id, m.label, imp.member)).join('')}</select></div>
            <div class="field"><label for="imp-module">Module</label>
              <select id="imp-module" data-imp="module">${Object.keys(IMP_MODULES).map((k) => opt(k, IMP_MODULES[k], imp.module)).join('')}</select></div>
          </div>
          <div class="field"><label for="imp-bank">${portfolio ? 'Brokerage' : 'Bank or card'}</label>
            <input id="imp-bank" type="text" maxlength="40" list="imp-banks" autocomplete="off" data-imp="bank" value="${esc(imp.bank)}" placeholder="${portfolio ? 'Fidelity' : 'Chase checking'}">
            <datalist id="imp-banks">${savedFormats(imp.module).map((f) => `<option value="${esc(f.name)}"></option>`).join('')}</datalist></div>
          ${portfolio ? `<div class="field"><label for="imp-account">Account</label>
            <select id="imp-account" data-imp="account"><option value="">Choose an account</option>${accts.map((id) => opt(id, `${D.accounts[id].name}${D.accounts[id].last4 ? ` ····${D.accounts[id].last4}` : ''}`, imp.account)).join('')}</select>
            ${accts.length ? '' : '<p class="muted">No accounts for this person yet. Add one under Portfolio > Accounts first.</p>'}</div>` : `
          <div class="field-row">
            <div class="field"><label for="imp-kind">Kind of account</label>
              <select id="imp-kind" data-imp="acctKind">${opt('checking', 'Checking or savings', imp.acctKind)}${opt('card', 'Credit card', imp.acctKind)}</select></div>
            <div class="field"><label for="imp-counts">Counts in</label>
              <select id="imp-counts" data-imp="countsIn">${opt('member', memberName, imp.countsIn)}${opt('shared', 'Joint', imp.countsIn)}</select></div>
          </div>`}
          <div class="field"><label for="imp-file">File (CSV)</label>
            <input id="imp-file" type="file" accept=".csv,.txt,text/csv,text/plain"></div>
          <div class="field"><label for="imp-paste">Or paste the rows, including the heading row</label>
            <textarea id="imp-paste" rows="4" data-imp="paste" spellcheck="false">${esc(imp.paste || '')}</textarea></div>
          <p class="muted" id="imp-floor" aria-live="polite">${floorText()}</p>
          <p class="muted">The file is read on this device only. Delete any account-number column first.</p>
          ${err}
          <div class="btn-row"><button type="submit" class="btn btn-primary">Next: match the columns</button><button type="button" class="btn" data-data-cancel>Cancel</button></div>
        </form>`;
    }

    const headers = imp.rows[imp.headerIdx].map((h, i) => ({ h, i })).filter((x) => x.h !== '');
    const sel = (key, label, required) => `
      <div class="field"><label for="map-${key}">${label}${required ? ' (required)' : ''}</label>
        <select id="map-${key}" data-imp-map="${key}"><option value="">${required ? 'Choose a column' : 'None'}</option>${headers.map((x) => opt(x.h, x.h, (imp.map || {})[key])).join('')}</select></div>`;
    const fmtSel = `<div class="field"><label for="map-dateFormat">Date order in the file</label>
      <select id="map-dateFormat" data-imp-map="dateFormat">${opt('MDY', 'Month/day/year', (imp.map || {}).dateFormat || 'MDY')}${opt('DMY', 'Day/month/year', (imp.map || {}).dateFormat)}</select></div>`;

    if (imp.stage === 'map') {
      const sample = imp.rows.slice(imp.headerIdx, imp.headerIdx + 4);
      const sampleTable = table('First rows of the file', sample[0].map((h) => ({ t: h || ' ' })), sample.slice(1).map((r) => r.map((c) => esc(c))));
      let fields = '';
      if (imp.module === 'budget') {
        fields = `<div class="field-row">${sel('date', 'Date', true)}${sel('description', 'Description', true)}</div>
          <div class="field-row">${sel('amount', 'Amount')}${sel('debit', 'Debit')}${sel('credit', 'Credit')}</div>
          <p class="muted">Choose Amount, or choose both Debit and Credit.</p>
          <div class="field-row">${sel('category', 'Category')}${sel('id', 'Bank reference ID')}</div>
          <div class="field-row">${fmtSel}<div class="field"><label for="map-spending">In the Amount column, spending shows as</label>
            <select id="map-spending" data-imp-map="spending">${opt('negative', 'A negative number', (imp.map || {}).spending || 'negative')}${opt('positive', 'A positive number', (imp.map || {}).spending)}</select></div></div>`;
      } else if (imp.module === 'activity') {
        fields = `<div class="field-row">${sel('date', 'Date', true)}${sel('action', 'Action', true)}</div>
          <div class="field-row">${sel('ticker', 'Ticker or symbol')}${sel('qty', 'Quantity')}${sel('amount', 'Amount', true)}</div>${fmtSel}`;
      } else {
        fields = `<div class="field-row">${sel('ticker', 'Ticker or symbol', true)}${sel('name', 'Name')}${sel('shares', 'Shares', true)}</div>
          <div class="field-row">${sel('price', 'Price')}${sel('value', 'Market value')}${sel('cost', 'Total cost basis')}${sel('type', 'Type')}</div>
          <p class="muted">Choose Price, or Market value (Kanopi divides by shares).</p>`;
      }
      return `
        <form class="member-form data-panel" data-imp-map-form novalidate>
          <h3 class="sub-label">Match the columns</h3>
          <p class="muted">${esc(IMP_MODULES[imp.module])} · ${esc(memberName)} · ${esc(imp.bank)}${imp.fromSaved ? '. Using the layout saved for this bank. Change it if the columns moved.' : '. Pick the column for each item. Kanopi remembers this for next time.'}</p>
          ${sampleTable}
          ${fields}
          ${err}
          <div class="btn-row"><button type="submit" class="btn btn-primary">Preview</button><button type="button" class="btn" data-imp-back>Back</button><button type="button" class="btn" data-data-cancel>Cancel</button></div>
        </form>`;
    }

    // preview
    const r = imp.result;
    const lines = [
      ['Rows in the file', r.rows],
      [imp.module === 'holdings' ? 'New holdings' : 'New, will be added', r.fresh.length]
    ];
    if (imp.module === 'holdings') { lines.push(['Already there, will be updated', r.same]); lines.push(['In this account but not in the file, will be removed', r.removed.length]); }
    else lines.push(['Already imported, skipped', r.same]);
    if (r.before) lines.push([`Dated before ${formatDate(parseDay(r.floor))}, already imported, skipped`, r.before]);
    if (r.unreadable) lines.push(['Could not be read', r.unreadable]);
    if (r.skipped) lines.push([imp.module === 'holdings' ? 'Repeated ticker, skipped' : 'Other kinds of rows, skipped', r.skipped]);
    if (r.uncategorized) lines.push(['No category yet (add one later)', r.uncategorized]);
    const first = r.fresh.slice(0, 10).map((x) => {
      if (x.kind === 'expense') return [esc(formatDate(parseDay(x.date))), esc(x.name), `<span class="pill">${esc(x.type)}</span>`, x.cat ? esc(D.categories[x.cat] || x.cat) : '—', money2.format(x.amount)];
      if (x.kind === 'ptx') return [esc(formatDate(parseDay(x.date))), esc(x.type), esc(x.ticker || '—'), x.qty ? String(x.qty) : '—', money2.format(x.amount)];
      return [`<strong>${esc(x.ticker)}</strong>`, esc(x.name), String(x.shares), money2.format(x.price), x.cost == null ? '—' : money.format(x.cost)];
    });
    const headRow = imp.module === 'budget' ? [{ t: 'Date' }, { t: 'Description' }, { t: 'Type' }, { t: 'Category' }, { t: 'Amount', num: true }]
      : imp.module === 'activity' ? [{ t: 'Date' }, { t: 'Type' }, { t: 'Ticker' }, { t: 'Shares', num: true }, { t: 'Amount', num: true }]
        : [{ t: 'Ticker' }, { t: 'Name' }, { t: 'Shares', num: true }, { t: 'Price', num: true }, { t: 'Cost', num: true }];
    const nothing = !r.fresh.length && !r.removed.length && !(imp.module === 'holdings' && r.same);
    return `
      <div class="member-form data-panel">
        <h3 class="sub-label">Ready to add</h3>
        <p class="muted">${esc(IMP_MODULES[imp.module])} · ${esc(memberName)} · ${esc(imp.bank)}</p>
        <ul class="plain-list">${lines.map(([a, b]) => `<li class="member-row"><span class="pay-main">${esc(a)}</span><span>${b}</span></li>`).join('')}</ul>
        ${r.problems.length ? `<ul class="plain-list">${r.problems.map((p) => `<li class="muted">${esc(p)}</li>`).join('')}</ul>` : ''}
        ${first.length ? `<h4 class="sub-label">First ${first.length} new</h4>${table('First new rows', headRow, first)}` : ''}
        ${imp.module === 'activity' ? '<p class="muted">Trades change the lots shown under Holdings. Keep the holdings for this account up to date too.</p>' : ''}
        ${nothing ? '<p class="muted">Nothing new to add.</p>' : ''}
        ${err}
        <div class="btn-row">
          ${nothing ? '' : '<button type="button" class="btn btn-primary" data-imp-add>Add to Kanopi</button>'}
          <button type="button" class="btn" data-imp-back>Back</button>
          <button type="button" class="btn" data-data-cancel>${nothing ? 'Close' : 'Cancel'}</button>
        </div>
      </div>`;
  }

  function startImport() {
    resetDataPanel(); dataNote = null;
    if (isSample()) { dataNote = { text: 'Import works with your own data. Choose "Use my own data" first.', error: true }; return; }
    if (!memberList.length) { dataNote = { text: 'Add a family member first (Settings > Family), so Kanopi knows who the file is for.', error: true }; return; }
    dataPanel = 'import';
    imp = { stage: 'setup', member: who !== 'together' ? who : (memberList[0] ? memberList[0].id : ''), module: 'budget', bank: '', account: '', countsIn: 'member', acctKind: 'checking', paste: '', text: '', fileName: '', error: '', map: {}, rows: null, headerIdx: 0, result: null, fromSaved: false };
  }

  // Latest date already on this device for a source (budget: member + bank + account; activity: account).
  // Tombstoned rows don't count, so deleting the newest row lets that day be imported again.
  function latestImportDate(pred) {
    let latest = '';
    records.forEach((r) => { if (!r.deleted && r.date && pred(r) && r.date > latest) latest = r.date; });
    return latest;
  }
  function importFloor() {
    if (!imp || imp.module === 'holdings') return '';
    if (imp.module === 'budget') {
      if (!imp.member || !imp.bank.trim()) return '';
      const src = KanopiImporter.srcKey(imp.member, imp.bank, imp.acctKind);
      return latestImportDate((r) => r.kind === 'expense' && r.src === src);
    }
    return imp.account ? latestImportDate((r) => r.kind === 'ptx' && r.account === imp.account) : '';
  }

  function floorText() {
    const f = importFloor();
    return f ? `The last import from this source runs through ${esc(formatDate(parseDay(f)))}. This file must start on or after that date, so rows already here are not added twice.` : '';
  }
  function updateFloorText() {
    const el = document.getElementById('imp-floor');
    if (el) el.innerHTML = floorText();
  }

  function impToMap() {
    const text = (imp.text || imp.paste || '').trim();
    imp.error = '';
    if (!imp.bank.trim()) { imp.error = 'Enter the bank or brokerage name.'; return false; }
    if (imp.module !== 'budget' && !imp.account) { imp.error = 'Choose the account.'; return false; }
    if (!text) { imp.error = 'Choose a file, or paste the rows.'; return false; }
    const parsed = KanopiImporter.parseCsv(text);
    if (parsed.error) { imp.error = parsed.error; return false; }
    imp.rows = parsed.rows;
    imp.headerIdx = KanopiImporter.findHeaderRow(parsed.rows);
    const saved = savedFormats(imp.module).find((f) => f.name.toLowerCase() === imp.bank.trim().toLowerCase());
    const heads = imp.rows[imp.headerIdx].map((h) => h.toLowerCase());
    const usable = saved && Object.keys(saved.map).every((k) => !saved.map[k] || k === 'dateFormat' || k === 'spending' || heads.indexOf(String(saved.map[k]).toLowerCase()) !== -1);
    imp.map = usable ? { ...saved.map } : {};
    imp.fromSaved = !!usable;
    imp.stage = 'map';
    return true;
  }

  function impPreview() {
    const m = imp.map;
    imp.error = '';
    const need = imp.module === 'budget' ? ['date', 'description'] : imp.module === 'activity' ? ['date', 'action', 'amount'] : ['ticker', 'shares'];
    const missing = need.filter((k) => !m[k]);
    if (missing.length) { imp.error = 'Choose a column for every item marked required.'; return false; }
    if (imp.module === 'budget' && !m.amount && !(m.debit && m.credit)) { imp.error = 'Choose the Amount column, or both Debit and Credit.'; return false; }
    if (imp.module === 'holdings' && !m.price && !m.value) { imp.error = 'Choose the Price or the Market value column.'; return false; }
    const rows = imp.rows.slice(imp.headerIdx);
    let out;
    if (imp.module === 'budget') {
      const member = memberList.find((x) => x.id === imp.member);
      out = KanopiSheets.parseTab(rows, {
        tab: 'import', member: member.label, bank: imp.bank.trim(), account: imp.acctKind, date: m.date, description: m.description,
        amount: m.amount || '', debit: m.debit || '', credit: m.credit || '', category: m.category || '', id: m.id || '',
        dateFormat: m.dateFormat || 'MDY', spending: m.spending || 'negative', countsIn: imp.countsIn === 'shared' ? 'Joint' : ''
      }, { members: memberList, categories: D.categories, rules: D.rules || {}, vendorKey: Store.vendorKey });
    } else if (imp.module === 'activity') {
      out = KanopiImporter.parseActivity(rows, m, { account: imp.account });
    } else {
      out = KanopiImporter.parseHoldings(rows, m, { account: imp.account });
    }
    if (out.problems.length && !out.records.length) { imp.error = out.problems[0]; return false; }
    const floor = importFloor();
    const before = floor ? out.records.filter((r) => r.date < floor).length : 0;
    if (floor) out.records = out.records.filter((r) => r.date >= floor);
    const have = new Set(records.map((r) => r.id));
    const fresh = out.records.filter((r) => !have.has(r.id));
    const fileIds = new Set(out.records.map((r) => r.id));
    const removed = imp.module === 'holdings'
      ? records.filter((r) => r.kind === 'holding' && !r.deleted && r.account === imp.account && !fileIds.has(r.id)) : [];
    imp.result = {
      rows: out.rows, all: out.records, fresh: imp.module === 'holdings' ? out.records.filter((r) => !have.has(r.id)) : fresh,
      same: out.records.length - (imp.module === 'holdings' ? out.records.filter((r) => !have.has(r.id)).length : fresh.length),
      unreadable: out.unreadable || 0, skipped: out.skipped || 0, uncategorized: out.uncategorized || 0, removed, problems: out.problems,
      before, floor
    };
    imp.stage = 'preview';
    return true;
  }

  function impAdd() {
    const r = imp.result;
    const stamp = Date.now();
    const toWrite = (imp.module === 'holdings' ? r.all : r.fresh).map((x) => ({ ...x, updatedAt: stamp }));
    const tombs = r.removed.map((x) => ({ id: x.id, kind: 'holding', updatedAt: stamp, deleted: true }));
    const map = {};
    Object.keys(imp.map).forEach((k) => { if (imp.map[k]) map[k] = imp.map[k]; });
    const fmt = { id: KanopiImporter.formatId(imp.module, imp.bank), kind: 'fmt', updatedAt: stamp, name: imp.bank.trim(), module: imp.module, map: JSON.stringify(map) };
    const list = toWrite.concat(tombs, [fmt]).map((x) => Store.clean(x)).filter(Boolean);
    const added = r.fresh.length;
    const label = { budget: 'transactions', activity: 'activity rows', holdings: 'holdings' }[imp.module];
    const isHold = imp.module === 'holdings';
    writeRecords(list);
    refreshData();
    resetDataPanel();
    dataNote = { text: `Added ${added} ${label}${isHold && r.same ? `, updated ${r.same}` : ''}${r.same && !isHold ? `, skipped ${r.same} already imported` : ''}.` };
  }

  function dataCard() {
    const field = (id, label, type, extra) => `
      <div class="field"><label for="${id}">${label}</label>
        <input id="${id}" type="${type}" autocomplete="${type === 'password' ? 'new-password' : 'off'}" ${extra || ''}></div>`;

    let panel = '';
    if (dataPanel === 'import') {
      panel = importPanel();
    } else if (dataPanel === 'export') {
      panel = `
        <form class="member-form data-panel" data-export-form novalidate>
          <h3 class="sub-label">Export a backup</h3>
          <p class="muted">The file holds everything on this device. Add a password to lock it. If you lose the password, nobody can open the file, including you.</p>
          ${field('export-pw', 'Password (optional)', 'password')}
          ${field('export-pw2', 'Confirm password', 'password')}
          ${exportError ? `<p class="form-error" role="alert">${esc(exportError)}</p>` : ''}
          <div class="btn-row">
            <button type="submit" class="btn btn-primary">Download backup</button>
            <button type="button" class="btn" data-data-cancel>Cancel</button>
          </div>
        </form>`;
    } else if (dataPanel === 'restore' && restore) {
      const err = restore.error ? `<p class="form-error" role="alert">${esc(restore.error)}</p>` : '';
      if (restore.stage === 'pick') {
        panel = `
          <div class="member-form data-panel">
            <h3 class="sub-label">${restore.mode === 'replace' ? 'Restore from backup' : "Upload another family member's backup"}</h3>
            <p class="muted">${restore.mode === 'replace' ? 'Choose a Kanopi backup file. Everything on this device will be replaced by what is in the file.' : "Choose the Kanopi backup file you were sent. You'll see what would change before anything is merged."}</p>
            <div class="field"><label for="restore-file">Backup file</label>
              <input id="restore-file" type="file" accept=".json,application/json"></div>
            ${err}
            <div class="btn-row"><button type="button" class="btn" data-data-cancel>Cancel</button></div>
          </div>`;
      } else if (restore.stage === 'password') {
        panel = `
          <form class="member-form data-panel" data-restore-pw-form novalidate>
            <h3 class="sub-label">This backup is locked</h3>
            <p class="muted">${esc(restore.fileName)}</p>
            ${field('restore-pw', 'Password', 'password')}
            ${err}
            <div class="btn-row">
              <button type="submit" class="btn btn-primary">Open backup</button>
              <button type="button" class="btn" data-data-cancel>Cancel</button>
            </div>
          </form>`;
      } else if (restore.mode === 'replace') {
        const incoming = restore.incoming.filter((r) => !r.deleted).length;
        panel = `
          <div class="member-form data-panel">
            <h3 class="sub-label">Replace everything on this device?</h3>
            <p class="muted">${esc(restore.fileName)}</p>
            <ul class="plain-list">
              <li class="member-row"><span class="pay-main">Records on this device now</span><span>${liveCount()}</span></li>
              <li class="member-row"><span class="pay-main">Records in the file</span><span>${incoming}</span></li>
            </ul>
            <p class="form-error" role="alert">Everything on this device will be erased and replaced with the file. This can't be undone. To keep a copy first, cancel and use Back up everything.</p>
            ${err}
            <div class="btn-row">
              <button type="button" class="btn btn-danger" data-restore-replace>Replace everything on this device</button>
              <button type="button" class="btn" data-data-cancel>Cancel</button>
            </div>
          </div>`;
      } else {
        const c = restore.plan.counts;
        const nothing = !restore.plan.apply.length;
        panel = `
          <div class="member-form data-panel">
            <h3 class="sub-label">Ready to merge</h3>
            <p class="muted">${esc(restore.fileName)}</p>
            <ul class="plain-list">
              <li><span>New to this device</span><span>${c.added}</span></li>
              <li><span>Newer in the file, will update</span><span>${c.newer}</span></li>
              <li><span>Newer on this device, kept</span><span>${c.older}</span></li>
              <li><span>Already the same</span><span>${c.same}</span></li>
            </ul>
            ${nothing ? '<p class="muted">Nothing to merge. This device already has everything in the file.</p>' : ''}
            ${err}
            <div class="btn-row">
              ${nothing ? '' : '<button type="button" class="btn btn-primary" data-restore-apply>Merge into this device</button>'}
              <button type="button" class="btn" data-data-cancel>${nothing ? 'Close' : 'Cancel'}</button>
            </div>
          </div>`;
      }
    }

    const note = dataNote ? `<p class="${dataNote.error ? 'form-error' : 'muted'}" role="${dataNote.error ? 'alert' : 'status'}">${esc(dataNote.text)}</p>` : '';
    const errNote = storeError ? `<p class="form-error" role="alert">${esc(storeError)}</p>` : '';

    return `
      <p class="row"><span>Showing</span><span>${isSample() ? 'Sample data' : 'Your data'}</span></p>
      <p class="row"><span>Stored on this device</span><span>${storeReady ? `${liveCount()} ${liveCount() === 1 ? 'record' : 'records'}` : 'Not available'}</span></p>
      <div class="btn-row">
        <button type="button" class="btn btn-primary" data-data-import ${storeReady ? '' : 'disabled'}>Import a bank or brokerage file</button>
        <button type="button" class="btn" data-data-restore ${storeReady ? '' : 'disabled'}>Upload another family member's backup</button>
      </div>
      <div class="btn-row">
        <button type="button" class="btn" data-data-export ${storeReady ? '' : 'disabled'}>Back up everything</button>
        <button type="button" class="btn" data-data-replace ${storeReady ? '' : 'disabled'}>Restore from backup</button>
      </div>
      <p class="muted">Upload merges a backup into what is here, and the newer edit wins. Restore erases this device first.</p>
      <div class="btn-row">
        ${isSample()
          ? `<button type="button" class="btn" data-data-mode="mine" ${storeReady ? '' : 'disabled'}>Use my own data</button>`
          : '<button type="button" class="btn" data-data-mode="sample">Show sample data</button>'}
      </div>
      ${panel}${note}${errNote}
      <p class="muted">${isSample()
        ? '"Use my own data" empties every page so only what you restore or import shows. Your sample data comes back with "Show sample data".'
        : '"Show sample data" switches back to the made-up numbers. Your own records stay on this device.'}</p>`;
  }

  function downloadText(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function setMode(mode) {
    resetBudgetTools();
    dataMode = mode;
    Store.setMeta('mode', mode).catch(() => {});
    syncMembers();
    refreshData();
  }

  function handleExport(form) {
    const pw = form.querySelector('#export-pw').value;
    const pw2 = form.querySelector('#export-pw2').value;
    exportError = '';
    if (pw !== pw2) { exportError = 'The two passwords do not match.'; route({ keepPlace: true, focus: '#export-pw' }); return; }
    if (pw && pw.length < 8) { exportError = 'Use at least 8 characters, or leave the password empty.'; route({ keepPlace: true, focus: '#export-pw' }); return; }
    Store.makeBackup(records, { password: pw, appVersion: V.version }).then((text) => {
      const day = new Date();
      const name = `kanopi-backup-${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}.json`;
      downloadText(name, text);
      lastExport = new Date().toISOString();
      Store.setMeta('lastExport', lastExport).catch(() => {});
      resetDataPanel();
      dataNote = { text: `Backup saved as ${name}${pw ? ', locked with your password' : ''}. Put it in your shared iCloud Drive folder.` };
      route({ keepPlace: true, focus: '[data-data-export]' });
    }).catch(() => {
      exportError = 'Could not make the backup. Try again.';
      route({ keepPlace: true, focus: '#export-pw' });
    });
  }

  function previewRestore(recs, fileName) {
    restore = { stage: 'preview', fileName, mode: (restore && restore.mode) || 'merge', incoming: recs, plan: Store.planMerge(records, recs) };
    route({ keepPlace: true, focus: '[data-restore-apply]' });
  }

  function handleRestoreFile(file) {
    if (!file) return;
    file.text().then((text) => {
      const parsed = Store.readBackup(text);
      if (parsed.encrypted) {
        restore = { stage: 'password', env: parsed.file, fileName: file.name };
        route({ keepPlace: true, focus: '#restore-pw' });
      } else {
        previewRestore(parsed.records, file.name);
      }
    }).catch((e) => {
      restore = { stage: 'pick', error: e.message || 'Could not read that file.' };
      route({ keepPlace: true, focus: '#restore-file' });
    });
  }

  function handleRestorePassword(form) {
    const pw = form.querySelector('#restore-pw').value;
    Store.openEncrypted(restore.env, pw).then((recs) => previewRestore(recs, restore.fileName)).catch((e) => {
      restore.error = e.message;
      route({ keepPlace: true, focus: '#restore-pw' });
    });
  }

  function applyReplace() {
    const incoming = restore.incoming.slice();
    const fileName = restore.fileName;
    Store.replaceAll(incoming).then(() => {
      records = incoming;
      syncMembers();
      const hasData = records.some((r) => !r.deleted && r.kind !== 'member');
      setMode(hasData ? 'mine' : dataMode);
      lastRestore = new Date().toISOString();
      Store.setMeta('lastRestore', lastRestore).catch(() => {});
      refreshData();
      resetDataPanel();
      dataNote = { text: `Replaced everything with ${fileName}.${hasData ? ' Now showing your data.' : ''}` };
      route({ keepPlace: true, focus: '[data-data-replace]' });
    }).catch(() => {
      restore.error = 'Could not save to this device. Nothing was changed.';
      route({ keepPlace: true, focus: '[data-restore-replace]' });
    });
  }

  function applyRestore() {
    const plan = restore.plan;
    const fileName = restore.fileName;
    Store.putRecords(plan.apply).then(() => {
      cacheRecords(plan.apply);
      syncMembers();
      const hasData = records.some((r) => !r.deleted && r.kind !== 'member');
      if (hasData && isSample()) setMode('mine');
      lastRestore = new Date().toISOString();
      Store.setMeta('lastRestore', lastRestore).catch(() => {});
      refreshData();
      resetDataPanel();
      dataNote = { text: `Merged ${fileName}: ${plan.counts.added} new, ${plan.counts.newer} updated.${hasData ? ' Now showing your data.' : ''}` };
      route({ keepPlace: true, focus: '[data-data-restore]' });
    }).catch(() => {
      restore.error = 'Could not save the merge to this device. Nothing was changed.';
      route({ keepPlace: true, focus: '[data-restore-apply]' });
    });
  }

  function renderSettings() {
    const full = memberList.length >= MAX_MEMBERS;
    return `
      <div class="stack">
        ${card('fam-title', 'Family',
          `<ul class="plain-list">${memberList.map(memberRow).join('')}
            ${editing === 'new' ? `<li class="member-row member-edit">${memberForm()}</li>` : ''}</ul>
           ${editing === 'new' ? '' : `<div class="btn-row"><button type="button" class="btn" data-member-add ${full ? 'disabled' : ''}>Add a family member</button></div>`}
           <p class="muted">${full ? `Up to ${MAX_MEMBERS} members. ` : ''}New members start with no data. A member who has accounts, budget items or payments can't be deleted. Changes are saved on this device only until sync is built.</p>`)}
        ${card('data-title', 'Data', dataCard())}
        ${card('sync-title', 'Sync',
          `<p class="row"><span>Method</span><span>Backup file shared through iCloud Drive</span></p>
           <p class="row"><span>Cadence</span><span>Monthly</span></p>
           <p class="row"><span>Last export</span><span>${esc(whenText(lastExport))}</span></p>
           <p class="row"><span>Last restore</span><span>${esc(whenText(lastRestore))}</span></p>
           <p class="muted">Restoring merges the file into this device. When both of you changed the same item, the newer edit wins.</p>`)}
        ${card('priv-title', 'Privacy',
          `<p class="muted">Kanopi never stores Social Security numbers, bank or account numbers, or logins. ${isSample() ? 'Everything you see now is sample data.' : 'Your data stays on this device. It leaves only when you export a backup.'}</p>`)}
        ${card('about-title', 'About',
          `<p class="row"><span>App</span><span>Kanopi</span></p>
           <p class="row"><span>Version</span><span>${esc(V.version)}</span></p>
           <p class="row"><span>Released</span><span>${esc(V.released)}</span></p>
           <p class="row"><span>Data</span><span>${isSample() ? 'Sample only' : 'Your data'}</span></p>
           <p class="btn-row"><button type="button" class="btn" data-check-version>Check for new version</button></p>
           <p class="muted" id="version-status" role="status" aria-live="polite"></p>
           <p class="muted">Red Panda and Koala's first joint project, started on November 21, 2026.</p>`)}
        ${card('design-title', 'Design', designCard())}
      </div>`;
  }

  // Settings > Design: the fonts, colours, buttons, icons and pills the app uses, shown as they look.
  function designCard() {
    const colours = [
      ['Mint', '#A8E6CF', 'Accents, Other income, highlights'],
      ['Mint soft', '#E6F7EF', 'Total rows, hover, group rows'],
      ['Leaf', '#2E9E76', 'Links, meters, focus, Investments income'],
      ['Leaf deep', '#1F7A5A', 'Positive amounts, Paycheck income, active tabs'],
      ['Ink', '#0E3B2B', 'Primary text, primary buttons'],
      ['Muted', '#3D5A4E', 'Secondary text'],
      ['Bark', '#7A5A3C', 'Danger buttons'],
      ['Money out', '#B3261E', 'Expense amounts'],
      ['Border', '#CFE6DA', 'Card edges, rules'],
      ['Page', '#F5FBF8', 'Page background'],
      ['Card', '#FFFFFF', 'Cards and inputs']
    ];
    const swatch = (name, hex, use) => `<li class="ds-sw"><span class="ds-chip" style="background:${hex}" aria-hidden="true"></span><span><strong>${esc(name)}</strong><br><span class="muted">${esc(hex)} · ${esc(use)}</span></span></li>`;
    const chart = PIE_COLORS.concat([PIE_OTHER]).map((c) => `<span class="ds-chip ds-chip-sm" style="background:${c}" title="${esc(c)}" aria-label="${esc(c)}"></span>`).join('');
    const navIcons = Array.from(document.querySelectorAll('.nav a')).map((a) => {
      const svg = a.querySelector('svg');
      return svg ? `<li class="ds-icon">${svg.outerHTML}<span class="muted">${esc(a.textContent.trim())}</span></li>` : '';
    }).join('');
    const members = memberList.map((m) => `<span class="ds-avatar">${avatarHtml(m.id)}<span class="muted">${esc(m.label)}</span></span>`).join('');
    return `
      <h3 class="ds-h">Fonts</h3>
      <p class="ds-title">Mouse Memoirs: titles and card headings</p>
      <p class="ds-body">Noto Sans regular: body text and table cells. <strong>Noto Sans bold (600 and 700): labels, names and amounts.</strong></p>
      <p class="muted">Titles use the Mouse Memoirs font. Everything else uses Noto Sans. Both are included in the app, so they work offline.</p>

      <h3 class="ds-h">Colours</h3>
      <ul class="ds-swatches" role="list">${colours.map(([n, h, u]) => swatch(n, h, u)).join('')}</ul>
      <p class="ds-h2">Chart colours</p>
      <p class="muted">Expense categories use these, in this order. Greens are reserved for income.</p>
      <div class="ds-chart-row">${chart}</div>

      <h3 class="ds-h">Buttons and links</h3>
      <div class="btn-row">
        <button type="button" class="btn">Button</button>
        <button type="button" class="btn btn-primary">Primary</button>
        <button type="button" class="btn btn-danger">Danger</button>
        <button type="button" class="btn" disabled>Disabled</button>
      </div>
      <p><button type="button" class="text-link link-btn">Text link</button></p>

      <h3 class="ds-h">Icon buttons</h3>
      <div class="btn-row">
        <button type="button" class="act-icon" aria-label="Edit sample" title="Edit">${ICON_PENCIL}</button>
        <button type="button" class="act-icon" aria-label="Delete sample" title="Delete">${ICON_TRASH}</button>
      </div>

      <h3 class="ds-h">Navigation icons</h3>
      <ul class="ds-icons" role="list">${navIcons}</ul>

      <h3 class="ds-h">Tags</h3>
      <div class="btn-row">
        <span class="pill">Yes</span>
        <span class="pill pill-off">No</span>
        <span class="pill pill-long">Long term</span>
        <span class="pill pill-short">Short term</span>
      </div>

      <h3 class="ds-h">Avatars</h3>
      <div class="ds-avatars">${members}</div>`;
  }

  // ---- Routing -----------------------------------------------------------

  const PAGES = {
    home: { title: 'Home', tab: 'home', render: renderHome },
    payments: { title: 'Upcoming payments', tab: 'home', render: renderPayments },
    portfolio: { title: 'Portfolio', doc: 'Composition', tab: 'portfolio', render: renderPortfolio },
    'portfolio-holdings': { title: 'Portfolio', doc: 'Holdings', tab: 'portfolio', render: renderHoldings },
    'portfolio-activity': { title: 'Portfolio', doc: 'Activity', tab: 'portfolio', render: renderActivity },
    'portfolio-accounts': { title: 'Portfolio', doc: 'Accounts', tab: 'portfolio', render: renderAccounts },
    'portfolio-performance': { title: 'Portfolio', doc: 'Performance', tab: 'portfolio', render: renderPerformance },
    taxes: { title: 'Taxes', tab: 'taxes', render: renderTaxes },
    budget: { title: 'Budget', doc: 'Overview', tab: 'budget', render: renderBudget },
    'budget-transactions': { title: 'Budget', doc: 'Transactions', tab: 'budget', render: renderTransactions },
    'budget-stores': { title: 'Budget', doc: 'Stores', tab: 'budget', render: renderStores },
    'budget-planner': { title: 'Budget', doc: 'Planner', tab: 'budget', render: renderPlanner },
    preferences: { title: 'Settings', tab: 'preferences', render: renderSettings }
  };

  const view = document.getElementById('view');

  let booted = false;

  // The lots popup lives outside the page so sorting or filtering behind it does not close it.
  const lotDialog = document.getElementById('lot-dialog');
  function openLots(ticker) {
    if (!lotDialog || typeof lotDialog.showModal !== 'function') return;
    const html = lotsDialog(ticker);
    if (!html) return;
    lotTrigger = ticker;
    lotDialog.innerHTML = html;
    lotDialog.showModal();
    const first = lotDialog.querySelector('[data-close-lots]');
    if (first) first.focus({ preventScroll: true });
  }
  if (lotDialog) {
    lotDialog.addEventListener('click', (e) => { if (e.target === lotDialog || e.target.closest('[data-close-lots]')) lotDialog.close(); });
    lotDialog.addEventListener('close', () => {
      const b = document.querySelector(`[data-open-lots="${lotTrigger}"]`);
      if (b) b.focus({ preventScroll: true });
    });
  }

  function route(opts) {
    if (!booted) return; // wait for stored data to load (init below)
    const keepPlace = !!(opts && opts.keepPlace);
    if (!keepPlace && lotDialog && lotDialog.open) lotDialog.close();
    let requested = location.hash.replace('#', '') || 'home';
    if (requested === 'budget-expenses') requested = 'budget-transactions';
    if (requested === 'portfolio-transactions') { requested = 'portfolio-activity'; history.replaceState(null, '', '#portfolio-activity'); }
    const key = Object.prototype.hasOwnProperty.call(PAGES, requested) ? requested : 'home';
    const page = PAGES[key];

    document.getElementById('page-title').textContent = page.title;
    const banner = document.getElementById('banner');
    if (banner) banner.textContent = isSample() ? 'Sample data. Not connected to any accounts.' : 'Your data, stored on this device only.';
    document.title = `${page.doc ? page.title + ' · ' + page.doc : page.title} · Kanopi`;
    view.innerHTML = page.render();
    syncPlanDialog(opts);
    renderWhoMenu();

    document.querySelectorAll('.nav a').forEach((a) => {
      const active = a.dataset.tab === page.tab;
      a.classList.toggle('active', active);
      if (active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    if (keepPlace) {
      // Changing a toggle: stay where you are and keep keyboard focus on the chosen button.
      const btn = opts.focus ? view.querySelector(opts.focus) : null;
      if (btn) btn.focus({ preventScroll: true });
    } else {
      window.scrollTo(0, 0);
      view.focus({ preventScroll: true });
    }
  }

  view.addEventListener('click', (event) => {
    const t = event.target;
    const w = t.closest('[data-who]');
    if (w) {
      setWho(w.dataset.who);
      route({ keepPlace: true, focus: `[data-who="${who}"]` });
      return;
    }
    if (t.closest('[data-check-version]')) { checkForNewVersion(); return; }
    if (t.closest('[data-reload-app]')) { window.location.reload(); return; }
    if (t.closest('[data-data-export]')) { resetDataPanel(); dataNote = null; dataPanel = 'export'; route({ keepPlace: true, focus: '#export-pw' }); return; }
    if (t.closest('[data-data-restore]')) { resetDataPanel(); dataNote = null; dataPanel = 'restore'; restore = { stage: 'pick', mode: 'merge' }; route({ keepPlace: true, focus: '#restore-file' }); return; }
    if (t.closest('[data-data-replace]')) { resetDataPanel(); dataNote = null; dataPanel = 'restore'; restore = { stage: 'pick', mode: 'replace' }; route({ keepPlace: true, focus: '#restore-file' }); return; }
    if (t.closest('[data-restore-replace]')) { applyReplace(); return; }
    if (t.closest('[data-data-import]')) { startImport(); route({ keepPlace: true, focus: dataPanel === 'import' ? '#imp-bank' : '[data-data-import]' }); return; }
    if (t.closest('[data-imp-back]')) { imp.stage = imp.stage === 'preview' ? 'map' : 'setup'; imp.error = ''; route({ keepPlace: true, focus: imp.stage === 'map' ? '[data-imp-map]' : '#imp-bank' }); return; }
    if (t.closest('[data-imp-add]')) { impAdd(); route({ keepPlace: true, focus: '[data-data-import]' }); return; }
    if (t.closest('[data-data-cancel]')) { resetDataPanel(); route({ keepPlace: true, focus: '[data-data-export]' }); return; }
    if (t.closest('[data-sheets-disconnect]')) {
      KanopiSheets.signOut(); saveSheetsSettings({ sheetId: '', sheetName: '', lastSync: '', lastResult: '' }); sheetsProblems = [];
      route({ keepPlace: true, focus: '#sh-client' }); return;
    }
    const modeBtn = t.closest('[data-data-mode]');
    if (modeBtn && !modeBtn.disabled) {
      const m = modeBtn.dataset.dataMode;
      setMode(m === 'mine' ? 'mine' : 'sample');
      dataNote = { text: m === 'mine' ? 'Now showing your own data. It is empty until you restore a backup or import files.' : 'Now showing sample data.' };
      route({ keepPlace: true, focus: m === 'mine' ? '[data-data-mode]' : '[data-data-mode]' });
      return;
    }
    if (t.closest('[data-restore-apply]')) { applyRestore(); return; }
    const histBtn = t.closest('[data-history]');
    if (histBtn) { historyView = histBtn.dataset.history === 'yoy' ? 'yoy' : 'quarters'; route({ keepPlace: true, focus: `[data-history="${historyView}"]` }); return; }
    const sortBtn = t.closest('[data-hold-sort]');
    if (sortBtn) {
      const k = sortBtn.dataset.holdSort;
      if (k === 'my') { holdSort = { key: 'my', dir: 'desc' }; route({ keepPlace: true, focus: '[data-hold-sort="my"]' }); return; }
      holdSort = holdSort.key === k ? { key: k, dir: holdSort.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: k === 'ticker' ? 'asc' : 'desc' };
      route({ keepPlace: true, focus: `[data-hold-sort="${k}"]` }); return;
    }
    if (t.closest('[data-open-groups]')) { groupsPanel = !groupsPanel; groupsDraft = null; holdNote = ''; route({ keepPlace: true, focus: groupsPanel ? '[data-group-input]' : '[data-open-groups]' }); return; }
    if (t.closest('[data-groups-cancel]')) { groupsPanel = false; groupsDraft = null; route({ keepPlace: true, focus: '[data-open-groups]' }); return; }
    const moveBtn = t.closest('[data-group-move]');
    if (moveBtn && !moveBtn.disabled) {
      const name = moveBtn.dataset.groupMove;
      moveGroup(name, Number(moveBtn.dataset.dir));
      route({ keepPlace: true, focus: `[data-group-move="${name.replace(/"/g, '\\"')}"][data-dir="${moveBtn.dataset.dir}"]:not([disabled]), [data-group-move="${name.replace(/"/g, '\\"')}"]:not([disabled])` }); return;
    }
    const lotBtn = t.closest('[data-open-lots]');
    if (lotBtn) { openLots(lotBtn.dataset.openLots); return; }
    const cyBtn = t.closest('[data-cyear]');
    if (cyBtn) { closedYear = Number(cyBtn.dataset.cyear); route({ keepPlace: true, focus: `[data-cyear="${cyBtn.dataset.cyear}"]` }); return; }
    if (t.closest('[data-open-acct]')) { openAcct(null); route({ keepPlace: true, focus: '#acct-name' }); return; }
    const acctEdit = t.closest('[data-acct-edit]');
    if (acctEdit) { openAcct(acctEdit.dataset.acctEdit); route({ keepPlace: true, focus: '#acct-name' }); return; }
    const acctDel = t.closest('[data-acct-delete]');
    if (acctDel) { acctConfirm = acctDel.dataset.acctDelete; acctNote = ''; route({ keepPlace: true, focus: '[data-acct-keep]' }); return; }
    if (t.closest('[data-acct-keep]')) { const was = acctConfirm; acctConfirm = null; route({ keepPlace: true, focus: `[data-acct-delete="${was}"]` }); return; }
    const acctOk = t.closest('[data-acct-delete-confirm]');
    if (acctOk) { deleteAcct(acctOk.dataset.acctDeleteConfirm); acctConfirm = null; route({ keepPlace: true, focus: '[data-open-acct]' }); return; }
    if (t.closest('[data-acct-cancel]')) { acctPanel = false; acctDraft = null; acctEditing = null; acctError = ''; route({ keepPlace: true, focus: '[data-open-acct]' }); return; }
    if (t.closest('[data-open-goals]')) { openGoals(); route({ keepPlace: true, focus: '[data-goal]' }); return; }
    if (t.closest('[data-open-cats]')) { openCats(); route({ keepPlace: true, focus: '[data-cat-name]' }); return; }
    if (t.closest('[data-open-tx]')) { openTx(); route({ keepPlace: true, focus: '#tx-name' }); return; }
    const txEdit = t.closest('[data-tx-edit]');
    if (txEdit) { openTxEdit(txEdit.dataset.txEdit); route({ keepPlace: true, focus: '#tx-name' }); return; }
    const txDel = t.closest('[data-tx-delete]');
    if (txDel) { txConfirm = txDel.dataset.txDelete; route({ keepPlace: true, focus: '[data-tx-delete-yes]' }); return; }
    if (t.closest('[data-tx-delete-no]')) { txConfirm = null; route({ keepPlace: true, focus: '[data-open-tx]' }); return; }
    const txYes = t.closest('[data-tx-delete-yes]');
    if (txYes) { deleteTx(txYes.dataset.txDeleteYes); route({ keepPlace: true, focus: '[data-open-tx]' }); return; }
    if (t.closest('[data-open-plan]')) { openPlan(null); route({ keepPlace: true, focus: '#plan-name' }); return; }
    const planEdit = t.closest('[data-plan-edit]');
    if (planEdit) {
      const item = (D.plan || []).find((p) => p.id === planEdit.dataset.planEdit);
      if (item) { openPlan(item); route({ keepPlace: true, focus: '#plan-name' }); }
      return;
    }
    const planDel = t.closest('[data-plan-delete]');
    if (planDel) { planConfirm = planDel.dataset.planDelete; route({ keepPlace: true, focus: '[data-plan-keep]' }); return; }
    if (t.closest('[data-plan-keep]')) { const was = planConfirm; planConfirm = null; route({ keepPlace: true, focus: `[data-plan-delete="${was}"]` }); return; }
    const planOk = t.closest('[data-plan-delete-confirm]');
    if (planOk) { deletePlan(planOk.dataset.planDeleteConfirm); planConfirm = null; route({ keepPlace: true, focus: '[data-open-plan]' }); return; }
    const planView = t.closest('[data-plan-view]');
    if (planView) { setWho(planView.dataset.planView); route(); return; }
    if (t.closest('[data-tx-clear]')) {
      txFilter = txFilterDefault();
      route({ keepPlace: true, focus: '#f-q' });
      return;
    }
    if (t.closest('[data-tool-cancel]')) {
      const back = budgetPanel === 'goals' ? '[data-open-goals]' : budgetPanel === 'cats' ? '[data-open-cats]' : planPanel ? '[data-open-plan]' : '[data-open-tx]';
      resetBudgetTools(); route({ keepPlace: true, focus: back }); return;
    }
    const catDel = t.closest('[data-cat-delete]');
    if (catDel && !catDel.disabled) { catConfirm = catDel.dataset.catDelete; toolError = ''; route({ keepPlace: true, focus: '[data-cat-keep]' }); return; }
    if (t.closest('[data-cat-keep]')) { const was = catConfirm; catConfirm = null; route({ keepPlace: true, focus: `[data-cat-delete="${was}"]` }); return; }
    const catOk = t.closest('[data-cat-delete-confirm]');
    if (catOk) { deleteCategory(catOk.dataset.catDeleteConfirm); catConfirm = null; route({ keepPlace: true, focus: '#cat-new' }); return; }
    const ruleDel = t.closest('[data-rule-remove]');
    if (ruleDel) { removeRule(ruleDel.dataset.ruleRemove); route({ keepPlace: true }); return; }
    const focusAfter = (sel) => route({ keepPlace: true, focus: sel });
    const nextColor = () => (COLORS.find((c) => !memberList.some((m) => m.color === c[0])) || COLORS[0])[0];
    const nextAvatar = () => (AVATAR_CHOICES.slice(2, 8).find((c) => !memberList.some((m) => m.avatar === c[0])) || AVATAR_CHOICES[2])[0];

    if (t.closest('[data-member-add]')) {
      if (memberList.length >= MAX_MEMBERS) return;
      resetFamilyEditing();
      editing = 'new';
      draft = { label: '', color: nextColor(), avatar: nextAvatar() };
      focusAfter('#member-name');
      return;
    }
    const edit = t.closest('[data-member-edit]');
    if (edit && MEMBERS[edit.dataset.memberEdit]) {
      const m = memberList.find((x) => x.id === edit.dataset.memberEdit);
      resetFamilyEditing();
      editing = m.id;
      draft = { label: m.label, color: m.color, avatar: m.avatar };
      focusAfter('#member-name');
      return;
    }
    if (t.closest('[data-member-cancel]')) {
      const was = confirmingDelete || (editing !== 'new' ? editing : null);
      resetFamilyEditing();
      focusAfter(was ? `[data-member-edit="${was}"]` : '[data-member-add]');
      return;
    }
    const pickA = t.closest('[data-pick-avatar]');
    if (pickA && draft) {
      draft.avatar = pickA.dataset.pickAvatar;
      focusAfter(`[data-pick-avatar="${draft.avatar}"]`);
      return;
    }
    const pickC = t.closest('[data-pick-color]');
    if (pickC && draft) {
      draft.color = pickC.dataset.pickColor;
      focusAfter(`[data-pick-color="${draft.color}"]`);
      return;
    }
    const del = t.closest('[data-member-delete]');
    if (del && !del.disabled) {
      resetFamilyEditing();
      confirmingDelete = del.dataset.memberDelete;
      focusAfter('[data-member-cancel]');
      return;
    }
    const delOk = t.closest('[data-member-delete-confirm]');
    if (delOk) {
      const id = delOk.dataset.memberDeleteConfirm;
      if (!memberHasItems(id) && memberList.length > 1) {
        const prevMembers = memberList;
        memberList = memberList.filter((m) => m.id !== id);
        if (who === id) setWho('together');
        saveMembers(prevMembers);
        rebuildMembers();
      }
      resetFamilyEditing();
      focusAfter('[data-member-add]');
      return;
    }
    const g = t.closest('[data-group]');
    if (g) {
      groupBy = g.dataset.group;
      route({ keepPlace: true, focus: `[data-group="${groupBy}"]` });
      return;
    }
    const p = t.closest('[data-period]');
    if (p) {
      period = p.dataset.period;
      route({ keepPlace: true, focus: `[data-period="${period}"]` });
    }
  });

  view.addEventListener('input', (event) => {
    const el = event.target;
    if (el.id === 'member-name' && draft) draft.label = el.value;
    else if (el.matches('[data-goal]') && goalsDraft) { const [o, c] = el.dataset.goal.split('|'); goalsDraft[o][c] = el.value; }
    else if (el.matches('[data-cat-name]') && catDraft) catDraft.names[el.dataset.catName] = el.value;
    else if (el.id === 'cat-new' && catDraft) catDraft.newName = el.value;
    else if (el.matches('[data-tx]') && txDraft && el.type !== 'checkbox') txDraft[el.dataset.tx] = el.value;
    else if (el.matches('[data-txf]')) { txFilter[el.dataset.txf] = el.value; updateTxResults(); }
    else if (el.matches('[data-imp]') && imp) { imp[el.dataset.imp] = el.value; if (el.dataset.imp === 'bank') updateFloorText(); }
    else if (el.matches('[data-group-input]')) { if (!groupsDraft) groupsDraft = {}; groupsDraft[el.dataset.groupInput] = el.value; }
    else if (el.matches('[data-acct]') && acctDraft) {
      if (el.dataset.acct === 'last4') { el.value = el.value.replace(/\D/g, '').slice(0, 4); }
      acctDraft[el.dataset.acct] = el.value;
    }
    else if (el.matches('[data-plan]') && planDraft) {
      planDraft[el.dataset.plan] = el.value;
      const m = document.getElementById('plan-monthly');
      if (m) m.textContent = planMonthlyText();
    }
  });

  view.addEventListener('change', (event) => {
    const el = event.target;
    if (el.id === 'restore-file') { handleRestoreFile(el.files && el.files[0]); return; }
    if (el.matches('[data-rule-cat]')) { setRule(el.dataset.ruleCat, el.value); route({ keepPlace: true, focus: `[data-rule-cat="${el.dataset.ruleCat}"]` }); return; }
    if (el.matches('[data-txf]')) { txFilter[el.dataset.txf] = el.value; updateTxResults(); return; }
    if (el.id === 'imp-file' && imp) {
      const f = el.files && el.files[0];
      if (!f) { imp.text = ''; imp.fileName = ''; return; }
      if (f.size > KanopiImporter.MAX_BYTES) { imp.error = 'That file is larger than 5 MB. Export a shorter date range.'; route({ keepPlace: true, focus: '#imp-file' }); return; }
      f.text().then((t) => { imp.text = t; imp.fileName = f.name; imp.error = ''; });
      return;
    }
    if (el.matches('[data-imp]') && imp) {
      imp[el.dataset.imp] = el.value;
      if (el.dataset.imp === 'acctKind' || el.dataset.imp === 'account') updateFloorText();
      if (el.dataset.imp === 'module' || el.dataset.imp === 'member') { if (el.dataset.imp === 'member') imp.account = ''; route({ keepPlace: true, focus: `#imp-${el.dataset.imp}` }); }
      return;
    }
    if (el.matches('[data-imp-map]') && imp) { imp.map[el.dataset.impMap] = el.value; return; }
    if (el.matches('[data-hold-group]')) { holdGroup = el.value; if (holdGroup === 'custom' && groupNames().length) holdSort = { key: 'my', dir: 'desc' }; else if (holdSort.key === 'my') holdSort = { key: 'value', dir: 'desc' }; route({ keepPlace: true, focus: '#hold-group' }); return; }
    if (el.matches('[data-acct]') && acctDraft) {
      acctDraft[el.dataset.acct] = el.value;
      if (el.dataset.acct === 'type') route({ keepPlace: true, focus: '#acct-type' });
      return;
    }
    if (el.matches('[data-plan]') && planDraft) {
      planDraft[el.dataset.plan] = el.value;
      if (el.dataset.plan === 'kind') route({ keepPlace: true, focus: '#plan-kind' });
      return;
    }
    if (!el.matches('[data-tx]') || !txDraft) return;
    const f = el.dataset.tx;
    if (f === 'name') suggestCategory();
    else if (f === 'cat') txDraft.catTouched = true;
    else if (f === 'type') { txDraft.type = el.value; txDraft.hint = ''; route({ keepPlace: true, focus: '#tx-type' }); }
  });

  view.addEventListener('submit', (event) => {
    if (event.target.matches('[data-sheets-form]')) {
      event.preventDefault();
      const vals = {};
      event.target.querySelectorAll('[data-sheets-field]').forEach((i) => { vals[i.dataset.sheetsField] = i.value.trim(); });
      if (!vals.clientId || !vals.apiKey || !vals.appId) { sheetsFormError = 'Fill in all three values.'; route({ keepPlace: true, focus: '.form-error' }); return; }
      if (!/^\d+$/.test(vals.appId)) { sheetsFormError = 'The project number is digits only.'; route({ keepPlace: true, focus: '.form-error' }); return; }
      saveSheetsSettings(vals); chooseSheet(); return;
    }
    if (event.target.matches('[data-export-form]')) { event.preventDefault(); handleExport(event.target); return; }
    if (event.target.matches('[data-restore-pw-form]')) { event.preventDefault(); handleRestorePassword(event.target); return; }
    if (event.target.matches('[data-goals-form]')) {
      event.preventDefault(); toolError = '';
      if (goalsDraft && saveGoals()) { budgetPanel = null; goalsDraft = null; route({ keepPlace: true, focus: '[data-open-goals]' }); } else route({ keepPlace: true, focus: '.form-error' });
      return;
    }
    if (event.target.matches('[data-cats-form]')) {
      event.preventDefault(); toolError = '';
      if (catDraft && saveCategories()) route({ keepPlace: true, focus: '#cat-new' }); else route({ keepPlace: true, focus: '.form-error' });
      return;
    }
    if (event.target.matches('[data-imp-setup]')) {
      event.preventDefault();
      if (imp) { const ta = event.target.querySelector('#imp-paste'); if (ta) imp.paste = ta.value; }
      if (imp && impToMap()) route({ keepPlace: true, focus: '[data-imp-map]' }); else route({ keepPlace: true, focus: '.form-error' });
      return;
    }
    if (event.target.matches('[data-imp-map-form]')) {
      event.preventDefault();
      if (imp && impPreview()) route({ keepPlace: true, focus: '[data-imp-add]' }); else route({ keepPlace: true, focus: '.form-error' });
      return;
    }
    if (event.target.matches('[data-groups-form]')) {
      event.preventDefault();
      const values = {};
      event.target.querySelectorAll('[data-group-input]').forEach((i) => { values[i.dataset.groupInput] = i.value; });
      saveGroups(values); groupsPanel = false; groupsDraft = null;
      route({ keepPlace: true, focus: '[data-open-groups]' }); return;
    }
    if (event.target.matches('[data-acct-form]')) {
      event.preventDefault(); acctError = '';
      if (acctDraft && saveAcct()) { acctPanel = false; acctDraft = null; acctEditing = null; route({ keepPlace: true, focus: '[data-open-acct]' }); } else route({ keepPlace: true, focus: '.form-error' });
      return;
    }
    if (event.target.matches('[data-plan-form]')) {
      event.preventDefault(); toolError = '';
      if (planDraft && savePlan()) { planPanel = false; planDraft = null; planEditing = null; route({ keepPlace: true, focus: '[data-open-plan]' }); } else route({ keepPlace: true, focus: '.form-error' });
      return;
    }
    if (event.target.matches('[data-tx-form]')) {
      event.preventDefault(); toolError = '';
      if (txDraft && saveTx()) { txDraft = null; route({ keepPlace: true, focus: '[data-open-tx]' }); } else route({ keepPlace: true, focus: '.form-error' });
      return;
    }
    if (!event.target.matches('[data-member-form]')) return;
    event.preventDefault();
    if (!draft) return;
    const name = draft.label.trim().replace(/\s+/g, ' ');
    const taken = memberList.some((m) => m.id !== editing && m.label.toLowerCase() === name.toLowerCase());
    if (!name) formError = 'Enter a name.';
    else if (/^(together|joint|shared)$/i.test(name)) formError = 'That name is reserved. Pick another.';
    else if (taken) formError = 'Someone already has that name.';
    else formError = '';
    if (formError) { route({ keepPlace: true, focus: '#member-name' }); return; }

    const prevMembers = memberList;
    if (editing === 'new') {
      let id;
      do { id = 'm' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); } while (MEMBERS[id]);
      memberList = memberList.concat({ id, label: name, color: draft.color, avatar: draft.avatar, updatedAt: Date.now() });
    } else {
      memberList = memberList.map((m) => (m.id === editing ? { ...m, label: name, color: draft.color, avatar: draft.avatar } : m));
    }
    const done = editing === 'new' ? '[data-member-add]' : `[data-member-edit="${editing}"]`;
    saveMembers(prevMembers);
    rebuildMembers();
    resetFamilyEditing();
    route({ keepPlace: true, focus: done });
  });

  window.addEventListener('hashchange', () => { resetFamilyEditing(); resetDataPanel(); dataNote = null; resetBudgetTools(); route(); });

  // Load the stored data, then draw the first page.
  async function init() {
    try {
      records = await Store.allRecords();
      dataMode = (await Store.getMeta('mode')) === 'mine' ? 'mine' : 'sample';
      lastExport = (await Store.getMeta('lastExport')) || '';
      lastRestore = (await Store.getMeta('lastRestore')) || '';
      storeReady = true;
    } catch (e) {
      storeError = 'This browser would not let Kanopi save data on this device, so changes will not be kept.';
      dataMode = 'sample';
    }
    syncMembers();
    recomputeSampleLimits();
    refreshData();
    booted = true;
    route();
    updateSyncLabel();
  }

  init();

  // ---- Update banner ---------------------------------------------------------------
  // Two messages: "a new version is ready" (a new service worker took over while the app was open),
  // and "updated to version X" (the first load after the version number changed).

  const updateBanner = document.getElementById('banner-update');
  const updateText = document.getElementById('banner-update-text');
  const updateRefresh = document.getElementById('banner-update-refresh');
  const updateClose = document.getElementById('banner-update-close');

  function showUpdateBanner(text, canRefresh) {
    if (!updateBanner) return;
    updateText.textContent = text;
    updateRefresh.hidden = !canRefresh;
    updateBanner.hidden = false;
  }

  // Asks the server (not the offline cache) for version.js and compares it with the running version.
  function checkForNewVersion() {
    const status = document.getElementById('version-status');
    if (!status) return;
    if (navigator.onLine === false) { status.textContent = 'You are offline. Connect to check for a new version.'; return; }
    status.textContent = 'Checking…';
    fetch('version.js?check=' + Date.now(), { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then((text) => {
        const m = text.match(/version:\s*'([^']+)'/);
        if (!m) throw new Error('no version found');
        const latest = m[1];
        if (latest === V.version) {
          status.textContent = `You have the latest version (${V.version}).`;
        } else {
          status.innerHTML = `Version ${esc(latest)} is available. <button type="button" class="btn" data-reload-app>Reload to update</button>`;
        }
      })
      .catch(() => { status.textContent = 'Could not check for a new version. Try again later.'; });
  }

  if (updateRefresh) updateRefresh.addEventListener('click', () => { window.location.reload(); });
  if (updateClose) updateClose.addEventListener('click', () => { updateBanner.hidden = true; });

  try {
    const seen = localStorage.getItem('kanopi-seen-version');
    if (seen && seen !== V.version) showUpdateBanner(`Kanopi was updated to version ${V.version}.`, false);
    localStorage.setItem('kanopi-seen-version', V.version);
  } catch (e) { /* storage unavailable: skip the message */ }

  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) showUpdateBanner('A new version of Kanopi is ready.', true);
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        // An app left open for days still checks for a new version when you come back to it.
        document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
      }).catch(() => {});
    });
  }
})();
