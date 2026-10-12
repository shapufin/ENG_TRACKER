import React from "react";

/**
 * True while rendering inside the floating row-actions pill. `RowActions`
 * consumes it to show `shortLabel` text next to icons (AdminTABLE mockup:
 * labels on wide screens, icon-only below `xl`); the actions column stays
 * icon-only.
 *
 * Lives in its own module so `RowActionsPill.tsx` keeps exporting only a
 * component (react-refresh/only-export-components).
 */
export const RowActionsPillContext = React.createContext(false);
