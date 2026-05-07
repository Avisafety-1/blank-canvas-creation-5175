import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AddMissionDialog, RouteData } from "@/components/dashboard/AddMissionDialog";

import { IncidentDetailDialog } from "@/components/dashboard/IncidentDetailDialog";
import { ExpandedMapDialog } from "@/components/dashboard/ExpandedMapDialog";
import { DocumentDetailDialog } from "@/components/dashboard/DocumentDetailDialog";
import { RiskAssessmentTypeDialog } from "@/components/dashboard/RiskAssessmentTypeDialog";
import { RiskAssessmentDialog } from "@/components/dashboard/RiskAssessmentDialog";
import { AddIncidentDialog } from "@/components/dashboard/AddIncidentDialog";
import { ChecklistExecutionDialog } from "@/components/resources/ChecklistExecutionDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClipboardCheck, CheckCircle2 } from "lucide-react";
import { DEFAULT_PDF_SECTIONS, PdfSections } from "@/lib/oppdragPdfExport";

type Mission = any;

export interface OppdragDialogsProps {
  // Add dialog
  addDialogOpen: boolean;
  setAddDialogOpen: (open: boolean) => void;
  onMissionAdded: () => void;
  onMissionAddedWithData?: (mission: any) => void;
  initialRouteData: RouteData | null;
  initialFormData: any;
  initialSelectedPersonnel: string[];
  initialSelectedEquipment: string[];
  initialSelectedDrones: string[];
  initialSelectedCustomer: string;
  clearInitialData: () => void;

  // Edit dialog
  editDialogOpen: boolean;
  setEditDialogOpen: (open: boolean) => void;
  onMissionUpdated: () => void;
  editingMission: Mission | null;


  // Incident detail
  incidentDialogOpen: boolean;
  setIncidentDialogOpen: (open: boolean) => void;
  selectedIncident: any;

  // Expanded map
  expandedMapMission: Mission | null;
  setExpandedMapMission: (mission: Mission | null) => void;
  fetchMissions: () => void;

  // Delete
  deletingMission: Mission | null;
  setDeletingMission: (mission: Mission | null) => void;
  onDeleteMission: () => void;

  // KML replace
  replaceRouteConfirmOpen: boolean;
  setReplaceRouteConfirmOpen: (open: boolean) => void;
  pendingKmlFile: File | null;
  kmlImportMissionId: string | null;
  onConfirmKmlReplace: () => void;
  onCancelKmlReplace: () => void;
  kmlInputRef: React.RefObject<HTMLInputElement>;
  onKmlFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;

  // Document detail
  documentDialogOpen: boolean;
  setDocumentDialogOpen: (open: boolean) => void;
  selectedDocument: any;

  // Risk type
  riskTypeDialogOpen: boolean;
  setRiskTypeDialogOpen: (open: boolean) => void;
  onSelectAI: () => void;
  onSelectManualSORA: () => void;
  riskDialogInitialTab: 'input' | 'result' | 'history' | 'sora' | 'manual-sora';

  // Risk assessment
  riskDialogOpen: boolean;
  setRiskDialogOpen: (open: boolean) => void;
  riskAssessmentMission: Mission | null;
  setRiskAssessmentMission: (mission: Mission | null) => void;
  riskDialogShowHistory: boolean;
  setRiskDialogShowHistory: (show: boolean) => void;

  // Export PDF
  exportPdfDialogOpen: boolean;
  setExportPdfDialogOpen: (open: boolean) => void;
  exportPdfMission: Mission | null;
  pdfSections: PdfSections;
  setPdfSections: (sections: PdfSections | ((s: PdfSections) => PdfSections)) => void;
  onConfirmExportPdf: () => void;

  // Report incident
  reportIncidentDialogOpen: boolean;
  setReportIncidentDialogOpen: (open: boolean) => void;
  reportIncidentMission: Mission | null;
  setReportIncidentMission: (mission: Mission | null) => void;

  // Checklist picker
  checklistPickerOpen: boolean;
  setChecklistPickerOpen: (open: boolean) => void;
  checklistMission: Mission | null;
  setChecklistMission: (mission: Mission | null) => void;
  checklists: any[];
  onToggleMissionChecklist: (checklistId: string) => void;

