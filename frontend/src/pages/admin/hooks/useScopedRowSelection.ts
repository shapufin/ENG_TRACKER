import { useState } from "react";
import type { OnChangeFn, RowSelectionState } from "@tanstack/react-table";

/**
 * Row selection that is dropped whenever `scope` (page + filters) changes, so ids
 * from rows no longer on screen are never acted on. Derived, not reset in an effect.
 */
export const useScopedRowSelection = (scope: string) => {
  const [state, setState] = useState<{ scope: string; selection: RowSelectionState }>({
    scope,
    selection: {},
  });
  const rowSelection = state.scope === scope ? state.selection : {};
  const setRowSelection: OnChangeFn<RowSelectionState> = (updater) =>
    setState({
      scope,
      selection: typeof updater === "function" ? updater(rowSelection) : updater,
    });
  return { rowSelection, setRowSelection, clear: () => setState({ scope, selection: {} }) };
};
