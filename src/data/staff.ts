export type StaffAccount = {
  workId: string;
  name: string;
  role: string;
  password: string;
};

/** 第一版示範帳號。之後遠端接真實後台時再換成 API。 */
export const STAFF: StaffAccount[] = [
  {
    workId: "E-1027",
    name: "林志偉",
    role: "現場調查員",
    password: "arbor1027",
  },
  {
    workId: "E-2041",
    name: "陳雅婷",
    role: "複核人員",
    password: "arbor2041",
  },
  {
    workId: "E-3308",
    name: "黃建宏",
    role: "承辦人",
    password: "arbor3308",
  },
];

export function authenticate(workId: string, password: string): StaffAccount | null {
  const staff = STAFF.find((item) => item.workId === workId);
  if (!staff || staff.password !== password) return null;
  return staff;
}
