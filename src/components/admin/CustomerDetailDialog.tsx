import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  FileText, 
  Calendar,
  MapPin as LocationIcon,
  AlertTriangle,
  Briefcase
} from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

interface Customer {
  id: string;
  navn: string;
  kontaktperson: string | null;
  epost: string | null;
  telefon: string | null;
  adresse: string | null;
  merknader: string | null;
  aktiv: boolean;
  opprettet_dato: string;
  intern_poc?: { id: string; full_name: string | null } | null;
}

interface Mission {
  id: string;
  tittel: string;
  lokasjon: string;
  tidspunkt: string;
  status: string;
  risk_nivå: string;
  beskrivelse: string | null;
}

interface Incident {
  id: string;
  tittel: string;
  alvorlighetsgrad: string;
  status: string;
  hendelsestidspunkt: string;
  lokasjon: string | null;
  beskrivelse: string | null;
  mission_id: string | null;
}

interface CustomerDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
}

export const CustomerDetailDialog = ({
  open,
  onOpenChange,
  customer,
}: CustomerDetailDialogProps) => {
  const isMobile = useIsMobile();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && customer) {
      fetchCustomerHistory();
    }
  }, [open, customer]);

  const fetchCustomerHistory = async () => {
    if (!customer) return;

    setLoading(true);
    try {
      const { data: missionsData, error: missionsError } = await supabase
        .from("missions")
        .select("*")
        .eq("customer_id", customer.id)
        .order("tidspunkt", { ascending: false });

      if (missionsError) throw missionsError;
      setMissions(missionsData || []);

      if (missionsData && missionsData.length > 0) {
        const missionIds = missionsData.map(m => m.id);
        const { data: incidentsData, error: incidentsError } = await supabase
          .from("incidents")
          .select("*")
          .in("mission_id", missionIds)
          .order("hendelsestidspunkt", { ascending: false });

        if (incidentsError) throw incidentsError;
        setIncidents(incidentsData || []);
      } else {
        setIncidents([]);
      }
    } catch (error: any) {
      console.error("Error fetching customer history:", error);
      toast.error("Kunne ikke laste kundehistorikk");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Planlagt":
        return "bg-blue-500/20 text-blue-500";
      case "Pågår":
        return "bg-yellow-500/20 text-yellow-500";
      case "Fullført":
        return "bg-green-500/20 text-green-500";
      case "Avbrutt":
        return "bg-red-500/20 text-red-500";
      case "Åpen":
        return "bg-orange-500/20 text-orange-500";
      case "Under behandling":
        return "bg-yellow-500/20 text-yellow-500";
      case "Lukket":
        return "bg-gray-500/20 text-gray-500";
      default:
        return "bg-gray-500/20 text-gray-500";
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "Kritisk":
        return "bg-red-500/20 text-red-500";
      case "Høy":
        return "bg-orange-500/20 text-orange-500";
      case "Medium":
        return "bg-yellow-500/20 text-yellow-500";
      case "Lav":
        return "bg-green-500/20 text-green-500";
      default:
        return "bg-gray-500/20 text-gray-500";
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "Høy":
        return "bg-red-500/20 text-red-500";
      case "Medium":
        return "bg-yellow-500/20 text-yellow-500";
      case "Lav":
        return "bg-green-500/20 text-green-500";
      default:
        return "bg-gray-500/20 text-gray-500";
    }
  };

  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${isMobile ? 'w-[92vw] max-w-[92vw] p-3 left-[50%] translate-x-[-50%]' : 'max-w-5xl'} max-h-[90vh] overflow-y-auto overflow-x-hidden`}>
        <DialogHeader className={isMobile ? 'pb-2 pr-6' : ''}>
          <DialogTitle className={`flex items-center gap-2 ${isMobile ? 'text-base' : ''}`}>
            <User className={`${isMobile ? 'h-4 w-4' : 'h-5 w-5'} flex-shrink-0`} />
            <span className="break-words min-w-0">{customer.navn}</span>
          </DialogTitle>
        </DialogHeader>

        <div className={`${isMobile ? 'space-y-3' : 'space-y-6'} overflow-x-hidden`}>
          {/* Customer Information */}
          <Card className={isMobile ? 'shadow-none border overflow-hidden' : ''}>
            <CardHeader className={isMobile ? 'p-3 pb-2' : ''}>
              <CardTitle className={isMobile ? 'text-sm' : 'text-lg'}>Kundeinformasjon</CardTitle>
            </CardHeader>
            <CardContent className={`space-y-2 ${isMobile ? 'p-3 pt-0 overflow-hidden' : ''}`}>
              <div className={`grid grid-cols-1 gap-2 ${isMobile ? '' : 'md:grid-cols-2 gap-4'}`}>
                {customer.kontaktperson && (
                  <div className={`flex items-start gap-2 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                    <User className={`${isMobile ? 'h-3 w-3' : 'h-4 w-4'} text-muted-foreground flex-shrink-0 mt-0.5`} />
                    <div className="min-w-0">
                      <span className="font-medium">Kontaktperson: </span>
                      <span className="break-words">{customer.kontaktperson}</span>
                    </div>
                  </div>
                )}
                {customer.intern_poc?.full_name && (
                  <div className={`flex items-start gap-2 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                    <User className={`${isMobile ? 'h-3 w-3' : 'h-4 w-4'} text-muted-foreground flex-shrink-0 mt-0.5`} />
                    <div className="min-w-0">
                      <span className="font-medium">Intern POC: </span>
                      <span className="break-words">{customer.intern_poc.full_name}</span>
                    </div>
                  </div>
                )}
                {customer.epost && (
                  <div className={`flex items-start gap-2 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                    <Mail className={`${isMobile ? 'h-3 w-3' : 'h-4 w-4'} text-muted-foreground flex-shrink-0 mt-0.5`} />
                    <div className="min-w-0">
                      <span className="font-medium">E-post: </span>
                      <span className="break-all">{customer.epost}</span>
                    </div>
                  </div>
                )}
                {customer.telefon && (
                  <div className={`flex items-start gap-2 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                    <Phone className={`${isMobile ? 'h-3 w-3' : 'h-4 w-4'} text-muted-foreground flex-shrink-0 mt-0.5`} />
                    <div className="min-w-0">
                      <span className="font-medium">Telefon: </span>
                      <span>{customer.telefon}</span>
                    </div>
                  </div>
                )}
                {customer.adresse && (
                  <div className={`flex items-start gap-2 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                    <MapPin className={`${isMobile ? 'h-3 w-3' : 'h-4 w-4'} text-muted-foreground flex-shrink-0 mt-0.5`} />
                    <div className="min-w-0">
                      <span className="font-medium">Adresse: </span>
                      <span className="break-words">{customer.adresse}</span>
                    </div>
                  </div>
                )}
              </div>
              {customer.merknader && (
                <div className={`pt-2 border-t ${isMobile ? 'mt-2' : 'pt-3'}`}>
                  <div className={`flex items-start gap-2 ${isMobile ? 'text-xs' : 'text-sm'}`}>
                    <FileText className={`${isMobile ? 'h-3 w-3' : 'h-4 w-4'} text-muted-foreground mt-0.5 flex-shrink-0`} />
                    <div className="min-w-0">
                      <span className="font-medium">Merknader:</span>
                      <p className="text-muted-foreground mt-1 break-words">{customer.merknader}</p>
                    </div>
                  </div>
                </div>
              )}
              <div className={`pt-2 border-t flex items-center gap-2 text-muted-foreground ${isMobile ? 'text-[10px]' : 'text-sm pt-3'}`}>
                <Calendar className={isMobile ? 'h-3 w-3' : 'h-4 w-4'} />
                <span>Opprettet: {format(new Date(customer.opprettet_dato), "d. MMMM yyyy", { locale: nb })}</span>
              </div>
            </CardContent>
          </Card>

          {/* History Tabs */}
          <Tabs defaultValue="missions" className="w-full overflow-hidden">
            <TabsList className={`grid w-full grid-cols-2 ${isMobile ? 'h-9' : ''}`}>
              <TabsTrigger value="missions" className={`flex items-center gap-1 ${isMobile ? 'text-xs px-2' : 'gap-2'}`}>
                <Briefcase className={isMobile ? 'h-3 w-3' : 'h-4 w-4'} />
                Oppdrag ({missions.length})
              </TabsTrigger>
              <TabsTrigger value="incidents" className={`flex items-center gap-1 ${isMobile ? 'text-xs px-2' : 'gap-2'}`}>
                <AlertTriangle className={isMobile ? 'h-3 w-3' : 'h-4 w-4'} />
                Hendelser ({incidents.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="missions" className={isMobile ? 'mt-2' : 'mt-4'}>
              <Card className={isMobile ? 'shadow-none border overflow-hidden' : ''}>
                <CardHeader className={isMobile ? 'p-3 pb-2' : ''}>
                  <CardTitle className={isMobile ? 'text-sm' : 'text-lg'}>Oppdragshistorikk</CardTitle>
                  {!isMobile && (
                    <CardDescription>Alle oppdrag for denne kunden</CardDescription>
                  )}
                </CardHeader>
                <CardContent className={isMobile ? 'p-3 pt-0' : ''}>
                  {loading ? (
                    <div className={`text-center py-4 text-muted-foreground ${isMobile ? 'text-xs' : ''}`}>
                      Laster...
                    </div>
                  ) : missions.length === 0 ? (
                    <div className={`text-center py-4 text-muted-foreground ${isMobile ? 'text-xs' : ''}`}>
                      Ingen oppdrag registrert
                    </div>
                  ) : isMobile ? (
                    <div className="space-y-2">
                      {missions.map((mission) => (
                        <div key={mission.id} className="p-2.5 bg-muted/30 rounded-lg border">
                          <div className="flex justify-between items-start gap-2 mb-1.5">
                            <span className="font-medium text-xs break-words flex-1">{mission.tittel}</span>
                            <Badge className={`${getStatusColor(mission.status)} text-[10px] px-1.5 py-0`}>
                              {mission.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1">
                            <LocationIcon className="h-2.5 w-2.5 flex-shrink-0" />
                            <span className="truncate">{mission.lokasjon}</span>
                          </div>
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="text-muted-foreground">
                              {format(new Date(mission.tidspunkt), "d. MMM yyyy", { locale: nb })}
                            </span>
                            <Badge className={`${getRiskColor(mission.risk_nivå)} text-[10px] px-1.5 py-0`}>
                              {mission.risk_nivå}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 font-medium">Tittel</th>
                            <th className="text-left py-2 font-medium">Lokasjon</th>
                            <th className="text-left py-2 font-medium">Tidspunkt</th>
                            <th className="text-left py-2 font-medium">Status</th>
                            <th className="text-left py-2 font-medium">Risikonivå</th>
                          </tr>
                        </thead>
                        <tbody>
                          {missions.map((mission) => (
                            <tr key={mission.id} className="border-b last:border-0">
                              <td className="py-2 font-medium">{mission.tittel}</td>
                              <td className="py-2">
                                <div className="flex items-center gap-1">
                                  <LocationIcon className="h-3 w-3 text-muted-foreground" />
                                  {mission.lokasjon}
                                </div>
                              </td>
                              <td className="py-2">
                                {format(new Date(mission.tidspunkt), "d. MMM yyyy HH:mm", { locale: nb })}
                              </td>
                              <td className="py-2">
                                <Badge className={getStatusColor(mission.status)}>{mission.status}</Badge>
                              </td>
                              <td className="py-2">
                                <Badge className={getRiskColor(mission.risk_nivå)}>{mission.risk_nivå}</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="incidents" className={isMobile ? 'mt-2' : 'mt-4'}>
              <Card className={isMobile ? 'shadow-none border overflow-hidden' : ''}>
                <CardHeader className={isMobile ? 'p-3 pb-2' : ''}>
                  <CardTitle className={isMobile ? 'text-sm' : 'text-lg'}>Hendelseshistorikk</CardTitle>
                  {!isMobile && (
                    <CardDescription>Alle hendelser knyttet til kundens oppdrag</CardDescription>
                  )}
                </CardHeader>
                <CardContent className={isMobile ? 'p-3 pt-0' : ''}>
                  {loading ? (
                    <div className={`text-center py-4 text-muted-foreground ${isMobile ? 'text-xs' : ''}`}>
                      Laster...
                    </div>
                  ) : incidents.length === 0 ? (
                    <div className={`text-center py-4 text-muted-foreground ${isMobile ? 'text-xs' : ''}`}>
                      Ingen hendelser registrert
                    </div>
                  ) : isMobile ? (
                    <div className="space-y-2">
                      {incidents.map((incident) => (
                        <div key={incident.id} className="p-2.5 bg-muted/30 rounded-lg border">
                          <div className="flex justify-between items-start gap-2 mb-1.5">
                            <span className="font-medium text-xs break-words flex-1">{incident.tittel}</span>
                            <Badge className={`${getSeverityColor(incident.alvorlighetsgrad)} text-[10px] px-1.5 py-0`}>
                              {incident.alvorlighetsgrad}
                            </Badge>
                          </div>
                          {incident.lokasjon && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1">
                              <LocationIcon className="h-2.5 w-2.5 flex-shrink-0" />
                              <span className="truncate">{incident.lokasjon}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="text-muted-foreground">
                              {format(new Date(incident.hendelsestidspunkt), "d. MMM yyyy", { locale: nb })}
                            </span>
                            <Badge className={`${getStatusColor(incident.status)} text-[10px] px-1.5 py-0`}>
                              {incident.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 font-medium">Tittel</th>
                            <th className="text-left py-2 font-medium">Tidspunkt</th>
                            <th className="text-left py-2 font-medium">Alvorlighetsgrad</th>
                            <th className="text-left py-2 font-medium">Status</th>
                            <th className="text-left py-2 font-medium">Lokasjon</th>
                          </tr>
                        </thead>
                        <tbody>
                          {incidents.map((incident) => (
                            <tr key={incident.id} className="border-b last:border-0">
                              <td className="py-2 font-medium">{incident.tittel}</td>
                              <td className="py-2">
                                {format(new Date(incident.hendelsestidspunkt), "d. MMM yyyy HH:mm", { locale: nb })}
                              </td>
                              <td className="py-2">
                                <Badge className={getSeverityColor(incident.alvorlighetsgrad)}>
                                  {incident.alvorlighetsgrad}
                                </Badge>
                              </td>
                              <td className="py-2">
                                <Badge className={getStatusColor(incident.status)}>{incident.status}</Badge>
                              </td>
                              <td className="py-2">
                                {incident.lokasjon ? (
                                  <div className="flex items-center gap-1">
                                    <LocationIcon className="h-3 w-3 text-muted-foreground" />
                                    {incident.lokasjon}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} size={isMobile ? 'sm' : 'default'}>
              Lukk
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};