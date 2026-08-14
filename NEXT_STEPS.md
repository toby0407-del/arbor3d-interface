# Arbor3D 介面 — 未完成事項（給遠端／另一台機器讀）

> 倉庫：https://github.com/toby0407-del/arbor3d-interface  
> 量測／演算法倉庫（Python）：https://github.com/toby0407-del/Arbor3D  
> 這份文件說明：**介面已做到哪、遠端要把真實觀測資料怎麼放、還缺什麼。**

---

## 一、目前介面已完成（可演示）

1. 示範帳號登入（`src/data/staff.ts`）
2. 全台灣公園／學校選點（OSM 目錄：`src/data/taiwan_sites.json`）
3. 關鍵字搜尋（支援台／臺、縣市、國小等同義）
4. GPS 定位：以自己為中心約 100 km；地圖鎖在台灣＋近離島
5. 現場錄製路徑：精度 **≤ 10 m** 才開始記點；可下載 GPX
6. 觀測 JSON 綁地點：`src/data/inventories/{scan_id}.json` + `src/data/scanBindings.ts`
7. 有盤點的地點：地圖黃點、列表「已盤點」；無資料不能進盤點
8. 路徑總覽／待複核／詳情；現場手測可填、存 localStorage、匯出 CSV
9. 照片／3D：沒檔就顯示「尚未匯入」（不再用假點雲假裝已接上）

**目前唯一有盤點示範資料的路徑：**

- 公園：`臺中中央公園`
- 路徑：`水湳東側步道`（`central-east`）
- 掃描：`20260812070325`
- JSON：`src/data/inventories/20260812070325.json`

---

## 二、遠端電腦「把實際觀測資料接上」要做的事（優先）

### 步驟 A — 放入掃描報告

Python 產出的 `park_inventory_report.json` 請複製並改名：

```text
arbor3d-interface/src/data/inventories/{scan_id}.json
```

例如掃描編號是 `20260812070325`，檔名就是 `20260812070325.json`。  
檔案內容的 `scan_id` 欄位要與檔名一致。

### 步驟 B — 綁到哪個公園／哪條路徑

編輯：

```text
src/data/scanBindings.ts
```

在 `SCAN_BINDINGS` 陣列加一筆，例如：

```ts
{
  parkName: "臺中中央公園",   // 必須與 OSM 目錄裡的 name 完全相同
  pathId: "central-east",     // 路徑唯一 id（英文代號即可）
  pathName: "水湳東側步道",    // 畫面上顯示的名稱
  scanId: "20260812070325",   // 對應 inventories 檔名
  polyline: [                 // 路徑座標 [lat, lng]；可用現場錄的 GPX 轉進來
    [24.18793, 120.65331],
    // ...
  ],
}
```

重點：

- `parkName` 要能在選點清單裡搜到（與 `taiwan_sites.json` 的 `name` 一致）
- 同一公園可加多筆 path／scan；頂部可切換掃描（`scanIds`）

### 步驟 C — 照片、遮罩、剖面、3D

JSON 裡的相對路徑（例如 `photos/Tree_001.jpg`、`models/Tree_001_supersplat.ply`）請放到：

```text
arbor3d-interface/public/scans/{scan_id}/photos/...
arbor3d-interface/public/scans/{scan_id}/masks/...
arbor3d-interface/public/scans/{scan_id}/dbh/...
arbor3d-interface/public/scans/{scan_id}/models/...
```

對應程式：`src/lib/scanMedia.ts`  
沒放檔時，詳情／3D 會顯示「尚未匯入」，這是預期行為。

### 步驟 D — 本機驗證

```bash
git clone https://github.com/toby0407-del/arbor3d-interface.git
cd arbor3d-interface
npm install
npm run dev
```

登入示範帳號 → 搜尋公園名 → 選有「已盤點」的路徑 → 進入盤點，確認樹數、燈號、CSV、照片路徑。

---

## 三、尚未做／建議下一台繼續做

依優先順序：

| 優先 | 項目 | 說明 |
|------|------|------|
| P0 | 接真實掃描檔 | 依上面 A–C，把遠端產出接進 `inventories` + `scanBindings` + `public/scans` |
| P0 | 實際步道路線 | 示範 polyline 是示意；應用現場 GPX／錄製軌跡取代，或從掃描 GPS 轉入（若有） |
| P1 | 真 3D 載入 `.ply` | 現在只有「未匯入」空狀態；接上 Three.js／SuperSplat 讀真實 ply |
| P1 | 多掃描同一路徑 | 綁定已支援多 `scanId`，需多份 JSON 與 UI 再測一輪 |
| P1 | 正式帳號 API | 現在是寫死示範帳號；上線前拿掉畫面上印出的密碼 |
| P2 | 手機版 UX | 戶外單手：大按鈕、地圖全螢幕、少並排 |
| P2 | 離線包 | 公園常沒網；已下載的掃描可離線看 |
| P2 | 手測同步後端 | 手測目前只存瀏覽器 localStorage，換機會不見 |

---

## 四、重要檔案索引

| 路徑 | 用途 |
|------|------|
| `src/data/taiwan_sites.json` | 全台公園／學校目錄（OSM） |
| `src/data/inventories/*.json` | 每次掃描的盤點報告 |
| `src/data/scanBindings.ts` | 掃描 ↔ 公園／路徑綁定 |
| `src/data/inventory.ts` | 自動載入 inventories |
| `src/lib/scanMedia.ts` | `public/scans/{scan_id}/...` URL |
| `src/hooks/usePathRecorder.ts` | GPS 錄製（起測門檻 10 m） |
| `src/hooks/useFieldMeasures.ts` | 現場手測（localStorage） |
| `src/lib/csv.ts` | 匯出 CSV |
| `src/types.ts` | `ParkInventoryReport`／樹欄位型別 |
| `src/data/park_inventory_report.sample.json` | 舊示範檔（正式請用 inventories） |

---

## 五、燈號規則（勿改錯語意）

程式：`src/lib/status.ts`

- **淡綠：** 演算法較可信
- **淡黃：** 有數字，但不是標準 1.3 m（`not_1.3m`）
- **淡紅：** 卡尺偏寬／量不到等；**不要當正式樹圍**；進「待複核」

手測欄位是另存，**不覆蓋**演算法 `DBH_cm`。

---

## 六、給另一台／另一個 agent 的最短指令

```text
1. Clone arbor3d-interface，npm install && npm run dev
2. 讀 NEXT_STEPS.md 第二節
3. 把 Python 產出的 park_inventory_report.json 放到 src/data/inventories/{scan_id}.json
4. 編輯 src/data/scanBindings.ts 綁公園名與路徑 polyline
5. 把照片／ply 放到 public/scans/{scan_id}/
6. 重新 npm run dev，在選點頁確認出現「已盤點」並能進入總覽
```

完成後請更新本檔「目前唯一有盤點示範資料」區塊，並 push。
