# Arbor3D 盤點介面

登入後台 → 地圖選公園／學校與路徑 → 錄製路線、匯入 PLY 與原始資料夾。

> 遠端接資料請讀：[NEXT_STEPS.md](./NEXT_STEPS.md)

## 使用流程

1. **登入：** 選工作編號、輸入密碼
2. **選點：** 搜尋／點公園或學校
3. **錄製路徑（可選）：** 精度 ≤ 10 m 才記點；停止時可保存並顯示在地圖上
4. **匯入：** 點選路徑 → 選年度、上傳去噪 PLY、高斯濺射 PLY、原始資料夾（編號隨資料夾名）
5. **已盤點路徑：** 可查看樹表、Segmentation 與照片

地圖用 [Leaflet](https://leafletjs.com/) + 國土測繪底圖。

## 示範帳號

| 工作編號 | 姓名 | 密碼 |
|---------|------|------|
| E-1027 | 林志偉 | arbor1027 |
| E-2041 | 陳雅婷 | arbor2041 |
| E-3308 | 黃建宏 | arbor3308 |

## 示範資料

- **逢甲大學 → 校園掃描路徑**（掃描 `20260812070325`，5 棵樹）
- JSON：`src/data/inventories/20260812070325.json`
- 媒體：`public/scans/20260812070325/`

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

倉庫：https://github.com/toby0407-del/arbor3d-interface
