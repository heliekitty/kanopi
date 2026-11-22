# Kanopi changelog

Versions follow MAJOR.MINOR.PATCH. The current version lives in `version.js`.
Each deployment gets a line here, newest first.

## 1.0.0 - 2026-11-22

First tracked release. Placeholder data only; not connected to any accounts.

- Portfolio: new Accounts screen (personal, retirement pre-tax, post-tax or 401(k); broker; last 4 digits). Add, edit and delete.
- Portfolio > Accounts: Type is split into two columns, Type (Personal or Retirement) and Retirement kind (Traditional IRA (pre-tax), Roth IRA (post-tax) or 401k). The form shows Retirement kind only for retirement accounts.
- Portfolio: Transactions is now Activity (trades, dividends, contributions). It no longer shows the Budget transactions page by mistake.
- Portfolio > Holdings: one row per holding across accounts; Together view shows a split bar by family member instead of the account. New columns: price, average cost, total cost, gain or loss. Sort by any column; group by asset type, account type, family member or your own named groups, with subtotals.
- Portfolio > Holdings: your own groups can be put in a specific order with Move up and Move down in Edit my groups. A My order button applies it; clicking a column heading sorts instead.
- Portfolio > Holdings: select a ticker for a popup of its lots by account (newest first, scrolls past 15 rows) with gain or loss, short-term or long-term, and a W badge for wash sales. Wash sales are checked across all household accounts, including retirement.
- Portfolio > Performance: closed positions for the year, split into short-term, long-term and total, with wash-sale losses shown separately.
- Import: Settings > Data now has Import a bank or brokerage file. Pick the family member, module (Budget transactions, Portfolio activity or Portfolio holdings) and bank, then match the columns by hand once (Kanopi remembers the layout per bank), preview the counts and first rows, and add. Repeats are skipped. The Google Sheets sync is hidden (code kept).
- Data card: Upload another family member's backup (merges), Back up everything, and Restore from backup (erases this device first, with a confirmation button).
- Budget: new Stores page for learned stores (moved out of Settings). Menu order is now Home, Budget, Portfolio, Taxes.
- Family: your own data starts with no family members (add them in Settings). Sample data uses Red Panda and Koala.
- Budget > Planner: "Short description" is now "Description"; new Due Date column (next due date, rolls forward by frequency); the Expenses table is now "Regular Expense"; new Subscriptions table with a Yes/No Subscription field (No = cancelled: listed, but left out of totals, chart and goals); subscriptions show as a lighter shade of each segment in the Expenses bar.
- Budget: sample month now shows an over-budget state (total and three categories); an over-budget total swaps the leaf meter for poop icons and shows an "Over budget by" line, also on Home.
- Budget: "Where the money goes" is a pie chart with a legend. The "Cooking at home vs eating out" chart is removed.
- Budget: Last three quarters and Compared with last year share one card with a toggle.
- Budget: the Expenses tab is now Transactions: newest first, past 60 days by default, with filters (search, date range, type, category, paid by, counts in). Types: expense, refund or reimbursement (opposite sign), income, transfer or card payment. The separate Reimbursements card is gone.
- Budget: new Planner tab with a monthly income vs expenses chart and a table of planned items with a frequency (daily to annually) and a monthly amount. Together adds up each person's items into one line. The planner's monthly totals become the budget goals; Set budget goals can override a category.
- Budget: Set budget goals and Edit categories moved to the Planner tab; Add a transaction is on the Transactions tab.
- Learned stores: a store name remembers the category you chose and fills it in next time. Manage the list in Settings.
- Fix: the Portfolio and Performance toggles were hidden on phones.
- App banner across the top of the window (above the page title) for "Sample data. Not connected to any accounts." The old note about one person's own accounts, budget and payments is removed.
- Update banners: "A new version of Kanopi is ready" with a Refresh button, and a one-time "Kanopi was updated to version X" after refreshing.
- Menu icons: house on a post (Home), bamboo (Portfolio), receipt with a percent sign (Taxes), eucalyptus leaf (Budget), gear (Settings).
- New leaf icon in the progress meters and as the accent before card titles.
- Red panda avatar is 10% smaller.
- Styles are now inside index.html (styles.css removed).
- App shell: left sidebar on desktop, bottom tabs on phones, member menu in the phone top bar.
- Home: net worth, trip goal, budget this month, upcoming payments (next 30 days with a detail page), pending signals card.
- Portfolio: composition, holdings, transactions, performance.
- Taxes: income, gains and losses, taxes paid and CPA fees, estimated payments, forecast.
- Budget: overview and expenses with reimbursements.
- Settings: editable family members (name, avatar, color; add and delete), data, sync, privacy, about.
- Tables stack on phones. Self-hosted fonts (Mouse Memoirs, Noto Sans). Offline shell via service worker.
- Data lives on the device in IndexedDB. Settings can export a backup file (optionally locked with a password) and restore one, merging with the newer edit winning. "Use my own data" switches the pages from sample data to what is stored.
- Tabled: what-if trades, rebalance signals, watchlist.
