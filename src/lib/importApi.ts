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
  status: "receiving" | "queued" | "running" | "done" | "error";
  message: string;
  stages: JobStage[];
  logs: string[];
  createdAt: string;
  updatedAt: string;
  fileCounts: { raw: number; denoised: number; gaussian: number };
};

export type FolderSlot = "raw" | "denoised" | "gaussian";

export async function createImportJob(input: {
  scanId: string;
  note: string;
  files: Record<FolderSlot, File[]>;
}): Promise<ImportJob> {
  const form = new FormData();
  form.append("scanId", input.scanId);
  form.append("note", input.note);
  for (const slot of ["raw", "denoised", "gaussian"] as const) {
    for (const file of input.files[slot]) {
      const name =
        (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
        file.name;
      form.append(slot, file, name);
    }
  }
  const res = await fetch("/api/import/jobs", { method: "POST", body: form });
  const data = (await res.json()) as { job?: ImportJob; error?: string };
  if (!res.ok || !data.job) {
    throw new Error(data.error || data.job?.message || "上傳失敗");
  }
  return data.job;
}

export async function fetchImportJob(id: string): Promise<ImportJob> {
  const res = await fetch(`/api/import/jobs/${encodeURIComponent(id)}`);
  const data = (await res.json()) as { job?: ImportJob; error?: string };
  if (!res.ok || !data.job) throw new Error(data.error || "讀取工作失敗");
  return data.job;
}

export async function rerunImportJob(id: string): Promise<ImportJob> {
  const res = await fetch(`/api/import/jobs/${encodeURIComponent(id)}/rerun`, {
    method: "POST",
  });
  const data = (await res.json()) as { job?: ImportJob; error?: string };
  if (!res.ok || !data.job) throw new Error(data.error || "重跑失敗");
  return data.job;
}

export function defaultScanId() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}
