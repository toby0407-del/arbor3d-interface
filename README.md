# Arbor3D 盤點介面

> **倉庫**：https://github.com/toby0407-del/arbor3d-interface  
> **量測管線（Python）**：https://github.com/toby0407-del/Arbor3D

---

## 一、系統概覽

本專案是一套基於瀏覽器的**樹木盤點複核工具**，用於：

1. 在地圖上選擇公園／學校 → 選擇掃描路徑
2. 上傳去噪 PLY、高斯濺射 PLY、原始照片 → 系統收檔並可接量測管線
3. 查看盤點結果：樹表、胸徑燈號、Segmentation、橫切面、3D 點雲
4. 填寫現場手測、碳匯計算、匯出 CSV

**技術棧**：React 19 + TypeScript + Vite 8 + Leaflet（國土測繪底圖）+ Three.js（3D 點雲）

---

## 二、使用流程

```
┌──────────┐     ┌────────────┐     ┌──────────────┐     ┌───────────────┐
│  1. 登入  │ ──→ │ 2. 地圖選點 │ ──→ │ 3. 點路徑     │ ──→ │ 4. 盤點／匯入  │
│  帳密驗證  │     │ 搜尋＋GPS   │     │ 已盤點→樹表   │     │ 三格上傳       │
└──────────┘     └────────────┘     │ 未盤點→匯入   │     │ 碳匯＋CSV      │
                                    └──────────────┘     └───────────────┘
```

### 步驟詳解

| 步驟 | 操作 | 說明 |
|------|------|------|
| **1. 登入** | 選工作編號 → 輸密碼 → 進入；或按「示範登入」 | 帳號在 `src/data/staff.ts`，上線前換 API |
| **2. 地圖選點** | 搜尋欄打「台中逢甲」、或直接點地圖上的點 | 支援台／臺互轉、縣市＋名稱連打 |
| **3a. 已盤點路徑** | 點路徑 → 直接開盤點視窗（樹表、影像、3D、碳匯） | 旁邊有「匯入」按鈕可再上傳新一組 |
| **3b. 尚未盤點** | 點路徑 → 開匯入對話框 | 三格上傳（見下方） |
| **4. 錄製路徑**（可選） | 側欄展開 → 開始記錄 → 停止時問是否保存 | 精度 ≤ 10 m 才記點；可下載 GPX |
| **5. 匯入** | 去噪 PLY、高斯濺射 PLY、原始照片資料夾 | 編號自動跟資料夾名；可選年度與去回程 |
| **6. 盤點視窗** | 樹表（燈號篩選）、影像分頁、量測分頁、3D 分頁、碳匯工作表 | 手測存 localStorage、匯出 CSV |

### 匯入三格

| 格位 | 類型 | 內容 |
|------|------|------|
| 去噪 PLY | 選 `.ply` 檔 | RayStudio 解算去噪後的 PLY |
| 高斯濺射 PLY | 選 `.ply` 檔 | 訓練完成後**匯出**的 PLY（不要用 `ray_gaussian/input.ply`） |
| 原始照片 | 選**資料夾** | 這一趟訓練用的影像資料夾 |

上傳前會驗證副檔名和 PLY 檔頭（ASCII `ply` magic）。編號 ID 自動等於原始照片資料夾名。

---

## 三、專案架構

