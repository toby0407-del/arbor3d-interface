import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import {
  createImportJob,
  defaultScanId,
  fetchImportJob,
  rerunImportJob,
  type FolderSlot,
  type ImportJob,
} from "../lib/importApi";

const folderInputProps = {
  webkitdirectory: "",
  directory: "",
} as InputHTMLAttributes<HTMLInputElement>;

type SlotKind = "ply" | "folder";

type SlotState = {
  files: File[];
  rootLabel: string;
  formatOk: boolean;
  formatMsg: string;
};

const SLOTS: {
  key: FolderSlot;
  kind: SlotKind;
  title: string;
  hint: string;
}[] = [
  {
    key: "denoised",
    kind: "ply",
    title: "去噪 PLY",
    hint: "這次解算去噪後的那一個 .ply",
  },
  {
    key: "gaussian",
    kind: "ply",
    title: "高斯濺射 PLY",
    hint: "訓練完成後匯出的 .ply，不要用 input.ply",
  },
  {
    key: "rawGo",
    kind: "folder",
    title: "原始／去程照片",
    hint: "同一趟影像，或左鏡頭／走過去的資料夾",
  },
  {
    key: "rawReturn",
    kind: "folder",
    title: "回程照片（選填）",
    hint: "有走回來或右鏡頭再選；單趟可留空",
  },
];

function emptySlot(): SlotState {
  return { files: [], rootLabel: "", formatOk: false, formatMsg: "" };
}

function emptySlots(): Record<FolderSlot, SlotState> {
  return {
    denoised: emptySlot(),
    gaussian: emptySlot(),
    rawGo: emptySlot(),
    rawReturn: emptySlot(),
  };
}

function isPlyName(name: string) {
  return /\.ply$/i.test(name.trim());
}

async function looksLikePlyFile(file: File): Promise<boolean> {
  if (!isPlyName(file.name)) return false;
  try {
    const head = await file.slice(0, 8).text();
    return /^ply(\r\n|\n|\r| )/i.test(head);
  } catch {
    return isPlyName(file.name);
  }
}

async function summarizePly(files: FileList | null): Promise<SlotState> {
  if (!files || files.length === 0) return emptySlot();
  const list = [...files];
  const plyFiles = list.filter((f) => isPlyName(f.name));
  if (plyFiles.length === 0) {
    return {
      files: [],
      rootLabel: list[0]?.name ?? "",
      formatOk: false,
      formatMsg: "格式不對：請選 .ply 檔",
    };
  }
  const checked: File[] = [];
  for (const file of plyFiles) {
    if (await looksLikePlyFile(file)) checked.push(file);
  }
  if (checked.length === 0) {
    return {
      files: [],
      rootLabel: plyFiles[0].name,
      formatOk: false,
      formatMsg: "副檔名是 .ply，但內容不像 PLY（檔頭應為 ply）",
    };
  }
  const extra = list.length - plyFiles.length;
  return {
    files: checked,
    rootLabel: checked.map((f) => f.name).join("、"),
    formatOk: true,
    formatMsg:
      extra > 0
        ? `已接受 ${checked.length} 個 .ply（已略過 ${extra} 個非 ply）`
        : `已驗證 ${checked.length} 個 .ply`,
  };
}

function summarizeFolder(files: FileList | null): SlotState {
  if (!files || files.length === 0) return emptySlot();
  const list = [...files];
  const first = list[0] as File & { webkitRelativePath?: string };
  const rel = first.webkitRelativePath || first.name;
  if (!first.webkitRelativePath && list.length === 1 && !rel.includes("/")) {
    return {
      files: [],
      rootLabel: first.name,
      formatOk: false,
      formatMsg: "格式不對：請選「資料夾」，不要只選單一檔案",
    };
  }
  const rootLabel = rel.includes("/") ? rel.split("/")[0] : rel;
  return {
    files: list,
    rootLabel,
    formatOk: true,
    formatMsg: `資料夾「${rootLabel}」· ${list.length} 個檔`,
  };
}

function stageClass(status: string) {
  if (status === "done") return "is-done";
  if (status === "running") return "is-running";
  if (status === "error") return "is-error";
  return "";
}

function stageStatusLabel(status: string) {
  if (status === "pending") return "等待";
  if (status === "running") return "進行中";
  if (status === "done") return "完成";
  if (status === "error") return "失敗";
  if (status === "skipped") return "略過";
  return status;
}

