/**
 * 後續量測處理：去噪 + 高斯濺射就緒後執行。
 *
 * 環境變數（擇一）：
 *   ARBOR3D_CMD  — 完整指令，會代入 {jobDir} {scanId}
 *   ARBOR3D_ROOT — Arbor3D 倉庫路徑，嘗試呼叫其中的 postprocess 腳本
 *
 * 用法：node scripts/run-postprocess.mjs <jobDir> <scanId>
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const jobDir = process.argv[2];
const scanId = process.argv[3];

if (!jobDir || !scanId) {
  console.error("用法: node scripts/run-postprocess.mjs <jobDir> <scanId>");
  process.exit(1);
}

function log(msg) {
  console.log(`[postprocess ${scanId}] ${msg}`);
}

async function dirHasFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { recursive: true });
    return entries.some((name) => !name.startsWith("."));
  } catch {
    return false;
  }
}

async function runCmd(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: true,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (buf) => process.stdout.write(buf));
    child.stderr.on("data", (buf) => process.stderr.write(buf));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`指令結束碼 ${code}: ${command} ${args.join(" ")}`));
    });
  });
}

async function main() {
  const raw = path.join(jobDir, "raw");
  const denoised = path.join(jobDir, "denoised");
  const gaussian = path.join(jobDir, "gaussian");

  for (const [label, dir] of [
    ["原始資料夾", raw],
    ["去噪結果", denoised],
    ["高斯濺射", gaussian],
  ]) {
    if (!(await dirHasFiles(dir))) {
      throw new Error(`缺少${label}：${dir}`);
    }
    log(`已確認 ${label}`);
  }

  const cmd = process.env.ARBOR3D_CMD?.trim();
  const arborRoot = process.env.ARBOR3D_ROOT?.trim();

  if (cmd) {
    const expanded = cmd
      .replaceAll("{jobDir}", jobDir)
      .replaceAll("{scanId}", scanId)
      .replaceAll("{raw}", raw)
      .replaceAll("{denoised}", denoised)
      .replaceAll("{gaussian}", gaussian);
    log(`執行 ARBOR3D_CMD: ${expanded}`);
    await runCmd(expanded, [], root);
    log("ARBOR3D_CMD 完成");
    return;
  }

  if (arborRoot) {
    const candidates = [
      path.join(arborRoot, "scripts", "postprocess_from_inbox.py"),
      path.join(arborRoot, "scripts", "run_measure.py"),
      path.join(arborRoot, "run_postprocess.py"),
      path.join(arborRoot, "app", "postprocess.py"),
    ];
    let script = null;
    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        script = candidate;
        break;
      } catch {
        /* try next */
      }
    }
    if (!script) {
      throw new Error(
        `ARBOR3D_ROOT=${arborRoot} 找不到 postprocess 腳本。請設 ARBOR3D_CMD。`,
      );
    }
    log(`執行 ${script}`);
    await runCmd("python3", [script, "--job-dir", jobDir, "--scan-id", scanId], arborRoot);
    log("Arbor3D 腳本完成");
    return;
  }

  // 尚無關線時：整理輸出目錄並寫明狀態，方便之後接真管線
  const outScan = path.join(root, "public", "scans", scanId);
  const staged = path.join(outScan, "_inbox_staged");
  await fs.mkdir(staged, { recursive: true });
  for (const name of ["raw", "denoised", "gaussian"]) {
    const dest = path.join(staged, name);
    await fs.cp(path.join(jobDir, name), dest, { recursive: true, force: true });
  }
  await fs.writeFile(
    path.join(jobDir, "RESULT.md"),
    [
      `# 掃描 ${scanId} — 已收檔、待接量測管線`,
      "",
      "已確認：原始資料夾、去噪結果、高斯濺射。",
      "檔案已同步到：",
      `\`${path.relative(root, staged)}\``,
      "",
      "接上真管線後請設定其一再開跑：",
      "",
      "```bash",
      "export ARBOR3D_CMD='python3 /path/to/Arbor3D/scripts/postprocess_from_inbox.py --job-dir {jobDir} --scan-id {scanId}'",
      "# 或",
      "export ARBOR3D_ROOT=/path/to/Arbor3D",
      "node scripts/run-postprocess.mjs",
      "```",
      "",
      "管線應產出：",
      `- src/data/inventories/${scanId}.json`,
      `- public/scans/${scanId}/{photos,masks,dbh,models,maps}/`,
      "- 並在 src/data/scanBindings.ts 綁定公園／路徑",
      "",
    ].join("\n"),
    "utf8",
  );
  log("未設定 ARBOR3D_CMD／ARBOR3D_ROOT：已暫存資料，請接上量測腳本後重跑。");
  // 以 exit 0 結束，讓 UI 顯示「已收檔待管線」；狀態檔標記 pending_pipeline
  await fs.writeFile(
    path.join(jobDir, "pipeline-status.json"),
    JSON.stringify(
      {
        status: "pending_pipeline",
        message: "三包資料已就緒。請設定 ARBOR3D_CMD 或 ARBOR3D_ROOT 以跑後續量測。",
        stagedDir: staged,
      },
      null,
      2,
    ),
    "utf8",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
