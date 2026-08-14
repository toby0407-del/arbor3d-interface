import type { TreeRecord } from "../types";
import { fileName } from "../lib/format";
import { scanAssetUrl } from "../lib/scanMedia";

type Props = {
  tree: TreeRecord;
  scanId: string;
};

export function SuperSplatViewer({ tree, scanId }: Props) {
  const ply = tree["3D_Model_Path"] || tree.Single_Tree_Ply;
  const url = scanAssetUrl(scanId, ply);

  return (
    <div className="splat-stage splat-missing">
      <div className="splat-empty">
        <div className="splat-kicker">3D 模型</div>
        <div className="splat-title">{tree.Tree_ID}</div>
        <p>模型尚未匯入，因此不顯示示意點雲，以免當成真實掃描。</p>
        <p className="splat-path">
          {url ? (
            <>
              請把 <code>{fileName(ply)}</code> 放到{" "}
              <code>public/scans/{scanId}/</code>
            </>
          ) : (
            "JSON 裡也還沒有 3D 路徑。"
          )}
        </p>
      </div>
    </div>
  );
}
