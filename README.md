# Arbor3D 盤點介面

登入 → 地圖選公園／學校與路徑 → 錄製路線、匯入 PLY 與照片 → 查看盤點成果。

> 遠端接資料、新掃描怎麼放：[NEXT_STEPS.md](./NEXT_STEPS.md)

## 使用流程

1. **登入：** 選工作編號、輸入密碼，或按「示範登入」
2. **選點：** 搜尋縣市＋名稱（例如：台中逢甲）
3. **已盤點路徑：** 點路徑先看樹表；旁邊「匯入」可再上傳
4. **尚未盤點：** 點路徑開匯入
5. **錄製路徑（可選，側欄收合）：** 精度 ≤ 10 m 才記點；可保存到地圖、下載 GPX
6. **匯入：** 去噪 PLY、高斯濺射 PLY、這一趟的照片資料夾
7. **盤點視窗：** 摘要燈號、影像／量測／3D、待複核、現場手測、匯出 CSV

地圖用 [Leaflet](https://leafletjs.com/) + 國土測繪底圖（街道／空拍）。3D 點雲用 Three.js，樹會直立、只能繞鉛直軸轉。

## 匯入三格

| 格位 | 內容 |
|------|------|
| 去噪 PLY | RayStudio 解算去噪後的一個 `.ply` |
| 高斯濺射 PLY | 訓練完成後**匯出**的 `.ply`（不要用 `ray_gaussian/input.ply`） |
| 原始照片 | 這一趟訓練用的影像資料夾（一個即可） |

編號預設隨照片資料夾名，可自行修改。只訓練一組時不必再分去程／回程。

沒有設定量測管線時，上傳只會收檔到 `inbox/` 與 `public/scans/{scanId}/_inbox_staged/`，**不會自動出樹表**。樹表要等 Python 產出 JSON 並綁定，或沿用下方示範掃描。

## 示範帳號

| 工作編號 | 姓名 | 角色 | 密碼 |
|---------|------|------|------|
| E-1027 | 林志偉 | 現場調查員 | arbor1027 |
| E-2041 | 陳雅婷 | 複核人員 | arbor2041 |
| E-3308 | 黃建宏 | 承辦人 | arbor3308 |

## 示範資料

- **逢甲大學 → 校園掃描路徑**（掃描 `20260812070325`，5 棵樹）
- JSON：`src/data/inventories/20260812070325.json`
- 媒體：`public/scans/20260812070325/`
- 燈號：001／003／005 淡黃；**002／004 淡紅**（勿當正式樹圍）
- 此掃描無樹上 GPS；地圖樹位依相對座標沿路徑折線放置

本機驗證：登入 → 搜尋「逢甲」→ 點「校園掃描路徑」→ 樹表、橫切面、3D。

## 啟動

```bash
npm install
npm run dev
```

接量測管線（可選）：

```bash
export ARBOR3D_CMD='python3 /path/to/script.py --job-dir {jobDir} --scan-id {scanId}'
# 或
export ARBOR3D_ROOT=/path/to/Arbor3D
```

Windows PowerShell 請改用 `$env:ARBOR3D_CMD='...'`。

倉庫：https://github.com/toby0407-del/arbor3d-interface
