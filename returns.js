/* Kanopi returns: time-weighted portfolio and benchmark returns.
 * Pure functions, no DOM. Day keys are local-midnight timestamps.
 *
 * Model (daily):
 *   shares held at each close come from current holdings, backed out by
 *   reversing the Buy and Sell activity after each day.
 *   NAV(day) = market value of shares at that day's close + cash.
 *   Cash starts at zero on the day before the first activity, then moves with
 *   dividends, buys, sells, contributions and withdrawals.
 *   Daily return = (NAV(day) - external flow that day) / NAV(previous day) - 1.
 *   Period return = product of daily returns over the period, minus 1.
 */
(function (root) {
  const DAY = 86400000;
  const BENCH = ['SPY', 'DIA', 'QQQ', 'IWM', 'IJH'];

  function dayKey(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function addMonths(ms, n) { const d = new Date(ms); d.setMonth(d.getMonth() + n); return d.getTime(); }
  function addDays(ms, n) { const d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); }
  function keyOfDateStr(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : NaN; }

  // holdings: [{account, ticker, shares, price}] (current, as shown on Holdings)
  // transactions: [{date:'YYYY-MM-DD', type, account, ticker, qty, amount}]
  // history: { TICKER: [[dayKey, close], ...] }
  function compute(input) {
    const notes = [];
    const hist = input.history || {};
    const set = new Set();
    Object.keys(hist).forEach((t) => (hist[t] || []).forEach((p) => set.add(p[0])));
    const cal = Array.from(set).sort((a, b) => a - b);
    if (!cal.length) return { ok: false, reason: 'no-history' };
    const n = cal.length;

    const txs = (input.transactions || []).map((t) => ({ ...t, key: keyOfDateStr(t.date) })).filter((t) => Number.isFinite(t.key));
    const firstKey = txs.length ? Math.min.apply(null, txs.map((t) => t.key)) : Infinity;
    let k0 = 0;
    if (firstKey !== Infinity) { for (let i = 0; i < n; i++) { if (cal[i] < firstKey) k0 = i; } }

    // Index of the first calendar day on or after a key (trades after the last close count as the last day).
    const eff = (key) => { let lo = 0; let hi = n - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (cal[mid] >= key) hi = mid; else lo = mid + 1; } return lo; };

    const pos = new Map();
    const pkey = (a, t) => `${a}|${String(t).toUpperCase()}`;
    (input.holdings || []).forEach((h) => {
      const k = pkey(h.account, h.ticker);
      pos.set(k, { account: h.account, ticker: String(h.ticker).toUpperCase(), now: Number(h.shares) || 0, fallback: Number(h.price) || 0, delta: new Float64Array(n) });
    });
    const cashD = new Float64Array(n);
    const ext = new Float64Array(n);
    let contributions = 0; let withdrawals = 0;
    txs.forEach((t) => {
      const idx = eff(t.key);
      const amt = Math.abs(Number(t.amount) || 0);
      const qty = Math.abs(Number(t.qty) || 0);
      if (t.type === 'Buy' || t.type === 'Sell') {
        if (!t.ticker || !(qty > 0)) return;
        const k = pkey(t.account, t.ticker);
        if (!pos.has(k)) pos.set(k, { account: t.account, ticker: String(t.ticker).toUpperCase(), now: 0, fallback: 0, delta: new Float64Array(n) });
        pos.get(k).delta[idx] += t.type === 'Buy' ? qty : -qty;
        cashD[idx] += t.type === 'Buy' ? -amt : amt;
      } else if (t.type === 'Dividend') {
        cashD[idx] += amt;
      } else if (t.type === 'Contribution') {
        cashD[idx] += amt; ext[idx] += amt; contributions += 1;
      } else if (t.type === 'Withdrawal') {
        cashD[idx] -= amt; ext[idx] -= amt; withdrawals += 1;
      }
    });

    // Shares at each close: reverse the later trades from the current share count.
    const positions = Array.from(pos.values()).map((p) => {
      const shares = new Float64Array(n);
      shares[n - 1] = p.now;
      for (let i = n - 2; i >= 0; i--) shares[i] = shares[i + 1] - p.delta[i + 1];
      const series = (hist[p.ticker] || []);
      const m = new Map(series);
      const px = new Float64Array(n);
      const has = new Uint8Array(n);
      let last = null;
      for (let i = 0; i < n; i++) { if (m.has(cal[i])) last = m.get(cal[i]); if (last !== null) { px[i] = last; has[i] = 1; } }
      return { ...p, shares, px, has, series };
    });

    // Cash never goes negative. A buy that exceeds available cash is treated as
    // money put in on that day (an implicit external flow), so it is not a return.
    const cash = new Float64Array(n);
    let run = 0;
    let implicit = 0;
    for (let i = 0; i < n; i++) {
      run += cashD[i];
      if (run < -1e-6) { ext[i] += -run; implicit += -run; run = 0; }
      cash[i] = run;
    }

    const nav = new Float64Array(n);
    const used = new Set();
    for (let i = 0; i < n; i++) {
      let v = cash[i];
      positions.forEach((p) => {
        if (p.shares[i] === 0) return;
        let price = p.has[i] ? p.px[i] : null;
        if (price === null) { price = p.fallback; used.add(p.ticker); }
        v += p.shares[i] * price;
      });
      nav[i] = v;
    }

    const ret = new Array(n).fill(null);
    for (let i = k0 + 1; i < n; i++) {
      if (nav[i - 1] > 0) ret[i] = (nav[i] - ext[i]) / nav[i - 1] - 1;
    }

    positions.forEach((p) => {
      let neg = false;
      for (let i = k0; i < n; i++) if (p.shares[i] < -1e-9) neg = true;
      if (neg) notes.push(`${p.ticker} in ${p.account}: activity implies negative shares, so Activity and holdings do not match.`);
    });
    if (implicit > 0.005) notes.push('Some buys exceeded cash on hand; that money is treated as deposited on the buy date.');
    const missing = Array.from(used).filter((t) => t !== 'CASH');
    if (missing.length) notes.push(`No price history for ${missing.join(', ')}; their current price was used for every day.`);
    if (firstKey !== Infinity && cal[0] > firstKey) notes.push('Price history starts after your first activity, so early returns are measured from the first price day.');

    const endIdx = n - 1;
    const endDate = cal[endIdx];
    const baseFor = (target) => {
      let b = -1;
      for (let i = 0; i < n; i++) { if (cal[i] <= target) b = i; }
      if (b < k0) { if (target < cal[k0]) notes.push('Some periods reach back before your price history, so they start on the first price day.'); return k0; }
      return b;
    };
    const product = (b) => { let v = 1; let any = false; for (let i = b + 1; i <= endIdx; i++) { if (ret[i] !== null) { v *= 1 + ret[i]; any = true; } } return any ? v - 1 : null; };
    const priceReturn = (t, b) => {
      const s = (hist[t] || []);
      if (!s.length) return null;
      const m = new Map(s);
      let last = null; let base = null;
      for (let i = 0; i < n; i++) { if (m.has(cal[i])) last = m.get(cal[i]); if (i === b) base = last; }
      return base && last ? last / base - 1 : null;
    };

    const end = new Date(endDate);
    const periodDefs = [
      { key: '1d', label: '1 day', b: endIdx - 1 >= k0 ? endIdx - 1 : k0 },
      { key: '1m', label: '1 month', b: baseFor(addMonths(endDate, -1)) },
      { key: 'ytd', label: 'Year to date', b: baseFor(new Date(end.getFullYear() - 1, 11, 31).getTime()) },
      { key: '1y', label: '1 year', b: baseFor(addDays(endDate, -365)) },
      { key: 'since', label: 'Since start', b: k0 }
    ];
    const periods = periodDefs.map((d) => {
      const bench = {};
      BENCH.forEach((t) => { bench[t] = priceReturn(t, d.b); });
      return { key: d.key, label: d.label, from: cal[d.b], portfolio: product(d.b), bench };
    });

    return {
      ok: true,
      start: cal[k0],
      end: endDate,
      periods,
      flows: { contributions, withdrawals },
      notes: Array.from(new Set(notes)),
      series: cal.map((d, i) => ({ day: d, nav: nav[i], ret: ret[i] }))
    };
  }

  const api = { compute, BENCH, dayKey, keyOfDateStr };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KanopiReturns = api;
})(typeof self !== 'undefined' ? self : this);
