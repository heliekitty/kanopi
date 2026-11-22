/* Kanopi: lots, closed positions and wash sales.
 *
 * Plain functions with no page code, so they can be tested alone.
 *
 * Inputs
 *   accounts      { id: { cls } }       cls: 'personal' | 'pretax' | 'posttax' | 'k401'
 *   holdings      [{ account, ticker, type, shares, price, cost?, acquired? | acquiredDaysAgo? }]
 *                 cost and acquired describe shares bought before the Activity history starts
 *   transactions  [{ date | daysAgo, type, ticker, qty, amount, account }]   Buy and Sell rows are used
 *   today         a Date
 *
 * Rules
 *   Sales use the oldest lot first (FIFO).
 *   A lot is long-term when it was held more than one year, otherwise short-term.
 *   Wash sale: a loss sale in a personal account is flagged when the same ticker was bought within
 *   30 days before or after, in ANY household account. If the buy was in a personal account, the lost
 *   amount is added to that lot's cost and its holding period carries over. If the buy was in a
 *   retirement account, the loss is gone for good.
 */
(function (root) {
  'use strict';

  const DAY = 86400000;
  const WASH_DAYS = 30;

  function toDay(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysBetween = (a, b) => Math.round((midnight(b) - midnight(a)) / DAY);
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const isCash = (h) => h.ticker === 'CASH' || h.type === 'Cash';
  const round2 = (n) => Math.round(n * 100) / 100;

  function eventDate(t, today) {
    return toDay(t.date) || (Number.isFinite(t.daysAgo) ? addDays(midnight(today), -t.daysAgo) : null);
  }

  function ledger(input) {
    const today = midnight(input.today || new Date());
    const accounts = input.accounts || {};
    const problems = [];
    const books = {};
    const book = (account, ticker) => {
      const k = `${account}|${ticker}`;
      return books[k] || (books[k] = { account, ticker, holding: null, events: [], lots: [] });
    };

    (input.holdings || []).forEach((h) => { if (accounts[h.account] && h.ticker && !isCash(h)) book(h.account, h.ticker).holding = h; });
    (input.transactions || []).forEach((t, i) => {
      if ((t.type !== 'Buy' && t.type !== 'Sell') || !t.ticker || !(t.qty > 0) || !accounts[t.account]) return;
      const date = eventDate(t, today);
      if (!date) return;
      book(t.account, t.ticker).events.push({ i, date, type: t.type, qty: t.qty, amount: t.amount });
    });

    const allBuys = [];
    const closed = [];
    const open = [];

    Object.keys(books).forEach((k) => {
      const b = books[k];
      b.events.sort((x, y) => (x.date - y.date) || (x.type === y.type ? x.i - y.i : x.type === 'Buy' ? -1 : 1));
      const buys = b.events.filter((e) => e.type === 'Buy').reduce((s, e) => s + e.qty, 0);
      const sells = b.events.filter((e) => e.type === 'Sell').reduce((s, e) => s + e.qty, 0);
      const held = b.holding ? b.holding.shares : 0;
      let opening = held - (buys - sells);
      if (opening < -1e-6) {
        problems.push(`${b.ticker}: Activity shows more shares than the holding. Opening shares set to zero.`);
        opening = 0;
      }
      if (opening > 1e-9) {
        const h = b.holding;
        const acquired = h ? (toDay(h.acquired) || (Number.isFinite(h.acquiredDaysAgo) ? addDays(today, -h.acquiredDaysAgo) : null)) : null;
        b.lots.push({
          id: `${k}|open`, account: b.account, ticker: b.ticker, acquired, qty: opening, origQty: opening,
          cost: h && h.cost != null && Number.isFinite(h.cost) ? h.cost : null, opening: true
        });
      }
      b.events.forEach((e, n) => {
        if (e.type === 'Buy') {
          const lot = { id: `${k}|${n}`, account: b.account, ticker: b.ticker, acquired: e.date, buyDate: e.date, qty: e.qty, origQty: e.qty, cost: e.amount, opening: false };
          b.lots.push(lot); allBuys.push(lot);
          return;
        }
        let left = e.qty;
        while (left > 1e-9 && b.lots.length) {
          const lot = b.lots[0];
          const take = Math.min(lot.qty, left);
          const basis = lot.cost == null ? null : lot.cost * take / lot.qty;
          const proceeds = e.amount * take / e.qty;
          closed.push({
            date: e.date, account: b.account, ticker: b.ticker, qty: take, proceeds, basis, acquired: lot.acquired,
            lotId: lot.id, disallowed: 0, wash: false, permanent: false
          });
          if (lot.cost != null) lot.cost -= basis;
          lot.qty -= take; left -= take;
          if (lot.qty <= 1e-9) b.lots.shift();
        }
        if (left > 1e-9) problems.push(`${b.ticker}: a sale of ${e.qty} shares is larger than what was held.`);
      });
      b.lots.forEach((l) => open.push(l));
    });

    // Wash sales, oldest sale first.
    closed.slice().sort((x, y) => x.date - y.date).forEach((c) => {
      const acct = accounts[c.account];
      if (!acct || acct.cls !== 'personal' || c.basis == null || !(c.proceeds < c.basis - 0.005)) return;
      const loss = c.basis - c.proceeds;
      let matched = 0;
      allBuys
        .filter((l) => l.ticker === c.ticker && l.id !== c.lotId && Math.abs(daysBetween(l.buyDate, c.date)) <= WASH_DAYS)
        .sort((x, y) => x.buyDate - y.buyDate)
        .forEach((l) => {
          if (matched >= c.qty - 1e-9) return;
          const avail = l.origQty - (l.matched || 0);
          if (avail <= 1e-9) return;
          const m = Math.min(avail, c.qty - matched);
          matched += m; l.matched = (l.matched || 0) + m;
          const portion = loss * m / c.qty;
          c.disallowed += portion; c.wash = true;
          const buyAcct = accounts[l.account];
          if (buyAcct && buyAcct.cls === 'personal') {
            l.washAdd = (l.washAdd || 0) + portion;
            l.wash = true;
            const tack = c.acquired ? Math.max(0, daysBetween(c.acquired, c.date)) : 0;
            l.tackDays = Math.max(l.tackDays || 0, tack);
          } else {
            c.permanent = true;
          }
        });
    });

    open.forEach((l) => {
      if (l.washAdd && l.cost != null) l.cost += l.washAdd * (l.qty / l.origQty);
      const start = l.acquired ? addDays(l.acquired, -(l.tackDays || 0)) : null;
      l.termDate = start;
      l.term = start ? (daysBetween(start, today) > 365 ? 'long' : 'short') : '';
      l.wash = !!l.wash;
    });
    closed.forEach((c) => {
      c.gain = c.basis == null ? null : c.proceeds - c.basis;
      c.allowed = c.gain == null ? null : c.gain + c.disallowed;
      c.term = c.acquired ? (daysBetween(c.acquired, c.date) > 365 ? 'long' : 'short') : '';
    });

    return { lots: open, closed, problems };
  }

  // Totals for closed positions in one calendar year. accountFilter(accountId) picks which accounts count.
  function yearSummary(closed, year, accountFilter) {
    const out = {
      short: { proceeds: 0, basis: 0, gain: 0 }, long: { proceeds: 0, basis: 0, gain: 0 },
      disallowed: 0, unknown: 0, rows: []
    };
    closed.forEach((c) => {
      if (c.date.getFullYear() !== year || (accountFilter && !accountFilter(c.account))) return;
      out.rows.push(c);
      if (c.allowed == null || !c.term) { out.unknown += 1; return; }
      const t = out[c.term];
      t.proceeds += c.proceeds; t.basis += c.basis; t.gain += c.allowed;
      out.disallowed += c.disallowed;
    });
    ['short', 'long'].forEach((k) => { out[k].proceeds = round2(out[k].proceeds); out[k].basis = round2(out[k].basis); out[k].gain = round2(out[k].gain); });
    out.disallowed = round2(out.disallowed);
    out.total = { proceeds: round2(out.short.proceeds + out.long.proceeds), basis: round2(out.short.basis + out.long.basis), gain: round2(out.short.gain + out.long.gain) };
    out.rows.sort((a, b) => b.date - a.date);
    return out;
  }

  const api = { ledger, yearSummary, WASH_DAYS };
  root.KanopiPortfolio = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
