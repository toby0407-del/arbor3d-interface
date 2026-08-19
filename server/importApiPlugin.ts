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
  parkName: string;
  pathId: string;
  status: "receiving" | "queued" | "running" | "done" | "error";
  message: string;
  stages: JobStage[];
  logs: string[];
  createdAt: string;
  updatedAt: string;
  treeCount: number | null;
  report: unknown | null;
  fileCounts: {
    denoised: number;
    gaussian: number;
    rawGo: number;
    rawReturn: number;
  };
};

const SLOT_LABELS = {
  denoised: "去噪 PLY",
  gaussian: "高斯濺射 PLY",
  rawGo: "原始照片",
  rawReturn: "回程照片",
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
    { id: "raw", label: "確認原始照片", status: "pending" },
    { id: "measure", label: "計算樹身分", status: "pending" },
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

  async function loadBindings(): Promise<Record<string, string>> {
    try {
      const raw = await fsp.readFile(
        path.join(projectRoot, "public", "scans", "_bindings.json"),
        "utf8",
      );
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {};
    }
  }

  async function loadInventory(scanId: string) {
    const candidates = [
      path.join(projectRoot, "public", "scans", scanId, "inventory.json"),
      path.join(inboxRoot, `job-${scanId}`, "inventory.json"),
    ];
    for (const file of candidates) {
      try {
        return JSON.parse(await fsp.readFile(file, "utf8"));
      } catch {
        /* try next */
      }
    }
    const dirs = await fsp.readdir(inboxRoot).catch(() => []);
    for (const id of dirs) {
      try {
        const raw = await fsp.readFile(path.join(inboxRoot, id, "inventory.json"), "utf8");
        const report = JSON.parse(raw) as { scan_id?: string };
        if (report.scan_id === scanId) return report;
      } catch {
        /* skip */
      }
    }
    return null;
  }

  async function runPipeline(job: ImportJob) {
    job.status = "running";
    job.message = "正在計算樹身分…";
    job.report = null;
    setStage(job, "measure", "running");
    setStage(job, "publish", "pending");
    pushLog(job, "開始從去噪點雲計算樹身分");
    await persistJob(job);

    const script = path.join(projectRoot, "scripts", "compute-inventory.mjs");
    const dir = jobDir(job);

    await new Promise<void>((resolve) => {
      const child = spawn(
        process.execPath,
        [script, dir, job.scanId, job.pathId].filter(Boolean),
        {
          cwd: projectRoot,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

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
          let statusMessage = "";
          try {
            const raw = await fsp.readFile(statusPath, "utf8");
            const parsed = JSON.parse(raw) as { status?: string; message?: string };
            if (parsed.message) statusMessage = parsed.message;
          } catch {
            /* no status file */
          }

          if (code === 0) {
            const report = (await loadInventory(job.scanId)) as {
              num_trees?: number;
              trees?: unknown[];
            } | null;
            job.report = report;
            job.treeCount = report?.num_trees ?? report?.trees?.length ?? null;
            setStage(job, "measure", "done");
            setStage(job, "publish", "done");
            job.status = "done";
            job.message = job.treeCount
              ? `已算出 ${job.treeCount} 棵樹身分，可查看盤點。`
              : statusMessage || "計算完成。";
            pushLog(job, job.message);
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
      parkName: "",
      pathId: "",
      status: "receiving",
      message: "上傳中…",
      stages: defaultStages(),
      logs: [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      treeCount: null,
      report: null,
      fileCounts: { rawGo: 0, rawReturn: 0, denoised: 0, gaussian: 0 },
    };
    jobs.set(id, job);
    setStage(job, "receive", "running");
    pushLog(job, "開始接收上傳");

    const dir = jobDir(job);
    await fsp.mkdir(path.join(dir, "raw", "go"), { recursive: true });
    await fsp.mkdir(path.join(dir, "raw", "return"), { recursive: true });
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
        if (name === "parkName") job.parkName = value.trim();
        if (name === "pathId") job.pathId = value.trim();
      });

      busboy.on("file", (name, stream, info) => {
        const slot = name as Slot;
        if (!(slot in SLOT_LABELS)) {
          stream.resume();
          return;
        }
        const rel = (info.filename || "file").replace(/^(\.\.[/\\])+/, "");
        const safeRel = rel.split(/[/\\]/).filter((p) => p && p !== "..").join(path.sep);
        const destRoot =
          slot === "rawGo"
            ? path.join(dir, "raw", "go")
            : slot === "rawReturn"
              ? path.join(dir, "raw", "return")
              : path.join(dir, slot);
        const dest = path.join(destRoot, safeRel || "file");
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
    for (const slot of ["denoised", "gaussian"] as const) {
      const ok = job.fileCounts[slot] > 0;
      setStage(job, slot, ok ? "done" : "error");
      pushLog(
        job,
        ok
          ? `${SLOT_LABELS[slot]}：${job.fileCounts[slot]} 個檔`
          : `${SLOT_LABELS[slot]}：未上傳`,
      );
    }
    const rawOk = job.fileCounts.rawGo > 0;
    setStage(job, "raw", rawOk ? "done" : "error");
    pushLog(
      job,
      rawOk
        ? `原始照片 ${job.fileCounts.rawGo} 檔`
        : "原始照片資料夾未上傳",
    );

    const missingLabels: string[] = [];
    if (job.fileCounts.denoised === 0) missingLabels.push(SLOT_LABELS.denoised);
    if (job.fileCounts.gaussian === 0) missingLabels.push(SLOT_LABELS.gaussian);
    if (job.fileCounts.rawGo === 0) missingLabels.push(SLOT_LABELS.rawGo);
    if (missingLabels.length) {
      job.status = "error";
      job.message = `缺少：${missingLabels.join("、")}`;
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
    job.message = "上傳完成。請按「開始計算」產生樹身分。";
    pushLog(job, job.message);
    await persistJob(job);
    sendJson(res, 200, { job });
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

  async function handleCompute(req: IncomingMessage, res: ServerResponse, id: string) {
    await readBody(req);
    const job = jobs.get(id) ?? (await (async () => {
      try {
        const raw = await fsp.readFile(path.join(inboxRoot, id, "job.json"), "utf8");
        const loaded = JSON.parse(raw) as ImportJob;
        jobs.set(id, loaded);
        return loaded;
      } catch {
        return null;
      }
    })());
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
    job.message = "開始計算樹身分";
    pushLog(job, "使用者按下開始計算");
    await persistJob(job);
    sendJson(res, 200, { job });
    void runPipeline(job);
  }

  async function handleInventories(_req: IncomingMessage, res: ServerResponse) {
    const bindings = await loadBindings();
    const reports: Record<string, unknown> = {};
    const scanIds = new Set<string>(Object.values(bindings));
    const scanRoot = path.join(projectRoot, "public", "scans");
    try {
      for (const name of await fsp.readdir(scanRoot)) {
        if (name.startsWith("_")) continue;
        scanIds.add(name);
      }
    } catch {
      /* none */
    }
    for (const scanId of scanIds) {
      const report = await loadInventory(scanId);
      if (report) reports[scanId] = report;
    }
    sendJson(res, 200, { bindings, reports });
  }

  async function handleInventory(_req: IncomingMessage, res: ServerResponse, scanId: string) {
    const report = await loadInventory(scanId);
    if (!report) {
      sendJson(res, 404, { error: "尚無樹身分" });
      return;
    }
    sendJson(res, 200, { report });
  }

  async function handleScanAsset(_req: IncomingMessage, res: ServerResponse, url: string) {
    const rel = decodeURIComponent(url.replace(/^\/scans\//, "")).replace(/\?.*$/, "");
    const scansRoot = path.resolve(projectRoot, "public", "scans");
    const abs = path.resolve(scansRoot, rel);
    if (abs !== scansRoot && !abs.startsWith(scansRoot + path.sep)) {
      res.statusCode = 403;
      res.end("forbidden");
      return;
    }
    try {
      const data = await fsp.readFile(abs);
      const ext = path.extname(abs).toLowerCase();
      const types: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".json": "application/json; charset=utf-8",
        ".ply": "application/octet-stream",
      };
      res.statusCode = 200;
      res.setHeader("Content-Type", types[ext] || "application/octet-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.end(data);
    } catch {
      res.statusCode = 404;
      res.end("not found");
    }
  }

  return {
    name: "arbor3d-import-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (req.method === "GET" && url.startsWith("/scans/")) {
          await handleScanAsset(req, res, url);
          return;
        }
        if (!url.startsWith("/api/import") && !url.startsWith("/api/inventories")) {
          return next();
        }

        try {
          if (req.method === "GET" && url === "/api/inventories") {
            await handleInventories(req, res);
            return;
          }
          const oneInv = /^\/api\/inventories\/([^/]+)$/.exec(url);
          if (req.method === "GET" && oneInv) {
            await handleInventory(req, res, decodeURIComponent(oneInv[1]));
            return;
          }
          if (req.method === "GET" && url === "/api/import/jobs") {
            await handleList(req, res);
            return;
          }
          const one = /^\/api\/import\/jobs\/([^/]+)$/.exec(url);
          if (req.method === "GET" && one) {
            await handleGet(req, res, decodeURIComponent(one[1]));
            return;
          }
          const compute = /^\/api\/import\/jobs\/([^/]+)\/compute$/.exec(url);
          if (req.method === "POST" && compute) {
            await handleCompute(req, res, decodeURIComponent(compute[1]));
            return;
          }
          const rerun = /^\/api\/import\/jobs\/([^/]+)\/rerun$/.exec(url);
          if (req.method === "POST" && rerun) {
            await handleCompute(req, res, decodeURIComponent(rerun[1]));
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
