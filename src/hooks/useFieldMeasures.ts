import { useCallback, useEffect, useState } from "react";

export type FieldMeasure = {
  dbhCm: string;
  note: string;
  updatedAt: number;
};

type Store = Record<string, FieldMeasure>;

function keyFor(scanId: string) {
  return `arbor3d-field-measures:${scanId}`;
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

export function useFieldMeasures(scanId: string | null) {
  const [store, setStore] = useState<Store>({});

  useEffect(() => {
    if (!scanId) {
      setStore({});
      return;
    }
    setStore(readStore(scanId));
  }, [scanId]);

  const save = useCallback(
    (treeId: string, next: Pick<FieldMeasure, "dbhCm" | "note">) => {
      if (!scanId) return;
      setStore((prev) => {
        const updated: Store = {
          ...prev,
          [treeId]: {
            dbhCm: next.dbhCm,
            note: next.note,
            updatedAt: Date.now(),
          },
        };
        writeStore(scanId, updated);
        return updated;
      });
    },
    [scanId],
  );

  return { store, save };
}
