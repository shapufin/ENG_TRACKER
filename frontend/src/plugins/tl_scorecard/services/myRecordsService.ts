import api from "@/lib/api";
import type { MyRecords } from "../types/myRecords";

const BASE = "/plugins/tl_scorecard";

export const getMyRecords = () => api.get<MyRecords>(`${BASE}/my-records/`).then((r) => r.data);
