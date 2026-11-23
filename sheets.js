/* Kanopi: Google Sheets sync (read only).
 *
 * The Sheet has a "Config" tab and one tab per bank. This file knows how to
 *  - sign in to Google and let you pick the Sheet (permission: only the file you pick),
 *  - read the Config tab and the bank tabs,
 *  - turn bank rows into Kanopi transactions.
 * The parsing functions are plain functions so they can be tested without Google.
 *
 * Config tab, row 1 headings (any order, any capitalization):
 *   Tab, Member, Bank, Account, Date, Description, Amount, Debit, Credit,
 *   Category, ID, Date format, Spending, Counts in
 * "Date", "Description", "Amount" and the other column settings hold the heading text
 * used in row 1 of that bank's tab.
 */
(function (root) {
  'use strict';

  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const TRANSFER_WORDS = /\b(transfer|xfer|autopay|auto pay|auto-pay|online payment|payment thank you|payment - thank|payment to|credit card payment|card payment|epayment|e-payment)\b/i;
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  const norm = (s) => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
  const pad = (n) => String(n).padStart(2, '0');

  // ---- Reading cells -------------------------------------------------------

  function validDay(y, m, d) {
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  function fullYear(y) { return y < 100 ? (y >= 70 ? 1900 + y : 2000 + y) : y; }

  // Returns YYYY-MM-DD or '' when the cell is not a date. format: MDY (default), DMY or YMD.
  function parseDate(cell, format) {
    const s = String(cell == null ? '' : cell).trim();
    if (!s) return '';
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) {
      const y = +m[1]; const mo = +m[2]; const d = +m[3];
      return validDay(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : '';
    }
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/);
    if (m) {
      const a = +m[1]; const b = +m[2]; const y = fullYear(+m[3]);
      const dmy = String(format || '').toUpperCase() === 'DMY';
      const mo = dmy ? b : a; const d = dmy ? a : b;
      return validDay(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : '';
    }
    m = s.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})/) || null;
    if (m) {
      const mo = MONTHS.indexOf(m[1].toLowerCase()) + 1; const d = +m[2]; const y = +m[3];
      return mo && validDay(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : '';
    }
    m = s.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]*\.?,? (\d{4})/);
    if (m) {
      const mo = MONTHS.indexOf(m[2].toLowerCase()) + 1; const d = +m[1]; const y = +m[3];
      return mo && validDay(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : '';
    }
    return '';
  }

  // Returns a number (negative for "-5", "(5)" or "5-") or null when the cell is not an amount.
  function parseAmount(cell) {
    if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null;
    let s = String(cell == null ? '' : cell).trim();
    if (!s) return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/[$,\s]/g, '').replace(/^usd/i, '');
    if (/^-/.test(s)) { neg = !neg; s = s.slice(1); }
    if (/-$/.test(s)) { neg = !neg; s = s.slice(0, -1); }
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    const v = Math.round(parseFloat(s) * 100) / 100;
    return neg ? -v : v;
  }

  // Two 32-bit hashes joined, so two different rows are very unlikely to share an id.
  function hashText(text) {
    let h1 = 0x811c9dc5; let h2 = 0x01000193;
    for (let i = 0; i < text.length; i += 1) {
      const c = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
      h2 ^= h2 >>> 13;
    }
    return h1.toString(36) + h2.toString(36);
  }

  // ---- Config tab ----------------------------------------------------------

  const CONFIG_KEYS = {
    tab: 'tab', member: 'member', bank: 'bank', account: 'account', date: 'date', description: 'description',
    amount: 'amount', debit: 'debit', credit: 'credit', category: 'category', id: 'id',
    'date format': 'dateFormat', spending: 'spending', 'counts in': 'countsIn'
  };

  // Returns { entries: [...], problems: [...] }.
  function parseConfig(values) {
    const rows = Array.isArray(values) ? values : [];
    const problems = [];
    if (!rows.length) return { entries: [], problems: ['The Config tab is empty.'] };
    const head = rows[0].map(norm);
    const col = {};
    head.forEach((h, i) => { if (CONFIG_KEYS[h] && col[CONFIG_KEYS[h]] === undefined) col[CONFIG_KEYS[h]] = i; });
    ['tab', 'member', 'date', 'description'].forEach((k) => {
      if (col[k] === undefined) problems.push(`The Config tab needs a "${k === 'tab' ? 'Tab' : k === 'member' ? 'Member' : k === 'date' ? 'Date' : 'Description'}" column.`);
    });
    if (col.amount === undefined && col.debit === undefined && col.credit === undefined) problems.push('The Config tab needs an "Amount" column, or "Debit" and "Credit" columns.');
    if (problems.length) return { entries: [], problems };
    const get = (r, k) => (col[k] === undefined ? '' : String(r[col[k]] == null ? '' : r[col[k]]).trim());
    const entries = [];
    rows.slice(1).forEach((r, i) => {
      if (!r || !r.some((c) => String(c == null ? '' : c).trim())) return;
      const e = {
        tab: get(r, 'tab'), member: get(r, 'member'), bank: get(r, 'bank') || get(r, 'tab'),
        account: /card|credit/i.test(get(r, 'account')) ? 'card' : 'checking',
        date: get(r, 'date'), description: get(r, 'description'), amount: get(r, 'amount'),
        debit: get(r, 'debit'), credit: get(r, 'credit'), category: get(r, 'category'), id: get(r, 'id'),
        dateFormat: /^dmy$/i.test(get(r, 'dateFormat')) ? 'DMY' : 'MDY',
        spending: /^pos/i.test(get(r, 'spending')) ? 'positive' : 'negative',
        countsIn: get(r, 'countsIn'), line: i + 2
      };
      if (!e.tab) { problems.push(`Config row ${e.line}: the Tab name is empty.`); return; }
      if (!e.member) { problems.push(`Config row ${e.line} (${e.tab}): the Member is empty.`); return; }
      entries.push(e);
    });
    if (!entries.length && !problems.length) problems.push('The Config tab has no rows under the headings.');
    return { entries, problems };
  }

  // ---- Bank tab ------------------------------------------------------------

  // ctx: { members: [{id,label}], categories: {key: label}, rules: {vendorKey: catKey}, vendorKey(fn) }
  // Returns { records, counts: {rows, skipped, uncategorized}, problems }.
  function parseTab(values, cfg, ctx) {
    const problems = [];
    const out = { records: [], rows: 0, unreadable: 0, uncategorized: 0, problems };
    const rows = Array.isArray(values) ? values : [];
    if (!rows.length) { problems.push(`Tab "${cfg.tab}" is empty.`); return out; }
    const member = ctx.members.find((m) => norm(m.label) === norm(cfg.member) || m.id === cfg.member);
    if (!member) { problems.push(`Tab "${cfg.tab}": no family member named "${cfg.member}".`); return out; }
    let owner = member.id;
    if (cfg.countsIn) {
      if (/^(joint|shared|together)$/i.test(cfg.countsIn)) owner = 'shared';
      else {
        const o = ctx.members.find((m) => norm(m.label) === norm(cfg.countsIn));
        if (o) owner = o.id; else problems.push(`Tab "${cfg.tab}": "Counts in" says "${cfg.countsIn}", which is not a family member. Using ${member.label}.`);
      }
    }
    const head = rows[0].map(norm);
    const find = (name) => (name ? head.indexOf(norm(name)) : -1);
    const ci = {
      date: find(cfg.date), desc: find(cfg.description), amount: find(cfg.amount),
      debit: find(cfg.debit), credit: find(cfg.credit), cat: find(cfg.category), id: find(cfg.id)
    };
    const missing = [];
    if (ci.date < 0) missing.push(`Date ("${cfg.date}")`);
    if (ci.desc < 0) missing.push(`Description ("${cfg.description}")`);
    if (ci.amount < 0 && ci.debit < 0 && ci.credit < 0) missing.push(`Amount ("${cfg.amount || cfg.debit || cfg.credit}")`);
    if (missing.length) { problems.push(`Tab "${cfg.tab}": row 1 has no column for ${missing.join(', ')}.`); return out; }

    const catByLabel = {};
    Object.keys(ctx.categories).forEach((k) => { catByLabel[norm(ctx.categories[k])] = k; catByLabel[norm(k)] = k; });
    const seen = {};
    const bankKey = norm(cfg.bank).replace(/[^a-z0-9]+/g, '-');
    const cell = (r, i) => (i < 0 || r[i] == null ? '' : r[i]);

    rows.slice(1).forEach((r) => {
      if (!r || !r.some((c) => String(c == null ? '' : c).trim())) return;
      out.rows += 1;
      const date = parseDate(cell(r, ci.date), cfg.dateFormat);
      const name = String(cell(r, ci.desc)).trim().replace(/\s+/g, ' ');
      let spend = null; // positive = money out
      if (ci.debit >= 0 || ci.credit >= 0) {
        const d = parseAmount(cell(r, ci.debit)); const c = parseAmount(cell(r, ci.credit));
        if (d) spend = Math.abs(d); else if (c) spend = -Math.abs(c);
      }
      if (spend === null && ci.amount >= 0) {
        const a = parseAmount(cell(r, ci.amount));
        if (a !== null) spend = cfg.spending === 'positive' ? a : -a;
      }
      if (!date || !name || spend === null || spend === 0) { out.unreadable += 1; return; }

      const moneyIn = spend < 0;
      const amount = Math.abs(spend);
      const isTransferWord = TRANSFER_WORDS.test(name);
      let type;
      if (isTransferWord) type = 'transfer';
      else if (moneyIn) type = cfg.account === 'card' ? 'refund' : 'income';
      else type = 'expense';

      let cat = '';
      if (type === 'expense' || type === 'refund') {
        const typed = norm(cell(r, ci.cat));
        if (typed && catByLabel[typed]) cat = catByLabel[typed];
        if (!cat) {
          const key = ctx.vendorKey ? ctx.vendorKey(name) : '';
          if (key && ctx.rules && ctx.categories[ctx.rules[key]]) cat = ctx.rules[key];
        }
        if (!cat) out.uncategorized += 1;
      }

      // The same date, amount and name twice in one tab is two purchases, so each gets its own number.
      const base = `${member.id}|${bankKey}|${date}|${Math.round(amount * 100)}|${moneyIn ? 'in' : 'out'}|${norm(name)}`;
      seen[base] = (seen[base] || 0) + 1;
      const bankId = String(cell(r, ci.id)).trim();
      const id = bankId ? `x-${hashText(`${member.id}|${bankKey}|${bankId}`)}` : `x-${hashText(`${base}|${seen[base]}`)}`;
      const src = `${member.id}|${bankKey}|${cfg.account || ''}`;
      out.records.push({ id, kind: 'expense', date, name, type, cat, amount, paidBy: member.id, owner, src });
    });
    return out;
  }

  // Everything: config values + { tabName: values } -> { records, summary lines }.
  function importAll(configValues, tabValues, ctx) {
    const cfg = parseConfig(configValues);
    const result = { records: [], problems: cfg.problems.slice(), rows: 0, unreadable: 0, uncategorized: 0, tabs: 0 };
    cfg.entries.forEach((e) => {
      if (!tabValues[e.tab]) { result.problems.push(`The Sheet has no tab named "${e.tab}".`); return; }
      const t = parseTab(tabValues[e.tab], e, ctx);
      result.tabs += 1;
      result.records = result.records.concat(t.records);
      result.rows += t.rows; result.unreadable += t.unreadable; result.uncategorized += t.uncategorized;
      result.problems = result.problems.concat(t.problems);
    });
    return result;
  }

  // ---- Google (browser only) -----------------------------------------------

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Could not reach Google. Check your connection.'));
      document.head.appendChild(s);
    });
  }

  // The token lives in memory only. It is never written to this device.
  let token = null;
  let tokenExpires = 0;

  function signIn(clientId, interactive) {
    if (token && Date.now() < tokenExpires - 60000) return Promise.resolve(token);
    return loadScript('https://accounts.google.com/gsi/client').then(() => new Promise((resolve, reject) => {
      const client = root.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (resp) => {
          if (resp.error) { reject(new Error('Google sign-in did not finish.')); return; }
          token = resp.access_token;
          tokenExpires = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
          resolve(token);
        },
        error_callback: () => reject(new Error('Google sign-in was closed before it finished.'))
      });
      client.requestAccessToken({ prompt: interactive ? 'select_account' : '' });
    }));
  }

  function signOut() {
    const t = token;
    token = null; tokenExpires = 0;
    if (t && root.google && root.google.accounts) { try { root.google.accounts.oauth2.revoke(t, () => {}); } catch (e) { /* ignore */ } }
  }

  // Opens Google's file picker. With this permission, Kanopi can open only the Sheet you pick here.
  function pickSheet(opts) {
    return signIn(opts.clientId, true).then((tk) => loadScript('https://apis.google.com/js/api.js').then(() => new Promise((resolve, reject) => {
      root.gapi.load('picker', {
        callback: () => {
          const view = new root.google.picker.DocsView(root.google.picker.ViewId.SPREADSHEETS).setIncludeFolders(false).setSelectFolderEnabled(false);
          const picker = new root.google.picker.PickerBuilder()
            .addView(view).setOAuthToken(tk).setDeveloperKey(opts.apiKey).setAppId(opts.appId)
            .setCallback((data) => {
              const action = data[root.google.picker.Response.ACTION];
              if (action === root.google.picker.Action.PICKED) {
                const doc = data[root.google.picker.Response.DOCUMENTS][0];
                resolve({ id: doc[root.google.picker.Document.ID], name: doc[root.google.picker.Document.NAME] });
              } else if (action === root.google.picker.Action.CANCEL) reject(new Error('No Sheet was chosen.'));
            }).build();
          picker.setVisible(true);
        },
        onerror: () => reject(new Error('Could not load the Google file picker.'))
      });
    })));
  }

  // Loads Google's scripts ahead of time, so the sign-in window opens right after a tap.
  function preload() { loadScript('https://accounts.google.com/gsi/client').catch(() => {}); }

  function api(tk, url) {
    return fetch(url, { headers: { Authorization: `Bearer ${tk}` } }).then((res) => {
      if (res.status === 401) { token = null; throw new Error('Google sign-in expired. Tap Sync again.'); }
      if (res.status === 403 || res.status === 404) throw new Error('Kanopi cannot open that Sheet. Choose it again in Settings.');
      if (res.status === 400) throw new Error('Google could not read a tab listed in Config. Check the tab names.');
      if (!res.ok) throw new Error(`Google returned an error (${res.status}).`);
      return res.json();
    });
  }

  const quote = (name) => `'${String(name).replace(/'/g, "''")}'`;

  // Reads the Config tab and every bank tab it lists. Returns { config, tabs }.
  function pull(settings) {
    return signIn(settings.clientId, false).then((tk) => {
      const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(settings.sheetId)}/values:batchGet`;
      const opts = 'majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE';
      return api(tk, `${base}?ranges=${encodeURIComponent(quote('Config'))}&${opts}`).then((first) => {
        const config = (first.valueRanges && first.valueRanges[0] && first.valueRanges[0].values) || [];
        const names = [];
        parseConfig(config).entries.forEach((e) => { if (names.indexOf(e.tab) === -1) names.push(e.tab); });
        if (!names.length) return { config, tabs: {} };
        const q = names.map((n) => `ranges=${encodeURIComponent(quote(n))}`).join('&');
        return api(tk, `${base}?${q}&${opts}`).then((second) => {
          const tabs = {};
          names.forEach((n, i) => { tabs[n] = (second.valueRanges && second.valueRanges[i] && second.valueRanges[i].values) || []; });
          return { config, tabs };
        });
      });
    });
  }

  const api_ = { SCOPE, parseDate, parseAmount, parseConfig, parseTab, importAll, signIn, signOut, pickSheet, pull, hashText, preload };
  root.KanopiSheets = api_;
  if (typeof module !== 'undefined' && module.exports) module.exports = api_;
}(typeof window !== 'undefined' ? window : globalThis));
