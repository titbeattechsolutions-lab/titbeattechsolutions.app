import { useSchool } from "./useSchool";

/**
 * Returns whether a named feature is enabled for the current school.
 * Reads school.features JSONB — a key absent from the object defaults to false.
 * Usage: const feesEnabled = useFeature('fees');
 */
export function useFeature(key: string): boolean {
  const { school } = useSchool();
  if (!school) return false;
  const features = school.features as Record<string, boolean> | null;
  if (!features) return false;
  return features[key] === true;
}
