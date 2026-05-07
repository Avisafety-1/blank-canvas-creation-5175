import {
  Database,
  Globe,
  Shield,
  User,
  Brain,
  MessageSquare,
  Zap,
  ChevronDown,
  Wind,
  Thermometer,
  Eye,
  MapPin,
  Users,
  Cpu,
  CheckCircle2,
  ArrowRight,
  Radio,
  BarChart3,
  FileText,
  Lock,
  Clock,
  Activity,
  Layers,
  Navigation,
  AlertTriangle,
} from "lucide-react";
import avisafeLogoText from "@/assets/avisafe-logo-text.png";

// All colors derived from the app's design system (index.css)
// Primary: hsl(210 80% 28%)
// Status green: hsl(142 71% 45%)
// Status yellow: hsl(38 92% 50%)
// Status red: hsl(0 84% 60%)
// Background dark: hsl(210 30% 8%)
// Foreground: hsl(210 20% 98%)

const C = {
  bg: "hsl(210 30% 6%)",
  bgCard: "hsl(210 30% 10%)",
  bgCardAlt: "hsl(210 30% 13%)",
  primary: "hsl(210 80% 28%)",
  primaryLight: "hsl(210 80% 50%)",
  primaryDim: "hsl(210 50% 15%)",
  green: "hsl(142 71% 45%)",
  greenDim: "hsl(142 50% 10%)",
  greenMid: "hsl(142 60% 18%)",
  yellow: "hsl(38 92% 50%)",
  yellowDim: "hsl(38 60% 10%)",
  yellowMid: "hsl(38 70% 18%)",
  red: "hsl(0 84% 60%)",
  redDim: "hsl(0 60% 10%)",
  redMid: "hsl(0 70% 18%)",
  purple: "hsl(258 80% 65%)",
  purpleDim: "hsl(258 50% 10%)",
  purpleMid: "hsl(258 60% 18%)",
  text: "hsl(210 20% 96%)",
  textMuted: "hsl(215 20% 60%)",
  textDim: "hsl(215 15% 40%)",
  border: "hsl(210 30% 18%)",
  borderPrimary: "hsl(210 50% 25%)",
};

const FlowConnector = ({ label }: { label: string }) => (
  <div className="flex flex-col items-center py-1" style={{ gap: 0 }}>
    <div className="w-px h-7" style={{ background: `linear-gradient(to bottom, ${C.border}, ${C.primaryLight}60)` }} />
    <div
      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border"
      style={{ background: C.primaryDim, borderColor: C.borderPrimary, color: C.primaryLight }}
    >
      <ChevronDown size={10} />
      {label}
    </div>
    <div className="w-px h-7" style={{ background: `linear-gradient(to bottom, ${C.primaryLight}60, ${C.border})` }} />
  </div>
);

interface Item {
  icon?: React.ReactNode;
  label: string;
  desc?: string;
}

interface PhaseCardProps {
  phase: number;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accentColor: string;
  dimColor: string;
  midColor: string;
  items: Item[];
  glow?: boolean;
}

