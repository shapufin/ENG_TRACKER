import type { LeaveRequest } from "@/types";

interface FilterOptions {
  filterStatus: string;
  filterUser: string;
  filterType: string;
  dateFrom: string;
  dateTo: string;
  searchQuery: string;
}

const matchesStatus = (req: LeaveRequest, filterStatus: string) =>
  filterStatus === "all" || req.status === filterStatus;

const matchesUser = (req: LeaveRequest, filterUser: string) =>
  filterUser === "all" || String(req.user) === filterUser;

const matchesType = (req: LeaveRequest, filterType: string) =>
  filterType === "all" || req.request_type === filterType;

const matchesDateRange = (req: LeaveRequest, dateFrom: string, dateTo: string) => {
  if (dateFrom && new Date(req.start_date) < new Date(dateFrom)) return false;
  if (dateTo && new Date(req.end_date) > new Date(dateTo)) return false;
  return true;
};

const matchesSearch = (req: LeaveRequest, searchQuery: string) => {
  if (!searchQuery) return true;
  const search = searchQuery.toLowerCase();
  const userName = req.user_name?.toLowerCase() || "";
  const reason = req.reason?.toLowerCase() || "";
  return userName.includes(search) || reason.includes(search);
};

export const matchesLeaveRequestFilter = (req: LeaveRequest, options: FilterOptions) =>
  matchesStatus(req, options.filterStatus) &&
  matchesUser(req, options.filterUser) &&
  matchesType(req, options.filterType) &&
  matchesDateRange(req, options.dateFrom, options.dateTo) &&
  matchesSearch(req, options.searchQuery);

export const sortLeaveRequests = (a: LeaveRequest, b: LeaveRequest) =>
  new Date(b.created_at || b.start_date).getTime() -
  new Date(a.created_at || a.start_date).getTime();
