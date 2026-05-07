import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Department {
  id: string;
  navn: string;
}

/**
 * Hook to manage department visibility for drones or equipment.
 * @param resourceType 'drone' or 'equipment'
 * @param resourceId The ID of the drone or equipment
 * @param companyId The company owning this resource
 * @param isOpen Whether the dialog is open (to trigger fetching)
 */
export const useDepartmentVisibility = (
  resourceType: "drone" | "equipment",
  resourceId: string | undefined,
  companyId: string | undefined,
  isOpen: boolean
) => {
  const [childDepartments, setChildDepartments] = useState<Department[]>([]);
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([]);
  const [allSelected, setAllSelected] = useState(true);
  const [loading, setLoading] = useState(false);

  const tableName = resourceType === "drone"
    ? "drone_department_visibility"
    : "equipment_department_visibility";
  const fkColumn = resourceType === "drone" ? "drone_id" : "equipment_id";

  // Fetch child departments for the company
  useEffect(() => {
    if (!companyId || !isOpen) return;

    const fetchDepts = async () => {
      // First check if this company has a parent (is a child itself) — get the root
      const { data: ownCompany } = await supabase
        .from("companies")
        .select("id, parent_company_id")
        .eq("id", companyId)
        .single();

      const parentId = ownCompany?.parent_company_id || companyId;

      // Get all children of parent (siblings + self if child, or children if parent)
      const { data: children } = await supabase
        .from("companies")
        .select("id, navn")
        .eq("parent_company_id", parentId)
        .order("navn");

      if (children && children.length > 0) {
        // Also include parent as option if current company is the parent
        if (!ownCompany?.parent_company_id) {
          // We are parent — show children only (resource already belongs to parent)
          setChildDepartments(children);
        } else {
          // We are a child — show siblings + parent
          const { data: parent } = await supabase
            .from("companies")
            .select("id, navn")
            .eq("id", parentId)
            .single();
          const allDepts = parent ? [parent, ...children.filter(c => c.id !== companyId)] : children.filter(c => c.id !== companyId);
          setChildDepartments(allDepts);
        }
      } else {
        setChildDepartments([]);
      }
    };

    fetchDepts();
  }, [companyId, isOpen]);

  // Fetch current visibility selections
  useEffect(() => {
    if (!resourceId || !isOpen || childDepartments.length === 0) {
      setSelectedDeptIds([]);
      setAllSelected(true);
      return;
    }

    const fetchVisibility = async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from(tableName)
        .select("company_id")
        .eq(fkColumn, resourceId);

      if (data && data.length > 0) {
        const ids = data.map((r: any) => r.company_id);
        setSelectedDeptIds(ids);
        setAllSelected(ids.length >= childDepartments.length && childDepartments.every(d => ids.includes(d.id)));
      } else {
        setSelectedDeptIds([]);
        setAllSelected(false);
      }
      setLoading(false);
    };

    fetchVisibility();
  }, [resourceId, isOpen, childDepartments, tableName, fkColumn]);

  const handleToggle = useCallback((deptId: string, checked: boolean) => {
    setSelectedDeptIds(prev => {
      const next = checked ? [...prev, deptId] : prev.filter(id => id !== deptId);
      setAllSelected(next.length >= childDepartments.length && childDepartments.every(d => next.includes(d.id)));
      return next;
    });
  }, [childDepartments]);

  const handleToggleAll = useCallback((checked: boolean) => {
    setAllSelected(checked);
    if (checked) {
      setSelectedDeptIds(childDepartments.map(d => d.id));
    } else {
      setSelectedDeptIds([]);
    }
  }, [childDepartments]);

  const saveVisibility = useCallback(async () => {
    if (!resourceId) return;

    // Delete all existing
    await (supabase as any)
      .from(tableName)
      .delete()
      .eq(fkColumn, resourceId);

    // Insert selected
    const idsToInsert = allSelected ? childDepartments.map(d => d.id) : selectedDeptIds;
    if (idsToInsert.length > 0) {
      const rows = idsToInsert.map(cid => ({
        [fkColumn]: resourceId,
        company_id: cid,
      }));
      await (supabase as any).from(tableName).insert(rows);
    }
  }, [resourceId, tableName, fkColumn, allSelected, childDepartments, selectedDeptIds]);

  return {
    childDepartments,
    selectedDeptIds,
    allSelected,
    loading,
    handleToggle,
    handleToggleAll,
    saveVisibility,
    hasDepartments: childDepartments.length > 0,
  };
};
