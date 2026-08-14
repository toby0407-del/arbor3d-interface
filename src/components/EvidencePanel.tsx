import { useState } from "react";
import type { TreeRecord } from "../types";
import { fileName, methodLabel } from "../lib/format";
import { scanAssetUrl } from "../lib/scanMedia";

type Props = {
  tree: TreeRecord;
  scanId: string;
};

function MediaCard({
  title,
  path,
  scanId,
}: {
  title: string;
  path: string | null;
  scanId: string;
}) {
  const url = scanAssetUrl(scanId, path);
  const [missing, setMissing] = useState(!url);

  return (
    <figure className="evidence-card">
      <figcaption>
        {title}
        <small>{fileName(path)}</small>
      </figcaption>
      {url && !missing ? (
        <img
          className="evidence-photo"
          src={url}
          alt={title}
          onError={() => setMissing(true)}
        />
      ) : (
        <div className="evidence-empty">
          尚未匯入
          <small>請放到 public/scans/{scanId}/{path || "檔名"}</small>
        </div>
      )}
    </figure>
  );
}

export function EvidencePanel({ tree, scanId }: Props) {
  return (
    <div className="evidence-grid">
      <MediaCard title="最佳照片" path={tree.Best_Photo} scanId={scanId} />
      <MediaCard title="YOLO 遮罩" path={tree.Mask_Path} scanId={scanId} />
      <MediaCard
        title={`胸高剖面 · ${methodLabel(tree.DBH_method)}`}
        path={tree.Cross_Section_Image}
        scanId={scanId}
      />
    </div>
  );
}
