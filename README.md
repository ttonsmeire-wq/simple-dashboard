# Simple-Dashboard

Browser-based supply chain dashboards. Upload raw data, confirm how its columns map, and view dashboards organized by theme and module.

**Live:** https://ttonsmeire-wq.github.io/simple-dashboard/

## Privacy

Files are read in the browser and saved only in that browser (IndexedDB). Nothing is sent to a server. Users can save and load a setup file to move their data and mappings between computers.

## Themes

| Theme | Status | Data types (each has its own upload and mapping) | Modules |
|---|---|---|---|
| Carrier Scorecard | Live | Shipments, Tenders | Carrier Ranking, On-Time Performance, Cost, Tender Acceptance, Claims |
| HR / Workday Exports | Planned | — | Headcount & Org, Turnover & Attrition, Hiring Pipeline, Labor Hours & Overtime, Absenteeism |
| Demand & Fulfillment | Planned | — | Demand Trend, Fill Rate & OTIF, Order Cycle Time, Backorders & Stockouts, SKU ABC Analysis |

## How it's built

Plain HTML, CSS, and JavaScript modules; no build step. GitHub Actions publishes the repo to GitHub Pages on every push to `main`.

```
index.html                 app shell
css/app.css                styles (light and dark)
js/main.js                 routing, data page, column mapping UI, filters, save/load setup
js/store.js                browser storage (IndexedDB)
js/ingest.js               reads CSV (bundled Papa Parse) and Excel (SheetJS, loaded on demand)
js/mapping.js              auto-suggested column mapping and row validation
js/coerce.js               date / number / yes-no parsing
js/charts.js               SVG bar and line charts, tables
js/themes/index.js         theme registry
js/themes/carrier/         Carrier Scorecard: schema, metrics, modules
data/                      fictional sample data
tools/generate_sample.py   regenerates the sample data (fixed seed)
```

## Adding a theme

Add a folder under `js/themes/` with a `schema.js` (datasets and their fields, with synonyms for auto-mapping), `metrics.js` (pure calculations), and `modules.js` (pages), then register it in `js/themes/index.js`.

## Metric definitions (Carrier Scorecard)

- **On-time delivery:** delivered on or before the scheduled delivery date. Shipments missing either date are excluded from the rate.
- **On-time pickup:** actual pickup on or before the scheduled pickup date.
- **Cost per mile / per CWT:** total cost ÷ total miles, and total cost ÷ (total weight ÷ 100). Ratios of totals, not averages of per-row ratios.
- **Tender acceptance:** accepted offers ÷ all offers.
- **Claim rate:** shipments with a claim amount above $0 ÷ shipments.
- **Ranking:** each measure is rescaled across carriers (best = 100, worst = 0), then combined by user-set weights. Weights are rescaled when a measure has no data.

Dates in `m/d/yyyy` form are read as US month/day.

## Credits

CSV parsing: [Papa Parse](https://www.papaparse.com/) (MIT). Excel parsing: [SheetJS Community Edition](https://sheetjs.com/) (Apache 2.0), loaded from the official SheetJS CDN only when an Excel file is uploaded.
