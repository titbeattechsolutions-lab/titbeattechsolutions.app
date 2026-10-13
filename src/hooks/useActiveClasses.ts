import { useMemo } from "react";
import { ALL_CLASSES } from "@/lib/school-constants";

export function useActiveClasses(appState: any): string[] {
  return useMemo(() => {
    const custom = appState?.schoolSettings?.activeClasses;
    if (custom && custom.length > 0) return custom;
    return ALL_CLASSES;
  }, [appState?.schoolSettings?.activeClasses]);
}
