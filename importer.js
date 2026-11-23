/* Kanopi: file import (bank, card and brokerage CSV files).
 *
 * Plain functions with no page code. They rely on sheets.js for reading dates, amounts and bank rows.
 * Nothing here talks to the network; the file is read on this device.
 */
(function (root) {
  'use strict';

  const MAX_BYTES = 5 * 1024 * 1024;
  const MAX_ROWS = 20000;

  // ---- CSV -----------------------------------------------------------------

  function detectDelimiter(text) {
    const line = text.split(/\r?\n/).find((l) => l.trim()) || '';
    let best = ','; let bestN = -1;
    [',', '\t', ';'].forEach((d) => {
      let n = 0; let q = false;
      for (let i = 0; i < line.length; i += 1) {
        if (line[i] === '"') q = !q;
        else if (!q && line[i] === d) n += 1;
      }
      if (n > bestN) { best = d; bestN = n; }
    });
    return best;
  }

  // Returns { rows } or { error }.
  function parseCsv(input) {
    let text = String(input == null ? '' : input);
    if (text.length > MAX_BYTES) return { error: 'That file is larger than 5 MB. Export a shorter date range.' };
    text = text.replace(/^﻿/, '');
    if (!text.trim()) return { error: 'The file is empty.' };
    const delim = detectDelimiter(text);
    const rows = [];
    let row = []; let cell = ''; let q = false;
    for (let i = 0; i < text.length; i += 1) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i += 1; } else q = false; } else cell += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cell.trim()); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i += 1;
        row.push(cell.trim()); cell = '';
        if (row.some((x) => x !== '')) rows.push(row);
        row = [];
        if (rows.length > MAX_ROWS) return { error: `More than ${MAX_ROWS} rows. Export a shorter date range.` };
      } else cell += c;
    }
    row.push(cell.trim());
    if (row.some((x) => x !== '')) rows.push(row);
    if (rows.length < 2) return { error: 'The file needs a heading row and at least one row of data.' };
    return { rows };
  }

  // The heading row is the first row with 3 or more filled cells and no date or amount in it.
  function findHeaderRow(rows) {
    const S = root.KanopiSheets;
    for (let i = 0; i < Math.min(rows.length, 30); i += 1) {
      const filled = rows[i].filter((c) => c !== '');
      if (filled.length >= 3 && !filled.some((c) => S.parseDate(c) || (S.parseAmount(c) !== null && /\d/.test(c)))) return i;
    }
    return 0;
  }

  // ---- Portfolio files -----------------------------------------------------

  function normalizeAction(text) {
    const t = String(text || '').toLowerCase();
    if (/\b(buy|bought|purchase|reinvest)/.test(t)) return 'Buy';
    if (/\b(sell|sold|redemption)/.test(t)) return 'Sell';
    if (/dividend|distribution|interest|\bdiv\b/.test(t)) return 'Dividend';
    if (/contribution|deposit|transfer in|payroll/.test(t)) return 'Contribution';
    return '';
  }

  const cleanTicker = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 10);

  // map: { date, action, ticker, qty, amount, dateFormat }. rows[0] is the heading row.
  // When the file has an Account name column, each row is matched to a Kanopi account by its name (not case-sensitive).
  // ctx.accountByName maps lowercased account names to account ids. Rows whose name is unknown are left out and listed.
  function accountFor(ctx, nameCell) {
    if (nameCell === undefined) return { id: ctx.account };
    const key = String(nameCell || '').trim().toLowerCase();
    const id = (ctx.accountByName || {})[key];
    return id ? { id } : { name: String(nameCell || '').trim() || '(blank)' };
  }

  function parseActivity(rows, map, ctx) {
    const S = root.KanopiSheets;
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const col = (name) => (name ? head.indexOf(String(name).trim().toLowerCase()) : -1);
    const ci = { date: col(map.date), action: col(map.action), ticker: col(map.ticker), qty: col(map.qty), amount: col(map.amount), account: col(map.accountName) };
    const out = { records: [], rows: 0, unreadable: 0, skipped: 0, problems: [], unmatched: [], touched: [] };
    if (ci.date < 0 || ci.action < 0 || ci.amount < 0) { out.problems.push('Choose the Date, Action and Amount columns.'); return out; }
    if (map.accountName && ci.account < 0) { out.problems.push('The Account name column is not in the file.'); return out; }
    const seen = {};
    rows.slice(1).forEach((r) => {
      if (!r.some((c) => c !== '')) return;
      out.rows += 1;
      const date = S.parseDate(r[ci.date], map.dateFormat);
      const type = normalizeAction(r[ci.action]);
      const amountRaw = S.parseAmount(r[ci.amount]);
      if (!date || amountRaw === null) { out.unreadable += 1; return; }
      if (!type) { out.skipped += 1; return; }
      const ticker = ci.ticker >= 0 ? cleanTicker(r[ci.ticker]) : '';
      const qtyRaw = ci.qty >= 0 ? S.parseAmount(r[ci.qty]) : null;
      const qty = qtyRaw === null ? 0 : Math.abs(qtyRaw);
      const amount = Math.abs(amountRaw);
      if ((type === 'Buy' || type === 'Sell') && (!ticker || !(qty > 0))) { out.unreadable += 1; return; }
      const acct = accountFor(ctx, ci.account >= 0 ? r[ci.account] : undefined);
      if (!acct.id) { out.unmatched.push(acct.name); return; }
      const base = `${acct.id}|${date}|${type}|${ticker}|${qty}|${Math.round(amount * 100)}`;
      seen[base] = (seen[base] || 0) + 1;
      const rec = { id: `p-${S.hashText(`${base}|${seen[base]}`)}`, kind: 'ptx', date, type, ticker, qty, amount, account: acct.id };
      out.records.push(rec);
      if (out.touched.indexOf(acct.id) === -1) out.touched.push(acct.id);
    });
    return out;
  }

  // map: { ticker, name, shares, price, value, cost, type }.
  function parseHoldings(rows, map, ctx) {
    const S = root.KanopiSheets;
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const col = (name) => (name ? head.indexOf(String(name).trim().toLowerCase()) : -1);
    const ci = { ticker: col(map.ticker), name: col(map.name), shares: col(map.shares), price: col(map.price), value: col(map.value), cost: col(map.cost), type: col(map.type), account: col(map.accountName) };
    const out = { records: [], rows: 0, unreadable: 0, skipped: 0, problems: [], unmatched: [], touched: [] };
    if (ci.ticker < 0 || ci.shares < 0 || (ci.price < 0 && ci.value < 0)) { out.problems.push('Choose the Ticker and Shares columns, and either Price or Value.'); return out; }
    if (map.accountName && ci.account < 0) { out.problems.push('The Account name column is not in the file.'); return out; }
    const seen = {};
    rows.slice(1).forEach((r) => {
      if (!r.some((c) => c !== '')) return;
      out.rows += 1;
      const ticker = cleanTicker(r[ci.ticker]);
      const shares = S.parseAmount(r[ci.shares]);
      if (!ticker || shares === null || !(shares > 0)) { out.unreadable += 1; return; }
      let price = ci.price >= 0 ? S.parseAmount(r[ci.price]) : null;
      if ((price === null || !(price > 0)) && ci.value >= 0) { const v = S.parseAmount(r[ci.value]); price = v !== null && shares ? v / shares : null; }
      if (price === null || !(price >= 0)) { out.unreadable += 1; return; }
      const acct = accountFor(ctx, ci.account >= 0 ? r[ci.account] : undefined);
      if (!acct.id) { out.unmatched.push(acct.name); return; }
      if (seen[`${acct.id}|${ticker}`]) { out.skipped += 1; return; }
      seen[`${acct.id}|${ticker}`] = true;
      if (out.touched.indexOf(acct.id) === -1) out.touched.push(acct.id);
      const cost = ci.cost >= 0 ? S.parseAmount(r[ci.cost]) : null;
      const name = ci.name >= 0 ? r[ci.name].slice(0, 80) : '';
      const type = ci.type >= 0 && r[ci.type] ? r[ci.type].slice(0, 40) : (/\betf\b/i.test(name) ? 'ETF' : 'Other');
      out.records.push({
        id: `h-${S.hashText(`${acct.id}|${ticker}`)}`, kind: 'holding', account: acct.id, ticker, name: name || ticker, type,
        shares, price: Math.round(price * 10000) / 10000, cost: cost !== null && cost > 0 ? cost : null, acquired: ''
      });
    });
    return out;
  }

  // ---- Saved bank formats --------------------------------------------------

  const srcKey = (member, bank, account) => {
    const norm = String(bank == null ? '' : bank).trim().toLowerCase().replace(/\s+/g, ' ');
    return `${member}|${norm.replace(/[^a-z0-9]+/g, '-')}|${account || ''}`;
  };
  const formatId = (module, bank) => `f-${root.KanopiSheets.hashText(`${module}|${String(bank).trim().toLowerCase()}`)}`;

  const api = { MAX_BYTES, parseCsv, findHeaderRow, normalizeAction, parseActivity, parseHoldings, formatId, srcKey };
  root.KanopiImporter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