```
arbor3d-interface/
├── index.html                      # Vite 入口
├── vite.config.ts                  # Vite 設定（含 importApiPlugin）
├── package.json
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
│
├── server/                         # Vite dev server 中介層
│   └── importApiPlugin.ts          # POST /api/import/jobs 收檔 + 跑管線
│
├── scripts/
│   ├── run-postprocess.mjs         # 後續量測（呼叫 Arbor3D Python）
│   ├── compute-inventory.mjs       # 本機計算盤點 JSON
│   └── render_inventory_figures.py # 產生俯視圖等圖片
│
├── inbox/                          # 匯入上傳暫存（.gitignore）
│
├── public/
│   ├── favicon.svg
│   ├── icons.svg
│   └── scans/
│       ├── 20260812070325/         # 示範掃描媒體
│       │   ├── photos/             # 原圖
│       │   ├── masks/              # YOLO Segmentation
│       │   ├── dbh/                # 胸高橫切面
│       │   ├── models/             # 單棵樹 PLY
│       │   └── maps/               # 俯視圖
│       └── 20260818092855/         # 8/18 實測掃描
│           ├── dbh/
│           ├── masks/
│           ├── maps/
│           ├── previews/
│           └── inventory.json
│
└── src/
    ├── main.tsx                    # React 進入點
    ├── App.tsx                     # 路由：login ↔ sites
    ├── types.ts                    # TreeRecord, ParkInventoryReport, TrafficLight
    ├── index.css                   # 全站樣式
    │
    ├── pages/
    │   ├── LoginPage.tsx           # 登入畫面（帳密 + 示範登入）
    │   ├── SitePickerPage.tsx      # 地圖選點＋側欄（錄製、路徑列表、overlays）
    │   ├── PathInventoryDialog.tsx  # 盤點視窗（樹表、影像、量測、3D、碳匯）
    │   └── PathImportDialog.tsx    # 匯入對話框（三格 + 年度 + 進度）
    │
    ├── components/
    │   ├── OsmSiteMap.tsx          # Leaflet 地圖（定位、底圖切換、overlays）
    │   ├── PathTreeMap.tsx         # 路徑小地圖（盤點視窗內）
    │   ├── PlyViewer.tsx           # Three.js 3D 點雲（直立、繞鉛直軸）
    │   ├── ColorLegend.tsx         # 綠黃紅燈號說明
    │   └── BrandMark.tsx           # Logo SVG
    │
    ├── hooks/
    │   ├── usePathRecorder.ts      # GPS 錄製（起測 ≤ 10 m）
    │   └── useFieldMeasures.ts     # 現場手測（存 localStorage）
    │
    ├── lib/
    │   ├── session.ts              # sessionStorage 登入狀態
    │   ├── geolocation.ts          # 快速定位策略（Wi-Fi → GPS）
    │   ├── mapBounds.ts            # 台灣範圍常數
    │   ├── mapTiles.ts             # 國土測繪底圖（街道 / 空拍）
    │   ├── mapViewStore.ts         # 地圖視野持久化（sessionStorage）
    │   ├── mapOverlays.ts          # 錄製／匯入路段 overlays
    │   ├── treePlacement.ts        # 無 GPS 時沿路徑折線放樹點
    │   ├── scanMedia.ts            # 組 /scans/{scanId}/{path} URL
    │   ├── loadPly.ts              # 解析 PLY（ascii / binary）
    │   ├── importApi.ts            # 前端 fetch /api/import/*
    │   ├── status.ts               # 燈號判定 + inventoryStats
    │   ├── carbon.ts               # 碳匯公式（圓周 × 高 × 係數）
    │   ├── csv.ts                  # 匯出 CSV（盤點 + 碳匯）
    │   ├── format.ts               # 格式化胸徑、弧度、坐標
    │   └── gpx.ts                  # GPX 匯出 + haversine
    │
    └── data/
        ├── taiwan_sites.json       # 全台公園／學校目錄（OSM 匯出）
        ├── sites.ts                # 地點搜尋、tokenize
        ├── scanBindings.ts         # 掃描 ↔ 公園／路徑綁定
        ├── inventory.ts            # 自動載入 inventories/*.json
        ├── inventories/
        │   ├── 20260812070325.json # 示範掃描盤點 JSON
        │   └── 20260818092855.json # 8/18 實測盤點 JSON
        ├── staff.ts                # 示範帳號
        └── park_inventory_report.sample.json
```

---

## 四、資料流

```
現場拍攝
   │
   ▼
RayStudio 去噪 → 去噪 .ply ─┐
RayStudio 高斯濺射 → 濺射 .ply ─┤──→ 介面「匯入三格」
原始照片資料夾 ──────────────────┘        │
                                         ▼
                                  inbox/{jobId}/
                                  ├── denoised/
                                  ├── gaussian/
                                  └── raw/
                                         │
                         ┌───────────────┤
                         │ 有設管線？     │
                         │               │
                    是   ▼          否   ▼
              run-postprocess.mjs     收檔到
              → Arbor3D Python        public/scans/{scanId}/_inbox_staged/
              → 產出 JSON + 媒體       （手動跑 Python 後再綁定）
                         │
                         ▼
              src/data/inventories/{scanId}.json  ← 盤點報告
              src/data/scanBindings.ts            ← 綁到公園路徑
              public/scans/{scanId}/              ← 照片/遮罩/剖面/PLY
                         │
                         ▼
                    介面顯示盤點
```

---

## 五、燈號規則

程式：`src/lib/status.ts`

| 燈號 | 條件 | 意義 |
|------|------|------|
| **淡綠** | 無特殊 note | 演算法較可信，可作盤點參考 |
| **淡黃** | — | （保留，目前未使用） |
| **淡紅** | `wide_caliper`、`gap`、`no_measurement` | 卡尺偏寬／切片缺口／量不到；**勿當正式樹圍**，進「待複核」 |

