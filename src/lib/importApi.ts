import type { ParkInventoryReport } from "../types";

export type StageStatus = "pending" | "running" | "done" | "error" | "skipped";

export type JobStage = {
  id: string;
  label: string;
  status: StageStatus;
};

export type ImportJob = {
  id: string;
  scanId: string;
  note: string;
  parkName?: string;
  pathId?: string;
  status: "receiving" | "queued" | "running" | "done" | "error";
  message: string;
  stages: JobStage[];
  logs: string[];
  createdAt: string;
  updatedAt: string;
  treeCount?: number | null;
  report?: ParkInventoryReport | null;
  fileCounts: {
    denoised: number;
    gaussian: number;
    rawGo: number;
    rawReturn: number;
  };
};

export type FolderSlot = "denoised" | "gaussian" | "rawGo" | "rawReturn";

const ALL_SLOTS: FolderSlot[] = ["denoised", "gaussian", "rawGo", "rawReturn"];

export type UploadProgress = {
  loaded: number;
  total: number;
  percent: number;
};

export async function createImportJob(input: {
  scanId: string;
  note: string;
  parkName?: string;
  pathId?: string;
  files: Record<FolderSlot, File[]>;
  onProgress?: (progress: UploadProgress) => void;
}): Promise<ImportJob> {
  const form = new FormData();
  form.append("scanId", input.scanId);
  form.append("note", input.note);
  if (input.parkName) form.append("parkName", input.parkName);
  if (input.pathId) form.append("pathId", input.pathId);
  for (const slot of ALL_SLOTS) {
    for (const file of input.files[slot]) {
      const name =
        (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
        file.name;
      form.append(slot, file, name);
    }
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/import/jobs");
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (!input.onProgress) return;
      const total = event.lengthComputable ? event.total : 0;
      const percent = total > 0 ? Math.min(100, Math.round((event.loaded / total) * 100)) : 0;
      input.onProgress({ loaded: event.loaded, total, percent });
    };
    xhr.onload = () => {
      const data = (typeof xhr.response === "object" && xhr.response
        ? xhr.response
        : (() => {
            try {
              return JSON.parse(xhr.responseText || "{}") as {
                job?: ImportJob;
                error?: string;
              };
            } catch {
              return {};
            }
          })()) as { job?: ImportJob; error?: string };
      if (xhr.status >= 200 && xhr.status < 300 && data.job) {
        resolve(data.job);
        return;
      }
      reject(new Error(data.error || data.job?.message || "上傳失敗"));
    };
    xhr.onerror = () => reject(new Error("上傳中斷，請檢查連線後再試"));
    xhr.onabort = () => reject(new Error("已取消上傳"));
    xhr.send(form);
  });
}

export async function fetchImportJob(id: string): Promise<ImportJob> {
  const res = await fetch(`/api/import/jobs/${encodeURIComponent(id)}`);
  const data = (await res.json()) as { job?: ImportJob; error?: string };
  if (!res.ok || !data.job) throw new Error(data.error || "讀取工作失敗");
  return data.job;
}

export async function computeImportJob(id: string): Promise<ImportJob> {
  const res = await fetch(`/api/import/jobs/${encodeURIComponent(id)}/compute`, {
    method: "POST",
  });
  const data = (await res.json()) as { job?: ImportJob; error?: string };
  if (!res.ok || !data.job) throw new Error(data.error || "無法開始計算");
  return data.job;
}

export async function fetchInventories(): Promise<{
  bindings: Record<string, string>;
  reports: Record<string, ParkInventoryReport>;
}> {
  const res = await fetch("/api/inventories");
  const data = (await res.json()) as {
    bindings?: Record<string, string>;
    reports?: Record<string, ParkInventoryReport>;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || "讀取盤點失敗");
  return { bindings: data.bindings ?? {}, reports: data.reports ?? {} };
}

export async function rerunImportJob(id: string): Promise<ImportJob> {
  return computeImportJob(id);
}

export function defaultScanId() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}
