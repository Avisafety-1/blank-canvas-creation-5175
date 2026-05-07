import { supabase } from "@/integrations/supabase/client";

export type ResourceKind = "document" | "equipment" | "personnel";

export interface MissingVisibility {
  resourceType: ResourceKind;
  resourceId: string;
  resourceName: string;
  /** company_id for the resource owner (used for equipment_department_visibility insert) */
  resourceCompanyId: string | null;
  /** Department company_ids that the resource is NOT visible to */
  missingDeptIds: string[];
}

export interface DepartmentInfo {
  id: string;
  navn: string;
}

/**
 * Check whether all resources linked to a drone are visible to the given target departments.
 * Returns one entry per (resource, missing-dept) gap.
 *
 * Exception: a personnel link is ignored if the person is the drone's technical responsible
 * AND belongs to the drone's owner company (i.e. the company sharing the drone downward).
 */
export async function checkDroneResourceVisibility(
  droneId: string,
  targetDeptIds: string[],
  options?: { droneCompanyId?: string | null; technicalResponsibleId?: string | null },
): Promise<MissingVisibility[]> {
  if (!droneId || targetDeptIds.length === 0) return [];
  const droneCompanyId = options?.droneCompanyId ?? null;
  const technicalResponsibleId = options?.technicalResponsibleId ?? null;

  const missing: MissingVisibility[] = [];

  // 1. Documents
  const { data: docLinks } = await (supabase as any)
    .from("drone_documents")
    .select("document:document_id(id, tittel, company_id, visible_to_children)")
    .eq("drone_id", droneId);

  for (const link of docLinks || []) {
    const doc = link.document;
    if (!doc) continue;
    const visibleEverywhere = !!doc.visible_to_children;
    const missingFor = visibleEverywhere
      ? []
      : targetDeptIds.filter((d) => d !== doc.company_id);
    if (missingFor.length > 0) {
      missing.push({
        resourceType: "document",
        resourceId: doc.id,
        resourceName: doc.tittel || "Uten tittel",
        resourceCompanyId: doc.company_id,
        missingDeptIds: missingFor,
      });
    }
  }

  // 2. Equipment
  const { data: eqLinks } = await supabase
    .from("drone_equipment")
    .select("equipment:equipment_id(id, navn, company_id)")
    .eq("drone_id", droneId);

  const equipmentList = (eqLinks || [])
    .map((l: any) => l.equipment)
    .filter(Boolean);

  if (equipmentList.length > 0) {
    const eqIds = equipmentList.map((e: any) => e.id);
    const { data: visRows } = await (supabase as any)
      .from("equipment_department_visibility")
      .select("equipment_id, company_id")
      .in("equipment_id", eqIds);

    const visMap = new Map<string, Set<string>>();
    for (const row of visRows || []) {
      if (!visMap.has(row.equipment_id)) visMap.set(row.equipment_id, new Set());
      visMap.get(row.equipment_id)!.add(row.company_id);
    }

    for (const eq of equipmentList) {
      const visibleSet = visMap.get(eq.id);
      const missingFor = targetDeptIds.filter((d) => {
        if (d === eq.company_id) return false;
        // If no visibility rows exist at all, equipment is owner-only → missing
        // If some rows exist, check membership
        if (!visibleSet) return true;
        return !visibleSet.has(d);
      });
      if (missingFor.length > 0) {
        missing.push({
          resourceType: "equipment",
          resourceId: eq.id,
          resourceName: eq.navn || "Uten navn",
          resourceCompanyId: eq.company_id,
          missingDeptIds: missingFor,
        });
      }
    }
  }

  // 3. Personnel — info-only (cannot auto-grant visibility)
  const { data: persLinks } = await (supabase as any)
    .from("drone_personnel")
    .select("profile:profile_id(id, full_name, company_id)")
    .eq("drone_id", droneId);

  for (const link of persLinks || []) {
    const p = link.profile;
    if (!p) continue;
    // Exception: technical responsible belonging to the drone's owner company is OK
    if (
      technicalResponsibleId &&
      p.id === technicalResponsibleId &&
      droneCompanyId &&
      p.company_id === droneCompanyId
    ) {
      continue;
    }
    const missingFor = targetDeptIds.filter((d) => d !== p.company_id);
    if (missingFor.length > 0) {
      missing.push({
        resourceType: "personnel",
        resourceId: p.id,
        resourceName: p.full_name || "Ukjent",
        resourceCompanyId: p.company_id,
        missingDeptIds: missingFor,
      });
    }
  }

  return missing;
}

/**
 * Auto-grant visibility for documents (visible_to_children=true) and equipment
 * (insert equipment_department_visibility rows). Personnel cannot be auto-fixed.
 */
export async function grantMissingVisibility(missing: MissingVisibility[]): Promise<void> {
  // Documents: set visible_to_children = true
  const docIds = Array.from(
    new Set(missing.filter((m) => m.resourceType === "document").map((m) => m.resourceId)),
  );
  if (docIds.length > 0) {
    await supabase
      .from("documents")
      .update({ visible_to_children: true })
      .in("id", docIds);
  }

  // Equipment: insert visibility rows for each (equipment, missing dept)
  const eqRows: { equipment_id: string; company_id: string }[] = [];
  for (const m of missing) {
    if (m.resourceType !== "equipment") continue;
    for (const dept of m.missingDeptIds) {
      eqRows.push({ equipment_id: m.resourceId, company_id: dept });
    }
  }
  if (eqRows.length > 0) {
    // Upsert-style: ignore conflicts on duplicate
    await (supabase as any)
      .from("equipment_department_visibility")
      .upsert(eqRows, { onConflict: "equipment_id,company_id", ignoreDuplicates: true });
  }
}
