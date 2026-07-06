```
 ██████╗██╗  ██╗ █████╗ ██████╗ ████████╗██╗   ██╗███████╗██╗
██╔════╝██║  ██║██╔══██╗██╔══██╗╚══██╔══╝╚██╗ ██╔╝██╔════╝██║
██║     ███████║███████║██████╔╝   ██║    ╚████╔╝ █████╗  ██║
██║     ██╔══██║██╔══██║██╔══██╗   ██║     ╚██╔╝  ██╔══╝  ██║
╚██████╗██║  ██║██║  ██║██║  ██║   ██║      ██║   ██║     ██║
 ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝      ╚═╝   ╚═╝     ╚═╝
```

## Description

Chartyfi is a charting application using Tradingview's lightweight charts, sourcing yahoo finance data, utilizing data analysis cycle.tools endpoints, and connecting to NVDIA's LLM's for indicator generation from natural language and additional AI app features

## External API Endpoints

| Service | Endpoint | Purpose |
|---------|----------|---------|
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1/chat/completions` | Streams LLM responses for AI-powered indicator generation and analysis. |
| cycle.tools | `https://api.cycle.tools/api/cycles/CycleScanner` | Performs cycle analysis on historical price data. |
| cycle.tools | `https://api.cycle.tools/api/CycleConsensus/calculate` | Calculates cycle consensus from historical price data. |
| cycle.tools | `https://api.cycle.tools/api/Stream/SubmitStreamData` | Uploads market data to Live Pulse Streams. |
| Yahoo Finance | `https://query1.finance.yahoo.com/v1/finance/search?q={query}` | Searches for stocks, ETFs, indices, currencies, and other financial instruments. |
| Yahoo Finance | `https://query2.finance.yahoo.com/v8/finance/chart/{symbol}` | Retrieves historical OHLCV price data. |
| Yahoo Finance | `https://query2.finance.yahoo.com/ws/insights/v1/finance/insights?symbol={symbol}` | Retrieves analyst insights and research data. |
| Yahoo Finance | `https://query1.finance.yahoo.com/v6/finance/quote/marketSummary` | Retrieves market summary information for major indices and markets. |
| Yahoo Finance | `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved` | Retrieves predefined stock screeners, including top gainers, losers, and most active stocks. |
| Yahoo Finance | `https://feeds.finance.yahoo.com/rss/2.0/headline?s={symbol}&region=US&lang=en-US` | Retrieves the latest news headlines for a symbol via RSS. |

## Tree

```
chartyfi/
├── README.md
├── index.html
├── manifest.webmanifest
├── register.js
├── sw.js
│
├── api/
│   ├── _link.php
│   ├── api_ai.php
│   ├── api_cycle.tools.php
│   ├── api_editor.php
│   ├── api_insights.php
│   ├── api_market.php
│   ├── api_news.php
│   ├── api_screener.php
│   ├── api.php
│   ├── apidata.php
│   │
│   ├── cron/
│   │   ├── cronCycleStream.php
│   │   └── cronSymbolStore.php
│   │
│   └── data/
│       ├── api.json
│       ├── config.php
│       ├── editorHelp.json
│       ├── instructconfig.php
│       ├── modelconfig.php
│       │
│       ├── cache/
│       │   └── screener.json
│       │
│       ├── indicators/
│       │   ├── *.jpg
│       │   └── *.json
│       │
│       └── instructions/
│           ├── indicators.txt
│           └── ratings.txt
│
└── assets/
    ├── css/
    │   ├── font.css
    │   └── style.css
    │
    └── scripts/
        ├── api.js
        ├── apiClient.js
        ├── app.bundled.js
        ├── app.js
        ├── appGuard.js
        ├── authPage.js
        ├── autoPoll.js
        ├── autofetch.js
        ├── backtester.js
        ├── cache.js
        ├── chart.js
        ├── cycleApp.js
        ├── cycleConsensus.js
        ├── dataintegrity.js
        ├── detector.js
        ├── editor.js
        ├── editorAi.js
        ├── editorFullscreen.js
        ├── editorParam.js
        ├── editorShare.js
        ├── emptyState.js
        ├── export.js
        ├── import.js
        ├── insights.js
        ├── marketSummary.js
        ├── message.js
        ├── miniApps.js
        ├── models.js
        ├── network.js
        ├── news.js
        ├── paneManager.js
        ├── screenshot.js
        ├── screener.js
        ├── search.js
        ├── settings.js
        ├── sidebar.js
        ├── spinner.js
        ├── storage.js
        ├── svg.js
        ├── timezone.js
        ├── tools.js
        ├── tooltip.js
        ├── urlState.js
        ├── watchlist.js
        │
        └── libs/
            └── lightweight-charts.standalone.production.js
```

## License

This project is licensed under the **GNU General Public License v3.0 (GPLv3)**.

You may use, modify, and distribute this software, but **any derivative work
must also be licensed under GPLv3 and remain open-source**.

See the [LICENSE file](https://github.com/composedbymax/openrouter-chatbot/blob/main/LICENSE) for full details.