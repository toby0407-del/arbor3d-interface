import type { StaffAccount } from "../data/staff";

const KEY = "arbor3d.session";

export type Session = {
  workId: string;
  name: string;
  role: string;
};

export function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function writeSession(staff: StaffAccount): Session {
  const session: Session = {
    workId: staff.workId,
    name: staff.name,
    role: staff.role,
  };
  sessionStorage.setItem(KEY, JSON.stringify(session));
  return session;
}

export function clearSession(): void {
  sessionStorage.removeItem(KEY);
}