function jobStatusLabel(status: string) {
  if (status === "receiving") return "接收中";
  if (status === "queued") return "排隊中";
  if (status === "running") return "處理中";
  if (status === "done") return "完成";
  if (status === "error") return "失敗";
  return status;
}

function resolveSegmentLabel(slots: Record<FolderSlot, SlotState>): string {
  const go = slots.rawGo.rootLabel;
  const back = slots.rawReturn.rootLabel;
  if (go && back) return `${go}＋${back}`;
  return go || back || "未命名路段";
}

function folderNameToScanId(folderName: string): string {
  const cleaned = folderName
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w.\-\u4e00-\u9fff]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return cleaned || defaultScanId();
}

function yearOptions(now = new Date().getFullYear()): number[] {
  const years: number[] = [];
  for (let y = now + 1; y >= now - 12; y -= 1) years.push(y);
  return years;
}

function readLastYear(): number {
  try {
    const raw = sessionStorage.getItem("arbor3d.importYear");
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n >= 2000 && n <= 2100) return n;
  } catch {
    /* ignore */
  }
  return new Date().getFullYear();
}

function writeLastYear(year: number) {
  try {
    sessionStorage.setItem("arbor3d.importYear", String(year));
  } catch {
    /* ignore */
  }
}

function validateAll(slots: Record<FolderSlot, SlotState>): string | null {
  if (!slots.denoised.formatOk) {
    return slots.denoised.formatMsg || "請上傳去噪 .ply";
  }
  if (!slots.gaussian.formatOk) {
    return slots.gaussian.formatMsg || "請上傳高斯濺射 .ply";
  }
  if (!slots.rawGo.formatOk) {
    return slots.rawGo.formatMsg || "請選擇原始／去程照片資料夾";
  }
  return null;
}

type Props = {
  parkName: string;
  pathName: string;
  hasInventory: boolean;
  onClose: () => void;
  onImported: (info: { label: string; scanId: string; year: number }) => void;
  onOpenInventory?: () => void;
};

