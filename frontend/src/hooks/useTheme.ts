import { useContext } from "react";
import { ThemeContext } from "@/context/theme-context-base";

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
};
