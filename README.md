# Arbor3D 盤點介面（第一版）

登入後台 → 在開源地圖上選公園與路徑 → 才會看到那條路上的樹位與燈號。

> **遠端／另一台機器請先讀：[NEXT_STEPS.md](./NEXT_STEPS.md)**  
> 裡面寫：已完成什麼、真實觀測 JSON／照片／ply 要放哪、還缺什麼。

## 使用流程

1. **登入：** 選工作編號、輸入密碼
2. **選點：** OpenStreetMap 上搜尋／點公園或學校，再點掃描路徑
3. **（可選）錄製路徑：** 精度 ≤ 10 m 才開始記點，可下載 GPX
4. **盤點：** 看路徑、樹位、綠黃紅燈；紅燈可填現場手測並匯出 CSV
5. **待複核／詳情／3D**

地圖用 [Leaflet](https://leafletjs.com/) + [OpenStreetMap](https://www.openstreetmap.org/copyright)，不需 API key。

## 示範帳號

| 工作編號 | 姓名 | 密碼 |
|---------|------|------|
| E-1027 | 林志偉 | arbor1027 |
| E-2041 | 陳雅婷 | arbor2041 |
| E-3308 | 黃建宏 | arbor3308 |

目前只有「臺中中央公園 → 水湳東側步道」接了示範 JSON（`src/data/inventories/20260812070325.json`）。  
其他地點要接真實資料：見 [NEXT_STEPS.md](./NEXT_STEPS.md)。

## 燈號

- **淡綠：** 演算法較可信
- **淡黃：** 有數字，但不是標準 1.3 m
- **淡紅：** 卡尺偏寬或量不到，現場再量，不要當正式樹圍

## 啟動

```bash
npm install
npm run dev
```

倉庫：https://github.com/toby0407-del/arbor3d-interface
