import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Radio, Wifi, WifiOff, Battery, Thermometer, Wind, HardDrive, AlertTriangle, UserPlus, RefreshCw, Video } from "lucide-react";
import { toast } from "sonner";
import { LiveStreamDialog } from "./LiveStreamDialog";

interface FH2Device {
  device_sn: string;
  device_name: string;
  device_model?: { model?: string; key?: string; name?: string; class?: string };
  online_status?: number; // 0=offline, 1=online
  bound_status?: number;
  type?: number; // 0=drone, 1=dock, etc.
  cameras?: any[];
  child_device_sn?: string;
  firmware_version?: string;
  [key: string]: any;
}

interface FH2DevicesSectionProps {
  fh2Projects: string[];
}

const extractDeviceList = (payload: any): FH2Device[] => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.list)) return payload.list;
  if (Array.isArray(payload?.devices)) return payload.devices;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.records)) return payload.records;
  return [];
};

const normalizeDevice = (device: any): FH2Device => ({
  ...device,
  device_sn: device.device_sn ?? device.sn ?? device.deviceSn ?? device.child_device_sn ?? "",
  device_name: device.device_name ?? device.callsign ?? device.name ?? device.nickname ?? device.aircraft_name ?? "",
  device_model: device.device_model ?? {
    model: device.device_model_name ?? device.model_name ?? device.model ?? device.product_name,
    key: device.device_model_key ?? device.model_key,
  },
  online_status:
    typeof device.online_status === "number"
      ? device.online_status
      : device.device_online_status === true ? 1
      : device.device_online_status === false ? 0
      : device.status === "online" || device.is_online === true
        ? 1
        : 0,
  type: device.type ?? device.device_type ?? device.product_type,
  firmware_version: device.firmware_version ?? device.firmware ?? device.firmwareVersion,
});

