```
 ::::::::  :::    :::     :::     ::::::::: ::::::::::: 
:+:    :+: :+:    :+:   :+: :+:   :+:    :+:    :+:     
+:+        +:+    +:+  +:+   +:+  +:+    +:+    +:+     
+#+        +#++:++#++ +#++:++#++: +#++:++#:     +#+     
+#+        +#+    +#+ +#+     +#+ +#+    +#+    +#+     
#+#    #+# #+#    #+# #+#     #+# #+#    #+#    #+#     
 ########  ###    ### ###     ### ###    ###    ###    
 ```

## File Map

| Script | Description | Exports |
|--------|------------|--------|
| `app.js` | App entry + wiring | — |
| `apiClient.js` | API layer + caching | `ApiClient` |
| `autofetch.js` | Auto-load historical data | `AutoFetch`, `autofetchEnabled` |
| `chart.js` | Chart engine (data + rendering) | `Chart`, `INTERVALS` |
| `sidebar.js` | Sidebar UI + controls | `Sidebar` |
| `settings.js` | Settings + preferences | `Settings` |
| `editor.js` | Indicator editor + runtime engine | `Editor` |
| `backtester.js` | Strategy optimizer (Web Workers) | `runBacktest`, `countCombinations` |
| `editorFullscreen.js` | Fullscreen code editor | `openFullscreen` |
| `editorShare.js` | Share + explore public indicators | `createShareModal`, `createExplorePanel` |
| `cache.js` | IndexedDB caching layer (charts + search) | `getCachedChart`, `setCachedChart`, `getCachedSearch`, `setCachedSearch` |
| `detector.js` | Device/browser detection utilities | `isIOS`, `isMac`, `isAndroid`, `isMobile`, `isFirefox`, `isChrome`, `isSafari` |
| `export.js` | Export system (CSV/JSON/TXT/table) | `Exporter` |
| `message.js` | Toasts + dialogs | `toast`, `confirm`, `deny`, `initMessage` |
| `network.js` | Online/offline state tracking | `isOnline`, `onNetworkChange` |
| `search.js` | Symbol search + URL routing | `Search`, `initUrlState` |
| `storage.js` | LocalStorage settings wrapper | `storage` |
| `svg.js` | SVG icon system (sprite-based) | `initSvgSprite`, icon exports |
| `timezone.js` | Timezone utilities | `localTimezone`, `isoInZone`, `shiftTimestamp` |
| `tools.js` | Chart drawing + interaction tools system | `Tools`, `toolsVisibility` |
| `tooltip.js` | Tooltip system (mobile + desktop) | `tooltip` |

---

## Core

<details>
<summary><strong>app.js</strong></summary>

Entry point. Initializes modules and loads chart.

- Builds layout  
- Loads user config  
- Initializes chart, sidebar, tools, search  
- Polls for new candles  

</details>

<details>
<summary><strong>apiClient.js</strong></summary>

API wrapper with caching + offline handling.

**Main:**
- `_chartData(sym, int, opts)` → fetch candles (cached)
- `_searchAPI(q)` → symbol search
- `_checkUpdatesAPI(sym, int, since)` → incremental updates
- `_userConfig()` → user config

**Also:**
- Streaming / polling support  
- API key handling  
- Timezone integration  
- Cache coordination with `cache.js`  

</details>


<details>
<summary><strong>autofetch.js</strong></summary>

Auto-fetches older data on scroll.

- Watches visible range  
- Calls `chart._extendBefore()` when near start  
- Stops when no more data  

</details>

<details>
<summary><strong>chart.js</strong></summary>

Core chart logic (data + rendering).

**Main:**
- `load(sym, int)`
- `_extendBefore(n)` / `_extendAfter(n)`
- `_appendCandles(candles)`

**Controls:**
- `_setMode`
- `_setField`
- `_setVolMode`

**Events:**
- `load`
- `dataChanged`
- `barsChanged`
- `trade`

</details>

<details>
<summary><strong>sidebar.js</strong></summary>

Sidebar controller (UI + actions).

- Timeframe switching  
- Data controls (extend / trim)  
- Export (CSV, JSON, TXT)  
- Saved assets + streams  
- Toggles editor + settings  

</details>

<details>
<summary><strong>settings.js</strong></summary>

Settings + preferences.

- Theme, chart mode, volume  
- Timezone handling  
- Autofetch, tooltips, sidebar behavior  
- API key + manual config  

</details>

<details>
<summary><strong>tools.js</strong></summary>

Chart drawing + interaction system for annotations on the chart.

**Core:**
- `Tools` → main controller for toolbar, drawing, and interactions
- `toolsVisibility` → global visibility state manager

