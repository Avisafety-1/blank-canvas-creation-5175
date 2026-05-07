import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { nb } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { SearchablePersonSelect } from "@/components/SearchablePersonSelect";

interface SoraAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missionId?: string;
  onSaved?: () => void;
}

export const SoraAnalysisDialog = ({ open, onOpenChange, missionId, onSaved }: SoraAnalysisDialogProps) => {
  const { user, companyId } = useAuth();
  const [missions, setMissions] = useState<any[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState<string>(missionId || "");
  const [selectedMission, setSelectedMission] = useState<any>(null);
  const [existingSora, setExistingSora] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [preparedByProfile, setPreparedByProfile] = useState<{ email?: string; full_name?: string } | null>(null);

  const [formData, setFormData] = useState({
    environment: "",
    conops_summary: "",
    igrc: "",
    ground_mitigations: "",
    fgrc: "",
    arc_initial: "",
    airspace_mitigations: "",
    arc_residual: "",
    sail: "",
    residual_risk_level: "",
    residual_risk_comment: "",
    operational_limits: "",
    sora_status: "Ikke startet",
    approved_by: "",
  });

  useEffect(() => {
    if (open) {
      fetchMissions();
      fetchProfiles();
      if (missionId) {
        setSelectedMissionId(missionId);
      }
    }
  }, [open, missionId]);

  useEffect(() => {
    if (selectedMissionId) {
      fetchMissionDetails();
      fetchExistingSora();
    }
  }, [selectedMissionId]);

  const fetchMissions = async () => {
    const { data, error } = await supabase
      .from("missions")
      .select("*")
      .in("status", ["Planlagt", "Pågående"])
      .order("tidspunkt", { ascending: true });

    if (error) {
      console.error("Error fetching missions:", error);
      toast.error("Kunne ikke hente oppdrag");
    } else {
      setMissions(data || []);
    }
  };

  const fetchProfiles = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("approved", true);

    if (error) {
      console.error("Error fetching profiles:", error);
    } else {
      setProfiles(data || []);
    }
  };

  const fetchMissionDetails = async () => {
    const { data, error } = await supabase
      .from("missions")
      .select("*")
      .eq("id", selectedMissionId)
      .single();

    if (error) {
      console.error("Error fetching mission details:", error);
    } else {
      setSelectedMission(data);
    }
  };

  const fetchExistingSora = async () => {
    const { data, error } = await supabase
      .from("mission_sora")
      .select("*")
      .eq("mission_id", selectedMissionId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching existing SORA:", error);
    } else if (data) {
      setExistingSora(data);
      setFormData({
        environment: data.environment || "",
        conops_summary: data.conops_summary || "",
        igrc: data.igrc?.toString() || "",
        ground_mitigations: data.ground_mitigations || "",
        fgrc: data.fgrc?.toString() || "",
        arc_initial: data.arc_initial || "",
        airspace_mitigations: data.airspace_mitigations || "",
        arc_residual: data.arc_residual || "",
        sail: data.sail || "",
        residual_risk_level: data.residual_risk_level || "",
        residual_risk_comment: data.residual_risk_comment || "",
        operational_limits: data.operational_limits || "",
        sora_status: data.sora_status || "Ikke startet",
        approved_by: data.approved_by || "",
      });

      if (data.prepared_by) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("id", data.prepared_by)
          .maybeSingle();
        setPreparedByProfile(profile);
      } else {
        setPreparedByProfile(null);
      }
    } else {
      setExistingSora(null);
      setPreparedByProfile(null);
      setFormData({
        environment: "",
        conops_summary: "",
        igrc: "",
        ground_mitigations: "",
        fgrc: "",
        arc_initial: "",
        airspace_mitigations: "",
        arc_residual: "",
        sail: "",
        residual_risk_level: "",
        residual_risk_comment: "",
        operational_limits: "",
        sora_status: "Ikke startet",
        approved_by: "",
      });
    }
  };

  const handleSave = async () => {
    if (!selectedMissionId) {
      toast.error("Vennligst velg et oppdrag");
      return;
    }

    if (!companyId) {
      toast.error("Kunne ikke finne selskaps-ID");
      return;
    }
    
    if (!user?.id) {
      toast.error("Kunne ikke finne bruker-ID");
      return;
    }

    setLoading(true);

    // Auto-upgrade status from "Ikke startet" to "Under arbeid" if any data has been entered
    let effectiveStatus = formData.sora_status;
    if (effectiveStatus === "Ikke startet") {
      const hasData = formData.environment || formData.conops_summary || formData.igrc || 
        formData.ground_mitigations || formData.fgrc || formData.arc_initial || 
        formData.airspace_mitigations || formData.arc_residual || formData.sail || 
        formData.residual_risk_level || formData.residual_risk_comment || formData.operational_limits;
      if (hasData) {
        effectiveStatus = "Under arbeid";
        setFormData(prev => ({ ...prev, sora_status: "Under arbeid" }));
      }
    }

    const soraData = {
      mission_id: selectedMissionId,
      company_id: companyId,
      environment: formData.environment || null,
      conops_summary: formData.conops_summary || null,
      igrc: formData.igrc ? parseInt(formData.igrc) : null,
      ground_mitigations: formData.ground_mitigations || null,
      fgrc: formData.fgrc ? parseInt(formData.fgrc) : null,
      arc_initial: formData.arc_initial || null,
      airspace_mitigations: formData.airspace_mitigations || null,
      arc_residual: formData.arc_residual || null,
      sail: formData.sail || null,
      residual_risk_level: formData.residual_risk_level || null,
      residual_risk_comment: formData.residual_risk_comment || null,
      operational_limits: formData.operational_limits || null,
      sora_status: effectiveStatus,
      approved_by: formData.approved_by || null,
      approved_at: effectiveStatus === "Ferdig" && !existingSora?.approved_at 
        ? new Date().toISOString() 
        : existingSora?.approved_at || null,
      prepared_by: existingSora?.prepared_by || user.id,
      prepared_at: existingSora?.prepared_at || new Date().toISOString(),
    };

    try {
      const { error } = await supabase
        .from("mission_sora")
        .upsert(soraData, { 
          onConflict: 'mission_id',
          ignoreDuplicates: false
        });

      if (error) throw error;
      
      toast.success(existingSora ? "SORA-analyse oppdatert" : "SORA-analyse opprettet");
      onSaved?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving SORA:", error);
      toast.error("Kunne ikke lagre SORA-analyse: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>
            {existingSora ? "Rediger SORA-analyse" : "Ny SORA-analyse"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Mission Selection */}
          <div className="space-y-2">
            <Label>Oppdrag *</Label>
            <Select
              value={selectedMissionId}
              onValueChange={setSelectedMissionId}
              disabled={!!missionId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Velg et oppdrag" />
              </SelectTrigger>
              <SelectContent>
                {missions.map((mission) => (
                  <SelectItem key={mission.id} value={mission.id}>
                    {mission.tittel} ({format(new Date(mission.tidspunkt), "d. MMM yyyy", { locale: nb })}, {mission.lokasjon})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Mission Info Card */}
          {selectedMission && (
            <Card className="bg-muted/50">
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-semibold">Oppdrag:</span> {selectedMission.tittel}
                  </div>
                  <div>
                    <span className="font-semibold">Dato/tid:</span>{" "}
                    {format(new Date(selectedMission.tidspunkt), "d. MMM yyyy HH:mm", { locale: nb })}
                    {selectedMission.slutt_tidspunkt && 
                      ` - ${format(new Date(selectedMission.slutt_tidspunkt), "HH:mm", { locale: nb })}`
                    }
                  </div>
                  <div>
                    <span className="font-semibold">Sted:</span> {selectedMission.lokasjon}
                  </div>
                  <div>
                    <span className="font-semibold">Risk-nivå:</span> {selectedMission.risk_nivå}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* SORA Form Sections */}
          <Accordion type="multiple" defaultValue={["section1", "section2", "section3", "section4", "section5"]} className="w-full">
            {/* Section 1: Operasjonsmiljø og ConOps */}
            <AccordionItem value="section1">
              <AccordionTrigger>Operasjonsmiljø og ConOps</AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Miljø</Label>
                  <Select value={formData.environment} onValueChange={(value) => setFormData({ ...formData, environment: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Velg miljø" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Tettbygd">Tettbygd</SelectItem>
                      <SelectItem value="Landlig">Landlig</SelectItem>
                      <SelectItem value="Sjø">Sjø</SelectItem>
                      <SelectItem value="Industriområde">Industriområde</SelectItem>
                      <SelectItem value="Annet">Annet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Kort ConOps-beskrivelse</Label>
                  <Textarea
                    value={formData.conops_summary}
                    onChange={(e) => setFormData({ ...formData, conops_summary: e.target.value })}
                    placeholder="Kort beskrivelse av hva som skal gjøres, hvor og hvordan (3–5 linjer)."
                    rows={4}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Section 2: Bakkebasert risiko (GRC) */}
            <AccordionItem value="section2">
              <AccordionTrigger>Bakkebasert risiko (GRC)</AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>iGRC (grunnrisiko på bakken)</Label>
                  <Select value={formData.igrc} onValueChange={(value) => setFormData({ ...formData, igrc: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Velg iGRC" />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                        <SelectItem key={num} value={num.toString()}>{num}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Tiltak for bakkebasert risiko</Label>
                  <Textarea
                    value={formData.ground_mitigations}
                    onChange={(e) => setFormData({ ...formData, ground_mitigations: e.target.value })}
                    placeholder="Beskriv sperringer, buffersoner, fallskjerm, ERP osv."
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label>fGRC (endelig risiko på bakken)</Label>
                  <Select value={formData.fgrc} onValueChange={(value) => setFormData({ ...formData, fgrc: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Velg fGRC" />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                        <SelectItem key={num} value={num.toString()}>{num}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Section 3: Luftromsrisiko (ARC) */}
            <AccordionItem value="section3">
              <AccordionTrigger>Luftromsrisiko (ARC)</AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Initial ARC</Label>
                  <Select value={formData.arc_initial} onValueChange={(value) => setFormData({ ...formData, arc_initial: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Velg initial ARC" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ARC-A">ARC-A</SelectItem>
                      <SelectItem value="ARC-B">ARC-B</SelectItem>
                      <SelectItem value="ARC-C">ARC-C</SelectItem>
                      <SelectItem value="ARC-D">ARC-D</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Tiltak for luftromsrisiko</Label>
                  <Textarea
                    value={formData.airspace_mitigations}
                    onChange={(e) => setFormData({ ...formData, airspace_mitigations: e.target.value })}
                    placeholder="Beskriv strategiske og taktiske tiltak (NOTAM, ATC-koordinering, observatører osv.)."
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Residual ARC</Label>
                  <Select value={formData.arc_residual} onValueChange={(value) => setFormData({ ...formData, arc_residual: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Velg residual ARC" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ARC-A">ARC-A</SelectItem>
                      <SelectItem value="ARC-B">ARC-B</SelectItem>
                      <SelectItem value="ARC-C">ARC-C</SelectItem>
                      <SelectItem value="ARC-D">ARC-D</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Section 4: SAIL og rest-risiko */}
            <AccordionItem value="section4">
              <AccordionTrigger>SAIL og rest-risiko</AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>SAIL-nivå</Label>
                  <Select value={formData.sail} onValueChange={(value) => setFormData({ ...formData, sail: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Velg SAIL-nivå" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SAIL I">SAIL I</SelectItem>
                      <SelectItem value="SAIL II">SAIL II</SelectItem>
                      <SelectItem value="SAIL III">SAIL III</SelectItem>
                      <SelectItem value="SAIL IV">SAIL IV</SelectItem>
                      <SelectItem value="SAIL V">SAIL V</SelectItem>
                      <SelectItem value="SAIL VI">SAIL VI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Vurdering av rest-risiko</Label>
                  <Select value={formData.residual_risk_level} onValueChange={(value) => setFormData({ ...formData, residual_risk_level: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Velg rest-risiko" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Lav">Lav</SelectItem>
                      <SelectItem value="Moderat">Moderat</SelectItem>
                      <SelectItem value="Høy">Høy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Begrunnelse for rest-risiko</Label>
                  <Textarea
                    value={formData.residual_risk_comment}
                    onChange={(e) => setFormData({ ...formData, residual_risk_comment: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Operative begrensninger</Label>
                  <Textarea
                    value={formData.operational_limits}
                    onChange={(e) => setFormData({ ...formData, operational_limits: e.target.value })}
                    placeholder="F.eks. maks vind, min. sikt, min. avstand til folk, bare dagslys osv."
                    rows={3}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Section 5: Status og godkjenning */}
            <AccordionItem value="section5">
              <AccordionTrigger>Status og godkjenning</AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>SORA-status *</Label>
                  <Select value={formData.sora_status} onValueChange={(value) => setFormData({ ...formData, sora_status: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Ikke startet">Ikke startet</SelectItem>
                      <SelectItem value="Under arbeid">Under arbeid</SelectItem>
                      <SelectItem value="Ferdig">Ferdig</SelectItem>
                      <SelectItem value="Revidert">Revidert</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Utført av</Label>
                  <Input
                    value={
                      existingSora?.prepared_by
                        ? (preparedByProfile?.full_name || preparedByProfile?.email || "Ukjent")
                        : (user?.email || "")
                    }
                    disabled
                  />
                  {!existingSora?.prepared_by && (
                    <p className="text-xs text-muted-foreground">Dette feltet settes automatisk til innlogget bruker</p>
                  )}
                </div>

                {existingSora?.prepared_at && (
                  <div className="space-y-2">
                    <Label>Dato utført</Label>
                    <Input 
                      value={format(new Date(existingSora.prepared_at), "d. MMM yyyy HH:mm", { locale: nb })} 
                      disabled 
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Godkjent av</Label>
                  <SearchablePersonSelect
                    persons={profiles}
                    value={formData.approved_by || null}
                    onValueChange={(val) => setFormData({ ...formData, approved_by: val || "" })}
                    placeholder="Velg godkjenner (valgfritt)"
                    searchPlaceholder="Søk person..."
                  />
                </div>

                {existingSora?.approved_at && (
                  <div className="space-y-2">
                    <Label>Dato godkjent</Label>
                    <Input 
                      value={format(new Date(existingSora.approved_at), "d. MMM yyyy HH:mm", { locale: nb })} 
                      disabled 
                    />
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? "Lagrer..." : "Lagre"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
