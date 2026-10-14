/** History stack for Organigrama builder (Undo / Redo). */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Node, Edge } from "@xyflow/react";

interface Snapshot {
  nodes: Node[];
  edges: Edge[];
}

const MAX_HISTORY_LENGTH = 30;

export function useBuilderHistory(
  nodes: Node[],
  edges: Edge[],
  setNodes: Dispatch<SetStateAction<Node[]>>,
  setEdges: Dispatch<SetStateAction<Edge[]>>
) {
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);

  // Ref to access current state without stale closures in keydown listeners
  const currentRef = useRef<Snapshot>({ nodes, edges });
  useEffect(() => {
    currentRef.current = { nodes, edges };
  }, [nodes, edges]);

  /** Record a snapshot before a significant mutation (drag stop, node add/delete, edge connect). */
  const recordSnapshot = useCallback((beforeNodes: Node[], beforeEdges: Edge[]) => {
    setPast((prev) => {
      const next = [...prev, { nodes: beforeNodes, edges: beforeEdges }];
      if (next.length > MAX_HISTORY_LENGTH) {
        return next.slice(next.length - MAX_HISTORY_LENGTH);
      }
      return next;
    });
    setFuture([]);
  }, []);

  const undo = useCallback(() => {
    setPast((prevPast) => {
      if (prevPast.length === 0) return prevPast;
      const previous = prevPast[prevPast.length - 1];
      const remainingPast = prevPast.slice(0, prevPast.length - 1);

      // Current state moves to future
      setFuture((prevFuture) => [currentRef.current, ...prevFuture]);

      // Restore previous state
      setNodes(previous.nodes);
      setEdges(previous.edges);

      return remainingPast;
    });
  }, [setNodes, setEdges]);

  const redo = useCallback(() => {
    setFuture((prevFuture) => {
      if (prevFuture.length === 0) return prevFuture;
      const next = prevFuture[0];
      const remainingFuture = prevFuture.slice(1);

      // Current state moves to past
      setPast((prevPast) => [...prevPast, currentRef.current]);

      // Restore next state
      setNodes(next.nodes);
      setEdges(next.edges);

      return remainingFuture;
    });
  }, [setNodes, setEdges]);

  // Global keyboard shortcuts for Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when focused inside form inputs
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }

      const isMac =
        typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        (modifier && e.key.toLowerCase() === "y") ||
        (modifier && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  return {
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undo,
    redo,
    recordSnapshot,
  };
}