  // Checklist execution
  executingChecklistMissionId: string | null;
  setExecutingChecklistMissionId: (id: string | null) => void;
  activeMissions: Mission[];
  completedMissions: Mission[];
  onMissionChecklistComplete: (checklistId: string) => void;

  // Risk prompt after creation
  riskPromptOpen?: boolean;
  setRiskPromptOpen?: (open: boolean) => void;
  onPerformRiskAssessment?: () => void;
  onSkipRiskAssessment?: () => void;
}

export const OppdragDialogs = (props: OppdragDialogsProps) => {
  return (
    <>
      {/* Add Mission Dialog */}
      <AddMissionDialog
        open={props.addDialogOpen}
        onOpenChange={(open) => {
          props.setAddDialogOpen(open);
          if (!open) props.clearInitialData();
        }}
        onMissionAdded={props.onMissionAdded}
        onMissionAddedWithData={props.onMissionAddedWithData}
        initialRouteData={props.initialRouteData}
        initialFormData={props.initialFormData}
        initialSelectedPersonnel={props.initialSelectedPersonnel}
        initialSelectedEquipment={props.initialSelectedEquipment}
        initialSelectedDrones={props.initialSelectedDrones}
        initialSelectedCustomer={props.initialSelectedCustomer}
      />

      {/* Edit Mission Dialog */}
      <AddMissionDialog
        open={props.editDialogOpen}
        onOpenChange={(open) => {
          props.setEditDialogOpen(open);
          if (!open) props.clearInitialData();
        }}
        onMissionAdded={props.onMissionUpdated}
        mission={props.editingMission}
        initialRouteData={props.initialRouteData}
        initialFormData={props.initialFormData}
        initialSelectedPersonnel={props.initialSelectedPersonnel}
        initialSelectedEquipment={props.initialSelectedEquipment}
        initialSelectedDrones={props.initialSelectedDrones}
        initialSelectedCustomer={props.initialSelectedCustomer}
      />

      {/* Incident Detail Dialog */}
      <IncidentDetailDialog
        open={props.incidentDialogOpen}
        onOpenChange={props.setIncidentDialogOpen}
        incident={props.selectedIncident}
      />

      {/* Expanded Map Dialog */}
      {props.expandedMapMission && (() => {
        const routeCoords = (props.expandedMapMission.route as any)?.coordinates;
        const effectiveLat = props.expandedMapMission.latitude ?? routeCoords?.[0]?.lat;
        const effectiveLng = props.expandedMapMission.longitude ?? routeCoords?.[0]?.lng;
        
        const firstTrack = props.expandedMapMission.flightLogs?.find((log: any) => log.flight_track?.positions?.length > 0);
        const trackLat = firstTrack?.flight_track?.positions?.[0]?.lat;
        const trackLng = firstTrack?.flight_track?.positions?.[0]?.lng;
        
        const finalLat = effectiveLat ?? trackLat;
        const finalLng = effectiveLng ?? trackLng;
        
        if (!finalLat || !finalLng) return null;
        
        return (
          <ExpandedMapDialog
            open={!!props.expandedMapMission}
            onOpenChange={(open) => !open && props.setExpandedMapMission(null)}
            latitude={finalLat}
            longitude={finalLng}
            route={props.expandedMapMission.route as any}
            flightTracks={
              props.expandedMapMission.flightLogs
                ?.filter((log: any) => log.flight_track?.positions?.length > 0)
                .map((log: any) => ({
                  positions: log.flight_track.positions,
                  flightLogId: log.id,
                  flightDate: log.flight_date,
                })) || null
            }
            missionTitle={props.expandedMapMission.tittel}
            missionId={props.expandedMapMission.id}
            onSoraUpdated={props.fetchMissions}
          />
        );
      })()}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!props.deletingMission} onOpenChange={(open) => !open && props.setDeletingMission(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Er du sikker på at du vil slette gjeldende oppdrag?</AlertDialogTitle>
            <AlertDialogDescription>
              Denne handlingen kan ikke angres. Oppdraget "{props.deletingMission?.tittel}" og alle tilknyttede data vil bli permanent slettet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={props.onDeleteMission} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Slett oppdrag
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* KML Import: hidden file input */}
      <input
        ref={props.kmlInputRef}
        type="file"
        accept=".kml,.kmz"
        className="hidden"
        onChange={props.onKmlFileSelected}
      />

      {/* KML Replace Route Confirmation */}
      <AlertDialog open={props.replaceRouteConfirmOpen} onOpenChange={props.setReplaceRouteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Erstatte eksisterende rute?</AlertDialogTitle>
            <AlertDialogDescription>
              Dette oppdraget har allerede en rute. Vil du erstatte den med koordinatene fra den importerte filen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={props.onCancelKmlReplace}>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={props.onConfirmKmlReplace}>
              Erstatt rute
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Document Detail Dialog */}
      <DocumentDetailDialog
        open={props.documentDialogOpen}
        onOpenChange={props.setDocumentDialogOpen}
        document={props.selectedDocument}
        status={(() => {
          if (!props.selectedDocument?.gyldig_til) return "Grønn";
          const daysUntil = Math.ceil((new Date(props.selectedDocument.gyldig_til).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          if (daysUntil < 0) return "Rød";
          if (daysUntil <= (props.selectedDocument.varsel_dager_for_utløp || 30)) return "Gul";
          return "Grønn";
        })()}
      />

      {/* Risk Assessment Type Dialog */}
      <RiskAssessmentTypeDialog
        open={props.riskTypeDialogOpen}
        onOpenChange={props.setRiskTypeDialogOpen}
        onSelectAI={props.onSelectAI}
        onSelectManualSORA={props.onSelectManualSORA}
      />

      {/* AI Risk Assessment Dialog */}
      {props.riskAssessmentMission && (
        <RiskAssessmentDialog
          open={props.riskDialogOpen}
          onOpenChange={(open) => {
            props.setRiskDialogOpen(open);
            if (!open) {
              props.setRiskAssessmentMission(null);
              props.setRiskDialogShowHistory(false);
              props.fetchMissions();
            }
          }}
          mission={props.riskAssessmentMission}
          initialTab={props.riskDialogShowHistory ? 'history' : props.riskDialogInitialTab}
          onSoraSaved={props.fetchMissions}
        />
      )}

      {/* Export PDF Dialog */}
      <Dialog open={props.exportPdfDialogOpen} onOpenChange={props.setExportPdfDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Eksporter oppdragsrapport</DialogTitle>
            <DialogDescription>
              Velg hvilke seksjoner som skal inkluderes i PDF-rapporten for «{props.exportPdfMission?.tittel}».
            </DialogDescription>
          </DialogHeader>

          {/* Select all / Deselect all */}
          <div className="flex justify-end">
            {(() => {
              const mission = props.exportPdfMission;
              const visibleKeys = [
                'basicInfo',
                'airspaceWarnings',
                ...(((mission?.latitude ?? (mission?.route as any)?.coordinates?.[0]?.lat)) ? ['map'] : []),
                ...((mission?.route as any)?.coordinates?.length > 0 ? ['routeCoordinates'] : []),
                ...(mission?.customers ? ['customerInfo'] : []),
                ...(mission?.personnel?.length > 0 ? ['personnel'] : []),
                ...(mission?.drones?.length > 0 ? ['drones'] : []),
                ...(mission?.equipment?.length > 0 ? ['equipment'] : []),
                ...((mission?.sora || (mission?.route as any)?.soraSettings?.enabled || (mission?.route as any)?.adjacentAreaDocumentation?.enabled) ? ['sora'] : []),
                ...(mission?.aiRisk ? ['riskAssessment'] : []),
                ...(mission?.incidents?.length > 0 ? ['incidents'] : []),
                ...(mission?.flightLogs?.length > 0 ? ['flightLogs'] : []),
                ...((mission?.beskrivelse || mission?.merknader) ? ['descriptionNotes'] : []),
              ] as (keyof typeof DEFAULT_PDF_SECTIONS)[];
              const allOn = visibleKeys.every(k => props.pdfSections[k]);
              return (
                <button
                  type="button"
                  className="text-xs text-primary underline-offset-2 hover:underline"
                  onClick={() => {
                    const val = !allOn;
                    const update = { ...props.pdfSections };
                    visibleKeys.forEach(k => { update[k] = val; });
                    props.setPdfSections(update);
                  }}
                >
                  {allOn ? 'Fjern alle' : 'Velg alle'}
                </button>
              );
            })()}
          </div>

          <div className="space-y-5">
            {/* Kart og luftrom */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Kart og luftrom</p>
              <div className="space-y-2">
                {(props.exportPdfMission?.latitude ?? (props.exportPdfMission?.route as any)?.coordinates?.[0]?.lat) && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={props.pdfSections.map} onCheckedChange={v => props.setPdfSections(s => ({ ...s, map: v === true }))} />
                    <span className="text-sm">Kartutsnitt</span>
                  </label>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={props.pdfSections.airspaceWarnings} onCheckedChange={v => props.setPdfSections(s => ({ ...s, airspaceWarnings: v === true }))} />
                  <span className="text-sm">Luftromsadvarsler</span>
                </label>
              </div>
            </div>

            {/* Oppdragsdetaljer */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Oppdragsdetaljer</p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={props.pdfSections.basicInfo} onCheckedChange={v => props.setPdfSections(s => ({ ...s, basicInfo: v === true }))} />
                  <span className="text-sm">Grunnleggende informasjon</span>
                </label>
                {(props.exportPdfMission?.beskrivelse || props.exportPdfMission?.merknader) && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={props.pdfSections.descriptionNotes} onCheckedChange={v => props.setPdfSections(s => ({ ...s, descriptionNotes: v === true }))} />
                    <span className="text-sm">Beskrivelse & merknader</span>
                  </label>
                )}
                {props.exportPdfMission?.customers && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={props.pdfSections.customerInfo} onCheckedChange={v => props.setPdfSections(s => ({ ...s, customerInfo: v === true }))} />
                    <span className="text-sm">Kundeinformasjon</span>
                  </label>
                )}
              </div>
            </div>

            {/* Ressurser */}
            {(props.exportPdfMission?.personnel?.length > 0 || props.exportPdfMission?.drones?.length > 0 || props.exportPdfMission?.equipment?.length > 0) && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ressurser</p>
                <div className="space-y-2">
                  {props.exportPdfMission?.personnel?.length > 0 && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={props.pdfSections.personnel} onCheckedChange={v => props.setPdfSections(s => ({ ...s, personnel: v === true }))} />
                      <span className="text-sm">Personell</span>
                    </label>
                  )}
                  {props.exportPdfMission?.drones?.length > 0 && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={props.pdfSections.drones} onCheckedChange={v => props.setPdfSections(s => ({ ...s, drones: v === true }))} />
                      <span className="text-sm">Droner/fly</span>
                    </label>
                  )}
                  {props.exportPdfMission?.equipment?.length > 0 && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={props.pdfSections.equipment} onCheckedChange={v => props.setPdfSections(s => ({ ...s, equipment: v === true }))} />
                      <span className="text-sm">Utstyr</span>
                    </label>
                  )}
                </div>
              </div>
            )}

            {/* Rute */}
            {((props.exportPdfMission?.route as any)?.coordinates?.length > 0 || props.exportPdfMission?.sora || (props.exportPdfMission?.route as any)?.soraSettings?.enabled || (props.exportPdfMission?.route as any)?.adjacentAreaDocumentation?.enabled) && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Rute</p>
                <div className="space-y-2">
                  {(props.exportPdfMission?.route as any)?.coordinates?.length > 0 && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={props.pdfSections.routeCoordinates} onCheckedChange={v => props.setPdfSections(s => ({ ...s, routeCoordinates: v === true }))} />
                      <span className="text-sm">Rutekoordinater</span>
                    </label>
                  )}
                  {(props.exportPdfMission?.sora || (props.exportPdfMission?.route as any)?.soraSettings?.enabled || (props.exportPdfMission?.route as any)?.adjacentAreaDocumentation?.enabled) && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={props.pdfSections.sora} onCheckedChange={v => props.setPdfSections(s => ({ ...s, sora: v === true }))} />
                      <span className="text-sm">SORA-analyse og beregningsgrunnlag</span>
                    </label>
                  )}
                </div>
              </div>
            )}

            {/* Vurderinger og logger */}
            {(props.exportPdfMission?.aiRisk || props.exportPdfMission?.incidents?.length > 0 || props.exportPdfMission?.flightLogs?.length > 0) && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Vurderinger og logger</p>
                <div className="space-y-2">
                  {props.exportPdfMission?.aiRisk && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={props.pdfSections.riskAssessment} onCheckedChange={v => props.setPdfSections(s => ({ ...s, riskAssessment: v === true }))} />
                      <span className="text-sm">AI Risikovurdering</span>
                    </label>
                  )}
                  {props.exportPdfMission?.incidents?.length > 0 && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={props.pdfSections.incidents} onCheckedChange={v => props.setPdfSections(s => ({ ...s, incidents: v === true }))} />
                      <span className="text-sm">Tilknyttede hendelser</span>
                    </label>
                  )}
                  {props.exportPdfMission?.flightLogs?.length > 0 && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={props.pdfSections.flightLogs} onCheckedChange={v => props.setPdfSections(s => ({ ...s, flightLogs: v === true }))} />
                      <span className="text-sm">Flyturer</span>
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => props.setExportPdfDialogOpen(false)}>Avbryt</Button>
            <Button onClick={props.onConfirmExportPdf}>Eksporter PDF</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report Incident from Mission */}
      <AddIncidentDialog
        open={props.reportIncidentDialogOpen}
        onOpenChange={(open) => {
          props.setReportIncidentDialogOpen(open);
          if (!open) props.setReportIncidentMission(null);
        }}
        defaultDate={props.reportIncidentMission?.tidspunkt ? new Date(props.reportIncidentMission.tidspunkt) : undefined}
        defaultMissionId={props.reportIncidentMission?.id}
        incidentToEdit={null}
      />

      {/* Checklist Picker Dialog */}
      <Dialog open={props.checklistPickerOpen} onOpenChange={(open) => {
        props.setChecklistPickerOpen(open);
        if (!open) props.setChecklistMission(null);
      }}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              Tilknytt sjekkliste
            </DialogTitle>
            <DialogDescription>
              {props.checklistMission?.tittel} – velg sjekklister å knytte til oppdraget
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {props.checklists.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Ingen sjekklister funnet</p>
            ) : (
              props.checklists.map((cl) => {
                const isLinked = props.checklistMission?.checklist_ids?.includes(cl.id);
                return (
                  <div
                    key={cl.id}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                      isLinked
                        ? 'bg-primary/10 border-primary/30'
                        : 'border-border hover:bg-muted/50'
                    }`}
                    onClick={() => props.onToggleMissionChecklist(cl.id)}
                  >
                    <span className="text-sm font-medium">{cl.tittel}</span>
                    {isLinked && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => props.setChecklistPickerOpen(false)}>Ferdig</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ChecklistExecutionDialog for oppdrag */}
      {props.executingChecklistMissionId && (() => {
        const execMission = [...props.activeMissions, ...props.completedMissions].find(m => m.id === props.executingChecklistMissionId);
        return (
          <ChecklistExecutionDialog
            open={!!props.executingChecklistMissionId}
            onOpenChange={(open) => {
              if (!open) props.setExecutingChecklistMissionId(null);
            }}
            checklistIds={execMission?.checklist_ids || []}
            completedIds={execMission?.checklist_completed_ids || []}
            itemName={execMission?.tittel || ''}
            onComplete={props.onMissionChecklistComplete}
          />
        );
      })()}

      {/* Risk assessment prompt after mission creation */}
      <AlertDialog open={props.riskPromptOpen} onOpenChange={props.setRiskPromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Risikovurdering</AlertDialogTitle>
            <AlertDialogDescription>
              Oppdraget er opprettet. Ønsker du å utføre en risikovurdering nå, eller fortsette uten?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={props.onSkipRiskAssessment}>
              Fortsett uten risikovurdering
            </AlertDialogCancel>
            <AlertDialogAction onClick={props.onPerformRiskAssessment}>
              Utfør risikovurdering
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
