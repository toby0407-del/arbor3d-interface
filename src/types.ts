export type DbhMethod = "circle" | "caliper" | string;

export type TreeRecord = {
  Tree_ID: string;
  DBH_cm: number | null;
  DBH_method: DbhMethod;
  DBH_note: string;
  arc_coverage_deg: number | null;
  dbh_is_strict_breast_height: boolean;
  GPS_Location: [number, number] | null;
  Local_XYZ_m: [number, number, number];
  Best_Photo: string | null;
  Mask_Path: string | null;
  Cross_Section_Image: string | null;
  "3D_Model_Path": string | null;
  Single_Tree_Ply: string | null;
  YOLO_confidence: number | null;
  num_detections: number | null;
};

export type ParkInventoryReport = {
  created_at: string;
  scan_id: string;
  gps_available: boolean;
  num_trees: number;
  trees: TreeRecord[];
};

export type TrafficLight = "green" | "yellow" | "red";

export type Route =
  | { name: "overview" }
  | { name: "review" }
  | { name: "detail"; treeId: string }
  | { name: "splat"; treeId: string };
