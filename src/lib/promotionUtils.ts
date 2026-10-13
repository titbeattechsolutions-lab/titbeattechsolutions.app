/**
 * promotionUtils.ts
 *
 * Pure, independently testable utility functions for the Bulk Promotion Engine:
 *  - Class name normalization with confidence scoring
 *  - Topological sort order calculation with cycle detection
 *  - Deterministic state hash calculation for DB TOCTOU race prevention
 *  - Snapshot calculation for pre-promotion audit logs
 *  - Rollback conflict detection for post-promotion manual edits
 */

export interface NormalizationResult {
  normalized: string;
  confidence: "high" | "low";
  reason?: string;
}

export interface TopologicalSortResult {
  executionOrder: string[];
  hasCycle: boolean;
  cycleNodes?: string[];
}

export interface StudentRecord {
  id: string;
  first_name: string;
  last_name: string;
  class_name: string;
  status: string;
}

export interface PromotionSnapshot {
  timestamp: string;
  students: Array<{ id: string; class_name: string; status: string }>;
}

export interface RollbackConflictReport {
  hasConflicts: boolean;
  conflictingStudents: Array<{ id: string; expected_class: string; current_class: string; current_status: string }>;
}

/**
 * Standard progression array for K-12 Nigerian curriculum
 */
export const STANDARD_PROGRESSION = [
  "creche", "pre-nursery", "nursery 1", "nursery 2",
  "primary 1", "primary 2", "primary 3", "primary 4", "primary 5", "primary 6",
  "jss 1", "jss 2", "jss 3", "ss 1", "ss 2", "ss 3"
];

export const STANDARD_DISPLAY_NAMES = [
  "Creche", "Pre-Nursery", "Nursery 1", "Nursery 2",
  "Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6",
  "JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3"
];

/**
 * Normalizes class names and assigns a confidence score ("high" vs "low").
 * Ambiguous names (e.g., "JSS 10" or unrecognized custom strings) return "low" confidence.
 */
export function normalizeClassName(rawName: string): NormalizationResult {
  if (!rawName || typeof rawName !== "string") {
    return { normalized: "Unknown", confidence: "low", reason: "Invalid or empty class name" };
  }

  let str = rawName.toLowerCase().trim();
  str = str.replace(/class/g, "").replace(/grade/g, "").replace(/basic/g, "primary");
  str = str.replace(/one/g, "1").replace(/two/g, "2").replace(/three/g, "3").replace(/four/g, "4").replace(/five/g, "5").replace(/six/g, "6");

  // Edge case check: JSS 10 or numeric anomalies
  const jssMatch = str.match(/jss\s*(\d+)/);
  if (jssMatch && parseInt(jssMatch[1], 10) > 3) {
    return {
      normalized: rawName,
      confidence: "low",
      reason: `Unusual JSS level (${jssMatch[1]}). Expected JSS 1, 2, or 3.`
    };
  }

  const ssMatch = str.match(/ss\s*(\d+)/);
  if (ssMatch && parseInt(ssMatch[1], 10) > 3) {
    return {
      normalized: rawName,
      confidence: "low",
      reason: `Unusual SS level (${ssMatch[1]}). Expected SS 1, 2, or 3.`
    };
  }

  const primMatch = str.match(/primary\s*(\d+)/);
  if (primMatch && parseInt(primMatch[1], 10) > 6) {
    return {
      normalized: rawName,
      confidence: "low",
      reason: `Unusual Primary level (${primMatch[1]}). Expected Primary 1 to 6.`
    };
  }

  // Strip arm suffixes so "JSS 1A", "SS 2 Science", "Primary 3 Gold", "Nursery 2B"
  // all resolve to their base curriculum level for subject/promotion lookups.
  str = str
    .replace(/jss\s*(\d).*/, "jss $1")
    .replace(/ss\s*(\d).*/, "ss $1")
    .replace(/primary\s*(\d).*/, "primary $1")
    .replace(/nursery\s*(\d).*/, "nursery $1")
    .replace(/basic\s*(\d).*/, "basic $1");
  const cleaned = str.replace(/\s+/g, " ").trim();

  const idx = STANDARD_PROGRESSION.indexOf(cleaned);
  if (idx !== -1) {
    return { normalized: STANDARD_DISPLAY_NAMES[idx], confidence: "high" };
  }

  return {
    normalized: rawName,
    confidence: "low",
    reason: "Custom or non-standard class name mapping"
  };
}