**Features:**
- Drawing tools: brush, trendline, Fibonacci, measure
- Interaction modes: cursor, crosshair, select, draw modes
- Shape editing: move, resize, delete
- Canvas overlay rendering (high-DPI)
- Pointer-based interaction system

**UI:**
- Tool grouping (cursor/draw/utility groups)
- Mobile + desktop adaptive tool behavior
- Popout tool menus

**Draw Types:**
- Brush (freehand)
- Trend line
- Measure (distance + % change)
- Fibonacci retracement

**System:**
- Canvas overlay synced with chart
- Hit-testing for selection
- Drag + edit support
- Real-time rendering loop
- Chart-aware coordinate mapping

</details>

---

## Editor System

<details>
<summary><strong>editor.js</strong></summary>

Full indicator editor + execution engine.

**Features:**
- Code editor with IndexedDB snippets
- Async indicator runtime
- Plot system:
  - `plot`, `plotHist`, `plotBand`, `plotDot`
  - `plotArea`, `plotCandle`, `plotLabel`
- Trade system:
  - `buy(time, price)`
  - `sell(time, price)`

**Backtesting:**
- `await backtest({ strategy, params })`
- Progress UI + cancellation (AbortController)

**UI:**
- Snippet manager (save/load/delete)
- Indicator list with live editing
- Help/docs panel (cached)
- Share + explore integration

</details>

<details>
<summary><strong>backtester.js</strong></summary>

High-performance strategy optimizer using Web Workers.

**Core:**
- `runBacktest({ bars, params, strategy })`
- `countCombinations(params)`

**Features:**
- Parallel worker pool (up to 8)
- Dynamic batching (`BATCH_SIZE`)
- Transferable objects (`Float64Array`)
- Strategy compiled via `new Function`

**Scoring:**
- Profit-based evaluation
- Penalizes low trade counts

</details>

<details>
<summary><strong>editorFullscreen.js</strong></summary>

Fullscreen code editor overlay.

**Features:**
- Syntax highlighting (regex-based)
- Line numbers
- Auto-indent + bracket pairing
- Tab / shift-tab handling
- Scroll sync (overlay system)

**API:**
- `openFullscreen({ code, name, onChange, onClose })`

</details>

<details>
<summary><strong>editorShare.js</strong></summary>

Public indicator sharing + discovery system.

**Features:**
- Upload indicators with metadata
- Canvas screenshot capture
- Public feed browsing
- Load shared indicators into editor

**API:**
- `createShareModal()`
- `createExplorePanel()`
- `fetchPublicIndicators()`
- `loadPublicIndicator(id)`

</details>

---

## Utilities

<details>
<summary><strong>cache.js</strong></summary>

IndexedDB caching system for charts + search.

- Stores candles + search results  
- Expiry-based invalidation  
- Write queue per key (race-safe)  
- Candle normalization + deduplication  
- Range filtering (p1/p2/limit)  

</details>

<details>
<summary><strong>detector.js</strong></summary>

Device/browser detection utilities.

- `isIOS`
- `isMac`
- `isAndroid`
- `isMobile`
- `isFirefox`
- `isChrome`
- `isSafari`

</details>

<details>
<summary><strong>export.js</strong></summary>

Export system for chart data.

**Formats:**
- CSV
- JSON
- TXT
- Table overlay UI

**Features:**
- Indicator merging into dataset
- Dynamic column generation
- Time formatting (ISO / datetime / unix)

</details>

<details>
<summary><strong>message.js</strong></summary>

UI messaging system.

- Toast notifications
- Confirm dialogs
- Error handling (`deny`)
- DOM overlay system

</details>

<details>
<summary><strong>network.js</strong></summary>

Online/offline state tracking.

- `isOnline()`
- Event-based listeners for state changes

</details>

<details>
<summary><strong>search.js</strong></summary>

Symbol search + URL routing.

- Debounced search input
- Keyboard navigation
- Symbol selection + chart load
- URL sync (`?sym&interval`)

</details>

<details>
<summary><strong>storage.js</strong></summary>

LocalStorage wrapper.

- Typed getters/setters
- Default fallbacks
- Stores:
  - theme
  - chart settings
  - API keys
  - UI preferences

</details>

<details>
<summary><strong>svg.js</strong></summary>

SVG icon system (sprite-based).

- Injects SVG sprite once
- Reusable `<use>` icons
- Large icon set (tools, cursor, charts, UI)

</details>

<details>
<summary><strong>timezone.js</strong></summary>

Timezone utilities.

- Convert UNIX timestamps between zones
- ISO formatting per timezone
- Offset calculations

</details>

<details>
<summary><strong>tooltip.js</strong></summary>

Tooltip system (mobile + desktop).

- Hover tooltips (desktop)
- Touch tracking tooltips (mobile)
- Auto-clamping to viewport
- Storage toggle support

</details>