const PhaseCard = ({ phase, icon, title, subtitle, accentColor, dimColor, midColor, items, glow }: PhaseCardProps) => (
  <div
    className="relative rounded-2xl border w-full overflow-hidden"
    style={{
      background: `linear-gradient(145deg, ${C.bgCard} 0%, ${dimColor} 100%)`,
      borderColor: `${accentColor}40`,
      boxShadow: glow
        ? `0 0 50px ${accentColor}25, 0 0 100px ${accentColor}10, inset 0 1px 0 ${accentColor}20`
        : `0 2px 20px rgba(0,0,0,0.5), inset 0 1px 0 ${accentColor}10`,
    }}
  >
    {glow && (
      <div
        className="absolute inset-0 pointer-events-none animate-pulse"
        style={{
          background: `radial-gradient(ellipse at 50% -10%, ${accentColor}20, transparent 60%)`,
          opacity: 0.6,
        }}
      />
    )}
    <div className="relative p-6">
      <div className="flex items-start gap-4 mb-5">
        <div
          className="flex items-center justify-center w-11 h-11 rounded-xl flex-shrink-0"
          style={{ background: midColor, border: `1px solid ${accentColor}50` }}
        >
          <div style={{ color: accentColor }}>{icon}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-xs font-bold tracking-widest uppercase px-2 py-0.5 rounded"
              style={{ background: midColor, color: accentColor }}
            >
              Fase {phase}
            </span>
          </div>
          <h3 className="font-bold text-lg leading-tight" style={{ color: C.text }}>
            {title}
          </h3>
          <p className="text-xs mt-0.5" style={{ color: C.textMuted }}>
            {subtitle}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((item, i) => (
          <div
            key={i}
            className="flex items-start gap-2.5 p-2.5 rounded-lg"
            style={{ background: `${accentColor}08`, border: `1px solid ${accentColor}18` }}
          >
            {item.icon && (
              <div className="flex-shrink-0 mt-0.5" style={{ color: `${accentColor}cc` }}>
                {item.icon}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium" style={{ color: C.text }}>
                {item.label}
              </div>
              {item.desc && (
                <div className="text-xs mt-0.5 leading-relaxed" style={{ color: C.textMuted }}>
                  {item.desc}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default function SoraProcess() {
  return (
    <div
      className="min-h-screen w-full"
      style={{ background: C.bg, color: C.text, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
    >
      {/* Subtle grid */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: `linear-gradient(${C.primaryLight} 1px, transparent 1px), linear-gradient(90deg, ${C.primaryLight} 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
        }}
      />
      {/* Top glow */}
      <div
        className="fixed inset-x-0 top-0 h-64 pointer-events-none opacity-20"
        style={{ background: `radial-gradient(ellipse at 50% 0%, ${C.primary}, transparent 70%)` }}
      />

      <div className="relative max-w-4xl mx-auto px-4 py-16">

        {/* ── HERO ── */}
        <div className="text-center mb-20">
          <img src={avisafeLogoText} alt="Avisafe" className="h-12 mx-auto mb-8" style={{ filter: "brightness(0) invert(1)", opacity: 0.9 }} />

          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold tracking-wider uppercase mb-6 border"
            style={{ background: C.primaryDim, borderColor: C.borderPrimary, color: C.primaryLight }}
          >
            <Activity size={12} />
            EASA SORA · AI-drevet · Specific-kategori
          </div>

          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight mb-4"
            style={{ color: C.text }}
          >
            Intelligent SORA
            <br />
            <span
              className="text-3xl sm:text-4xl"
              style={{ color: C.primaryLight }}
            >
              fra data til beslutning
            </span>
          </h1>

          <p className="text-lg mb-2" style={{ color: C.textMuted }}>
            Automatisert risikovurdering etter EASA SORA-metodikken
          </p>
          <p className="text-sm font-semibold tracking-wide" style={{ color: C.primaryLight }}>
            Norges mest avanserte droneoperasjonsplattform
          </p>

          {/* Stats bar */}
          <div
            className="flex flex-wrap justify-center gap-px mt-12 rounded-2xl overflow-hidden border"
            style={{ borderColor: C.border }}
          >
            {[
              { value: "7+", label: "Datakilder" },
              { value: "5", label: "AI-kategorier" },
              { value: "SAIL I–VI", label: "SORA-dekning" },
              { value: "< 60s", label: "Analysertid" },
            ].map((s, i) => (
              <div
                key={s.label}
                className="flex-1 min-w-[100px] py-4 px-6 text-center"
                style={{ background: i % 2 === 0 ? C.bgCard : C.bgCardAlt }}
              >
                <div className="text-2xl font-black" style={{ color: C.primaryLight }}>{s.value}</div>
                <div className="text-xs mt-1" style={{ color: C.textDim }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── FLOW DIAGRAM ── */}
        <div className="space-y-0">

          <PhaseCard
            phase={1}
            icon={<Database size={20} />}
            title="Avisafe Oppdragsdata"
            subtitle="Strukturerte operasjonsdata fra plattformen"
            accentColor={C.primaryLight}
            dimColor={C.primaryDim}
            midColor={`hsl(210 50% 20%)`}
            items={[
              { icon: <MapPin size={13} />, label: "Oppdragsdetaljer", desc: "Lokasjon, tid, rute, kunde" },
              { icon: <Users size={13} />, label: "Piloter & kompetanser", desc: "Sertifikater, flytimer, recency" },
              { icon: <Navigation size={13} />, label: "Droner", desc: "Modell, status, flytimer, inspeksjon" },
              { icon: <Layers size={13} />, label: "Utstyr", desc: "Vedlikeholdsstatus, tilgjengelighet" },
            ]}
          />

          <FlowConnector label="Kontekstdata" />

          <PhaseCard
            phase={2}
            icon={<Globe size={20} />}
            title="Eksterne Datakilder"
            subtitle="Sanntidsdata fra offentlige og regulatoriske API-er"
            accentColor={C.green}
            dimColor={C.greenDim}
            midColor={C.greenMid}
            items={[
              { icon: <Wind size={13} />, label: "Yr.no / OpenMeteo", desc: "Temperatur, vind, kast, sikt, nedbør" },
              { icon: <Radio size={13} />, label: "OpenAIP Luftrom", desc: "CTR, TMA, R/D/P-soner, restriksjoner" },
              { icon: <MapPin size={13} />, label: "SSB Arealbruk (Geonorge WFS)", desc: "Bolig, industri, natur-klassifisering" },
              { icon: <Users size={13} />, label: "SSB Befolkning (rutenett WFS)", desc: "Tetthet per km² — direkte inn i GRC" },
            ]}
          />

          <FlowConnector label="Sanntidsdata" />

          <PhaseCard
            phase={3}
            icon={<Shield size={20} />}
            title="Selskapssettings & Hard Stops"
            subtitle="Operatørens sikkerhetspolicyer — automatiske blokkeringer ved brudd"
            accentColor={C.red}
            dimColor={C.redDim}
            midColor={C.redMid}
            items={[
              { icon: <Wind size={13} />, label: "Vindgrenser (m/s)", desc: "Middelvind og kastterskel" },
              { icon: <Thermometer size={13} />, label: "Temperaturgrenser (°C)", desc: "Min og maks operasjonstemperatur" },
              { icon: <Navigation size={13} />, label: "Maks flyhøyde (m AGL)", desc: "Hardstop — kan ikke overstyres" },
              { icon: <Eye size={13} />, label: "BVLOS / Nattflyging", desc: "Tillatt eller ikke for selskapet" },
              { icon: <Users size={13} />, label: "Maks befolkningstetthet", desc: "Terskel for operasjonsgodkjenning" },
              { icon: <CheckCircle2 size={13} />, label: "Krav: observatør & reservebatteri", desc: "Operative minimumskrav" },
              { icon: <Lock size={13} />, label: "Operative begrensninger", desc: "Fritekst sendt til AI-systemprompt" },
              { icon: <FileText size={13} />, label: "Operasjonsmanual", desc: "Policydokumenter som AI-kontekst" },
            ]}
          />

          <FlowConnector label="Selskapspolicyer" />

          <PhaseCard
            phase={4}
            icon={<User size={20} />}
            title="Pilot & Operatør Input"
            subtitle="Operasjonsspesifikke parametere definert av piloten"
            accentColor={C.yellow}
            dimColor={C.yellowDim}
            midColor={C.yellowMid}
            items={[
              { icon: <Navigation size={13} />, label: "Flyhøyde & operasjonstype", desc: "VLOS / BVLOS" },
              { icon: <Users size={13} />, label: "Nærhet til folk", desc: "Ingen / spredt / tett bebyggelse" },
              { icon: <AlertTriangle size={13} />, label: "Kritisk infrastruktur", desc: "Nærhet og eksponeringsgrad" },
              { icon: <Eye size={13} />, label: "Antall observatører", desc: "Bemanning av sikkerhetsvakter" },
              { icon: <Radio size={13} />, label: "ATC-koordinering", desc: "Kontakt og clearance-status" },
              { icon: <MapPin size={13} />, label: "Reservelandingsplass", desc: "Definert nødlandingspunkt" },
            ]}
          />

          <FlowConnector label="Operasjonsparametre" />

          <PhaseCard
            phase={5}
            icon={<Brain size={20} />}
            title="AI Analyse — Første vurdering"
            subtitle="Claude AI analyserer alle inputs simultant mot SORA-rammeverket"
            accentColor={C.purple}
            dimColor={C.purpleDim}
            midColor={C.purpleMid}
            glow
            items={[
              { icon: <Cpu size={13} />, label: "Simultant alle datakilder", desc: "700+ parametere analysert i én pass" },
              { icon: <AlertTriangle size={13} />, label: "Hard stop-sjekk", desc: "Automatisk blokkering ved brudd" },
              { icon: <BarChart3 size={13} />, label: "Risikoscore 1–10", desc: "Vektet per kategori" },
              { icon: <Wind size={13} />, label: "Værvurdering", desc: "Vind, sikt, temperatur, nedbør" },
              { icon: <Radio size={13} />, label: "Luftromsvurdering", desc: "CTR/TMA-konflikter, klareringer" },
              { icon: <Users size={13} />, label: "Pilot & utstyrsvurdering", desc: "Kompetanse, recency, vedlikehold" },
            ]}
          />

          <FlowConnector label="Risikovurdering" />

          <PhaseCard
            phase={6}
            icon={<MessageSquare size={20} />}
            title="Pilotens Mitigeringer"
            subtitle="Piloter responderer på AI-analysen med tiltak i 5 risikoklasser"
            accentColor={C.yellow}
            dimColor={C.yellowDim}
            midColor={C.yellowMid}
            items={[
              { icon: <Wind size={13} />, label: "Værtiltak", desc: "Planer for vindeksponering og nedbør" },
              { icon: <Radio size={13} />, label: "Luftromstiltak", desc: "ATC-koordinering, NOTAM-konfirmasjon" },
              { icon: <User size={13} />, label: "Pilotvurdering", desc: "Begrunnelse for kompetanse og recency" },
              { icon: <MapPin size={13} />, label: "Oppdragstiltak", desc: "Operasjonell kontigensplan" },
              { icon: <Cpu size={13} />, label: "Utstyrstiltak", desc: "Redundans, backup-systemer, inspeksjon" },
              { icon: <FileText size={13} />, label: "Oppdatert ConOps", desc: "Revidert operasjonskonsept til AI" },
            ]}
          />

          <FlowConnector label="Mitigeringer" />

          <PhaseCard
            phase={7}
            icon={<Zap size={20} />}
            title="AI Re-vurdering — SORA-modus"
            subtitle="Ny AI-analyse med alle mitigeringer. Strukturert SORA-beregning etter EASA SORA AMC-rammeverket"
            accentColor={C.purple}
            dimColor={C.purpleDim}
            midColor={C.purpleMid}
            glow
            items={[
              { icon: <Brain size={13} />, label: "Komplett re-analyse", desc: "Alle mitigeringer integrert" },
              { icon: <BarChart3 size={13} />, label: "GRC-beregning", desc: "iGRC → bakkemitigeringer → fGRC" },
              { icon: <Radio size={13} />, label: "ARC-klassifisering", desc: "Initial ARC → luftromsmitigeringer → Residual ARC" },
              { icon: <Layers size={13} />, label: "SAIL-matrise", desc: "fGRC × Residual ARC → SAIL I–VI" },
            ]}
          />

          <FlowConnector label="SORA-analyse" />

          {/* ── SORA OUTPUT ── */}
          <div
            className="relative rounded-2xl border overflow-hidden"
            style={{
              background: `linear-gradient(145deg, ${C.bgCard} 0%, ${C.greenDim} 100%)`,
              borderColor: `${C.green}50`,
              boxShadow: `0 0 60px ${C.green}20, 0 0 120px ${C.green}08`,
            }}
          >
            <div
              className="absolute inset-0 pointer-events-none animate-pulse"
              style={{
                background: `radial-gradient(ellipse at 50% 100%, ${C.green}18, transparent 60%)`,
                opacity: 0.7,
              }}
            />
            <div className="relative p-6">
              <div className="text-center mb-8">
                <div
                  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold mb-3 border"
                  style={{ background: C.greenMid, borderColor: `${C.green}50`, color: C.green }}
                >
                  <CheckCircle2 size={14} />
                  SORA OUTPUT
                </div>
                <h3 className="text-2xl font-black" style={{ color: C.text }}>
                  Strukturert risikovurdering
                </h3>
                <p className="text-sm mt-1" style={{ color: C.textMuted }}>
                  Komplett SORA-rapport etter EASA SORA-metodikken
                </p>
              </div>

              {/* GRC row */}
              <div className="mb-5">
                <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: C.textDim }}>
                  Bakkerisikoklasse (GRC)
                </p>
                <div className="flex items-center gap-3">
                  <div
                    className="flex-1 rounded-xl p-4 text-center border"
                    style={{ background: `linear-gradient(135deg, ${C.bgCard}, ${C.yellowDim})`, borderColor: `${C.yellow}40` }}
                  >
                    <div className="text-xs font-bold tracking-wider uppercase mb-1" style={{ color: C.textMuted }}>iGRC</div>
                    <div className="text-3xl font-black" style={{ color: C.yellow }}>3</div>
                    <div className="text-xs" style={{ color: C.textMuted }}>Initial</div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <ArrowRight size={18} style={{ color: C.textDim }} />
                    <span className="text-xs text-center" style={{ color: C.textDim, maxWidth: 56 }}>Bakke­mitigeringer</span>
                  </div>
                  <div
                    className="flex-1 rounded-xl p-4 text-center border"
                    style={{ background: `linear-gradient(135deg, ${C.bgCard}, ${C.greenDim})`, borderColor: `${C.green}40` }}
                  >
                    <div className="text-xs font-bold tracking-wider uppercase mb-1" style={{ color: C.textMuted }}>fGRC</div>
                    <div className="text-3xl font-black" style={{ color: C.green }}>2</div>
                    <div className="text-xs" style={{ color: C.textMuted }}>Final</div>
                  </div>
                </div>
              </div>

              {/* ARC row */}
              <div className="mb-5">
                <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: C.textDim }}>
                  Luftromsrisikoklasse (ARC)
                </p>
                <div className="flex items-center gap-3">
                  <div
                    className="flex-1 rounded-xl p-4 text-center border"
                    style={{ background: `linear-gradient(135deg, ${C.bgCard}, ${C.yellowDim})`, borderColor: `${C.yellow}40` }}
                  >
                    <div className="text-xs font-bold tracking-wider uppercase mb-1" style={{ color: C.textMuted }}>Initial ARC</div>
                    <div className="text-3xl font-black" style={{ color: C.yellow }}>B</div>
                    <div className="text-xs" style={{ color: C.textMuted }}>Ukontrollert luftrom</div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <ArrowRight size={18} style={{ color: C.textDim }} />
                    <span className="text-xs text-center" style={{ color: C.textDim, maxWidth: 56 }}>Luftroms­mitigeringer</span>
                  </div>
                  <div
                    className="flex-1 rounded-xl p-4 text-center border"
                    style={{ background: `linear-gradient(135deg, ${C.bgCard}, ${C.greenDim})`, borderColor: `${C.green}40` }}
                  >
                    <div className="text-xs font-bold tracking-wider uppercase mb-1" style={{ color: C.textMuted }}>Residual ARC</div>
                    <div className="text-3xl font-black" style={{ color: C.green }}>A</div>
                    <div className="text-xs" style={{ color: C.textMuted }}>Etter mitigeringer</div>
                  </div>
                </div>
              </div>

              {/* SAIL + Rest-risiko + OSO */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                {[
                  { label: "SAIL-nivå", value: "II", sub: "Skala I–VI", color: C.primaryLight, dim: C.primaryDim },
                  { label: "Rest-risiko", value: "Lav", sub: "Etter mitigeringer", color: C.green, dim: C.greenDim },
                  { label: "OSO-krav", value: "M", sub: "Medium robusthet", color: C.purple, dim: C.purpleDim },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="rounded-xl p-4 text-center border"
                    style={{ background: `linear-gradient(135deg, ${C.bgCard}, ${m.dim})`, borderColor: `${m.color}35` }}
                  >
                    <div className="text-xs font-bold tracking-wider uppercase mb-2" style={{ color: C.textMuted }}>{m.label}</div>
                    <div className="text-2xl sm:text-3xl font-black" style={{ color: m.color }}>{m.value}</div>
                    <div className="text-xs mt-1" style={{ color: C.textMuted }}>{m.sub}</div>
                  </div>
                ))}
              </div>

              {/* GO badge */}
              <div
                className="rounded-xl p-5 text-center border"
                style={{
                  background: `linear-gradient(135deg, ${C.greenMid}, ${C.greenDim})`,
                  borderColor: `${C.green}60`,
                  boxShadow: `0 0 30px ${C.green}25`,
                }}
              >
                <div className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: C.textMuted }}>
                  AI-anbefaling
                </div>
                <div className="text-5xl font-black tracking-widest mb-2" style={{ color: C.green }}>
                  GO
                </div>
                <p className="text-sm" style={{ color: C.textMuted }}>
                  Alle hardstops bestått · Mitigeringer tilstrekkelige · SAIL II godkjent
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── FEATURE HIGHLIGHTS ── */}
        <div className="mt-24 mb-16">
          <h2 className="text-3xl font-black text-center mb-12" style={{ color: C.text }}>
            Hvorfor Avisafe SORA?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              {
                color: C.primaryLight,
                dimColor: C.primaryDim,
                icon: <Cpu size={26} />,
                title: "Fullt automatisert",
                points: [
                  "AI henter alle datakilder automatisk",
                  "Ingen manuell datainnsamling",
                  "Analyse ferdig på under 60 sekunder",
                  "700+ parametere vurdert simultant",
                ],
              },
              {
                color: C.yellow,
                dimColor: C.yellowDim,
                icon: <Clock size={26} />,
                title: "100% sporbar",
                points: [
                  "Komplett revisjonsspor",
                  "Alle inputs og outputs lagret",
                  "Pilot-signatur på hver vurdering",
                  "Eksport til PDF",
                ],
              },
              {
                color: C.green,
                dimColor: C.greenDim,
                icon: <Shield size={26} />,
                title: "Regulatorisk klar",
                points: [
                  "EASA SORA AMC-rammeverket",
                  "SORA-metodikk for Specific-kategori",
                  "Automatisk SAIL-beregning",
                  "Norske CAA-krav ivaretatt",
                ],
              },
            ].map((col) => (
              <div
                key={col.title}
                className="rounded-2xl p-6 border"
                style={{
                  background: `linear-gradient(145deg, ${C.bgCard}, ${col.dimColor})`,
                  borderColor: `${col.color}30`,
                }}
              >
                <div
                  className="flex items-center justify-center w-12 h-12 rounded-xl mx-auto mb-4 border"
                  style={{ background: `${col.color}15`, borderColor: `${col.color}40` }}
                >
                  <div style={{ color: col.color }}>{col.icon}</div>
                </div>
                <h3 className="text-base font-bold text-center mb-4" style={{ color: C.text }}>
                  {col.title}
                </h3>
                <ul className="space-y-2">
                  {col.points.map((p) => (
                    <li key={p} className="flex items-start gap-2">
                      <CheckCircle2 size={13} className="flex-shrink-0 mt-0.5" style={{ color: col.color }} />
                      <span className="text-sm leading-snug" style={{ color: C.textMuted }}>
                        {p}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div className="text-center pt-10 border-t" style={{ borderColor: C.border }}>
          <img
            src={avisafeLogoText}
            alt="Avisafe"
            className="h-8 mx-auto mb-3"
            style={{ filter: "brightness(0) invert(1)", opacity: 0.5 }}
          />
          <p className="text-sm" style={{ color: C.textDim }}>
            Powered by AviSafe · EASA SORA · AI-drevet droneoperasjonsplattform
          </p>
          <p className="text-xs mt-1" style={{ color: C.textDim }}>
            © {new Date().getFullYear()} AviSafe AS
          </p>
        </div>
      </div>
    </div>
  );
}
