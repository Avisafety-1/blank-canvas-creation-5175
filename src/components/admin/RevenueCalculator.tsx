import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calculator, TrendingUp, TrendingDown, DollarSign, Users, Package, Pencil, Check, Save, FileText } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const STORAGE_KEY_PREFIX = "avisafe_revenue_scenarios_"; // fallback only
const EUR_TO_NOK = 11.5; // Approximate exchange rate

interface TierConfig {
  maxUsers: number;
  pricePerUser: number;
}

interface CalcState {
  tiers: {
    small: TierConfig;
    medium: TierConfig;
    large: TierConfig;
  };
  totalUsers: number;
  showTiers: boolean;
  dronetagEnabled: boolean;
  dronetagAcquisitionType: "leasing" | "purchase";
  dronetagLeasingCostPerMonth: number;
  dronetagLeasingCustomerPricePerMonth: number;
  dronetagPurchaseCostEur: number;
  dronetagDiscountPercent: number;
  dronetagCustomerPrice: number;
  dronetagPaymentType: "installment" | "oneoff";
  dronetagInstallmentMonths: number;
  dronetagCount: number;
  nriPurchaseCost: number;
  nriCustomerPrice: number;
  nriHours: number;
  dronetagIntegrationEnabled: boolean;
  dronetagIntegrationCostPerUnit: number;
  customerName: string;
  quoteSavedDate: string | null;
  eccairsEnabled: boolean;
  eccairsPrice: number;
  soraAdminEnabled: boolean;
  soraAdminPrice: number;
}

interface Scenario {
  name: string;
  state: CalcState;
}

interface CompanyWithUsers {
  id: string;
  navn: string;
  userCount: number;
}

const defaultCalcState: CalcState = {
  tiers: {
    small: { maxUsers: 5, pricePerUser: 299 },
    medium: { maxUsers: 15, pricePerUser: 249 },
    large: { maxUsers: 999, pricePerUser: 199 },
  },
  totalUsers: 0,
  showTiers: false,
  dronetagEnabled: true,
  dronetagAcquisitionType: "purchase",
  dronetagLeasingCostPerMonth: 0,
  dronetagLeasingCustomerPricePerMonth: 0,
  dronetagPurchaseCostEur: 299,
  dronetagDiscountPercent: 20,
  dronetagCustomerPrice: 0,
  dronetagPaymentType: "installment",
  dronetagInstallmentMonths: 12,
  dronetagCount: 0,
  nriPurchaseCost: 0,
  nriCustomerPrice: 0,
  nriHours: 0,
  dronetagIntegrationEnabled: false,
  dronetagIntegrationCostPerUnit: 0,
  customerName: "",
  quoteSavedDate: null,
  eccairsEnabled: false,
  eccairsPrice: 0,
  soraAdminEnabled: false,
  soraAdminPrice: 0,
};

const defaultScenarios: Scenario[] = [
  { name: "Scenario 1", state: { ...defaultCalcState } },
  { name: "Scenario 2", state: { ...defaultCalcState } },
  { name: "Scenario 3", state: { ...defaultCalcState } },
];

const loadScenarios = (companyKey: string): Scenario[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + companyKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === 3) {
        return parsed.map((s: any, i: number) => ({
          name: s.name || `Scenario ${i + 1}`,
          state: { ...defaultCalcState, ...s.state },
        }));
      }
    }
  } catch {}
  return defaultScenarios.map(s => ({ ...s, state: { ...s.state } }));
};