現場手測欄位（`useFieldMeasures`）另存 localStorage，**不覆蓋**演算法 `DBH_cm`。

---

## 六、碳匯計算

程式：`src/lib/carbon.ts`

公式：`碳儲量D = 圓周² × 樹高 × 係數`，`CO₂當量 = D × 3.667`

| 欄位 | 來源 | 備註 |
|------|------|------|
| 圓周 (m) | π × DBH(m) | 手測優先，回退演算法 |
| 樹高 (m) | 手測 or 估算 | 無實測時用 `1.3 + 1.8√DBH` 粗估，標記「估算」 |
| 係數 | 預設 0.0159（表定）| 可選闊葉 0.027 / 針葉 0.020 / 自訂 |

---

## 七、示範帳號

| 工作編號 | 姓名 | 角色 | 密碼 |
|---------|------|------|------|
| E-1027 | 林志偉 | 現場調查員 | arbor1027 |
| E-2041 | 陳雅婷 | 複核人員 | arbor2041 |
| E-3308 | 黃建宏 | 承辦人 | arbor3308 |

---

## 八、已接上的實測掃描

| 項目 | 掃描 1 | 掃描 2 |
|------|--------|--------|
| 地點 | 逢甲大學 | 逢甲大學 |
| 路徑 | 校園掃描路徑 | 校園掃描路徑（8/18） |
| scan_id | `20260812070325` | `20260818092855` |
| JSON | `src/data/inventories/20260812070325.json` | `src/data/inventories/20260818092855.json` |
| 媒體 | `public/scans/20260812070325/` | `public/scans/20260818092855/` |
| 棵數 | 5 棵 | 依 JSON |
| GPS | 無（用相對座標沿路徑放置） | 依 JSON |

---

## 九、啟動

```bash
git clone https://github.com/toby0407-del/arbor3d-interface.git
cd arbor3d-interface
npm install
npm run dev
```

瀏覽器開 http://127.0.0.1:5173/，登入後搜尋「逢甲」即可驗證。

### 接量測管線（可選）

```bash
# 方法 A：完整指令（{jobDir}、{scanId} 會被代入）
export ARBOR3D_CMD='python3 /path/to/Arbor3D/scripts/postprocess_from_inbox.py --job-dir {jobDir} --scan-id {scanId}'

# 方法 B：指定 Arbor3D 倉庫路徑
export ARBOR3D_ROOT=/path/to/Arbor3D

# Windows PowerShell
$env:ARBOR3D_CMD='python3 ...'
```

### 其他 npm scripts

| 指令 | 說明 |
|------|------|
| `npm run dev` | 啟動 Vite 開發伺服器 |
| `npm run build` | TypeScript 檢查 + 打包 |
| `npm run lint` | oxlint 檢查 |
| `npm run preview` | 預覽 build 產物 |
| `npm run postprocess` | 手動跑後續量測 `node scripts/run-postprocess.mjs <jobDir> <scanId>` |

---

## 十、接新掃描（詳細步驟）

見 [NEXT_STEPS.md](./NEXT_STEPS.md)

---

## 十一、重要檔案索引

| 路徑 | 用途 |
|------|------|
| `src/App.tsx` | 根元件（login ↔ sites 兩畫面） |
| `src/pages/SitePickerPage.tsx` | 地圖選點主頁 |
| `src/pages/PathInventoryDialog.tsx` | 盤點視窗（樹表＋影像＋量測＋3D＋碳匯） |
| `src/pages/PathImportDialog.tsx` | 匯入三格對話框 |
| `src/components/OsmSiteMap.tsx` | Leaflet 地圖 |
| `src/components/PlyViewer.tsx` | Three.js 3D 點雲 |
| `src/data/taiwan_sites.json` | 全台公園／學校 OSM 目錄 |
| `src/data/inventories/*.json` | 盤點報告 JSON |
| `src/data/scanBindings.ts` | 掃描 ↔ 地點綁定 |
| `src/lib/status.ts` | 燈號判定 |
| `src/lib/carbon.ts` | 碳匯公式 |
| `src/lib/treePlacement.ts` | 無 GPS 時樹位插值 |
| `src/hooks/useFieldMeasures.ts` | 現場手測（localStorage） |
| `src/lib/csv.ts` | CSV 匯出 |
| `server/importApiPlugin.ts` | `/api/import` 後端 |
| `scripts/run-postprocess.mjs` | 管線呼叫腳本 |