export const FH2DevicesSection = ({ fh2Projects }: FH2DevicesSectionProps) => {
  const [devices, setDevices] = useState<FH2Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [debugData, setDebugData] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);

  // Test device API debug
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [showTestResult, setShowTestResult] = useState(false);

  // Debug-endpoint sandbox
  const [debugDialogOpen, setDebugDialogOpen] = useState(false);
  const [debugEndpoint, setDebugEndpoint] = useState("system_status");
  const [debugMethod, setDebugMethod] = useState("GET");
  const [debugProjectUuid, setDebugProjectUuid] = useState("");
  const [debugDeviceSn, setDebugDeviceSn] = useState("");
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugResult, setDebugResult] = useState<any>(null);

  // Device detail
  const [detailDevice, setDetailDevice] = useState<FH2Device | null>(null);
  const [detailState, setDetailState] = useState<any>(null);
  const [detailHms, setDetailHms] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Live stream dialog
  const [liveDevice, setLiveDevice] = useState<FH2Device | null>(null);

  // Add member dialog
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [memberUserId, setMemberUserId] = useState("");
  const [memberNickname, setMemberNickname] = useState("");
  const [memberRole, setMemberRole] = useState("project-member");
  const [memberProject, setMemberProject] = useState("");
  const [addingMember, setAddingMember] = useState(false);

  const runDebugEndpoint = async (overrides?: { endpoint?: string; method?: string; projectUuid?: string }) => {
    const ep = overrides?.endpoint ?? debugEndpoint;
    const method = overrides?.method ?? debugMethod;
    const projUuid = overrides?.projectUuid ?? debugProjectUuid;
    setDebugLoading(true);
    setDebugResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("flighthub2-proxy", {
        body: {
          action: "debug-endpoint",
          endpoint: ep,
          method,
          projectUuid: projUuid || undefined,
        },
      });
      if (error) throw error;
      setDebugResult(data);
    } catch (err: any) {
      setDebugResult({ error: err?.message || "Feil" });
    } finally {
      setDebugLoading(false);
    }
  };

  const fetchDevices = async () => {
    setLoading(true);
    setDebugData(null);
    try {
      const { data, error } = await supabase.functions.invoke("flighthub2-proxy", {
        body: { action: "list-devices" },
      });
      if (error) throw error;

      // Always save full response for debug
      setDebugData(data);

      if (data?.ok === false) {
        setDevices([]);
        setLoaded(true);
        console.error("FH2 list-devices diagnostics:", data?.diagnostics);
        toast.error(data?.error || "Kunne ikke hente enheter");
        return;
      }

      const uniqueDevices = Array.from(
        new Map(
          extractDeviceList(data?.data)
            .map(normalizeDevice)
            .filter((device) => device.device_sn || device.device_name)
            .map((device) => [device.device_sn || device.device_name, device])
        ).values()
      );

      if (data?.diagnostics) {
        console.info("FH2 list-devices diagnostics:", data.diagnostics);
      }

      setDevices(uniqueDevices);
      setLoaded(true);
      if (uniqueDevices.length === 0) toast("Ingen enheter funnet i FlightHub 2");
    } catch (err: any) {
      toast.error(err?.message || "Kunne ikke hente enheter");
    } finally {
      setLoading(false);
    }
  };

  const testDeviceApi = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("flighthub2-proxy", {
        body: { action: "test-device-api", deviceSn: "1581F8DBW255D00A2M0U" },
      });
      if (error) throw error;
      setTestResult(data);
      setShowTestResult(true);
    } catch (err: any) {
      setTestResult({ error: err?.message || "Feil ved test" });
      setShowTestResult(true);
    } finally {
      setTestLoading(false);
    }
  };

  const openDeviceDetail = async (device: FH2Device) => {
    setDetailDevice(device);
    setDetailState(null);
    setDetailHms([]);
    setDetailLoading(true);
    try {
      const [stateRes, hmsRes] = await Promise.all([
        supabase.functions.invoke("flighthub2-proxy", {
          body: { action: "device-state", deviceSn: device.device_sn },
        }),
        supabase.functions.invoke("flighthub2-proxy", {
          body: { action: "device-hms", deviceSnList: device.device_sn },
        }),
      ]);
      if (stateRes.data?.data) setDetailState(stateRes.data.data);
      if (hmsRes.data?.data) {
        const hmsList = hmsRes.data.data?.list || hmsRes.data.data || [];
        setDetailHms(Array.isArray(hmsList) ? hmsList : []);
      }
    } catch (err: any) {
      console.error("Device detail error:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAddMember = async () => {
    if (!memberUserId.trim() || !memberProject) return;
    setAddingMember(true);
    try {
      const { data, error } = await supabase.functions.invoke("flighthub2-proxy", {
        body: {
          action: "add-project-member",
          projectUuid: memberProject,
          userId: memberUserId.trim(),
          role: memberRole,
          nickname: memberNickname.trim(),
        },
      });
      if (error) throw error;
      if (data?.code === 0) {
        toast.success("Personell lagt til i prosjektet");
        setMemberDialogOpen(false);
        setMemberUserId("");
        setMemberNickname("");
      } else {
        toast.error(data?.message || data?.error || "Kunne ikke legge til personell");
      }
    } catch (err: any) {
      toast.error(err?.message || "Feil ved tillegging av personell");
    } finally {
      setAddingMember(false);
    }
  };

  const getDeviceTypeName = (device: FH2Device) => {
    const t = device.type ?? device.device_type;
    if (t === 0 || t === 60) return "Drone";
    if (t === 1 || t === 2 || t === 3) return "Dock";
    if (t === 56) return "RC";
    return `Type ${t ?? "?"}`;
  };

  const getModelName = (device: FH2Device) =>
    device.device_model?.model || device.device_model?.name || device.model_name || device.device_name || "Ukjent";

  // Extract camera options from a device (DJI camera_list format)
  const getDeviceCameras = (device: FH2Device): { index: string; name: string }[] => {
    const list = (device as any).camera_list ?? (device as any).cameras ?? [];
    if (!Array.isArray(list)) return [];
    return list
      .map((c: any) => {
        const index = c.camera_index ?? c.index ?? c.id ?? c.payload_index ?? "";
        const name = c.camera_name ?? c.name ?? c.payload_name ?? c.type_name ?? `Kamera ${index}`;
        return index ? { index: String(index), name: String(name) } : null;
      })
      .filter(Boolean) as { index: string; name: string }[];
  };

  const isOnline = (device: FH2Device) => device.online_status === 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">FlightHub 2 Enheter</span>
        </div>
        <div className="flex gap-2">
          {fh2Projects.length > 0 && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setMemberDialogOpen(true)}>
              <UserPlus className="h-3.5 w-3.5 mr-1" /> Legg til personell
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={testDeviceApi} disabled={testLoading}>
            {testLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Radio className="h-3.5 w-3.5 mr-1" />}
            Test enhets-API
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setDebugResult(null); setDebugDialogOpen(true); }}>
            <Radio className="h-3.5 w-3.5 mr-1" /> Debug API
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={fetchDevices} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            {loaded ? "Oppdater" : "Hent enheter"}
          </Button>
        </div>
      </div>

      {/* Test Device API Result */}
      {testResult && (
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => setShowTestResult(!showTestResult)}>
            {showTestResult ? "Skjul" : "Vis"} test-resultat
          </Button>
          {showTestResult && (
            <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto max-h-80 whitespace-pre-wrap break-all">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          )}
        </div>
      )}

      {loaded && devices.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Navn</TableHead>
              <TableHead>Modell</TableHead>
              <TableHead>SN</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="w-20 text-right">Live</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.map((d) => {
              const cameras = getDeviceCameras(d);
              const canLive = isOnline(d) && cameras.length > 0;
              return (
                <TableRow
                  key={d.device_sn}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => openDeviceDetail(d)}
                >
                  <TableCell>
                    {isOnline(d)
                      ? <Wifi className="h-4 w-4 text-green-500" />
                      : <WifiOff className="h-4 w-4 text-muted-foreground" />}
                  </TableCell>
                  <TableCell className="font-medium text-sm">{d.device_name || d.nickname || "–"}</TableCell>
                  <TableCell className="text-sm">{getModelName(d)}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{d.device_sn}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">{getDeviceTypeName(d)}</Badge>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!canLive}
                      onClick={() => setLiveDevice(d)}
                      title={canLive ? "Start live stream" : "Krever online drone med kamera"}
                    >
                      <Video className="h-3.5 w-3.5 mr-1" /> Live
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {loaded && devices.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">Ingen enheter funnet.</p>
      )}

      {/* Debug raw data panel */}
      {debugData && (
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => setShowDebug(!showDebug)}>
            {showDebug ? "Skjul" : "Vis"} rå-data
          </Button>
          {showDebug && (
            <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto max-h-60 whitespace-pre-wrap break-all">
              {JSON.stringify(debugData, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Device Detail Dialog */}
      <Dialog open={!!detailDevice} onOpenChange={(open) => { if (!open) setDetailDevice(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailDevice && isOnline(detailDevice)
                ? <Wifi className="h-4 w-4 text-green-500" />
                : <WifiOff className="h-4 w-4 text-muted-foreground" />}
              {detailDevice?.device_name || detailDevice?.device_sn}
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-4">
              {/* Basic info */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Modell:</span> {detailDevice && getModelName(detailDevice)}</div>
                <div><span className="text-muted-foreground">SN:</span> <span className="font-mono text-xs">{detailDevice?.device_sn}</span></div>
                <div><span className="text-muted-foreground">Type:</span> {detailDevice && getDeviceTypeName(detailDevice)}</div>
                <div><span className="text-muted-foreground">Status:</span> {detailDevice && isOnline(detailDevice) ? "Online" : "Offline"}</div>
              </div>

              {/* State data */}
              {detailState && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Enhetsstatus</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {detailState.battery?.capacity_percent != null && (
                      <div className="flex items-center gap-1.5">
                        <Battery className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Batteri: {detailState.battery.capacity_percent}%</span>
                      </div>
                    )}
                    {detailState.temperature != null && (
                      <div className="flex items-center gap-1.5">
                        <Thermometer className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Temp: {detailState.temperature}°C</span>
                      </div>
                    )}
                    {detailState.wind_speed != null && (
                      <div className="flex items-center gap-1.5">
                        <Wind className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Vind: {detailState.wind_speed} m/s</span>
                      </div>
                    )}
                    {detailState.storage?.total != null && (
                      <div className="flex items-center gap-1.5">
                        <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Lagring: {detailState.storage.used_capacity || 0}/{detailState.storage.total} GB</span>
                      </div>
                    )}
                    {detailState.firmware_version && (
                      <div><span className="text-muted-foreground">Firmware:</span> {detailState.firmware_version}</div>
                    )}
                    {detailState.latitude != null && (
                      <div><span className="text-muted-foreground">GPS:</span> {detailState.latitude?.toFixed(5)}, {detailState.longitude?.toFixed(5)}</div>
                    )}
                    {detailState.height != null && (
                      <div><span className="text-muted-foreground">Høyde:</span> {detailState.height} m</div>
                    )}
                    {detailState.mode_code != null && (
                      <div><span className="text-muted-foreground">Modus:</span> {detailState.mode_code}</div>
                    )}
                  </div>
                  {/* Raw state fallback for undocumented fields */}
                  {!detailState.battery && !detailState.firmware_version && (
                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-40">
                      {JSON.stringify(detailState, null, 2)}
                    </pre>
                  )}
                </div>
              )}

              {/* HMS warnings */}
              {detailHms.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-amber-500" /> HMS-advarsler
                  </h4>
                  <div className="space-y-1">
                    {detailHms.map((hms: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-xs p-2 rounded bg-amber-500/10 border border-amber-500/20">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                        <div>
                          <span className="font-medium">{hms.hms_id || hms.code || `HMS #${i + 1}`}</span>
                          {hms.title && <span className="ml-1">{hms.title}</span>}
                          {hms.description && <p className="text-muted-foreground mt-0.5">{hms.description}</p>}
                          {hms.level != null && (
                            <Badge variant={hms.level >= 2 ? "destructive" : "secondary"} className="text-[10px] mt-1">
                              Nivå {hms.level}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!detailState && detailHms.length === 0 && !detailLoading && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Ingen tilstandsdata tilgjengelig. Enheten kan være offline.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Legg til personell i FH2-prosjekt</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Prosjekt</Label>
              <Select value={memberProject} onValueChange={setMemberProject}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Velg prosjekt..." />
                </SelectTrigger>
                <SelectContent>
                  {fh2Projects.map((name, i) => (
                    <SelectItem key={i} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Merk: For å koble til riktig prosjekt-UUID, må prosjekt-UUID spesifiseres i brukerens JWT eller velges via FH2-grensesnittet.
              </p>
            </div>
            <div>
              <Label className="text-xs">Bruker-ID (FH2 user_id)</Label>
              <Input
                value={memberUserId}
                onChange={(e) => setMemberUserId(e.target.value)}
                placeholder="FH2-bruker-ID..."
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Kallenavn</Label>
              <Input
                value={memberNickname}
                onChange={(e) => setMemberNickname(e.target.value)}
                placeholder="Valgfritt kallenavn..."
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Rolle</Label>
              <Select value={memberRole} onValueChange={setMemberRole}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project-member">Medlem</SelectItem>
                  <SelectItem value="project-admin">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={handleAddMember} disabled={addingMember || !memberUserId.trim() || !memberProject}>
              {addingMember ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <UserPlus className="h-3.5 w-3.5 mr-1" />}
              Legg til
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Debug Endpoint Dialog */}
      <Dialog open={debugDialogOpen} onOpenChange={setDebugDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>FH2 API Debug-sandkasse</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs"
                onClick={() => runDebugEndpoint({ endpoint: "system_status", method: "GET" })}>
                System status
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs"
                onClick={() => runDebugEndpoint({ endpoint: "device", method: "GET" })}>
                Org-enheter
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs"
                onClick={() => runDebugEndpoint({ endpoint: "project", method: "GET" })}>
                List prosjekter
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs"
                disabled={!debugProjectUuid}
                onClick={() => runDebugEndpoint({ endpoint: "project/device?page=1&page_size=200", method: "GET" })}>
                Prosjekt-enheter
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs"
                disabled={!debugDeviceSn}
                onClick={() => runDebugEndpoint({ endpoint: `device/${encodeURIComponent(debugDeviceSn)}/state`, method: "GET" })}>
                Device state
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs"
                disabled={!debugDeviceSn}
                onClick={() => runDebugEndpoint({ endpoint: `device/hms?device_sn_list=${encodeURIComponent(debugDeviceSn)}`, method: "GET" })}>
                HMS
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Device SN (for state/HMS)</Label>
                <Input value={debugDeviceSn} onChange={(e) => setDebugDeviceSn(e.target.value)} placeholder="SN..." className="h-8 text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs">Project UUID</Label>
                <Input value={debugProjectUuid} onChange={(e) => setDebugProjectUuid(e.target.value)} placeholder="uuid..." className="h-8 text-sm font-mono" />
              </div>
            </div>

            <div className="grid grid-cols-[1fr_auto_auto] gap-2">
              <div>
                <Label className="text-xs">Egendefinert endpoint (uten /openapi/v0.1/ prefiks)</Label>
                <Input value={debugEndpoint} onChange={(e) => setDebugEndpoint(e.target.value)} placeholder="device" className="h-8 text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs">Metode</Label>
                <Select value={debugMethod} onValueChange={setDebugMethod}>
                  <SelectTrigger className="h-8 text-sm w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button size="sm" className="h-8" onClick={() => runDebugEndpoint()} disabled={debugLoading || !debugEndpoint.trim()}>
                  {debugLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Kjør"}
                </Button>
              </div>
            </div>

            {debugResult && (
              <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto max-h-[50vh] whitespace-pre-wrap break-all">
                {JSON.stringify(debugResult, null, 2)}
              </pre>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Live Stream Dialog */}
      {liveDevice && (
        <LiveStreamDialog
          open={!!liveDevice}
          onOpenChange={(open) => { if (!open) setLiveDevice(null); }}
          deviceSn={liveDevice.device_sn}
          deviceName={liveDevice.device_name}
          cameras={getDeviceCameras(liveDevice)}
          projectUuid={(liveDevice as any).project_uuid}
        />
      )}
    </div>
  );
};