/**
 * Computes topological sort order from source -> destination mapping graph.
 * Higher destination classes are executed first to prevent student record collision.
 */
export function buildTopologicalOrder(mappings: Record<string, string>): TopologicalSortResult {
  const activeMappings = Object.entries(mappings).filter(([_, target]) => target && target !== "DO_NOT_PROMOTE");
  
  const graph: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};

  // Initialize in-degree for all source and target classes
  activeMappings.forEach(([src, tgt]) => {
    if (inDegree[src] === undefined) inDegree[src] = 0;
    if (tgt && tgt !== "GRADUATE" && tgt !== "DO_NOT_PROMOTE") {
      if (inDegree[tgt] === undefined) inDegree[tgt] = 0;
    }
  });

  // If src -> tgt (e.g. JSS 1 -> JSS 2), JSS 2 must execute BEFORE JSS 1.
  // So JSS 1 depends on JSS 2 executing first!
  activeMappings.forEach(([src, tgt]) => {
    if (tgt && tgt !== "GRADUATE" && tgt !== "DO_NOT_PROMOTE") {
      if (!graph[tgt]) graph[tgt] = [];
      graph[tgt].push(src);
      inDegree[src] = (inDegree[src] || 0) + 1;
    }
  });

  // Nodes with in-degree 0 (e.g., SS 3 graduating or highest target classes) can execute immediately
  const queue: string[] = Object.keys(inDegree).filter((k) => inDegree[k] === 0);
  const order: string[] = [];

  while (queue.length > 0) {
    const u = queue.shift()!;
    order.push(u);
    const dependents = graph[u] || [];
    dependents.forEach((v) => {
      inDegree[v]--;
      if (inDegree[v] === 0) queue.push(v);
    });
  }

  const totalNodes = Object.keys(inDegree).length;
  const hasCycle = order.length < totalNodes;

  return {
    executionOrder: order,
    hasCycle,
    cycleNodes: hasCycle ? Object.keys(inDegree).filter((k) => !order.includes(k)) : undefined
  };
}

/**
 * Computes a deterministic MD5/SHA256-like state hash for pre-execution TOCTOU checks.
 */
export function computeStateHash(students: StudentRecord[]): string {
  const sorted = [...students].sort((a, b) => a.id.localeCompare(b.id));
  const payload = sorted.map((s) => `${s.id}:${s.class_name}:${s.status}`).join("|");

  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return "hash_" + Math.abs(hash).toString(16);
}

/**
 * Generates a pre-promotion snapshot storing previous student class and status assignments.
 */
export function computePromotionSnapshot(
  students: StudentRecord[]
): PromotionSnapshot {
  return {
    timestamp: new Date().toISOString(),
    students: students.map((s) => ({
      id: s.id,
      class_name: s.class_name,
      status: s.status
    }))
  };
}

/**
 * Detects conflicts when attempting to roll back a promotion batch.
 * If a student was edited manually post-promotion (e.g. class changed or status changed), it flags a conflict.
 */
export function detectRollbackConflicts(
  snapshot: PromotionSnapshot,
  currentStudents: StudentRecord[],
  postPromotionMappings: Record<string, string>
): RollbackConflictReport {
  const studentMap = new Map(currentStudents.map((s) => [s.id, s]));
  const conflicts: Array<{ id: string; expected_class: string; current_class: string; current_status: string }> = [];

  snapshot.students.forEach((snapStudent) => {
    const current = studentMap.get(snapStudent.id);
    const expectedPostClass = postPromotionMappings[snapStudent.class_name] || snapStudent.class_name;
    const isGraduate = expectedPostClass === "GRADUATE";
    const expectedStatus = isGraduate ? "graduated" : "active";

    if (!current) {
      conflicts.push({
        id: snapStudent.id,
        expected_class: expectedPostClass,
        current_class: "DELETED",
        current_status: "DELETED"
      });
      return;
    }

    // If current class or status doesn't match expected post-promotion state, a manual edit occurred!
    if (!isGraduate && current.class_name !== expectedPostClass) {
      conflicts.push({
        id: snapStudent.id,
        expected_class: expectedPostClass,
        current_class: current.class_name,
        current_status: current.status
      });
    } else if (current.status !== expectedStatus) {
      conflicts.push({
        id: snapStudent.id,
        expected_class: expectedPostClass,
        current_class: current.class_name,
        current_status: current.status
      });
    }
  });

  return {
    hasConflicts: conflicts.length > 0,
    conflictingStudents: conflicts
  };
}
