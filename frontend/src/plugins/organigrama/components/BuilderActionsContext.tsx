import { createContext, useContext } from "react";

export interface BuilderActionsContextValue {
  onAddChild?: (parentId: string) => void;
  onAddPeer?: (nodeId: string) => void;
  onDeleteNode?: (nodeId: string) => void;
}

export const BuilderActionsContext = createContext<BuilderActionsContextValue>({});

export const useBuilderActions = () => useContext(BuilderActionsContext);