export const RevenueCalculator = () => {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const storageKey = selectedCompanyId ?? "custom";
  const [scenarios, setScenarios] = useState<Scenario[]>(() => loadScenarios(storageKey));
  const [activeIndex, setActiveIndex] = useState(0);
  const [editingName, setEditingName] = useState<number | null>(null);
  const [tempName, setTempName] = useState("");
  const [companies, setCompanies] = useState<CompanyWithUsers[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savingToDb, setSavingToDb] = useState(false);
  const [loadingFromDb, setLoadingFromDb] = useState(false);

  // Load scenarios from database for the selected company
  const loadFromDatabase = useCallback(async (companyKey: string) => {
    setLoadingFromDb(true);
    try {
      let query = supabase
        .from("revenue_calculator_scenarios")
        .select("scenarios");
      
      if (companyKey === "custom") {
        query = query.is("company_id", null);
      } else {
        query = query.eq("company_id", companyKey);
      }
      
      const { data, error } = await query.maybeSingle();
      
      if (error) {
        console.error("Failed to load scenarios from DB:", error);
        setScenarios(loadScenarios(companyKey));
      } else if (data?.scenarios) {
        const parsed = data.scenarios as any[];
        if (Array.isArray(parsed) && parsed.length === 3) {
          setScenarios(parsed.map((s: any, i: number) => ({
            name: s.name || `Scenario ${i + 1}`,
            state: { ...defaultCalcState, ...s.state, showTiers: false },
          })));
        } else {
          setScenarios(loadScenarios(companyKey));
        }
      } else {
        // No DB record yet, use defaults
        setScenarios(defaultScenarios.map(s => ({ ...s, state: { ...s.state } })));
      }
    } catch (err) {
      console.error("Error loading scenarios:", err);
      setScenarios(loadScenarios(companyKey));
    }
    setLoadingFromDb(false);
  }, []);

  const scenario = scenarios[activeIndex];
  const state = scenario.state;

  // Fetch companies with user counts via edge function (bypasses RLS)
  useEffect(() => {
    const fetchCompanies = async () => {
      setLoadingCompanies(true);
      try {
        const { data, error } = await supabase.functions.invoke("count-all-users", {
          body: { breakdown: true },
        });

        if (error || !data) {
          console.error("Failed to fetch company breakdown:", error);
          setLoadingCompanies(false);
          return;
        }

        setCompanies(data.companies || []);
      } catch (err) {
        console.error("Error fetching companies:", err);
      }
      setLoadingCompanies(false);
    };
    fetchCompanies();
  }, []);

  // Load scenarios from DB whenever storageKey changes (including initial mount)
  useEffect(() => {
    loadFromDatabase(storageKey);
  }, [storageKey, loadFromDatabase]);

  const totalUsersAllCompanies = useMemo(
    () => companies.reduce((sum, c) => sum + c.userCount, 0),
    [companies]
  );

  const saveScenarios = useCallback(async () => {
    setSavingToDb(true);
    try {
      let existingQuery = supabase
        .from("revenue_calculator_scenarios")
        .select("id");
      
      if (storageKey === "custom") {
        existingQuery = existingQuery.is("company_id", null);
      } else {
        existingQuery = existingQuery.eq("company_id", storageKey);
      }

      const { data: existing } = await existingQuery.maybeSingle();
      const { data: { user } } = await supabase.auth.getUser();

      if (existing) {
        let updateQuery = supabase
          .from("revenue_calculator_scenarios")
          .update({
            scenarios: scenarios as any,
            updated_at: new Date().toISOString(),
            updated_by: user?.id,
          });
        
        if (storageKey === "custom") {
          updateQuery = updateQuery.is("company_id", null);
        } else {
          updateQuery = updateQuery.eq("company_id", storageKey);
        }
        
        const { error } = await updateQuery;
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("revenue_calculator_scenarios")
          .insert({
            company_id: storageKey === "custom" ? null : storageKey,
            scenarios: scenarios as any,
            updated_by: user?.id,
          });
        if (error) throw error;
      }

      // Set quoteSavedDate on all scenarios
      const dateStr = (() => {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      })();
      setScenarios(prev => prev.map(s => ({
        ...s,
        state: { ...s.state, quoteSavedDate: dateStr }
      })));
      setHasUnsavedChanges(false);
      toast.success("Scenarioer lagret");
    } catch (err) {
      console.error("Failed to save scenarios:", err);
      toast.error("Kunne ikke lagre scenarioer til databasen");
    }
    setSavingToDb(false);
  }, [scenarios, storageKey]);

  const updateScenario = useCallback(
    (partial: Partial<Scenario>) => {
      setScenarios((prev) => {
        const next = [...prev];
        next[activeIndex] = { ...next[activeIndex], ...partial };
        return next;
      });
      setHasUnsavedChanges(true);
    },
    [activeIndex]
  );

  const updateState = useCallback(
    (partial: Partial<CalcState>) => {
      setScenarios((prev) => {
        const next = [...prev];
        next[activeIndex] = {
          ...next[activeIndex],
          state: { ...next[activeIndex].state, ...partial },
        };
        return next;
      });
      setHasUnsavedChanges(true);
    },
    [activeIndex]
  );

  const updateTier = (
    tier: "small" | "medium" | "large",
    field: keyof TierConfig,
    value: number
  ) => {
    setScenarios((prev) => {
      const next = [...prev];
      const s = next[activeIndex];
      next[activeIndex] = {
        ...s,
        state: {
          ...s.state,
          tiers: {
            ...s.state.tiers,
            [tier]: { ...s.state.tiers[tier], [field]: value },
          },
        },
      };
      return next;
    });
    setHasUnsavedChanges(true);
  };

  const num = (v: string) => {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };

  // Dronetag purchase cost in NOK after discount
  const dronetagPurchaseNok = useMemo(() => {
    const baseNok = state.dronetagPurchaseCostEur * EUR_TO_NOK;
    const discount = state.dronetagDiscountPercent / 100;
    return baseNok * (1 - discount);
  }, [state.dronetagPurchaseCostEur, state.dronetagDiscountPercent]);

  const handleCompanyChange = async (value: string) => {
    const newCompanyId = value === "custom" ? null : value;
    setSelectedCompanyId(newCompanyId);
    const newKey = newCompanyId ?? "custom";
    setActiveIndex(0);
    setHasUnsavedChanges(false);

    // Load from database for real companies, localStorage for custom
    await loadFromDatabase(newKey);

    // Update totalUsers for the first scenario based on selection
    if (value === "custom") {
      // Keep whatever is saved
    } else if (value === "all") {
      setScenarios(prev => {
        const next = [...prev];
        next[0] = { ...next[0], state: { ...next[0].state, totalUsers: totalUsersAllCompanies } };
        return next;
      });
    } else {
      const company = companies.find((c) => c.id === value);
      if (company) {
        setScenarios(prev => {
          const next = [...prev];
          next[0] = { ...next[0], state: { ...next[0].state, totalUsers: company.userCount } };
          return next;
        });
      }
    }
  };

  const startEditName = (index: number) => {
    setEditingName(index);
    setTempName(scenarios[index].name);
  };

  const confirmEditName = () => {
    if (editingName !== null && tempName.trim()) {
      setScenarios((prev) => {
        const next = [...prev];
        next[editingName] = { ...next[editingName], name: tempName.trim() };
        return next;
      });
      setHasUnsavedChanges(true);
    }
    setEditingName(null);
  };

  // Calculations
  const calc = useMemo(() => {
    const { tiers, totalUsers, dronetagCustomerPrice, dronetagPaymentType, dronetagInstallmentMonths, dronetagCount, nriPurchaseCost, nriCustomerPrice } = state;

    let pricePerUser = tiers.large.pricePerUser;
    let tierLabel = "Stor";
    if (totalUsers <= tiers.small.maxUsers) {
      pricePerUser = tiers.small.pricePerUser;
      tierLabel = "Liten";
    } else if (totalUsers <= tiers.medium.maxUsers) {
      pricePerUser = tiers.medium.pricePerUser;
      tierLabel = "Medium";
    }

    const monthlyUserRevenue = totalUsers * pricePerUser;

    let monthlyDronetagCost = 0;
    let monthlyDronetagRevenue = 0;
    let monthlyLeasingCost = 0;
    let monthlyLeasingRevenue = 0;

    if (state.dronetagEnabled) {
      if (state.dronetagAcquisitionType === "leasing") {
        // Leasing mode: no cost for us, only customer revenue
        monthlyLeasingCost = 0;
        monthlyLeasingRevenue = state.dronetagLeasingCustomerPricePerMonth * dronetagCount;
      } else {
        // Purchase mode (existing logic)
        monthlyDronetagRevenue = dronetagCustomerPrice * dronetagCount;
        if (dronetagPaymentType === "installment" && dronetagInstallmentMonths > 0) {
          monthlyDronetagCost = (dronetagPurchaseNok * dronetagCount) / dronetagInstallmentMonths;
        } else {
          monthlyDronetagCost = dronetagPurchaseNok * dronetagCount;
        }
      }
    }

    let monthlyIntegrationRevenue = 0;
    if (state.dronetagIntegrationEnabled) {
      monthlyIntegrationRevenue = state.dronetagIntegrationCostPerUnit * dronetagCount;
    }

    let monthlyNriCost = 0;
    let monthlyNriRevenue = 0;
    if (state.dronetagEnabled) {
      monthlyNriCost = nriPurchaseCost * state.nriHours;
      monthlyNriRevenue = nriCustomerPrice * state.nriHours;
    }

    // Tilleggsmoduler
    const monthlyEccairsRevenue = state.eccairsEnabled ? state.eccairsPrice : 0;
    const monthlySoraAdminRevenue = state.soraAdminEnabled ? state.soraAdminPrice : 0;

    // Recurring revenue (continues after installment period)
    const recurringRevenue = monthlyUserRevenue + monthlyNriRevenue + monthlyIntegrationRevenue + monthlyLeasingRevenue + monthlyEccairsRevenue + monthlySoraAdminRevenue;
    // Recurring costs (continues after installment period)
    const recurringCost = monthlyNriCost + monthlyLeasingCost;

    // Monthly Dronetag customer payment (spread if installment, full if upfront) — purchase mode only
    const monthlyDronetagCustomerPayment = (state.dronetagAcquisitionType === "purchase" && dronetagPaymentType === "installment" && dronetagInstallmentMonths > 0)
      ? monthlyDronetagRevenue / dronetagInstallmentMonths
      : 0;

    // Total monthly during installment: recurring + monthly customer payment
    const totalRevenue = recurringRevenue + monthlyDronetagCustomerPayment;
    const totalCost = recurringCost;
    const netResult = totalRevenue - totalCost;

    // After installment period: no more Dronetag hardware cost/revenue
    const netAfterInstallment = recurringRevenue - recurringCost;

    return {
      tierLabel,
      pricePerUser,
      monthlyUserRevenue,
      monthlyDronetagCost,
      monthlyDronetagRevenue,
      monthlyLeasingCost,
      monthlyLeasingRevenue,
      monthlyIntegrationRevenue,
      monthlyNriCost,
      monthlyNriRevenue,
      monthlyEccairsRevenue,
      monthlySoraAdminRevenue,
      recurringRevenue,
      recurringCost,
      totalRevenue,
      totalCost,
      netResult,
      netAfterInstallment,
    };
  }, [state, dronetagPurchaseNok]);

  const fmt = (n: number) =>
    n.toLocaleString("nb-NO", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const tierRows: { key: "small" | "medium" | "large"; label: string }[] = [
    { key: "small", label: "Liten" },
    { key: "medium", label: "Medium" },
    { key: "large", label: "Stor" },
  ];

  const selectValue = selectedCompanyId === null
    ? "custom"
    : selectedCompanyId;

  return (
    <div className="space-y-4 sm:space-y-6 w-full px-1 sm:px-0">
      {/* Scenario selector */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base sm:text-lg">Scenarioer</CardTitle>
            <Button
              size="sm"
              onClick={saveScenarios}
              className="gap-1.5"
              variant={hasUnsavedChanges ? "default" : "outline"}
              disabled={savingToDb || loadingFromDb}
            >
              <Save className="h-4 w-4" />
              {savingToDb ? "Lagrer..." : "Lagre"}
              {hasUnsavedChanges && !savingToDb && <span className="ml-1 h-2 w-2 rounded-full bg-background" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {scenarios.map((s, i) => (
              <div key={i} className="flex items-center gap-1">
                {editingName === i ? (
                  <div className="flex items-center gap-1">
                    <Input
                      className="h-8 w-36 text-sm"
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && confirmEditName()}
                      autoFocus
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={confirmEditName}>
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant={activeIndex === i ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setActiveIndex(i)}
                  >
                    {s.name}
                    <Pencil
                      className="h-3 w-3 opacity-60 hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditName(i);
                      }}
                    />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Company selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Users className="h-5 w-5 text-primary" />
            Selskapsvelger
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm">
            <Label>Velg selskap</Label>
            <Select
              value={selectValue}
              onValueChange={handleCompanyChange}
              disabled={loadingCompanies}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingCompanies ? "Laster selskaper..." : "Velg selskap"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Egendefinert</SelectItem>
                <SelectItem value="all">Alle selskaper ({totalUsersAllCompanies} brukere)</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.navn} ({c.userCount} brukere)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Section 1: Tiers */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Users className="h-5 w-5 text-primary" />
              Bedriftsstørrelser og priser
            </CardTitle>
            <div className="flex items-center gap-2">
              <Label htmlFor="tiers-toggle" className="text-sm text-muted-foreground">Vis</Label>
              <Switch
                id="tiers-toggle"
                checked={state.showTiers}
                onCheckedChange={(v) => updateState({ showTiers: v })}
              />
            </div>
          </div>
        </CardHeader>
        {state.showTiers && <CardContent>
          <div className="grid gap-3">
            {tierRows.map(({ key, label }) => (
              <div key={key} className="rounded-lg border border-border bg-muted/30 p-3 sm:p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center justify-center rounded-md bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    {label}
                  </span>
                  {state.tiers[key].maxUsers > 0 && (
                    <span className="text-xs text-muted-foreground">
                      (opptil {state.tiers[key].maxUsers} brukere)
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Maks brukere</Label>
                    <Input
                      type="number"
                      value={state.tiers[key].maxUsers || ""}
                      onChange={(e) => updateTier(key, "maxUsers", num(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Pris/bruker/mnd</Label>
                    <Input
                      type="number"
                      value={state.tiers[key].pricePerUser || ""}
                      onChange={(e) => updateTier(key, "pricePerUser", num(e.target.value))}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>}
      </Card>

      {/* Section 2: User calculation */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Calculator className="h-5 w-5 text-primary" />
            Brukerberegning
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs">
            <Label>Totalt antall brukere</Label>
            <Input
              type="number"
              value={state.totalUsers || ""}
              onChange={(e) => updateState({ totalUsers: num(e.target.value) })}
              disabled={selectedCompanyId !== null}
            />
            {selectedCompanyId !== null && (
              <p className="text-xs text-muted-foreground mt-1">
                Automatisk hentet fra valgt selskap. Velg «Egendefinert» for å endre manuelt.
              </p>
            )}
          </div>
          {state.totalUsers > 0 && (
            <div className="rounded-lg bg-muted p-4 space-y-1 text-sm">
              <p>
                Kategori: <span className="font-semibold">{calc.tierLabel}</span>
              </p>
              <p>
                Pris per bruker: <span className="font-semibold">{fmt(calc.pricePerUser)} NOK/mnd</span>
              </p>
              <p className="text-base font-semibold text-primary">
                Månedlig lisensintekt: {fmt(calc.monthlyUserRevenue)} NOK
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Dronetag */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Package className="h-5 w-5 text-primary" />
              Dronetag &amp; NRI Hours
            </CardTitle>
            <div className="flex items-center gap-2">
              <Label htmlFor="dronetag-toggle" className="text-sm text-muted-foreground">Inkluder</Label>
              <Switch
                id="dronetag-toggle"
                checked={state.dronetagEnabled}
                onCheckedChange={(v) => updateState({ dronetagEnabled: v })}
              />
            </div>
          </div>
        </CardHeader>
        {state.dronetagEnabled && <CardContent className="space-y-4">
          {/* Antall Dronetags */}
          <div className="max-w-xs">
            <Label>Antall Dronetags i bruk</Label>
            <Input
              type="number"
              value={state.dronetagCount || ""}
              onChange={(e) => {
                const count = num(e.target.value);
                updateState({ dronetagCount: count, nriHours: count * 30 });
              }}
            />
          </div>

          {/* Top-level: Leasing vs Kjøp */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Anskaffelsesmodell</Label>
            <RadioGroup
              value={state.dronetagAcquisitionType}
              onValueChange={(v) => updateState({ dronetagAcquisitionType: v as "leasing" | "purchase" })}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="leasing" id={`leasing-${activeIndex}`} />
                <Label htmlFor={`leasing-${activeIndex}`} className="cursor-pointer font-normal">Leasing</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="purchase" id={`purchase-${activeIndex}`} />
                <Label htmlFor={`purchase-${activeIndex}`} className="cursor-pointer font-normal">Kjøp</Label>
              </div>
            </RadioGroup>
          </div>

          {/* === LEASING MODE === */}
          {state.dronetagAcquisitionType === "leasing" && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 sm:p-4 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Leasing</p>
              <div className="max-w-xs">
                <Label>Kundepris per enhet/mnd (NOK)</Label>
                <Input
                  type="number"
                  value={state.dronetagLeasingCustomerPricePerMonth || ""}
                  onChange={(e) => updateState({ dronetagLeasingCustomerPricePerMonth: num(e.target.value) })}
                />
              </div>
              {state.dronetagCount > 0 && state.dronetagLeasingCustomerPricePerMonth > 0 && (
                <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                  <p>Månedlig inntekt fra kunde: <span className="font-semibold">{fmt(state.dronetagLeasingCustomerPricePerMonth * state.dronetagCount)} NOK</span></p>
                  {dronetagPurchaseNok > 0 && (
                    <p className="text-muted-foreground text-xs italic">
                      Nedbetalingstid per enhet: ca. {Math.ceil(dronetagPurchaseNok / state.dronetagLeasingCustomerPricePerMonth)} mnd (basert på innkjøpspris {fmt(Math.round(dronetagPurchaseNok))} NOK)
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* === PURCHASE MODE === */}
          {state.dronetagAcquisitionType === "purchase" && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 sm:p-4 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kjøp</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label>Innkjøpspris (EUR)</Label>
                  <Input
                    type="number"
                    value={state.dronetagPurchaseCostEur || ""}
                    onChange={(e) => updateState({ dronetagPurchaseCostEur: num(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Avslag (%)</Label>
                  <Input
                    type="number"
                    value={state.dronetagDiscountPercent || ""}
                    onChange={(e) => updateState({ dronetagDiscountPercent: num(e.target.value) })}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Innkjøpspris etter avslag (NOK)</Label>
                  <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm font-medium">
                    {fmt(Math.round(dronetagPurchaseNok))} NOK
                  </div>
                </div>
              </div>

              <div className="max-w-xs">
                <Label>Kostpris til kunde (NOK)</Label>
                <Input
                  type="number"
                  value={state.dronetagCustomerPrice || ""}
                  onChange={(e) => updateState({ dronetagCustomerPrice: num(e.target.value) })}
                />
              </div>

              <div className="space-y-3">
                <Label>Betalingsmodell</Label>
                <RadioGroup
                  value={state.dronetagPaymentType}
                  onValueChange={(v) => updateState({ dronetagPaymentType: v as "installment" | "oneoff" })}
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="installment" id={`installment-${activeIndex}`} />
                    <Label htmlFor={`installment-${activeIndex}`} className="cursor-pointer font-normal">Nedbetaling</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="oneoff" id={`oneoff-${activeIndex}`} />
                    <Label htmlFor={`oneoff-${activeIndex}`} className="cursor-pointer font-normal">Engangskostnad</Label>
                  </div>
                </RadioGroup>
              </div>

              {state.dronetagPaymentType === "installment" && (
                <div className="max-w-xs">
                  <Label>Antall måneder nedbetaling</Label>
                  <Input
                    type="number"
                    value={state.dronetagInstallmentMonths || ""}
                    onChange={(e) => updateState({ dronetagInstallmentMonths: num(e.target.value) })}
                  />
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* NRI Hours sub-section */}
          <div>
            <Label className="text-sm font-semibold">NRI Hours</Label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Stipulert forbruk (timer)</Label>
              <Input
                type="number"
                value={state.nriHours || ""}
                onChange={(e) => updateState({ nriHours: num(e.target.value) })}
              />
            </div>
            <div>
              <Label>Innkjøpspris per time (NOK)</Label>
              <Input
                type="number"
                value={state.nriPurchaseCost || ""}
                onChange={(e) => updateState({ nriPurchaseCost: num(e.target.value) })}
              />
            </div>
            <div>
              <Label>Kostpris til kunde per time (NOK)</Label>
              <Input
                type="number"
                value={state.nriCustomerPrice || ""}
                onChange={(e) => updateState({ nriCustomerPrice: num(e.target.value) })}
              />
            </div>
          </div>
        </CardContent>}
      </Card>

      {/* Section 4: Tilleggsmoduler */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <FileText className="h-5 w-5 text-primary" />
            Tilleggsmoduler
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Avisafe-Dronetag-Integrasjon */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 sm:p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Switch
                id="dronetag-integration-toggle"
                checked={state.dronetagIntegrationEnabled}
                onCheckedChange={(v) => updateState({ dronetagIntegrationEnabled: v })}
              />
              <Label htmlFor="dronetag-integration-toggle" className="text-sm font-semibold cursor-pointer">Avisafe-Dronetag-Integrasjon</Label>
            </div>
            <div className="max-w-xs">
              <Label className="text-xs">Pris per Dronetag/mnd (NOK)</Label>
              <Input
                type="number"
                value={state.dronetagIntegrationCostPerUnit || ""}
                onChange={(e) => updateState({ dronetagIntegrationCostPerUnit: num(e.target.value) })}
              />
              {state.dronetagIntegrationEnabled && state.dronetagCount > 0 && state.dronetagIntegrationCostPerUnit > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {state.dronetagCount} stk × {fmt(state.dronetagIntegrationCostPerUnit)} NOK = {fmt(state.dronetagIntegrationCostPerUnit * state.dronetagCount)} NOK/mnd
                </p>
              )}
            </div>
          </div>

          {/* ECCAIRS */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 sm:p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Switch
                id="eccairs-toggle"
                checked={state.eccairsEnabled}
                onCheckedChange={(v) => updateState({ eccairsEnabled: v })}
              />
              <Label htmlFor="eccairs-toggle" className="text-sm font-semibold cursor-pointer">ECCAIRS-integrasjon</Label>
            </div>
            <div className="max-w-xs">
              <Label className="text-xs">Pris per måned (NOK)</Label>
              <Input
                type="number"
                value={state.eccairsPrice || ""}
                onChange={(e) => updateState({ eccairsPrice: num(e.target.value) })}
              />
            </div>
          </div>

          {/* SORA Admin */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 sm:p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Switch
                id="sora-toggle"
                checked={state.soraAdminEnabled}
                onCheckedChange={(v) => updateState({ soraAdminEnabled: v })}
              />
              <Label htmlFor="sora-toggle" className="text-sm font-semibold cursor-pointer">SORA Admin</Label>
            </div>
            <div className="max-w-xs">
              <Label className="text-xs">Pris per måned (NOK)</Label>
              <Input
                type="number"
                value={state.soraAdminPrice || ""}
                onChange={(e) => updateState({ soraAdminPrice: num(e.target.value) })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 5: Summary */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">
            Oppsummering og pristilbud — {scenario.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="summary">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="summary">Oppsummering (Intern)</TabsTrigger>
              <TabsTrigger value="quote">Pristilbud (Kunde)</TabsTrigger>
            </TabsList>

            {/* === OPPSUMMERING TAB === */}
            <TabsContent value="summary">
              <div className="space-y-3">
                {/* === Løpende inntekter === */}
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Løpende inntekter</p>
                <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                  <span className="text-muted-foreground text-xs sm:text-sm">Brukerlisensinntekt ({state.totalUsers} × {fmt(calc.pricePerUser)} NOK)</span>
                  <span className="font-medium">{fmt(calc.monthlyUserRevenue)} NOK</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                  <span className="text-muted-foreground text-xs sm:text-sm">Inntekt NRI Hours</span>
                  <span className="font-medium">{fmt(calc.monthlyNriRevenue)} NOK</span>
                </div>
                {calc.monthlyIntegrationRevenue > 0 && (
                <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                  <span className="text-muted-foreground text-xs sm:text-sm">Inntekt Avisafe-Dronetag-Integrasjon ({state.dronetagCount} stk × {fmt(state.dronetagIntegrationCostPerUnit)} NOK)</span>
                  <span className="font-medium">{fmt(Math.round(calc.monthlyIntegrationRevenue))} NOK</span>
                </div>
                )}
                {state.dronetagEnabled && state.dronetagAcquisitionType === "leasing" && calc.monthlyLeasingRevenue > 0 && (
                  <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                    <span className="text-muted-foreground text-xs sm:text-sm">Dronetag leasing-inntekt ({state.dronetagCount} stk × {fmt(state.dronetagLeasingCustomerPricePerMonth)} NOK)</span>
                    <span className="font-medium">{fmt(Math.round(calc.monthlyLeasingRevenue))} NOK</span>
                  </div>
                )}
                {calc.monthlyEccairsRevenue > 0 && (
                  <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                    <span className="text-muted-foreground text-xs sm:text-sm">ECCAIRS-integrasjon</span>
                    <span className="font-medium">{fmt(calc.monthlyEccairsRevenue)} NOK</span>
                  </div>
                )}
                {calc.monthlySoraAdminRevenue > 0 && (
                  <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                    <span className="text-muted-foreground text-xs sm:text-sm">SORA Admin</span>
                    <span className="font-medium">{fmt(calc.monthlySoraAdminRevenue)} NOK</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-sm font-semibold">
                  <span>Sum løpende inntekter</span>
                  <span className="text-primary">{fmt(Math.round(calc.recurringRevenue))} NOK</span>
                </div>

                {/* === Løpende kostnader === */}
                <div className="pt-2" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Løpende kostnader</p>
                <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                  <span className="text-muted-foreground text-xs sm:text-sm">Kostnad NRI Hours</span>
                  <span className="font-medium text-destructive">−{fmt(calc.monthlyNriCost)} NOK</span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm font-semibold">
                  <span>Sum løpende kostnader</span>
                  <span className="text-destructive">−{fmt(Math.round(calc.recurringCost))} NOK</span>
                </div>

                {/* === Dronetag leasing info === */}
                {state.dronetagEnabled && state.dronetagAcquisitionType === "leasing" && state.dronetagCount > 0 && state.dronetagLeasingCustomerPricePerMonth > 0 && dronetagPurchaseNok > 0 && (
                  <>
                    <div className="pt-2" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dronetag leasing — informasjon</p>
                    <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                      <span className="text-muted-foreground text-xs sm:text-sm">Innkjøpspris per enhet (etter avslag)</span>
                      <span className="font-medium">{fmt(Math.round(dronetagPurchaseNok))} NOK</span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                      <span className="text-muted-foreground text-xs sm:text-sm">Månedlig leasinginntekt per enhet</span>
                      <span className="font-medium">{fmt(state.dronetagLeasingCustomerPricePerMonth)} NOK</span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground text-xs italic">
                      <span>Enheten er nedbetalt etter ca. {Math.ceil(dronetagPurchaseNok / state.dronetagLeasingCustomerPricePerMonth)} mnd</span>
                    </div>
                  </>
                )}

                {/* === Dronetag hardware (purchase mode only) === */}
                {state.dronetagEnabled && state.dronetagAcquisitionType === "purchase" && (
                  <>
                    <div className="pt-2" />
                    {state.dronetagPaymentType === "installment" && state.dronetagInstallmentMonths > 0 ? (
                      <>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Dronetag hardware — nedbetaling ({state.dronetagInstallmentMonths} mnd)
                        </p>
                        <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                          <span className="text-muted-foreground text-xs sm:text-sm">Vår engangskostnad ({state.dronetagCount} stk × {fmt(Math.round(dronetagPurchaseNok))} NOK)</span>
                          <span className="font-medium text-destructive">−{fmt(Math.round(dronetagPurchaseNok * state.dronetagCount))} NOK</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                          <span className="text-muted-foreground text-xs sm:text-sm">Kundens totalpris ({state.dronetagCount} stk × {fmt(Math.round(state.dronetagCustomerPrice))} NOK)</span>
                          <span className="font-medium">{fmt(Math.round(calc.monthlyDronetagRevenue))} NOK</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between text-sm font-semibold">
                          <span>Margin på hardware (engangs)</span>
                          <span className={calc.monthlyDronetagRevenue - dronetagPurchaseNok * state.dronetagCount >= 0 ? "text-primary" : "text-destructive"}>
                            {fmt(Math.round(calc.monthlyDronetagRevenue - dronetagPurchaseNok * state.dronetagCount))} NOK
                          </span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5 mt-1">
                          <span className="text-muted-foreground text-xs sm:text-sm">Månedlig innbetaling fra kunde</span>
                          <span className="font-medium">{fmt(Math.round(calc.monthlyDronetagRevenue / state.dronetagInstallmentMonths))} NOK/mnd</span>
                        </div>
                        <div className="flex justify-between text-sm text-muted-foreground text-xs italic">
                          <span>Tilbakebetalt etter ca. {Math.ceil((dronetagPurchaseNok * state.dronetagCount) / (calc.monthlyDronetagRevenue / state.dronetagInstallmentMonths))} mnd</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Dronetag hardware — engangsbetaling
                        </p>
                        <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                          <span className="text-muted-foreground text-xs sm:text-sm">Kundepris ({state.dronetagCount} stk × {fmt(Math.round(state.dronetagCustomerPrice))} NOK)</span>
                          <span className="font-medium">{fmt(Math.round(calc.monthlyDronetagRevenue))} NOK</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                          <span className="text-muted-foreground text-xs sm:text-sm">Innkjøpskostnad ({state.dronetagCount} stk × {fmt(Math.round(dronetagPurchaseNok))} NOK)</span>
                          <span className="font-medium text-destructive">−{fmt(Math.round(dronetagPurchaseNok * state.dronetagCount))} NOK</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between text-sm font-semibold">
                          <span>Margin på hardware (engangs)</span>
                          <span className={calc.monthlyDronetagRevenue - dronetagPurchaseNok * state.dronetagCount >= 0 ? "text-primary" : "text-destructive"}>
                            {fmt(Math.round(calc.monthlyDronetagRevenue - dronetagPurchaseNok * state.dronetagCount))} NOK
                          </span>
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* === Kostnad til kunde inkl. MVA === */}
                <div className="pt-2" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kostnad til kunde inkl. 25% MVA</p>
                <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                  <span className="text-muted-foreground text-xs sm:text-sm">Brukerlisens ({state.totalUsers} × {fmt(Math.round(calc.pricePerUser * 1.25))} NOK)</span>
                  <span className="font-medium">{fmt(Math.round(calc.monthlyUserRevenue * 1.25))} NOK/mnd</span>
                </div>
                {state.dronetagEnabled && calc.monthlyNriRevenue > 0 && (
                  <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                    <span className="text-muted-foreground text-xs sm:text-sm">NRI Hours ({state.nriHours} t × {fmt(Math.round(state.nriCustomerPrice * 1.25))} NOK)</span>
                    <span className="font-medium">{fmt(Math.round(calc.monthlyNriRevenue * 1.25))} NOK/mnd</span>
                  </div>
                )}
                {calc.monthlyIntegrationRevenue > 0 && (
                  <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                    <span className="text-muted-foreground text-xs sm:text-sm">Avisafe-Dronetag-Integrasjon ({state.dronetagCount} stk × {fmt(Math.round(state.dronetagIntegrationCostPerUnit * 1.25))} NOK)</span>
                    <span className="font-medium">{fmt(Math.round(calc.monthlyIntegrationRevenue * 1.25))} NOK/mnd</span>
                  </div>
                )}
                {state.dronetagEnabled && state.dronetagAcquisitionType === "leasing" && calc.monthlyLeasingRevenue > 0 && (
                  <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                    <span className="text-muted-foreground text-xs sm:text-sm">Dronetag leasing ({state.dronetagCount} stk × {fmt(Math.round(state.dronetagLeasingCustomerPricePerMonth * 1.25))} NOK)</span>
                    <span className="font-medium">{fmt(Math.round(calc.monthlyLeasingRevenue * 1.25))} NOK/mnd</span>
                  </div>
                )}
                {state.dronetagEnabled && state.dronetagAcquisitionType === "purchase" && calc.monthlyDronetagRevenue > 0 && (
                  <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                    <span className="text-muted-foreground text-xs sm:text-sm">
                      Dronetag hardware ({state.dronetagCount} stk × {fmt(Math.round(state.dronetagCustomerPrice * 1.25))} NOK)
                    </span>
                    <span className="font-medium">
                      {fmt(Math.round(calc.monthlyDronetagRevenue * 1.25))} NOK
                      {state.dronetagPaymentType === "installment" ? "" : " (engang)"}
                    </span>
                  </div>
                )}
                {state.dronetagEnabled && state.dronetagAcquisitionType === "purchase" && state.dronetagPaymentType === "installment" && state.dronetagInstallmentMonths > 0 && calc.monthlyDronetagRevenue > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground text-xs italic">
                    <span>Månedlig innbetaling inkl. MVA</span>
                    <span>{fmt(Math.round((calc.monthlyDronetagRevenue / state.dronetagInstallmentMonths) * 1.25))} NOK/mnd</span>
                  </div>
                )}
                {calc.monthlyEccairsRevenue > 0 && (
                  <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                    <span className="text-muted-foreground text-xs sm:text-sm">ECCAIRS-integrasjon</span>
                    <span className="font-medium">{fmt(Math.round(calc.monthlyEccairsRevenue * 1.25))} NOK/mnd</span>
                  </div>
                )}
                {calc.monthlySoraAdminRevenue > 0 && (
                  <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                    <span className="text-muted-foreground text-xs sm:text-sm">SORA Admin</span>
                    <span className="font-medium">{fmt(Math.round(calc.monthlySoraAdminRevenue * 1.25))} NOK/mnd</span>
                  </div>
                )}

                {/* === Totalt === */}
                <div className="pt-2" />
                <Separator className="bg-primary/30" />
                <div className="flex flex-col sm:flex-row sm:justify-between text-base sm:text-lg font-bold gap-1">
                  <span className="flex items-center gap-2">
                    {calc.netResult >= 0 ? (
                      <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 shrink-0" />
                    ) : (
                      <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5 text-destructive shrink-0" />
                    )}
                    <span className="text-sm sm:text-lg">
                      {!state.dronetagEnabled
                        ? "Netto overskudd"
                        : state.dronetagAcquisitionType === "leasing"
                          ? "Netto månedlig"
                          : "Netto månedlig (i nedbetalingsperioden)"}
                    </span>
                  </span>
                  <span className={`text-right ${calc.netResult >= 0 ? "text-green-500" : "text-destructive"}`}>
                    {calc.netResult >= 0 ? "" : "−"}{fmt(Math.abs(Math.round(calc.netResult)))} NOK
                  </span>
                </div>

                {/* === Etter nedbetaling (purchase + installment only) === */}
                {state.dronetagEnabled && state.dronetagAcquisitionType === "purchase" && state.dronetagPaymentType === "installment" && state.dronetagInstallmentMonths > 0 && (
                  <div className="flex flex-col sm:flex-row sm:justify-between text-base sm:text-lg font-bold gap-1">
                    <span className="flex items-center gap-2">
                      {calc.netAfterInstallment >= 0 ? (
                        <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 shrink-0" />
                      ) : (
                        <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5 text-destructive shrink-0" />
                      )}
                      <span className="text-sm sm:text-lg">Netto månedlig (etter nedbetaling)</span>
                    </span>
                    <span className={`text-right ${calc.netAfterInstallment >= 0 ? "text-green-500" : "text-destructive"}`}>
                      {calc.netAfterInstallment >= 0 ? "" : "−"}{fmt(Math.abs(Math.round(calc.netAfterInstallment)))} NOK
                    </span>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* === PRISTILBUD TAB === */}
            <TabsContent value="quote">
              <div className="space-y-4">
                {/* Modell-tittel */}
                <div className="rounded-lg bg-primary/10 p-3">
                  <p className="text-sm font-bold text-primary">
                    {!state.dronetagEnabled
                      ? "Plattformlisens"
                      : state.dronetagAcquisitionType === "leasing"
                        ? "Plattformlisens + Dronetag leasing og administrasjon"
                        : state.dronetagPaymentType === "installment"
                          ? "Plattformlisens + Dronetag nedbetaling"
                          : "Plattformlisens + Dronetag kjøp"}
                  </p>
                </div>

                {/* Gyldighet */}
                <div className="rounded-lg bg-muted p-3 text-sm">
                  {state.quoteSavedDate ? (() => {
                    const [y, m, d] = state.quoteSavedDate.split('-').map(Number);
                    const saved = new Date(y, m - 1, d);
                    const expires = new Date(y, m - 1, d + 14);
                    const fmtDate = (dt: Date) => String(dt.getDate()).padStart(2, '0') + '.' + String(dt.getMonth() + 1).padStart(2, '0') + '.' + dt.getFullYear();
                    return (
                      <p className="font-medium">
                        Pristilbud gyldig i 14 dager fra {fmtDate(saved)} (til {fmtDate(expires)})
                      </p>
                    );
                  })() : (
                    <p className="text-muted-foreground italic">Pristilbud ikke lagret ennå — trykk «Lagre» for å sette gyldighetsdato.</p>
                  )}
                </div>

                {/* Kundenavn */}
                <div className="max-w-sm">
                  <Label>Kundenavn</Label>
                  <Input
                    placeholder="Skriv inn kundenavn..."
                    value={state.customerName}
                    onChange={(e) => updateState({ customerName: e.target.value })}
                  />
                </div>

                <Separator />

                {/* Selskapsstørrelse og prismodell */}
                <div>
                  <p className="text-sm font-semibold mb-2">Selskapsstørrelse og prismodell</p>
                  <p className="text-xs text-muted-foreground mb-3">En automatisk beregning basert på brukere i systemet blir gjort</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Selskapsstørrelse</TableHead>
                        <TableHead>Maks brukere</TableHead>
                        <TableHead className="text-right">Pris per bruker/mnd (eks. MVA)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        { label: "Liten", max: state.tiers.small.maxUsers, price: state.tiers.small.pricePerUser, tierKey: "Liten" },
                        { label: "Medium", max: state.tiers.medium.maxUsers, price: state.tiers.medium.pricePerUser, tierKey: "Medium" },
                        { label: "Stor", max: state.tiers.large.maxUsers, price: state.tiers.large.pricePerUser, tierKey: "Stor" },
                      ].map((row) => (
                        <TableRow key={row.label} className={calc.tierLabel === row.tierKey ? "bg-primary/10 font-semibold" : ""}>
                          <TableCell>
                            {row.label}
                            {calc.tierLabel === row.tierKey && (
                              <span className="ml-2 text-xs text-primary">(gjeldende)</span>
                            )}
                          </TableCell>
                          <TableCell>{row.label === "Stor" ? `Over ${state.tiers.medium.maxUsers}` : `Opptil ${row.max}`}</TableCell>
                          <TableCell className="text-right">{fmt(Math.round(row.price))} NOK</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <Separator />

                {/* Prisdetaljer for dette scenarioet */}
                <div>
                  <p className="text-sm font-semibold mb-2">Prisdetaljer for dette scenarioet</p>
                </div>

                <div className="space-y-2">
                  {/* Brukerlisens */}
                   <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                    <span className="text-muted-foreground text-xs sm:text-sm">Brukerlisens ({state.totalUsers} × {fmt(Math.round(calc.pricePerUser))} NOK)</span>
                    <span className="font-medium">{fmt(Math.round(calc.monthlyUserRevenue))} NOK/mnd</span>
                  </div>

                  {/* Dronetag */}
                   {state.dronetagEnabled && state.dronetagAcquisitionType === "leasing" && calc.monthlyLeasingRevenue > 0 && (
                    <>
                      <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                        <span className="text-muted-foreground text-xs sm:text-sm">Dronetag leasing ({state.dronetagCount} stk × {fmt(Math.round(state.dronetagLeasingCustomerPricePerMonth))} NOK)</span>
                        <span className="font-medium">{fmt(Math.round(calc.monthlyLeasingRevenue))} NOK/mnd</span>
                      </div>
                      <p className="text-xs text-muted-foreground italic">Inkluderer oppsett og administrasjon av enhetene</p>
                    </>
                  )}
                  {state.dronetagEnabled && state.dronetagAcquisitionType === "purchase" && calc.monthlyDronetagRevenue > 0 && (
                    <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                      <span className="text-muted-foreground text-xs sm:text-sm">
                        Dronetag hardware ({state.dronetagCount} stk × {fmt(Math.round(state.dronetagCustomerPrice))} NOK)
                        {state.dronetagPaymentType === "installment" && state.dronetagInstallmentMonths > 0
                          ? ` — nedbetaling over ${state.dronetagInstallmentMonths} mnd`
                          : ""}
                      </span>
                      <span className="font-medium">
                        {state.dronetagPaymentType === "installment" && state.dronetagInstallmentMonths > 0
                          ? `${fmt(Math.round(calc.monthlyDronetagRevenue / state.dronetagInstallmentMonths))} NOK/mnd`
                          : `${fmt(Math.round(calc.monthlyDronetagRevenue))} NOK (engangskostnad)`}
                      </span>
                    </div>
                  )}

                  {/* Avisafe-Dronetag-Integrasjon */}
                   {state.dronetagIntegrationEnabled && calc.monthlyIntegrationRevenue > 0 && (
                    <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                      <span className="text-muted-foreground text-xs sm:text-sm">Avisafe-Dronetag-Integrasjon ({state.dronetagCount} stk × {fmt(Math.round(state.dronetagIntegrationCostPerUnit))} NOK)</span>
                      <span className="font-medium">{fmt(Math.round(calc.monthlyIntegrationRevenue))} NOK/mnd</span>
                    </div>
                  )}

                  {/* NRI Hours */}
                  {state.dronetagEnabled && calc.monthlyNriRevenue > 0 && (
                    <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                      <span className="text-muted-foreground text-xs sm:text-sm">NRI Hours ({state.nriHours} t × {fmt(Math.round(state.nriCustomerPrice))} NOK)</span>
                      <span className="font-medium">{fmt(Math.round(calc.monthlyNriRevenue))} NOK/mnd</span>
                    </div>
                  )}

                  {/* Tilleggsmoduler (aktiverte) */}
                  {state.eccairsEnabled && state.eccairsPrice > 0 && (
                    <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                      <span className="text-muted-foreground text-xs sm:text-sm">ECCAIRS-integrasjon</span>
                      <span className="font-medium">{fmt(state.eccairsPrice)} NOK/mnd</span>
                    </div>
                  )}
                  {state.soraAdminEnabled && state.soraAdminPrice > 0 && (
                    <div className="flex flex-col sm:flex-row sm:justify-between text-sm gap-0.5">
                      <span className="text-muted-foreground text-xs sm:text-sm">SORA Admin</span>
                      <span className="font-medium">{fmt(state.soraAdminPrice)} NOK/mnd</span>
                    </div>
                  )}

                  {/* Total */}
                  <div className="pt-2" />
                  <Separator className="bg-primary/30" />
                  {(() => {
                    let totalMonthly = calc.monthlyUserRevenue;
                    if (state.dronetagEnabled) {
                      totalMonthly += calc.monthlyNriRevenue;
                      if (state.dronetagAcquisitionType === "leasing") {
                        totalMonthly += calc.monthlyLeasingRevenue;
                      } else if (state.dronetagPaymentType === "installment" && state.dronetagInstallmentMonths > 0) {
                        totalMonthly += calc.monthlyDronetagRevenue / state.dronetagInstallmentMonths;
                      }
                    }
                    totalMonthly += calc.monthlyIntegrationRevenue;
                    totalMonthly += calc.monthlyEccairsRevenue;
                    totalMonthly += calc.monthlySoraAdminRevenue;
                    return (
                      <div className="flex justify-between text-base font-bold">
                        <span>Total månedlig kostnad eks. MVA</span>
                        <span className="text-primary">{fmt(Math.round(totalMonthly))} NOK/mnd</span>
                      </div>
                    );
                  })()}

                  {/* Engangskostnad */}
                  {state.dronetagEnabled && state.dronetagAcquisitionType === "purchase" && state.dronetagPaymentType === "oneoff" && calc.monthlyDronetagRevenue > 0 && (
                    <div className="flex justify-between text-sm font-semibold mt-2">
                      <span>Engangskostnad Dronetag hardware eks. MVA</span>
                      <span>{fmt(Math.round(calc.monthlyDronetagRevenue))} NOK</span>
                    </div>
                  )}

                  {/* Tilgjengelige tilleggsmoduler (ikke aktivert) */}
                  {((!state.dronetagIntegrationEnabled || state.dronetagIntegrationCostPerUnit === 0) || (!state.eccairsEnabled || state.eccairsPrice === 0) || (!state.soraAdminEnabled || state.soraAdminPrice === 0)) && (
                    <div className="mt-4 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-3 space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tilgjengelige tilleggsmoduler</p>
                      {(!state.dronetagIntegrationEnabled || state.dronetagIntegrationCostPerUnit === 0) && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Avisafe-Dronetag-Integrasjon</span>
                          <span className="text-muted-foreground italic">{state.dronetagIntegrationCostPerUnit > 0 ? `${fmt(state.dronetagIntegrationCostPerUnit)} NOK/enhet/mnd` : "Pris ikke satt"}</span>
                        </div>
                      )}
                      {(!state.eccairsEnabled || state.eccairsPrice === 0) && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">ECCAIRS-integrasjon</span>
                          <span className="text-muted-foreground italic">{state.eccairsPrice > 0 ? `${fmt(state.eccairsPrice)} NOK/mnd` : "Pris ikke satt"}</span>
                        </div>
                      )}
                      {(!state.soraAdminEnabled || state.soraAdminPrice === 0) && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">SORA Admin</span>
                          <span className="text-muted-foreground italic">{state.soraAdminPrice > 0 ? `${fmt(state.soraAdminPrice)} NOK/mnd` : "Pris ikke satt"}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
