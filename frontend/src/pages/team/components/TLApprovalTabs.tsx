import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TLApprovalTabPanel } from "./TLApprovalTabPanel";
import type { Tab } from "../hooks/useTLApprovalDashboard";
import type { RowSelectionState } from "@tanstack/react-table";

interface TLApprovalTabsProps {
  activeTab: Tab;
  onActiveTabChange: (tab: Tab) => void;
  queries: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    overtime: { data?: any[]; isLoading: boolean; error: any; refetch: () => void };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    standby: { data?: any[]; isLoading: boolean; error: any; refetch: () => void };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    leave: { data?: any[]; isLoading: boolean; error: any; refetch: () => void };
  };
  columns: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    overtime: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    standby: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    leave: any[];
  };
  rowSelection: Record<Tab, RowSelectionState>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onRowSelectionChange: (type: Tab) => (updater: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onBulkApprove: (type: Tab, data: any[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onBulkReject: (type: Tab, data: any[]) => void;
  onClearSelection: (type: Tab) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getSelectedIds: (type: Tab, data: any[]) => number[];
  isBulkPending: boolean;
  header?: React.ReactNode;
}

const TABS = [
  { key: "overtime" as Tab, label: "Overtime" },
  { key: "standby" as Tab, label: "Standby" },
  { key: "leave" as Tab, label: "Leave" },
];

/**
 * 8-9 columns do not fit a 1440px viewport at readable widths, so each tab's
 * free-text column starts hidden — still one click away in the Columns menu and
 * persisted per tab, never dropped. The tab panel owns the Columns control
 * because it owns the table.
 */
const HIDDEN_BY_DEFAULT: Record<Tab, Record<string, boolean>> = {
  overtime: { description: false },
  standby: { description: false },
  leave: { reason: false },
};

export const TLApprovalTabs: React.FC<TLApprovalTabsProps> = ({
  activeTab,
  onActiveTabChange,
  queries,
  columns,
  rowSelection,
  onRowSelectionChange,
  onBulkApprove,
  onBulkReject,
  onClearSelection,
  getSelectedIds,
  isBulkPending,
  header,
}) => (
  <Tabs value={activeTab} onValueChange={(v) => onActiveTabChange(v as Tab)}>
    <TabsList className="grid w-full grid-cols-3">
      {TABS.map(({ key, label }) => (
        <TabsTrigger key={key} value={key}>
          {label} ({queries[key].data?.length || 0})
        </TabsTrigger>
      ))}
    </TabsList>

    {TABS.map(({ key, label }) => (
      <TabsContent value={key} key={key}>
        <TLApprovalTabPanel
          header={header}
          type={key}
          label={label.toLowerCase()}
          storageKey={`table-visibility-tl-approvals-${key}`}
          defaultColumnVisibility={HIDDEN_BY_DEFAULT[key]}
          data={queries[key].data || []}
          isLoading={queries[key].isLoading}
          error={queries[key].error}
          onRefetch={queries[key].refetch}
          columns={columns[key]}
          rowSelection={rowSelection[key]}
          onRowSelectionChange={onRowSelectionChange(key)}
          selectedCount={getSelectedIds(key, queries[key].data || []).length}
          onClearSelection={() => onClearSelection(key)}
          onBulkApprove={() => onBulkApprove(key, queries[key].data || [])}
          onBulkReject={() => onBulkReject(key, queries[key].data || [])}
          isBulkPending={isBulkPending}
        />
      </TabsContent>
    ))}
  </Tabs>
);
