import { useCallback, useState } from "react";

export type FieldMeasure = {
  dbhCm: string;
  note: string;
};

type Store = Record<string, FieldMeasure>;

function keyFor(scanId: string) {
  return `arbor3d.fieldMeasures.${scanId}`;
}

function readStore(scanId: string): Store {
  try {
    const raw = localStorage.getItem(keyFor(scanId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(scanId: string, store: Store) {
  localStorage.setItem(keyFor(scanId), JSON.stringify(store));
}

export function useFieldMeasures(scanId: string) {
  const [measures, setMeasures] = useState<Store>(() => readStore(scanId));

  const update = useCallback(
    (treeId: string, patch: Partial<FieldMeasure>) => {
      setMeasures((prev) => {
        const next = {
          ...prev,
          [treeId]: {
            dbhCm: prev[treeId]?.dbhCm ?? "",
            note: prev[treeId]?.note ?? "",
            ...patch,
          },
        };
        writeStore(scanId, next);
        return next;
      });
    },
    [scanId],
  );

  return { measures, update };
}
