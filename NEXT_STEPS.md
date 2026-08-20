# Arbor3D 介面 — 接新掃描與進階設定

> 倉庫：https://github.com/toby0407-del/arbor3d-interface  
> 量測／演算法倉庫（Python）：https://github.com/toby0407-del/Arbor3D  
> 主文件：[README.md](./README.md)

---

## 一、目前已完成功能

1. 示範帳號登入（`src/data/staff.ts`），含角色
2. 全台灣公園／學校選點（OSM 目錄 `src/data/taiwan_sites.json`）
3. 關鍵字搜尋（台／臺互轉、縣市＋名稱可連打）
4. GPS 快速定位（Wi-Fi → GPS；拖地圖停追蹤）
5. 現場錄製路徑（≤ 10 m 起測；停止時問保存；保存後畫在地圖上）
6. 盤點 JSON 綁定地點（`inventories/{scan_id}.json` + `scanBindings.ts`）
7. 盤點視窗：棵數／燈號摘要、篩選、Segmentation、橫切面、原圖
8. 量測分頁：現場手測（localStorage，不覆蓋演算法）、待複核、匯出 CSV
9. 碳匯工作表：圓周 × 高 × 係數 → CO₂ 當量
10. 3D 點雲（Three.js，自動直立，繞鉛直軸轉）
11. 地圖沿路徑標樹（無 GPS 時用 Local_XYZ_m 插值）
12. 匯入三格：去噪 PLY、高斯濺射 PLY、單趟照片；格式預驗、進度中文
13. 地圖視野持久化（除非登出）
14. 國土測繪底圖（街道 / 空拍 切換）

---

## 二、接新掃描

### 流程概覽

```
拍攝 → RayStudio 去噪 → 高斯濺射訓練 → 匯出
                                              │
                                  ┌────────────┤
                                  │            │
                            匯入上傳       或手動放檔
                           （App 三格）    （下方步驟 A–D）
                                  │            │
                                  ▼            ▼
                           inbox/ 收檔      直接放到
                              │             src/data/ + public/scans/
                              │                │
                         有設管線？             │
                         ├─ 是 → 跑 Python     │
                         └─ 否 → 暫存          │
                                               ▼
                                          介面看到樹表
```

### 步驟 A — 放入掃描報告（樹表出現的條件）

Python 管線產出的 `park_inventory_report.json` 複製並改名：

```
src/data/inventories/{scan_id}.json
```

- 檔案內 `scan_id` 欄位要與檔名一致
- 路徑欄位用**相對路徑**：

```json
{
  "Best_Photo": "photos/Tree_001.jpg",
  "Mask_Path": "masks/real_tree_mask_Tree_001.jpg",
  "Cross_Section_Image": "dbh/dbh_slice_top_down_Tree_001.png",
  "3D_Model_Path": "models/Tree_001_supersplat.ply",
  "Single_Tree_Ply": "models/Tree_001_single_tree.ply"
}
```

### 步驟 B — 綁到公園／路徑

編輯 `src/data/scanBindings.ts`，在 `SCAN_BINDINGS` 加一筆：

```ts
{
  parkName: "逢甲大學",          // 必須與 taiwan_sites.json name 完全相同
  pathId: "fengchia-campus-new",
  pathName: "新掃描路徑",
  scanId: "20260901120000",
  polyline: [
    [24.18122, 120.64674],       // [lat, lng] 數組
    [24.18122, 120.64714],
  ],
}
```

### 步驟 C — 放媒體檔

```
public/scans/{scan_id}/
├── photos/          # 原圖（對應 JSON 的 Best_Photo）
├── masks/           # YOLO Segmentation 遮罩
├── dbh/             # 胸高橫切面圖
├── models/          # 單棵樹 PLY
├── previews/        # 點雲預覽圖（可選）
└── maps/
    └── tree_id_map_dbh.png   # 俯視圖（可選，盤點視窗會顯示）
```

URL 組法：`src/lib/scanMedia.ts` → `/scans/{scanId}/{相對路徑}`

### 步驟 D — 驗證

```bash
git pull
npm install
npm run dev
```

登入 → 搜尋地點 → 點路徑 → 確認樹表、影像、3D 正常。

---

## 三、管線設定（可選）

