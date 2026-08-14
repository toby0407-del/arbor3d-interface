# Arbor3D 介面 — 進度與接資料說明

> 倉庫：https://github.com/toby0407-del/arbor3d-interface  
> 量測／演算法倉庫（Python）：https://github.com/toby0407-del/Arbor3D  
> 這份文件說明：**介面已做到哪、真實觀測資料怎麼放、還缺什麼。**

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
9. **真實媒體已接上主掃描**：照片、YOLO 遮罩、胸高剖面、演算法俯視圖
10. **真實 3DGS `.ply` 點雲檢視**（Three.js；無檔時仍顯示「尚未匯入」）

### 目前已接上的實測掃描

| 項目 | 內容 |
|------|------|
| 地點 | `逢甲大學`（學校） |
| 路徑 | `校園掃描路徑`（`fengchia-campus`） |
| 掃描 | `20260812070325` |
| JSON | `src/data/inventories/20260812070325.json` |
| 媒體 | `public/scans/20260812070325/{photos,masks,dbh,models,maps}/` |
| 樹數 | 5 棵（Tree_001–005） |
| 燈號 | 001／003／005 淡黃；**002／004 淡紅**（勿當正式樹圍） |
| GPS | 此掃描無 GPS；樹位用相對座標放到示範 polyline |

本機驗證路徑：登入 → 搜尋「逢甲大學」→ 選「校園掃描路徑（已盤點）」→ 總覽看樹卡與俯視圖 → 詳情看照片／遮罩／剖面 → 開 3D。

---

## 二、之後再接新掃描（遠端／另一台）

### 步驟 A — 放入掃描報告

Python 產出的 `park_inventory_report.json` 請複製並改名：

```text
arbor3d-interface/src/data/inventories/{scan_id}.json
```

檔案內容的 `scan_id` 欄位要與檔名一致。路徑欄位用**相對路徑**，例如：

```json
"Best_Photo": "photos/Tree_001.jpg",
"Mask_Path": "masks/real_tree_mask_Tree_001.jpg",
"Cross_Section_Image": "dbh/dbh_slice_top_down_Tree_001.png",
"3D_Model_Path": "models/Tree_001_supersplat.ply"
```

### 步驟 B — 綁到哪個公園／哪條路徑

編輯 `src/data/scanBindings.ts`，在 `SCAN_BINDINGS` 加一筆：

```ts
{
  parkName: "逢甲大學",        // 必須與 OSM 目錄 name 完全相同
  pathId: "fengchia-campus",
  pathName: "校園掃描路徑",
  scanId: "20260812070325",
  polyline: [ /* [lat, lng] */ ],
}
```

### 步驟 C — 照片、遮罩、剖面、3D、俯視圖

```text
public/scans/{scan_id}/photos/...
public/scans/{scan_id}/masks/...
public/scans/{scan_id}/dbh/...
public/scans/{scan_id}/models/...
public/scans/{scan_id}/maps/tree_id_map_dbh.png   # 可選，總覽會顯示
```

對應程式：`src/lib/scanMedia.ts`（組成 `/scans/{scanId}/{相對路徑}`）。

### 步驟 D — 本機驗證

```bash
git pull
npm install
npm run dev
```

---

## 三、尚未做／建議下一輪

| 優先 | 項目 | 說明 |
|------|------|------|
| P0 | 實際步道路線 | 示範 polyline 仍是示意；應用現場 GPX／錄製軌跡取代 |
| P1 | 多掃描同一路徑 | 綁定已支援多 `scanId`，需多份 JSON 再測 |
| P1 | 正式帳號 API | 現在是寫死示範帳號；上線前拿掉畫面上印出的密碼 |
| P2 | 手機版 UX | 戶外單手：大按鈕、地圖全螢幕 |
| P2 | 離線包 | 公園常沒網 |
| P2 | 手測同步後端 | 手測目前只存 localStorage |

~~P0 接真實掃描檔~~（主掃描已完成）  
~~P1 真 3D 載入 `.ply`~~（已用點雲方式讀 supersplat ply）

---

## 四、重要檔案索引

| 路徑 | 用途 |
|------|------|
| `src/data/taiwan_sites.json` | 全台公園／學校目錄（OSM） |
| `src/data/inventories/*.json` | 每次掃描的盤點報告 |
| `src/data/scanBindings.ts` | 掃描 ↔ 公園／路徑綁定 |
| `src/data/inventory.ts` | 自動載入 inventories |
| `src/lib/scanMedia.ts` | `public/scans/{scan_id}/...` URL |
| `src/lib/loadPly.ts` | 讀 binary PLY 給 3D 檢視 |
| `src/hooks/usePathRecorder.ts` | GPS 錄製（起測門檻 10 m） |
| `src/hooks/useFieldMeasures.ts` | 現場手測（localStorage） |
| `src/lib/csv.ts` | 匯出 CSV |
| `public/scans/{scan_id}/` | 該次掃描的照片／遮罩／剖面／模型 |

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
1. git pull；npm install && npm run dev
2. 讀 NEXT_STEPS.md 第二節（若要接新掃描）
3. 新掃描：inventories/{scan_id}.json + scanBindings.ts + public/scans/{scan_id}/
4. 驗證：搜尋「逢甲大學」→ 校園掃描路徑 → 詳情照片／3D 應有真實檔
```

完成新掃描後，請更新本檔「目前已接上的實測掃描」區塊，並 push。
