<p align="center">
  <img src="./public/w3c.svg" width="80" alt="W3C_BATCH logo">
</p>

<h1 align="center">W3C_BATCH</h1>

Batch HTML validator against the [W3C Nu validator](https://validator.w3.org/nu/). Paste a sitemap XML, validate all pages, get a consolidated report.

## CLI

```bash
npx tsx src/cli.ts --sitemap https://example.com/sitemap.xml
```

| Flag              | Description                                                       |
| ----------------- | ----------------------------------------------------------------- |
| `--sitemap <url>` | **(required)** URL of the sitemap.xml                             |
| `--base <url>`    | Override base URL (useful for localhost/staging)                  |
| `--output <file>` | HTML report path (default: `report.html`)                         |
| `--delay <ms>`    | Delay between requests (default: `1000`) — **W3C recommends ≥1s** |
| `--unique`        | Show deduplicated errors summary                                  |

Localhost URLs are auto-detected — HTML is fetched locally and POSTed to the W3C API instead of asking the validator to reach your machine.

> **Rate limit**: The W3C Nu validator public API recommends no more than **1 request per second** from automated tools. The default `--delay 1000` respects this. Lowering it risks getting rate-limited or blocked.

## UI

```bash
npm run dev
```

Opens at `http://localhost:3000`. Paste sitemap XML, click **SCAN_NOW**, watch results stream in real-time. Toggle **Filter Unique Exceptions** to deduplicate errors across pages. Light/dark theme included.
