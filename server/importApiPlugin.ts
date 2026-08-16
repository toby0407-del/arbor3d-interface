import Busboy from "busboy";
import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

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

const SLOT_LABELS = {
  denoised: "去噪 PLY",
  gaussian: "高斯濺射 PLY",
  raw: "原始資料夾",
} as const;

type Slot = keyof typeof SLOT_LABELS;

function nowIso() {
  return new Date().toISOString();
}

function makeScanId() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

function defaultStages(): JobStage[] {
  return [
    { id: "receive", label: "接收上傳", status: "pending" },
    { id: "denoised", label: "確認去噪 PLY", status: "pending" },
    { id: "gaussian", label: "確認高斯濺射 PLY", status: "pending" },
    { id: "raw", label: "確認原始資料夾", status: "pending" },
    { id: "measure", label: "後續量測處理", status: "pending" },
    { id: "publish", label: "整理輸出", status: "pending" },
  ];
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function importApiPlugin(projectRoot: string): Plugin {
  const inboxRoot = path.join(projectRoot, "inbox");
  const jobs = new Map<string, ImportJob>();

  function jobDir(job: ImportJob) {
    return path.join(inboxRoot, job.id);
  }

  function pushLog(job: ImportJob, line: string) {
    const stamp = new Date().toLocaleTimeString("zh-TW", { hour12: false });
    job.logs.push(`[${stamp}] ${line}`);
    if (job.logs.length > 200) job.logs.splice(0, job.logs.length - 200);
    job.updatedAt = nowIso();
  }

  function setStage(job: ImportJob, id: string, status: StageStatus) {
    const stage = job.stages.find((s) => s.id === id);
    if (stage) stage.status = status;
    job.updatedAt = nowIso();
  }

  async function persistJob(job: ImportJob) {
    const dir = jobDir(job);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(
      path.join(dir, "job.json"),
      JSON.stringify(job, null, 2),
      "utf8",
    );
  }

  async function runPipeline(job: ImportJob) {
    job.status = "running";
    job.message = "正在跑後續量測…";
    setStage(job, "measure", "running");
    pushLog(job, "啟動後續處理腳本");
    await persistJob(job);

    const script = path.join(projectRoot, "scripts", "run-postprocess.mjs");
    const dir = jobDir(job);

    await new Promise<void>((resolve) => {
      const child = spawn(process.execPath, [script, dir, job.scanId], {
        cwd: projectRoot,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const onChunk = (buf: Buffer) => {
        const text = buf.toString("utf8").trim();
        if (!text) return;
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) pushLog(job, line.trim());
        }
      };
      child.stdout.on("data", onChunk);
      child.stderr.on("data", onChunk);

      child.on("close", async (code) => {
        try {
          const statusPath = path.join(dir, "pipeline-status.json");
          let pendingPipeline = false;
          try {
            const raw = await fsp.readFile(statusPath, "utf8");
            const parsed = JSON.parse(raw) as { status?: string; message?: string };
            pendingPipeline = parsed.status === "pending_pipeline";
            if (parsed.message) job.message = parsed.message;
          } catch {
            /* no status file */
          }

          if (code === 0) {
            setStage(job, "measure", "done");
            setStage(job, "publish", "done");
            job.status = "done";
            if (!pendingPipeline) {
              job.message = "處理完成。請確認 inventories 與 public/scans。";
            }
            pushLog(job, pendingPipeline ? "收檔完成（待接 ARBOR3D 管線）" : "處理完成");
          } else {
            setStage(job, "measure", "error");
            job.status = "error";
            job.message = `處理失敗（結束碼 ${code}）`;
            pushLog(job, job.message);
          }
          await persistJob(job);
        } finally {
          resolve();
        }
      });

      child.on("error", async (err) => {
        setStage(job, "measure", "error");
        job.status = "error";
        job.message = err.message;
        pushLog(job, err.message);
        await persistJob(job);
        resolve();
      });
    });
  }

  async function handleCreateJob(req: IncomingMessage, res: ServerResponse) {
    const id = `job-${Date.now().toString(36)}`;
    const job: ImportJob = {
      id,
      scanId: makeScanId(),
      note: "",
      status: "receiving",
      message: "上傳中…",
      stages: defaultStages(),
      logs: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      fileCounts: { raw: 0, denoised: 0, gaussian: 0 },
    };
    jobs.set(id, job);
    setStage(job, "receive", "running");
    pushLog(job, "開始接收上傳");

    const dir = jobDir(job);
    await fsp.mkdir(path.join(dir, "raw"), { recursive: true });
    await fsp.mkdir(path.join(dir, "denoised"), { recursive: true });
    await fsp.mkdir(path.join(dir, "gaussian"), { recursive: true });

    const contentType = req.headers["content-type"];
    if (!contentType?.includes("multipart/form-data")) {
      sendJson(res, 400, { error: "需要 multipart/form-data" });
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const busboy = Busboy({
        headers: req.headers,
        limits: { files: 50_000, fileSize: 1024 * 1024 * 1024 },
      });
      const writes: Promise<void>[] = [];

      busboy.on("field", (name, value) => {
        if (name === "scanId" && value.trim()) job.scanId = value.trim();
        if (name === "note") job.note = value;
      });

      busboy.on("file", (name, stream, info) => {
        const slot = name as Slot;
        if (!(slot in SLOT_LABELS)) {
          stream.resume();
          return;
        }
        const rel = (info.filename || "file").replace(/^(\.\.[/\\])+/, "");
        const safeRel = rel.split(/[/\\]/).filter((p) => p && p !== "..").join(path.sep);
        const dest = path.join(dir, slot, safeRel || "file");
        writes.push(
          (async () => {
            await fsp.mkdir(path.dirname(dest), { recursive: true });
            await new Promise<void>((ok, fail) => {
              const out = fs.createWriteStream(dest);
              stream.pipe(out);
              out.on("finish", ok);
              out.on("error", fail);
              stream.on("error", fail);
            });
            job.fileCounts[slot] += 1;
          })(),
        );
      });

      busboy.on("error", reject);
      busboy.on("finish", () => {
        Promise.all(writes).then(() => resolve()).catch(reject);
      });

      req.pipe(busboy);
    });

    setStage(job, "receive", "done");
    for (const slot of Object.keys(SLOT_LABELS) as Slot[]) {
      const ok = job.fileCounts[slot] > 0;
      setStage(job, slot, ok ? "done" : "error");
      pushLog(
        job,
        ok
          ? `${SLOT_LABELS[slot]}：${job.fileCounts[slot]} 個檔`
          : `${SLOT_LABELS[slot]}：未上傳`,
      );
    }

    const missing = (Object.keys(SLOT_LABELS) as Slot[]).filter(
      (s) => job.fileCounts[s] === 0,
    );
    if (missing.length) {
      job.status = "error";
      job.message = `缺少：${missing.map((s) => SLOT_LABELS[s]).join("、")}`;
      await persistJob(job);
      sendJson(res, 400, { job });
      return;
    }

    // 伺服器端再驗一次：上兩項必須是 .ply
    for (const slot of ["denoised", "gaussian"] as const) {
      const slotDir = path.join(dir, slot);
      const names = await fsp.readdir(slotDir, { recursive: true });
      const plyNames = names.filter((n) => /\.ply$/i.test(String(n)));
      if (plyNames.length === 0) {
        setStage(job, slot, "error");
        job.status = "error";
        job.message = `${SLOT_LABELS[slot]} 不是 .ply`;
        pushLog(job, job.message);
        await persistJob(job);
        sendJson(res, 400, { job });
        return;
      }
      const sample = path.join(slotDir, String(plyNames[0]));
      const head = await fsp.readFile(sample, { encoding: "utf8", flag: "r" }).catch(() => "");
      const snippet = head.slice(0, 8);
      if (!/^ply(\r\n|\n|\r| )/i.test(snippet)) {
        // binary ply 也可能檔頭是 ASCII "ply"
        const buf = await fsp.readFile(sample);
        const text = buf.subarray(0, 4).toString("ascii");
        if (!/^ply/i.test(text)) {
          setStage(job, slot, "error");
          job.status = "error";
          job.message = `${SLOT_LABELS[slot]} 內容不像 PLY`;
          pushLog(job, job.message);
          await persistJob(job);
          sendJson(res, 400, { job });
          return;
        }
      }
      pushLog(job, `${SLOT_LABELS[slot]} 格式通過（${plyNames.length} 個 .ply）`);
    }

    job.status = "queued";
    job.message = "排隊執行後續處理";
    await persistJob(job);
    sendJson(res, 200, { job });

    void runPipeline(job);
  }

  async function handleList(_req: IncomingMessage, res: ServerResponse) {
    const list = [...jobs.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    sendJson(res, 200, { jobs: list });
  }

  async function handleGet(_req: IncomingMessage, res: ServerResponse, id: string) {
    let job = jobs.get(id);
    if (!job) {
      try {
        const raw = await fsp.readFile(
          path.join(inboxRoot, id, "job.json"),
          "utf8",
        );
        job = JSON.parse(raw) as ImportJob;
        jobs.set(id, job);
      } catch {
        sendJson(res, 404, { error: "找不到工作" });
        return;
      }
    }
    sendJson(res, 200, { job });
  }

  async function handleRerun(req: IncomingMessage, res: ServerResponse, id: string) {
    await readBody(req);
    const job = jobs.get(id);
    if (!job) {
      sendJson(res, 404, { error: "找不到工作" });
      return;
    }
    if (job.status === "running" || job.status === "receiving") {
      sendJson(res, 409, { error: "工作進行中" });
      return;
    }
    setStage(job, "measure", "pending");
    setStage(job, "publish", "pending");
    job.status = "queued";
    job.message = "重新排隊";
    pushLog(job, "手動重跑後續處理");
    await persistJob(job);
    sendJson(res, 200, { job });
    void runPipeline(job);
  }

  return {
    name: "arbor3d-import-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith("/api/import")) return next();

        try {
          if (req.method === "GET" && url === "/api/import/jobs") {
            await handleList(req, res);
            return;
          }
          const one = /^\/api\/import\/jobs\/([^/]+)$/.exec(url);
          if (req.method === "GET" && one) {
            await handleGet(req, res, decodeURIComponent(one[1]));
            return;
          }
          const rerun = /^\/api\/import\/jobs\/([^/]+)\/rerun$/.exec(url);
          if (req.method === "POST" && rerun) {
            await handleRerun(req, res, decodeURIComponent(rerun[1]));
            return;
          }
          if (req.method === "POST" && url === "/api/import/jobs") {
            await handleCreateJob(req, res);
            return;
          }
          sendJson(res, 404, { error: "未知 API" });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          sendJson(res, 500, { error: message });
        }
      });
    },
  };
}