export function PathImportDialog({
  parkName,
  pathName,
  hasInventory,
  onClose,
  onImported,
  onOpenInventory,
}: Props) {
  const [year, setYear] = useState(readLastYear);
  const [scanId, setScanId] = useState("");
  const [note, setNote] = useState("");
  const [slots, setSlots] = useState(emptySlots);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<ImportJob | null>(null);
  const folderLabel = resolveSegmentLabel(slots);
  const segmentLabel = `${year} · ${folderLabel}`;
  const years = yearOptions();
  const derivedScanId = slots.rawGo.rootLabel
    ? folderNameToScanId(slots.rawGo.rootLabel)
    : "";
  const lastDerived = useRef("");
  const formatError = validateAll(slots);

  useEffect(() => {
    if (!derivedScanId) return;
    setScanId((prev) =>
      !prev || prev === lastDerived.current ? derivedScanId : prev,
    );
    lastDerived.current = derivedScanId;
  }, [derivedScanId]);

  useEffect(() => {
    if (!job || job.status === "done" || job.status === "error") return;
    const timer = window.setInterval(() => {
      void fetchImportJob(job.id)
        .then(setJob)
        .catch(() => {
          /* keep last */
        });
    }, 1200);
    return () => window.clearInterval(timer);
  }, [job]);

  const ready =
    !formatError &&
    scanId.trim().length > 0 &&
    Number.isFinite(year);

  const onPick = async (key: FolderSlot, kind: SlotKind, list: FileList | null) => {
    setError("");
    if (kind === "ply") {
      const next = await summarizePly(list);
      setSlots((prev) => ({ ...prev, [key]: next }));
      if (!next.formatOk && next.formatMsg) setError(next.formatMsg);
      return;
    }
    const next = summarizeFolder(list);
    setSlots((prev) => ({ ...prev, [key]: next }));
    if (!next.formatOk && next.formatMsg) setError(next.formatMsg);
  };

  const start = async () => {
    const problem = validateAll(slots);
    if (problem) {
      setError(problem);
      return;
    }
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    writeLastYear(year);
    try {
      const next = await createImportJob({
        scanId: scanId.trim(),
        note:
          note.trim() ||
          `${year} / ${parkName} / ${pathName} / ${folderLabel}`,
        files: {
          denoised: slots.denoised.files,
          gaussian: slots.gaussian.files,
          rawGo: slots.rawGo.files,
          rawReturn: slots.rawReturn.files,
        },
      });
      setJob(next);
      onImported({ label: segmentLabel, scanId: next.scanId, year });
    } catch (err) {
      setError(err instanceof Error ? err.message : "上傳失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="path-db-backdrop" role="presentation" onClick={onClose}>
      <div
        className="path-db-panel is-wide import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="path-import-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="path-db-head">
          <div>
            <p className="path-db-kicker">{parkName}</p>
            <h2 id="path-import-title">匯入 · {pathName}</h2>
            <p>
              上兩項為去噪與高斯濺射 .ply；照片可只選同一趟，回程／另一側鏡頭選填。標記：
              <strong> {segmentLabel || "—"}</strong>
            </p>
          </div>
          <div className="path-db-head-actions">
            {hasInventory && onOpenInventory ? (
              <button type="button" className="ghost-btn" onClick={onOpenInventory}>
                查看已有盤點
              </button>
            ) : null}
            <button type="button" className="ghost-btn" onClick={onClose}>
              關閉
            </button>
          </div>
        </header>

        <div className="import-dialog-body">
          <section className="import-panel">
            <div className="import-meta is-3">
              <label className="login-field">
                盤點年度
                <select
                  value={year}
                  disabled={busy}
                  onChange={(e) => setYear(Number(e.target.value))}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y} 年
                    </option>
                  ))}
                </select>
              </label>
              <label className="login-field">
                編號 ID
                <input
                  value={scanId}
                  disabled={busy}
                  placeholder="請先選照片資料夾，也可自行修改"
                  title="預設等於照片資料夾名稱，可改"
                  onChange={(e) => setScanId(e.target.value)}
                />
              </label>
              <label className="login-field">
                備註（可選）
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="去程／回程、左鏡頭…"
                  disabled={busy}
                />
              </label>
            </div>

            <div className="import-slots">
              {SLOTS.map((slot) => {
                const state = slots[slot.key];
                return (
                  <label
                    key={slot.key}
                    className={`import-slot ${
                      state.files.length
                        ? state.formatOk
                          ? "is-ok"
                          : "is-bad"
                        : ""
                    }`}
                  >
                    <span className="import-slot-title">{slot.title}</span>
                    <span className="import-slot-hint">{slot.hint}</span>
                    {slot.kind === "ply" ? (
                      <input
                        type="file"
                        accept=".ply,model/ply,application/octet-stream"
                        multiple
                        disabled={busy}
                        onChange={(e) => {
                          void onPick(slot.key, "ply", e.target.files);
                        }}
                      />
                    ) : (
                      <input
                        type="file"
                        multiple
                        disabled={busy}
                        {...folderInputProps}
                        onChange={(e) => {
                          void onPick(slot.key, "folder", e.target.files);
                        }}
                      />
                    )}
                    <span className="import-slot-status">
                      {state.formatMsg ||
                        (slot.kind === "ply" ? "點此選擇 .ply" : "點此選擇資料夾")}
                    </span>
                  </label>
                );
              })}
            </div>

            {error ? <p className="login-error">{error}</p> : null}
            {!error && formatError ? (
              <p className="login-error">{formatError}</p>
            ) : null}

            <button
              type="button"
              className="primary-btn import-start"
              disabled={!ready || busy}
              onClick={() => void start()}
            >
              {busy ? "上傳中…" : `上傳 ${year} 年並開始後續處理`}
            </button>
          </section>

          <section className="import-panel import-progress">
            <h2>處理進度</h2>
            {!job ? (
              <p className="empty">格式通過並上傳後會顯示階段與日誌。</p>
            ) : (
              <>
                <div className="import-job-head">
                  <div>
                    <div className="meta-kicker">工作 {job.id}</div>
                    <strong>{job.scanId}</strong>
                  </div>
                  <span className={`import-badge is-${job.status}`}>
                    {jobStatusLabel(job.status)}
                  </span>
                </div>
                <p className="import-message">{job.message}</p>
                <ol className="import-stages">
                  {job.stages.map((stage) => (
                    <li key={stage.id} className={stageClass(stage.status)}>
                      <span>{stage.label}</span>
                      <span>{stageStatusLabel(stage.status)}</span>
                    </li>
                  ))}
                </ol>
                <div className="import-log" aria-live="polite">
                  {job.logs.map((line, i) => (
                    <div key={`${i}-${line}`}>{line}</div>
                  ))}
                </div>
                {(job.status === "done" || job.status === "error") && (
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => {
                      void rerunImportJob(job.id).then(setJob).catch((err) => {
                        setError(err instanceof Error ? err.message : "重跑失敗");
                      });
                    }}
                  >
                    重跑後續處理
                  </button>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