未設定時匯入只收檔到 `inbox/` 和 `public/scans/{scanId}/_inbox_staged/`。

設定任一：

```bash
# 方法 A：完整指令
export ARBOR3D_CMD='python3 /path/to/script.py --job-dir {jobDir} --scan-id {scanId}'

# 方法 B：指定 Arbor3D 路徑（自動找 scripts/ 下的 postprocess 腳本）
export ARBOR3D_ROOT=/path/to/Arbor3D
```

管線應產出：
- `src/data/inventories/{scanId}.json`
- `public/scans/{scanId}/{photos,masks,dbh,models,maps}/`
- 更新 `src/data/scanBindings.ts`

---

## 四、尚未做／建議下一輪

| 優先 | 項目 | 說明 |
|------|------|------|
| P0 | 接上 Arbor3D 量測管線 | 未設 `ARBOR3D_CMD`／`ARBOR3D_ROOT` 時匯入只收檔 |
| P0 | 實際步道路線 | 示範 polyline 仍是示意；應用現場 GPX／錄製軌跡取代 |
| P1 | 多掃描同一路徑 | 綁定已支援多 `scanId`，需多份 JSON 再測 |
| P1 | 正式帳號 API | 現在是寫死示範帳號 |
| P2 | 手機版 UX | 戶外單手：大按鈕、地圖全螢幕 |
| P2 | 離線包 | 公園常沒網 |
| P2 | 手測同步後端 | 手測目前只存 localStorage |

~~P0 接真實掃描檔~~（逢甲示範掃描已完成）  
~~P1 真 3D 載入 `.ply`~~（點雲直立＋繞 Z 軸）  
~~P1 盤點摘要／待複核／CSV／手測~~（已在盤點視窗）  
~~P1 碳匯工作表~~（圓周²×高×係數）

---

## 五、重要檔案索引

| 路徑 | 用途 |
|------|------|
| `src/data/taiwan_sites.json` | 全台公園／學校目錄（OSM） |
| `src/data/inventories/*.json` | 每次掃描的盤點報告 |
| `src/data/scanBindings.ts` | 掃描 ↔ 公園／路徑綁定 |
| `src/data/inventory.ts` | 自動載入 inventories（`import.meta.glob`） |
| `src/lib/scanMedia.ts` | `public/scans/{scan_id}/...` URL |
| `src/lib/loadPly.ts` | 讀 binary／ascii PLY |
| `src/components/PlyViewer.tsx` | 3D 點雲（直立、繞鉛直軸） |
| `src/pages/PathInventoryDialog.tsx` | 盤點視窗（樹表＋影像＋量測＋3D＋碳匯） |
| `src/pages/PathImportDialog.tsx` | 匯入三格 |
| `src/hooks/usePathRecorder.ts` | GPS 錄製（起測門檻 10 m） |
| `src/hooks/useFieldMeasures.ts` | 現場手測（localStorage） |
| `src/lib/carbon.ts` | 碳匯計算 |
| `src/lib/csv.ts` | 匯出 CSV |
| `src/lib/treePlacement.ts` | 樹上地圖點位（無 GPS 沿路徑插值） |
| `public/scans/{scan_id}/` | 該次掃描的照片／剖面／模型 |
| `server/importApiPlugin.ts` | `/api/import` 收檔 |

---

## 六、燈號規則

程式：`src/lib/status.ts`

- **淡綠：** 演算法較可信
- **淡黃：** 保留（有數字，建議核對）
- **淡紅：** 卡尺偏寬／切片缺口／量不到；**不要當正式樹圍**；進「待複核」

手測欄位是另存，**不覆蓋**演算法 `DBH_cm`。

---

## 七、給另一台／另一個 agent 的最短指令

```
1. git clone https://github.com/toby0407-del/arbor3d-interface.git
2. cd arbor3d-interface && npm install && npm run dev
3. 讀 NEXT_STEPS.md 第二節（若要接新掃描）
4. 新掃描：inventories/{scan_id}.json + scanBindings.ts + public/scans/{scan_id}/
5. 驗證：搜尋「逢甲大學」→ 校園掃描路徑 → 樹表／3D 應有真實檔
```

完成新掃描後，請更新「已接上的實測掃描」區塊，並 push。
