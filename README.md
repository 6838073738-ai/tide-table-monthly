# Tide Table · Monthly

A small web app for people who put some money aside each month. You choose what you can put in, the fields you
care about and how your money is split. Tide Table adds up your choices, shows the facts on both sides, and keeps
your records in your own browser.

> **Not advice.** Tide Table shows facts from the past and today. It is not personal advice and never says buy,
> sell or hold. Check that any choice fits your own money, goals and taxes.

## What is in this repository

| Path | What it is |
|---|---|
| `index.html`, `js/`, `css/`, `img/` | The app: static HTML, CSS and JavaScript. No build step, no server, no account, no analytics. |
| `data/base-plan.json` | The example plan the app scales to your monthly amount. |
| `data/upcoming-curated.json` | The hand-kept list of upcoming listings, as it was when the app was built. The app reads it when the open data below is not there. |
| `data/index.json` and the other files in `data/` | The open data: the list of companies, the fields, the yearly figures, the facts from both sides, headlines and exchange rates. `data/index.json` names every file, its sources and when it was built. |
| `.nojekyll` | An empty file that tells GitHub Pages to serve the files as they are. |

## How the app works

- **Your amount.** You type what you can put in each month, from $25 up, or the same in baht. You can change it
  for any month you have not logged yet.
- **Your fields.** You choose fields, for example Technology or Retail, and tick companies in each one. Each field's
  share is split equally across the companies you ticked. That is your own arithmetic, not a pick.
- **Your split.** A strip sets how much goes to your fields and how much to an all-world index fund (VWRA). It
  starts unset, and nothing is saved until you move it.
- **An example plan** is there for months you have not chosen fields for. It is an illustration, not advice.
- **Names.** Every holding is shown with its ticker and its full name, for example "VWRA · Vanguard FTSE All-World
  UCITS ETF, accumulating". A company that does not trade yet shows its name only.
- **Prices.** You type share prices from your broker's app. Coin prices come from CoinGecko, and the US dollar to
  baht rate from Frankfurter. Nothing else is fetched from outside the site except Google Fonts.
- **Your records stay with you.** They live in your browser. Settings can save them to a file and load that file
  again. Nothing you type is sent anywhere.

The site's Content Security Policy allows only these places: the site itself, Google Fonts, `api.coingecko.com`
and `api.frankfurter.dev`.

## The list of companies

A company is listed when its yearly reports show a profit in each year Tide Table checks. Every company says how
it was checked:

- **5 fiscal years checked**, or
- **4 fiscal years and the latest 12 months checked**, where open data does not reach 5 years yet.

Companies that made a loss are left out, so the list looks better than all companies did. Lists start A to Z.
Any other order is one you chose. Tiles show only how many companies they hold.

Orders are placed in US dollars at Interactive Brokers on US exchanges. So companies whose main listing is over
the counter, or only in Europe, are shown to read about, but they cannot be added to a list.

**Upcoming listings.** A short hand-kept list holds companies that have filed to list on a US exchange, with the
chips "Not listed yet" and "Outside the profit list". Their reported timing is shown as an estimate with its date
and sources, never as a forecast. The plan as written holds one of them, Anthropic, as a fixed line of 10% of each
month's amount. In a month before its first trading day, that 10% goes to VWRA. Its status comes from its filings with the US
SEC, and its page shows facts from both sides with their sources and dates, like every other company. It is part
of the plan as written, an illustration, not personal advice.

**No price history.** The site uses open data only, so it shows no share-price charts and no picture of past
swings. The lines say so where it matters.

## Where the data comes from

The open data is built on the maintainer's computer from the open sources below, checked, and published here. It
holds no personal details: every data file says `"licence": "open"`, and `data/index.json` names its sources and
the time it was built.

| Source | What it gives | Credit shown |
|---|---|---|
| SEC EDGAR (www.sec.gov, data.sec.gov) | US listings, industry codes, yearly and quarterly reports, and the filings of upcoming listings | "Yearly reports via SEC EDGAR" |
| ESEF filings (filings.xbrl.org) | yearly reports of European filers that upload them | "Yearly reports via filings.xbrl.org (ESEF)" |
| European Central Bank euro reference rates, via Frankfurter | exchange rates | "Calculated by Tide Table from European Central Bank euro reference rates, via Frankfurter" |
| GDELT Project | headlines: title, publisher, date and link only | "Headlines found through the GDELT Project (https://www.gdeltproject.org/)" |
| CoinGecko (in your browser) | coin prices | "Crypto prices by CoinGecko" |

Headlines are third-party text. They are quoted as they are, outside both sides, never coloured or tagged.

**Switched off, until their terms allow it:** BBC News feeds (their terms do not allow taking metadata from the
feeds without permission), Bangkok Post and Guardian feeds (terms not read yet), and Japan Exchange Group's list of
listed companies (its terms do not allow its data to be adapted without permission).

## How the data is built

| When | What it does |
|---|---|
| Every morning, about 07:30 Bangkok time, when the computer is on | exchange rates, headlines on a rotation, the upcoming listings' check with the SEC, and every line rendered again from the stored figures |
| Saturdays (Bangkok time), the first run, and any morning the list is a week old or more | also SEC's bulk files, ESEF, the list, the fields, the profit rule and the yearly figures |

- Every request goes through one honest client: a list of allowed hosts, an honest User-Agent, pacing per host,
  retries with pauses, a back-off after "too many requests", size caps and the robots check. No browser identity,
  no proxies, no tricks. The SEC asks every program for a contact; it goes to the SEC's own hosts only and is not
  part of any file here.
- When a source does not answer, its part keeps its last good data and is marked stale. The page shows each part's
  own date.
- Every file is checked before it is published: its schema, its size, its links, every fact line against the
  wording rules, and a privacy check. A file that fails stops the publish, and the site stays as it was.
- When the computer is off, nothing is built that day, and the page says how old the facts are.

## The wording rules

- Tide Table never says buy, sell or hold, and never rates, scores, ranks or features a company.
- Each company and field shows what has been going well and what could go wrong, on the same paper, in the same
  ink, with the same counts. The sign of a fact picks its side; the sentence stays the same.
- No stars, dots or other meters, no "popular" or "trending" badges, and no highlighted rows.
- Every generated line passes the same wording check before it is written.
