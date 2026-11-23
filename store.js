// Kanopi on-device storage, backup files, and the "your data" builder.
// Everything lives in this browser's IndexedDB. Nothing is sent anywhere.
//
// Record shapes (every record has id, kind, updatedAt in ms; deleted:true marks a removed record):
//   member   { label, color, avatar }
//   account  { name, owner, acctType, acctClass, broker, last4, balance }   balance is negative for debts
//                acctClass: personal | pretax | posttax | k401; last4 is the last 4 digits only
//   holding  { account, ticker, name, type, shares, price, cost?, acquired? }  cost and acquired cover shares bought before the Activity history
//   fmt      { name, module, map }                              a saved column layout for one bank file; map is JSON
//   gorder   { names: [group names in the order you chose] }   id is always 'gorder'
//   tgroup   { ticker, group }                                  the named group a ticker belongs to in Holdings
//   hlabel   { account, ticker, type }                          your own type for a holding; imports never overwrite it
//   ptx      { date, type, ticker, qty, amount, account }      portfolio transaction
//   expense  { date, name, type, cat, amount, paidBy, owner } type: expense | refund | income | transfer
//   bill     { name, amount, day, owner }                      day of month, 1 to 28
//   budget   { owner, cat, limit }                             monthly limit
(function (root) {
  'use strict';

  const DB_NAME = 'kanopi';
  const DB_VERSION = 1;
  const KINDS = ['member', 'account', 'holding', 'ptx', 'expense', 'bill', 'budget', 'category', 'rule', 'plan', 'tgroup', 'hlabel', 'gorder', 'fmt'];
  const DATA_KINDS = KINDS.filter((k) => k !== 'member');
  const MAX_RECORDS = 50000;
  const MAX_FILE_BYTES = 25 * 1024 * 1024;
  const KDF_ITERATIONS = 600000;

  // ---- IndexedDB -----------------------------------------------------------

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!root.indexedDB) { reject(new Error('Storage is not available in this browser.')); return; }
      const req = root.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('records', { keyPath: 'id' }).createIndex('kind', 'kind');
        db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Could not open storage.'));
      req.onblocked = () => reject(new Error('Storage is busy. Close other Kanopi tabs and reload.'));
    });
    return dbPromise;
  }

  function run(storeNames, mode, work) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(storeNames, mode);
      let out;
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Storage write was cancelled.'));
      out = work(t);
    }));
  }

  function request(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function allRecords() {
    return open().then((db) => request(db.transaction('records', 'readonly').objectStore('records').getAll()));
  }

  function putRecords(list) {
    if (!list.length) return Promise.resolve();
    return run('records', 'readwrite', (t) => { list.forEach((r) => t.objectStore('records').put(r)); });
  }

  // Wipes every record on this device and stores the given ones.
  function replaceAll(list) {
    return run('records', 'readwrite', (t) => { const st = t.objectStore('records'); st.clear(); list.forEach((r) => st.put(r)); });
  }

  function getMeta(key) {
    return open().then((db) => request(db.transaction('meta', 'readonly').objectStore('meta').get(key)))
      .then((row) => (row ? row.value : undefined));
  }

  function setMeta(key, value) {
    return run('meta', 'readwrite', (t) => { t.objectStore('meta').put({ key, value }); });
  }

  // ---- Validation (backup files are untrusted input) ---------------------------

  const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const str = (v, max) => String(v === undefined || v === null ? '' : v).slice(0, max || 120);
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const dateStr = (v) => (typeof v === 'string' && DATE_RE.test(v) ? v : '');

  // ---- Transaction types and planner frequencies ---------------------------------------

  const TX_TYPES = ['expense', 'refund', 'income', 'transfer'];

  // [key, label, times per year]. Used when an item has no due date; otherwise the actual count in the month is used.
  const FREQ = [
    ['daily', 'Daily', 365], ['weekly', 'Weekly', 52], ['biweekly', 'Every 2 weeks', 26], ['semimonthly', 'Twice a month', 24],
    ['monthly', 'Monthly', 12], ['quarterly', 'Quarterly', 4], ['semiannual', 'Twice a year', 2], ['annual', 'Annually', 1]
  ];
  const FREQ_KEYS = FREQ.map((f) => f[0]);

  // How many times an item falls due in a calendar month (month is 0-based). Null when the schedule can't be worked out.
  function occurrencesIn(freq, due, year, month) {
    const daysIn = new Date(year, month + 1, 0).getDate();
    if (freq === 'daily') return daysIn;
    if (freq === 'semimonthly') return 2;
    if (freq === 'monthly') return 1;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due || '');
    if (!m) return null;
    const anchorDay = Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000;
    if (freq === 'weekly' || freq === 'biweekly') {
      const step = freq === 'weekly' ? 7 : 14;
      let n = 0;
      for (let d = 1; d <= daysIn; d += 1) {
        const day = Date.UTC(year, month, d) / 86400000;
        if ((((day - anchorDay) % step) + step) % step === 0) n += 1;
      }
      return n;
    }
    const every = { quarterly: 3, semiannual: 6, annual: 12 }[freq];
    if (!every) return null;
    const diff = (year * 12 + month) - (+m[1] * 12 + (+m[2] - 1));
    return ((diff % every) + every) % every === 0 ? 1 : 0;
  }

  // What one planner item costs (or brings in) in a month: the actual count of due dates in that month
  // (weekly can be 4 or 5), or the yearly average when there is no due date. ref is the month to use; default is this month.
  function monthlyOf(amount, freq, due, ref) {
    const f = FREQ.find((x) => x[0] === freq) || FREQ[4];
    const when = ref || new Date();
    const n = occurrencesIn(f[0], due, when.getFullYear(), when.getMonth());
    const count = n === null ? f[2] / 12 : n;
    return Math.round((Number(amount) || 0) * count * 100) / 100;
  }

  // Spending effect of a transaction: expenses add, refunds subtract, income and transfers are not spending.
  const spendOf = (e) => (e.type === 'refund' ? -e.amount : (!e.type || e.type === 'expense') ? e.amount : 0);

  function cleanRecord(r) {
    if (!r || typeof r !== 'object') return null;
    if (typeof r.id !== 'string' || !ID_RE.test(r.id)) return null;
    if (KINDS.indexOf(r.kind) === -1) return null;
    const updatedAt = Number(r.updatedAt);
    if (!Number.isFinite(updatedAt) || updatedAt < 0) return null;
    const base = { id: r.id, kind: r.kind, updatedAt };
    if (r.deleted === true) return { ...base, deleted: true };

    switch (r.kind) {
      case 'member':
        return { ...base, label: str(r.label, 20), color: str(r.color, 16), avatar: str(r.avatar, 20) };
      case 'account':
        return {
          ...base, name: str(r.name), owner: str(r.owner, 64), acctType: str(r.acctType, 40), balance: num(r.balance),
          acctClass: ['personal', 'pretax', 'posttax', 'k401'].indexOf(r.acctClass) !== -1 ? r.acctClass : 'personal',
          broker: str(r.broker, 40), last4: /^\d{4}$/.test(String(r.last4 || '')) ? String(r.last4) : ''
        };
      case 'fmt':
        return { ...base, name: str(r.name, 40), module: ['budget', 'activity', 'holdings'].indexOf(r.module) !== -1 ? r.module : 'budget', map: str(r.map, 1500) };
      case 'gorder':
        return { ...base, names: Array.isArray(r.names) ? r.names.map((n) => str(n, 30)).filter(Boolean).slice(0, 40) : [] };
      case 'tgroup':
        return { ...base, ticker: str(r.ticker, 16), group: str(r.group, 30) };
      case 'holding':
        return { ...base, account: str(r.account, 64), ticker: str(r.ticker, 16), name: str(r.name), type: str(r.type, 40), shares: num(r.shares), price: num(r.price), cost: r.cost === null || r.cost === undefined || r.cost === '' ? null : num(r.cost), acquired: dateStr(r.acquired) };
      case 'hlabel':
        return { ...base, account: str(r.account, 64), ticker: str(r.ticker, 16), type: str(r.type, 40) };
      case 'ptx':
        return { ...base, date: dateStr(r.date), type: str(r.type, 40), ticker: str(r.ticker, 16), qty: num(r.qty), amount: num(r.amount), account: str(r.account, 64) };
      case 'expense':
        return { ...base, date: dateStr(r.date), name: str(r.name), type: TX_TYPES.indexOf(r.type) !== -1 ? r.type : 'expense', cat: str(r.cat, 40), amount: num(r.amount), paidBy: str(r.paidBy, 64), owner: str(r.owner, 64), src: str(r.src, 120) };
      case 'bill':
        return { ...base, name: str(r.name), amount: num(r.amount), day: Math.min(28, Math.max(1, Math.round(num(r.day)) || 1)), owner: str(r.owner, 64) };
      case 'budget':
        return { ...base, owner: str(r.owner, 64), cat: str(r.cat, 40), limit: num(r.limit) };
      case 'category':
        return { ...base, label: str(r.label, 30) };
      case 'rule':
        return { ...base, vendor: str(r.vendor, 40), cat: str(r.cat, 40) };
      case 'plan':
        return { ...base, flow: r.flow === 'income' ? 'income' : 'expense', owner: str(r.owner, 64), cat: str(r.cat, 40), name: str(r.name, 60), freq: FREQ_KEYS.indexOf(r.freq) !== -1 ? r.freq : 'monthly', amount: num(r.amount), sub: r.flow === 'income' ? '' : (r.sub === 'yes' || r.sub === 'no' ? r.sub : ''), due: dateStr(r.due), incomeType: r.flow === 'income' ? str(r.incomeType, 20) : '' };
      default:
        return null;
    }
  }

  // ---- Merge: newer edit wins ----------------------------------------------------

  // Compares incoming records with what is on the device. Returns counts and the records to write.
  function planMerge(local, incoming) {
    const byId = new Map(local.map((r) => [r.id, r]));
    const counts = { added: 0, newer: 0, same: 0, older: 0 };
    const apply = [];
    incoming.forEach((r) => {
      const mine = byId.get(r.id);
      if (!mine) { if (!r.deleted) counts.added += 1; else counts.same += 1; apply.push(r); }
      else if (r.updatedAt > mine.updatedAt) { counts.newer += 1; apply.push(r); }
      else if (r.updatedAt < mine.updatedAt) counts.older += 1;
      else counts.same += 1;
    });
    return { counts, apply };
  }

  // ---- Backup files ----------------------------------------------------------------

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function toB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  function fromB64(text) {
    const bin = atob(text);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }

  function deriveKey(password, salt, iterations) {
    return root.crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
      .then((base) => root.crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
        base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']));
  }

  // Returns the backup file text. With a password the records are encrypted (AES-GCM, key from PBKDF2).
  function makeBackup(records, opts) {
    const o = opts || {};
    const header = { format: 'kanopi-backup', schema: 1, appVersion: o.appVersion || '', exportedAt: new Date().toISOString() };
    const payload = JSON.stringify({ records });
    if (!o.password) return Promise.resolve(JSON.stringify({ ...header, encrypted: false, payload: JSON.parse(payload) }, null, 1));

    const salt = root.crypto.getRandomValues(new Uint8Array(16));
    const iv = root.crypto.getRandomValues(new Uint8Array(12));
    return deriveKey(o.password, salt, KDF_ITERATIONS)
      .then((key) => root.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(payload)))
      .then((cipher) => JSON.stringify({
        ...header, encrypted: true,
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: KDF_ITERATIONS, salt: toB64(salt) },
        cipher: { name: 'AES-GCM', iv: toB64(iv) },
        data: toB64(new Uint8Array(cipher))
      }));
  }

  // Step 1 of a restore: read the file text. Returns { encrypted, header, records? }.
  function readBackup(text) {
    if (text.length > MAX_FILE_BYTES) throw new Error('That file is too large to be a Kanopi backup.');
    let file;
    try { file = JSON.parse(text); } catch (e) { throw new Error('That file is not a Kanopi backup.'); }
    if (!file || file.format !== 'kanopi-backup') throw new Error('That file is not a Kanopi backup.');
    if (file.schema !== 1) throw new Error('This backup was made by a newer version of Kanopi. Update the app first.');
    const header = { exportedAt: str(file.exportedAt, 40), appVersion: str(file.appVersion, 20) };
    if (file.encrypted) return { encrypted: true, header, file };
    return { encrypted: false, header, records: cleanList(file.payload && file.payload.records) };
  }

  function cleanList(list) {
    if (!Array.isArray(list)) throw new Error('This backup has no records.');
    if (list.length > MAX_RECORDS) throw new Error('This backup has too many records.');
    const out = [];
    list.forEach((r) => { const c = cleanRecord(r); if (c) out.push(c); });
    return out;
  }

  // Step 2 for encrypted files.
  function openEncrypted(file, password) {
    try {
      const k = file.kdf || {};
      if (k.name !== 'PBKDF2' || k.hash !== 'SHA-256' || !(k.iterations >= 100000 && k.iterations <= 5000000)) throw new Error('bad kdf');
      const salt = fromB64(String(k.salt));
      const iv = fromB64(String(file.cipher && file.cipher.iv));
      const data = fromB64(String(file.data));
      return deriveKey(password, salt, k.iterations)
        .then((key) => root.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data))
        .then((plain) => cleanList(JSON.parse(dec.decode(plain)).records),
          () => { throw new Error('Wrong password, or the file is damaged.'); });
    } catch (e) {
      return Promise.reject(new Error('This backup file is damaged.'));
    }
  }

  // ---- Turning records into the shape the pages read -----------------------------------

  const pad = (n) => String(n).padStart(2, '0');
  const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const daysBetween = (from, to) => Math.round((to - from) / 86400000);

  // ---- Vendor names: the same shop should always give the same key ------------------------

  // 'SQ *Trader Joe's #123' and 'TRADER JOES 456' both become 'trader joes'.
  function vendorKey(name) {
    return String(name || '').toLowerCase()
      .replace(/^(sq|tst|pp|pos|dd)\s*\*\s*/, '')
      .replace(/['\u2019]/g, '')
      .replace(/[#*]\s*[a-z0-9]*\d[a-z0-9]*/g, ' ')
      .replace(/\b\d+\b/g, ' ')
      .replace(/[^a-z&\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40)
      .trim();
  }

  const ruleId = (key) => 'r-' + key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

  function build(records, sample, today) {
    const live = records.filter((r) => !r.deleted);
    const of = (k) => live.filter((r) => r.kind === k);
    const members = of('member').map((m) => m.id);
    const fallbackMember = members[0] || 'shared';
    const owners = members.concat('shared');
    const ownerOk = (o) => owners.indexOf(o) !== -1;

    // Categories: the starter list, with renames and removals from stored category records.
    const categories = { ...sample.categories };
    records.filter((r) => r.kind === 'category' && r.deleted).forEach((r) => { delete categories[r.id]; });
    of('category').forEach((c) => { if (c.label) categories[c.id] = c.label; });
    delete categories.other;
    categories.other = 'Other';

    // Learned vendor names, only for categories that still exist.
    const rules = {};
    of('rule').forEach((r) => { if (r.vendor && categories[r.cat]) rules[r.vendor] = r.cat; });

    const tgroups = {};
    of('tgroup').forEach((g) => { if (g.ticker && g.group) tgroups[g.ticker] = g.group; });

    const typeLabels = {};
    of('hlabel').forEach((l) => { if (l.account && l.ticker && l.type) typeLabels[`${l.account}|${l.ticker}`] = l.type; });

    const gorderRec = of('gorder').find((g) => g.id === 'gorder');
    const gorder = gorderRec ? gorderRec.names : [];

    const balances = {};
    owners.forEach((o) => { balances[o] = { assets: 0, liabilities: 0 }; });
    const accounts = {};
    of('account').forEach((a) => {
      const owner = ownerOk(a.owner) ? a.owner : 'shared';
      accounts[a.id] = { name: a.name || 'Account', owner, cls: a.acctClass || 'personal', broker: a.broker || '', last4: a.last4 || '' };
      if (a.balance >= 0) balances[owner].assets += a.balance;
      else balances[owner].liabilities += -a.balance;
    });

    const holdings = of('holding').filter((h) => accounts[h.account])
      .map((h) => ({ ticker: h.ticker, name: h.name, fileType: h.type || 'Other', type: typeLabels[`${h.account}|${h.ticker}`] || h.type || 'Other', account: h.account, shares: h.shares, price: h.price, cost: h.cost == null ? undefined : h.cost, acquired: h.acquired || undefined }));

    const transactions = of('ptx').filter((t) => accounts[t.account] && t.date)
      .map((t) => ({ date: t.date, daysAgo: daysBetween(parseDay(t.date), today), type: t.type || 'Buy', ticker: t.ticker, qty: t.qty || undefined, amount: t.amount, account: t.account }));

    const expenseRecs = of('expense').filter((e) => e.date).map((e) => {
      const type = TX_TYPES.indexOf(e.type) !== -1 ? e.type : 'expense';
      const hasCat = type === 'expense' || type === 'refund';
      return {
        date: parseDay(e.date),
        daysAgo: daysBetween(parseDay(e.date), today),
        name: e.name || 'Transaction',
        type,
        cat: hasCat ? (categories[e.cat] ? e.cat : (e.cat ? 'other' : '')) : '',
        amount: e.amount,
        paidBy: members.indexOf(e.paidBy) !== -1 ? e.paidBy : fallbackMember,
        owner: ownerOk(e.owner) ? e.owner : 'shared',
        id: e.id,
        src: e.src || ''
      };
    });

    // Planner items.
    const plan = of('plan').filter((p) => ownerOk(p.owner) && p.amount > 0 && (p.flow === 'income' || categories[p.cat]))
      .map((p) => ({ id: p.id, flow: p.flow, owner: p.owner, cat: p.flow === 'income' ? '' : p.cat, name: p.name || 'Item', freq: p.freq, amount: p.amount, sub: p.sub || '', due: p.due || '', incomeType: p.flow === 'income' ? (p.incomeType || '') : '' }));

    const bills = of('bill').map((b) => ({ name: b.name || 'Bill', amount: b.amount, day: b.day, owner: ownerOk(b.owner) ? b.owner : 'shared' }));

    // Budget: spent comes from this month's transactions. The limit comes from the planner,
    // unless a goal was typed in for that category (a budget record), which wins.
    const budget = {};
    owners.forEach((o) => { budget[o] = {}; });
    const monthKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
    expenseRecs.forEach((e) => {
      const spend = spendOf(e);
      if (!spend || isoDay(e.date).slice(0, 7) !== monthKey) return;
      const row = budget[e.owner][e.cat] || (budget[e.owner][e.cat] = [0, 0]);
      row[0] += spend;
    });
    // A cancelled subscription stays in the planner but no longer counts toward goals.
    plan.filter((p) => p.flow === 'expense' && p.sub !== 'no').forEach((p) => {
      const row = budget[p.owner][p.cat] || (budget[p.owner][p.cat] = [0, 0]);
      row[1] = Math.round((row[1] + monthlyOf(p.amount, p.freq, p.due)) * 100) / 100;
    });
    of('budget').forEach((b) => {
      if (!ownerOk(b.owner) || !categories[b.cat]) return;
      let row = budget[b.owner][b.cat];
      if (!row) { if (!(b.limit > 0)) return; row = budget[b.owner][b.cat] = [0, 0]; }
      row[1] = b.limit;
      if (row[0] === 0 && row[1] === 0) delete budget[b.owner][b.cat];
    });

    // Quarters and year over year, from the expenses.
    const quarterOf = (d) => ({ y: d.getFullYear(), q: Math.floor(d.getMonth() / 3) });
    const total = (test) => {
      const t = {};
      owners.forEach((o) => { t[o] = 0; });
      expenseRecs.forEach((e) => { if (test(e.date)) t[e.owner] += spendOf(e); });
      return t;
    };
    const cur = quarterOf(today);
    const lastQuarters = [3, 2, 1].map((back) => {
      let y = cur.y; let q = cur.q - back;
      while (q < 0) { q += 4; y -= 1; }
      return { y, q };
    });
    const quarters = lastQuarters.map(({ y, q }) => ({
      label: `Q${q + 1} ${y}`,
      ...total((d) => d.getFullYear() === y && Math.floor(d.getMonth() / 3) === q)
    }));
    const lastQ = lastQuarters[2];
    const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const monthName = (d) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const sameMonth = (ref, yearOffset) => (d) => d.getFullYear() === ref.getFullYear() + yearOffset && d.getMonth() === ref.getMonth();
    const yoy = {
      month: {
        thisLabel: monthName(prevMonth),
        lastLabel: monthName(new Date(prevMonth.getFullYear() - 1, prevMonth.getMonth(), 1)),
        thisYear: total(sameMonth(prevMonth, 0)),
        lastYear: total(sameMonth(prevMonth, -1))
      },
      quarter: {
        thisLabel: `Q${lastQ.q + 1} ${lastQ.y}`,
        lastLabel: `Q${lastQ.q + 1} ${lastQ.y - 1}`,
        thisYear: total((d) => d.getFullYear() === lastQ.y && Math.floor(d.getMonth() / 3) === lastQ.q),
        lastYear: total((d) => d.getFullYear() === lastQ.y - 1 && Math.floor(d.getMonth() / 3) === lastQ.q)
      }
    };

    return {
      balances,
      trip: { name: 'Trip name TBD', saved: 0, target: 0, targetDate: 'Target date TBD' },
      categories,
      rules,
      tgroups,
      gorder,
      budget,
      quarters,
      yoy,
      expenses: expenseRecs,
      plan,
      bills,
      accounts,
      ownerLabels: {},
      holdings,
      transactions,
      periods: sample.periods,
      perf: { portfolio: {}, benchmarks: sample.perf.benchmarks },
      income: [],
      sales: [],
      taxPayments: [],
      plannedSales: [],
      planRates: sample.planRates,
      signals: []
    };
  }

  root.KanopiStore = {
    KINDS, DATA_KINDS, TX_TYPES, FREQ, monthlyOf, spendOf, vendorKey, ruleId, open, allRecords, putRecords, replaceAll, clean: cleanRecord, getMeta, setMeta,
    planMerge, makeBackup, readBackup, openEncrypted, build
  };
})(window);
