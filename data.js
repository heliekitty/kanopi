// Kanopi placeholder data. Everything here is made up. No real figures, accounts, or quotes.
// Money is split three ways: Red Panda's own, Koala's own, and shared (joint).
// "Together" adds all three. A personal view shows only that person's own items.
// Dates that must stay current are stored as "days ago" or "day of month" and resolved in app.js.
window.KANOPI_SAMPLE = {
  balances: {
    redpanda:   { assets: 150000, liabilities: 0 },
    koala: { assets: 120000, liabilities: 20000 },
    shared:  { assets: 142500, liabilities: 166300 }
  },

  trip: { name: 'Trip name TBD', saved: 3850, target: 6000, targetDate: 'Target date TBD' },

  // ---- Budget ----------------------------------------------------------
  categories: {
    mortgage: 'Mortgage',
    utilities: 'Utilities',
    pet: 'Pet',
    groceries: 'Groceries',
    eating: 'Eating out',
    health: 'Health and self-improvement',
    subs: 'Subscriptions'
  },

  // [spent this month, monthly limit] per category, per owner. The app recomputes the limits from the planner.
  // Sample month is over budget: Groceries, Eating out and Pet are over, and so is the total.
  budget: {
    redpanda:   { subs: [45, 60], eating: [236, 200], health: [320, 340], groceries: [65, 100] },
    koala: { subs: [35, 60], eating: [248, 220], health: [215, 260], groceries: [95, 160] },
    shared:  { mortgage: [2150, 2150], utilities: [270, 300], pet: [310, 200], groceries: [860, 700], eating: [380, 300], subs: [56, 80] }
  },

  // Learned vendor names -> category. The app adds to this when you categorize a purchase.
  rules: {
    'electric bill': 'utilities',
    'pet food': 'pet',
    'streaming subscription': 'subs',
    'grocery run': 'groceries'
  },

  // Total spend per calendar quarter (the quarter definition is still an open question).
  quarters: [
    { label: 'Q1 2026', redpanda: 1480, koala: 1390, shared: 9800 },
    { label: 'Q2 2026', redpanda: 1560, koala: 1470, shared: 10100 },
    { label: 'Q3 2026', redpanda: 1510, koala: 1520, shared: 10350 }
  ],

  yoy: {
    month: {
      thisLabel: 'Oct 2026', lastLabel: 'Oct 2025',
      thisYear: { redpanda: 510, koala: 470, shared: 3390 },
      lastYear: { redpanda: 490, koala: 455, shared: 3280 }
    },
    quarter: {
      thisLabel: 'Q3 2026', lastLabel: 'Q3 2025',
      thisYear: { redpanda: 1510, koala: 1520, shared: 10350 },
      lastYear: { redpanda: 1440, koala: 1430, shared: 9700 }
    }
  },

  // Transactions. type = expense | refund | income | transfer.
  // owner = whose budget it counts in. paidBy = who paid it (or who received it, for refunds and income).
  // A refund or reimbursement is a transaction of its own, entered with the opposite sign of an expense.
  // Transfers (such as paying a credit card) move your own money and are not spending.
  expenses: [
    { daysAgo: 1, name: 'Grocery run', type: 'expense', cat: 'groceries', amount: 86, paidBy: 'redpanda', owner: 'shared' },
    { daysAgo: 2, name: 'Dinner out', type: 'expense', cat: 'eating', amount: 74, paidBy: 'koala', owner: 'shared' },
    { daysAgo: 3, name: 'Yoga class pack', type: 'expense', cat: 'health', amount: 90, paidBy: 'redpanda', owner: 'redpanda' },
    { daysAgo: 4, name: 'Vet visit', type: 'expense', cat: 'pet', amount: 210, paidBy: 'redpanda', owner: 'shared' },
    { daysAgo: 5, name: 'Paycheck', type: 'income', cat: '', amount: 1900, paidBy: 'koala', owner: 'koala' },
    { daysAgo: 6, name: 'Streaming subscription', type: 'expense', cat: 'subs', amount: 16, paidBy: 'koala', owner: 'koala' },
    { daysAgo: 8, name: 'Grocery run', type: 'expense', cat: 'groceries', amount: 112, paidBy: 'koala', owner: 'shared' },
    { daysAgo: 8, name: 'Paycheck', type: 'income', cat: '', amount: 3900, paidBy: 'redpanda', owner: 'redpanda' },
    { daysAgo: 9, name: 'Lunch with coworkers', type: 'expense', cat: 'eating', amount: 32, paidBy: 'redpanda', owner: 'redpanda' },
    { daysAgo: 11, name: 'Electric bill', type: 'expense', cat: 'utilities', amount: 142, paidBy: 'redpanda', owner: 'shared' },
    { daysAgo: 12, name: 'Credit card payment', type: 'transfer', cat: '', amount: 1840, paidBy: 'redpanda', owner: 'shared' },
    { daysAgo: 13, name: 'Gym membership', type: 'expense', cat: 'health', amount: 55, paidBy: 'koala', owner: 'koala' },
    { daysAgo: 15, name: 'Pet food', type: 'expense', cat: 'pet', amount: 48, paidBy: 'koala', owner: 'shared' },
    { daysAgo: 17, name: 'Red Panda\'s share, water and gas', type: 'refund', cat: 'utilities', amount: 64, paidBy: 'koala', owner: 'shared' },
    { daysAgo: 18, name: 'Book club dinner', type: 'expense', cat: 'eating', amount: 58, paidBy: 'redpanda', owner: 'redpanda' },
    { daysAgo: 18, name: 'Red Panda\'s share, mortgage', type: 'refund', cat: 'mortgage', amount: 1075, paidBy: 'koala', owner: 'shared' },
    { daysAgo: 19, name: 'Water and gas', type: 'expense', cat: 'utilities', amount: 128, paidBy: 'koala', owner: 'shared' },
    { daysAgo: 19, name: 'Paycheck', type: 'income', cat: '', amount: 1900, paidBy: 'koala', owner: 'koala' },
    { daysAgo: 20, name: 'Mortgage', type: 'expense', cat: 'mortgage', amount: 2150, paidBy: 'koala', owner: 'shared' },
    { daysAgo: 22, name: 'Music subscription', type: 'expense', cat: 'subs', amount: 11, paidBy: 'redpanda', owner: 'redpanda' },
    { daysAgo: 23, name: 'Grocery run', type: 'expense', cat: 'groceries', amount: 94, paidBy: 'koala', owner: 'shared' },
    { daysAgo: 26, name: 'Pizza night', type: 'expense', cat: 'eating', amount: 46, paidBy: 'koala', owner: 'shared' },
    { daysAgo: 28, name: 'Transfer to savings', type: 'transfer', cat: '', amount: 500, paidBy: 'koala', owner: 'shared' },
    { daysAgo: 29, name: 'Yoga class pack', type: 'expense', cat: 'health', amount: 90, paidBy: 'redpanda', owner: 'redpanda' },
    { daysAgo: 30, name: 'Grocery run', type: 'expense', cat: 'groceries', amount: 121, paidBy: 'redpanda', owner: 'shared' },
    { daysAgo: 31, name: 'Returned order', type: 'refund', cat: 'groceries', amount: 12, paidBy: 'redpanda', owner: 'shared' },
    { daysAgo: 33, name: 'Brunch', type: 'expense', cat: 'eating', amount: 61, paidBy: 'redpanda', owner: 'shared' },
    { daysAgo: 33, name: 'Pet insurance', type: 'expense', cat: 'pet', amount: 38, paidBy: 'redpanda', owner: 'shared' },
    { daysAgo: 33, name: 'Paycheck', type: 'income', cat: '', amount: 1900, paidBy: 'koala', owner: 'koala' },
    { daysAgo: 36, name: 'Streaming subscription', type: 'expense', cat: 'subs', amount: 16, paidBy: 'koala', owner: 'koala' },
    { daysAgo: 37, name: 'Grocery run', type: 'expense', cat: 'groceries', amount: 103, paidBy: 'koala', owner: 'shared' },
    { daysAgo: 38, name: 'Paycheck', type: 'income', cat: '', amount: 3900, paidBy: 'redpanda', owner: 'redpanda' },
    { daysAgo: 41, name: 'Electric bill', type: 'expense', cat: 'utilities', amount: 131, paidBy: 'redpanda', owner: 'shared' },
    { daysAgo: 41, name: 'Birthday dinner', type: 'expense', cat: 'eating', amount: 132, paidBy: 'koala', owner: 'shared' },
    { daysAgo: 42, name: 'Credit card payment', type: 'transfer', cat: '', amount: 1905, paidBy: 'redpanda', owner: 'shared' },
    { daysAgo: 43, name: 'Gym membership', type: 'expense', cat: 'health', amount: 55, paidBy: 'koala', owner: 'koala' },
    { daysAgo: 44, name: 'Grocery run', type: 'expense', cat: 'groceries', amount: 88, paidBy: 'redpanda', owner: 'shared' },
    { daysAgo: 46, name: 'Pet food', type: 'expense', cat: 'pet', amount: 52, paidBy: 'koala', owner: 'shared' },
    { daysAgo: 47, name: 'Paycheck', type: 'income', cat: '', amount: 1900, paidBy: 'koala', owner: 'koala' },
    { daysAgo: 48, name: 'Coffee shop', type: 'expense', cat: 'eating', amount: 14, paidBy: 'redpanda', owner: 'redpanda' },
    { daysAgo: 49, name: 'Water and gas', type: 'expense', cat: 'utilities', amount: 119, paidBy: 'koala', owner: 'shared' },
    { daysAgo: 50, name: 'Mortgage', type: 'expense', cat: 'mortgage', amount: 2150, paidBy: 'koala', owner: 'shared' },
    { daysAgo: 51, name: 'Grocery run', type: 'expense', cat: 'groceries', amount: 117, paidBy: 'koala', owner: 'shared' },
    { daysAgo: 52, name: 'Climbing pass', type: 'expense', cat: 'health', amount: 205, paidBy: 'koala', owner: 'koala' },
    { daysAgo: 52, name: 'Cloud storage', type: 'expense', cat: 'subs', amount: 50, paidBy: 'redpanda', owner: 'shared' },
    { daysAgo: 55, name: 'Takeout', type: 'expense', cat: 'eating', amount: 38, paidBy: 'koala', owner: 'koala' },
    { daysAgo: 58, name: 'Grocery run', type: 'expense', cat: 'groceries', amount: 99, paidBy: 'redpanda', owner: 'shared' }
  ],

  // Planner: what you expect to earn and spend, each with a frequency.
  // The monthly total per category becomes that category's budget goal.
  // sub: '' regular expense | 'yes' active subscription | 'no' cancelled subscription (not counted). due: next due date.
  plan: [
    { id: 'p1', owner: 'redpanda', flow: 'expense', cat: 'subs', name: 'Music and apps', freq: 'monthly', amount: 60, sub: 'yes', due: '2026-11-28' },
    { id: 'p2', owner: 'redpanda', flow: 'expense', cat: 'eating', name: 'Lunches out', freq: 'weekly', amount: 36, sub: '', due: '2026-11-23' },
    { id: 'p3', owner: 'redpanda', flow: 'expense', cat: 'eating', name: 'Date nights', freq: 'monthly', amount: 44, sub: '', due: '2026-11-29' },
    { id: 'p4', owner: 'redpanda', flow: 'expense', cat: 'health', name: 'Yoga classes', freq: 'monthly', amount: 90, sub: '', due: '2026-12-01' },
    { id: 'p5', owner: 'redpanda', flow: 'expense', cat: 'health', name: 'Skincare', freq: 'quarterly', amount: 270, sub: '', due: '2026-12-15' },
    { id: 'p6', owner: 'redpanda', flow: 'expense', cat: 'health', name: 'Gym', freq: 'monthly', amount: 160, sub: '', due: '2026-12-01' },
    { id: 'p7', owner: 'redpanda', flow: 'expense', cat: 'groceries', name: 'Snacks and pantry', freq: 'biweekly', amount: 24, sub: '', due: '2026-11-24' },
    { id: 'p8', owner: 'redpanda', flow: 'expense', cat: 'groceries', name: 'Specialty tea', freq: 'monthly', amount: 48, sub: '', due: '2026-12-03' },
    { id: 'p9', owner: 'redpanda', flow: 'income', cat: '', name: 'Salary', freq: 'monthly', amount: 3900, sub: '', due: '2026-11-30' },
    { id: 'p10', owner: 'koala', flow: 'expense', cat: 'subs', name: 'Streaming and games', freq: 'monthly', amount: 60, sub: 'yes', due: '2026-11-27' },
    { id: 'p11', owner: 'koala', flow: 'expense', cat: 'eating', name: 'Work lunches', freq: 'weekly', amount: 36, sub: '', due: '2026-11-23' },
    { id: 'p12', owner: 'koala', flow: 'expense', cat: 'eating', name: 'Weekend dinners', freq: 'monthly', amount: 64, sub: '', due: '2026-11-29' },
    { id: 'p13', owner: 'koala', flow: 'expense', cat: 'health', name: 'Gym', freq: 'monthly', amount: 55, sub: '', due: '2026-12-02' },
    { id: 'p14', owner: 'koala', flow: 'expense', cat: 'health', name: 'Climbing pass', freq: 'quarterly', amount: 615, sub: '', due: '2027-01-10' },
    { id: 'p15', owner: 'koala', flow: 'expense', cat: 'groceries', name: 'Snacks', freq: 'weekly', amount: 24, sub: '', due: '2026-11-25' },
    { id: 'p16', owner: 'koala', flow: 'expense', cat: 'groceries', name: 'Bulk shop', freq: 'monthly', amount: 56, sub: '', due: '2026-12-05' },
    { id: 'p17', owner: 'koala', flow: 'income', cat: '', name: 'Salary', freq: 'biweekly', amount: 1900, sub: '', due: '2026-11-27' },
    { id: 'p18', owner: 'shared', flow: 'expense', cat: 'mortgage', name: 'Mortgage', freq: 'monthly', amount: 2150, sub: '', due: '2026-12-01' },
    { id: 'p19', owner: 'shared', flow: 'expense', cat: 'utilities', name: 'Electric', freq: 'monthly', amount: 140, sub: '', due: '2026-12-12' },
    { id: 'p20', owner: 'shared', flow: 'expense', cat: 'utilities', name: 'Water and gas', freq: 'monthly', amount: 80, sub: '', due: '2026-12-08' },
    { id: 'p21', owner: 'shared', flow: 'expense', cat: 'utilities', name: 'Internet', freq: 'monthly', amount: 80, sub: '', due: '2026-11-28' },
    { id: 'p22', owner: 'shared', flow: 'expense', cat: 'pet', name: 'Pet food', freq: 'monthly', amount: 100, sub: '', due: '2026-12-04' },
    { id: 'p23', owner: 'shared', flow: 'expense', cat: 'pet', name: 'Vet checkups', freq: 'quarterly', amount: 150, sub: '', due: '2027-01-15' },
    { id: 'p24', owner: 'shared', flow: 'expense', cat: 'pet', name: 'Pet insurance', freq: 'monthly', amount: 38, sub: '', due: '2026-12-15' },
    { id: 'p25', owner: 'shared', flow: 'expense', cat: 'pet', name: 'Treats and toys', freq: 'monthly', amount: 12, sub: '', due: '2026-12-10' },
    { id: 'p26', owner: 'shared', flow: 'expense', cat: 'groceries', name: 'Weekly shop', freq: 'weekly', amount: 150, sub: '', due: '2026-11-28' },
    { id: 'p27', owner: 'shared', flow: 'expense', cat: 'groceries', name: 'Bulk run', freq: 'monthly', amount: 50, sub: '', due: '2026-12-06' },
    { id: 'p28', owner: 'shared', flow: 'expense', cat: 'eating', name: 'Family dinners', freq: 'weekly', amount: 48, sub: '', due: '2026-11-29' },
    { id: 'p29', owner: 'shared', flow: 'expense', cat: 'eating', name: 'Takeout', freq: 'monthly', amount: 92, sub: '', due: '2026-12-09' },
    { id: 'p30', owner: 'shared', flow: 'expense', cat: 'subs', name: 'Streaming bundle', freq: 'monthly', amount: 30, sub: 'yes', due: '2026-12-01' },
    { id: 'p31', owner: 'shared', flow: 'expense', cat: 'subs', name: 'Cloud storage', freq: 'annual', amount: 600, sub: 'yes', due: '2027-03-20' },
    { id: 'p32', owner: 'shared', flow: 'expense', cat: 'eating', name: 'Meal kit (cancelled)', freq: 'monthly', amount: 45, sub: 'no', due: '2026-11-30' }
  ],

  // Bills repeat monthly on a day of the month.
  bills: [
    { name: 'Mortgage', amount: 2150, day: 1, owner: 'shared' },
    { name: "Red Panda's phone", amount: 95, day: 5, owner: 'redpanda' },
    { name: 'Electric', amount: 142, day: 12, owner: 'shared' },
    { name: 'Pet insurance', amount: 38, day: 15, owner: 'shared' },
    { name: "Koala's gym", amount: 55, day: 20, owner: 'koala' },
    { name: 'Internet', amount: 80, day: 28, owner: 'shared' }
  ],

  // ---- Portfolio -------------------------------------------------------
  accounts: {
    'redpanda-401k': { name: 'Red Panda 401k', owner: 'redpanda', cls: 'k401', broker: 'Fidelity', last4: '4821' },
    'koala-ira': { name: 'Koala IRA', owner: 'koala', cls: 'pretax', broker: 'Vanguard', last4: '7305' },
    'joint': { name: 'Joint brokerage', owner: 'shared', cls: 'personal', broker: 'Schwab', last4: '1190' }
  },

  ownerLabels: { redpanda: 'Red Panda', koala: 'Koala', shared: 'Joint' },

  // Sample prices only. These are not live quotes.
  // cost and acquiredDaysAgo describe the shares bought before the Activity list starts.
  holdings: [
    { ticker: 'VTI',  name: 'Total US stock market ETF',          type: 'US stocks',            account: 'redpanda-401k',  shares: 220, price: 290, cost: 38675, acquiredDaysAgo: 1100 },
    { ticker: 'VXUS', name: 'Total international stock ETF',      type: 'International stocks', account: 'redpanda-401k',  shares: 400, price: 66,  cost: 17400, acquiredDaysAgo: 1000 },
    { ticker: 'BND',  name: 'Total bond market ETF',              type: 'Bonds',                account: 'redpanda-401k',  shares: 350, price: 72,  cost: 22800, acquiredDaysAgo: 950 },
    { ticker: 'VTI',  name: 'Total US stock market ETF',          type: 'US stocks',            account: 'koala-ira', shares: 150, price: 290, cost: 30750, acquiredDaysAgo: 1300 },
    { ticker: 'VNQ',  name: 'Real estate ETF',                    type: 'Real estate',          account: 'koala-ira', shares: 120, price: 92,  cost: 8800,  acquiredDaysAgo: 800 },
    { ticker: 'VXUS', name: 'Total international stock ETF',      type: 'International stocks', account: 'koala-ira', shares: 300, price: 66,  cost: 17100, acquiredDaysAgo: 700 },
    { ticker: 'BND',  name: 'Total bond market ETF',              type: 'Bonds',                account: 'koala-ira', shares: 260, price: 72,  cost: 19500, acquiredDaysAgo: 600 },
    { ticker: 'VTI',  name: 'Total US stock market ETF',          type: 'US stocks',            account: 'joint',       shares: 80,  price: 290 },
    { ticker: 'QQQ',  name: 'Nasdaq-100 ETF',                     type: 'US stocks',            account: 'joint',       shares: 25,  price: 520 },
    { ticker: 'VTIP', name: 'Short-term inflation-protected ETF', type: 'Bonds',                account: 'joint',       shares: 150, price: 50 },
    { ticker: 'CASH', name: 'Cash',                               type: 'Cash',                 account: 'joint',       shares: 12000, price: 1 }
  ],

  // Trades are matched oldest lot first. The VNQ and VTIP sales show the two kinds of wash sale:
  // the VNQ loss was followed by a buy in an IRA (loss gone for good); the VTIP loss by a buy in the
  // same taxable account (loss added to the new lot's cost).
  transactions: [
    { daysAgo: 2,   type: 'Dividend',     ticker: 'VTI',  amount: 38,   account: 'joint' },
    { daysAgo: 5,   type: 'Contribution', ticker: '',     amount: 650,  account: 'redpanda-401k' },
    { daysAgo: 8,   type: 'Buy',          ticker: 'VXUS', qty: 15, amount: 990,  account: 'koala-ira' },
    { daysAgo: 11,  type: 'Dividend',     ticker: 'BND',  amount: 71,   account: 'redpanda-401k' },
    { daysAgo: 20,  type: 'Sell',         ticker: 'VNQ',  qty: 10, amount: 920,  account: 'koala-ira' },
    { daysAgo: 24,  type: 'Contribution', ticker: '',     amount: 500,  account: 'koala-ira' },
    { daysAgo: 33,  type: 'Buy',          ticker: 'QQQ',  qty: 2,  amount: 1040, account: 'joint' },
    { daysAgo: 40,  type: 'Dividend',     ticker: 'VXUS', amount: 52,   account: 'koala-ira' },
    { daysAgo: 40,  type: 'Sell',         ticker: 'SCHD', qty: 40, amount: 1180, account: 'joint' },
    { daysAgo: 47,  type: 'Buy',          ticker: 'VTI',  qty: 5,  amount: 1450, account: 'redpanda-401k' },
    { daysAgo: 55,  type: 'Contribution', ticker: '',     amount: 650,  account: 'redpanda-401k' },
    { daysAgo: 60,  type: 'Buy',          ticker: 'VNQ',  qty: 30, amount: 2730, account: 'koala-ira' },
    { daysAgo: 60,  type: 'Buy',          ticker: 'VTIP', qty: 50, amount: 2400, account: 'joint' },
    { daysAgo: 70,  type: 'Sell',         ticker: 'VNQ',  qty: 30, amount: 2700, account: 'joint' },
    { daysAgo: 75,  type: 'Sell',         ticker: 'VTIP', qty: 50, amount: 2350, account: 'joint' },
    { daysAgo: 100, type: 'Buy',          ticker: 'VTI',  qty: 30, amount: 8250, account: 'joint' },
    { daysAgo: 140, type: 'Buy',          ticker: 'VTIP', qty: 50, amount: 2400, account: 'joint' },
    { daysAgo: 150, type: 'Buy',          ticker: 'QQQ',  qty: 8,  amount: 3800, account: 'joint' },
    { daysAgo: 200, type: 'Buy',          ticker: 'BND',  qty: 50, amount: 3700, account: 'redpanda-401k' },
    { daysAgo: 200, type: 'Buy',          ticker: 'SCHD', qty: 40, amount: 1100, account: 'joint' },
    { daysAgo: 250, type: 'Sell',         ticker: 'VTI',  qty: 20, amount: 6000, account: 'joint' },
    { daysAgo: 260, type: 'Buy',          ticker: 'VNQ',  qty: 30, amount: 3000, account: 'joint' },
    { daysAgo: 300, type: 'Buy',          ticker: 'VXUS', qty: 100, amount: 6200, account: 'redpanda-401k' },
    { daysAgo: 400, type: 'Buy',          ticker: 'VTI',  qty: 40, amount: 10480, account: 'redpanda-401k' },
    { daysAgo: 500, type: 'Buy',          ticker: 'VTI',  qty: 50, amount: 12500, account: 'joint' },
    { daysAgo: 600, type: 'Buy',          ticker: 'QQQ',  qty: 15, amount: 5400, account: 'joint' },
    { daysAgo: 700, type: 'Buy',          ticker: 'VTI',  qty: 20, amount: 5200, account: 'joint' },
    { daysAgo: 700, type: 'Buy',          ticker: 'VTIP', qty: 100, amount: 5000, account: 'joint' }
  ],

  // Named groups for the Holdings table. Real data keeps these on this device.
  gorder: ['Core', 'Growth', 'Stability'],
  tgroups: { VTI: 'Core', VXUS: 'Core', BND: 'Stability', VTIP: 'Stability', QQQ: 'Growth', VNQ: 'Growth' },

  // Returns in percent. 3Y and 5Y are annualized. Sample numbers; the history source is still open.
  periods: ['1M', '3M', '6M', '1Y', '3Y', '5Y'],
  perf: {
    portfolio: {
      together: [1.1, 3.2, 5.8, 11.4, 8.6, 9.1],
      redpanda:    [1.3, 3.6, 6.4, 12.5, 9.2, 9.8],
      koala:  [0.9, 2.8, 5.1, 10.2, 7.9, 8.5]
    },
    benchmarks: {
      SPY: [1.6, 4.3, 7.4, 14.1, 10.9, 12.3],
      QQQ: [2.1, 5.6, 9.8, 18.7, 13.2, 15.8],
      DIA: [1.2, 3.5, 5.9, 10.8, 8.9, 9.7]
    }
  },

  // ---- Taxes (filing jointly) -------------------------------------------
  income: [
    { year: '2024',       redpanda: 108000, koala: 96000,  federal: 31200, state: 9100,  cpa: 650 },
    { year: '2025',       redpanda: 115000, koala: 102000, federal: 34600, state: 10050, cpa: 700 },
    { year: '2026 (YTD)', redpanda: 101000, koala: 90000,  federal: 29800, state: 8700,  cpa: null }
  ],

  // Sales this year. owner = whose account sold it. Gains use proceeds minus cost.
  sales: [
    { daysAgo: 20,  ticker: 'VNQ',  term: 'Short', proceeds: 920,  cost: 870,  owner: 'koala' },
    { daysAgo: 85,  ticker: 'VXUS', term: 'Long',  proceeds: 5400, cost: 4700, owner: 'redpanda' },
    { daysAgo: 150, ticker: 'QQQ',  term: 'Long',  proceeds: 2100, cost: 2350, owner: 'shared' },
    { daysAgo: 240, ticker: 'BND',  term: 'Short', proceeds: 1800, cost: 1830, owner: 'redpanda' }
  ],

  taxPayments: [
    { label: 'Q1 2026', due: [2026, 4, 15], federal: 1860, state: 620, status: 'Paid' },
    { label: 'Q2 2026', due: [2026, 6, 15], federal: 1860, state: 620, status: 'Paid' },
    { label: 'Q3 2026', due: [2026, 9, 15], federal: 1860, state: 620, status: 'Paid' },
    { label: 'Q4 2026', due: [2027, 1, 15], federal: 1860, state: 620, status: 'Upcoming' }
  ],

  // Planned sales feed the forecast. Rates are placeholders, not tax advice.
  plannedSales: [
    { name: 'Sell 40 VTI (planned December)', gain: 3200, term: 'Long' },
    { name: 'Sell 15 VXUS (planned December)', gain: 600, term: 'Short' }
  ],
  planRates: { federalLong: 0.15, federalShort: 0.24, state: 0.05 },

  signals: [
    { id: 'drift-equity', label: 'Drift', detail: 'Equities 6 pts above target' },
    { id: 'news-watch', label: 'News', detail: 'Headline volume up on one watchlist name' }
  ]
};
