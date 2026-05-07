import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, Plane, Wrench, Building2, User } from "lucide-react";

interface PersonnelItem {
  profile_id: string;
  profiles: { id: string; full_name: string | null } | null;
  role_id: string | null;
  company_mission_roles: { id: string; name: string } | null;
}

interface DroneItem {
  drone_id: string;
  drones: { id: string; modell: string; serienummer: string } | null;
}

interface EquipmentItem {
  equipment_id: string;
  equipment: { id: string; navn: string; type: string } | null;
}

interface MissionResourceSectionsProps {
  mission: any;
  open: boolean;
}

export const MissionResourceSections = ({ mission, open }: MissionResourceSectionsProps) => {
  const [personnel, setPersonnel] = useState<PersonnelItem[]>([]);
  const [drones, setDrones] = useState<DroneItem[]>([]);
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !mission?.id) {
      setPersonnel([]);
      setDrones([]);
      setEquipment([]);
      return;
    }

    // If mission already has resource data from parent (e.g. Oppdrag.tsx), use it
    if (mission.personnel || mission.drones || mission.equipment) {
      if (mission.personnel) setPersonnel(mission.personnel);
      if (mission.drones) setDrones(mission.drones);
      if (mission.equipment) setEquipment(mission.equipment);
      return;
    }

    const fetchResources = async () => {
      setLoading(true);
      try {
        const [pRes, dRes, eRes] = await Promise.all([
          supabase
            .from("mission_personnel")
            .select("profile_id, profiles(id, full_name), role_id, company_mission_roles(id, name)")
            .eq("mission_id", mission.id),
          supabase
            .from("mission_drones")
            .select("drone_id, drones(id, modell, serienummer)")
            .eq("mission_id", mission.id),
          supabase
            .from("mission_equipment")
            .select("equipment_id, equipment(id, navn, type)")
            .eq("mission_id", mission.id),
        ]);
        setPersonnel((pRes.data as PersonnelItem[] | null) ?? []);
        setDrones((dRes.data as DroneItem[] | null) ?? []);
        setEquipment((eRes.data as EquipmentItem[] | null) ?? []);
      } catch {
        // silently fail — sections just won't show
      } finally {
        setLoading(false);
      }
    };

    fetchResources();
  }, [open, mission?.id]);

  if (loading) return null;

  const kunde = mission?.kunde;
  const createdByName = mission?.created_by_name;
  const hasAny = kunde || createdByName || personnel.length > 0 || drones.length > 0 || equipment.length > 0;

  if (!hasAny) return null;

  return (
    <div className="space-y-3">
      {kunde && (
        <div className="flex items-start gap-3">
          <Building2 className="w-5 h-5 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">Kunde</p>
            <p className="text-base">{kunde}</p>
          </div>
        </div>
      )}

      {personnel.length > 0 && (
        <div className="flex items-start gap-3">
          <Users className="w-5 h-5 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">Personell</p>
            <ul className="text-base space-y-0.5">
              {personnel.map((p) => (
                <li key={p.profile_id} className="flex items-center gap-1.5">
                  <span>{p.profiles?.full_name || "Ukjent"}</span>
                  {p.company_mission_roles?.name && (
                    <span className="text-xs text-muted-foreground">({p.company_mission_roles.name})</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {drones.length > 0 && (
        <div className="flex items-start gap-3">
          <Plane className="w-5 h-5 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">Droner</p>
            <ul className="text-base space-y-0.5">
              {drones.map((d) => (
                <li key={d.drone_id}>
                  {d.drones?.modell || "Ukjent"}{" "}
                  <span className="text-sm text-muted-foreground">
                    ({d.drones?.serienummer})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {equipment.length > 0 && (
        <div className="flex items-start gap-3">
          <Wrench className="w-5 h-5 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">Utstyr</p>
            <ul className="text-base space-y-0.5">
              {equipment.map((e) => (
                <li key={e.equipment_id}>
                  {e.equipment?.navn || "Ukjent"}{" "}
                  <span className="text-sm text-muted-foreground">
                    ({e.equipment?.type})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {createdByName && (
        <div className="flex items-start gap-3">
          <User className="w-5 h-5 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">Opprettet av</p>
            <p className="text-base">{createdByName}</p>
          </div>
        </div>
      )}
    </div>
  );
};
