import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRoleCheck } from "@/hooks/useRoleCheck";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Mail, Save, Eye, RefreshCw, Code, Eye as EyeIcon, Settings, Building2, Globe, RotateCcw, Paperclip, X, Plus } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { AttachmentPickerDialog } from "./AttachmentPickerDialog";

interface AttachmentDocument {
  id: string;
  tittel: string;
  fil_url: string | null;
  fil_navn: string | null;
}

interface EmailTemplate {
  id: string;
  company_id: string;
  template_type: string;
  subject: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface Company {
  id: string;
  navn: string;
}

// Default template content for each template type
const defaultTemplateContent: Record<string, string> = {
  user_approved: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
.content { background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px; }
.success-icon { font-size: 48px; margin-bottom: 15px; }
.button { display: inline-block; background: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<div class="success-icon">✓</div>
<h1 style="margin: 0;">Velkommen til {{company_name}}!</h1>
</div>
<div class="content">
<h2>Hei {{user_name}}!</h2>
<p>Vi er glade for å informere deg om at brukerkontoen din hos <strong>{{company_name}}</strong> nå er godkjent.</p>
<p>Du har nå full tilgang til systemet og kan begynne å bruke alle funksjonene som er tilgjengelige for deg.</p>
<p style="text-align: center;">
<a href="https://app.avisafe.no" class="button">Logg inn nå</a>
</p>
<p>Med vennlig hilsen,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`,

  user_welcome: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Velkommen til {{company_name}}!</h1>
</div>
<div class="content">
<p>Hei {{user_name}},</p>
<p>Velkommen som bruker hos {{company_name}}. Din konto er nå opprettet og venter på godkjenning av en administrator.</p>
<p>Du vil motta en e-post når kontoen din er godkjent.</p>
<p>Med vennlig hilsen,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`,

  customer_welcome: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
.content { background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px; }
.welcome-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1 style="margin: 0;">Velkommen som kunde!</h1>
</div>
<div class="content">
<h2>Hei {{customer_name}}!</h2>
<p>Vi er glade for å ønske deg velkommen som kunde hos <strong>{{company_name}}</strong>.</p>
<div class="welcome-box">
<p style="margin: 0;">Du er nå registrert i vårt system. Vi ser frem til et godt samarbeid.</p>
</div>
</div>
</div>
</body>
</html>`,

  mission_confirmation: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
.mission-box { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; }
.detail-row { padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
.status { display: inline-block; padding: 4px 12px; border-radius: 4px; background: #dbeafe; color: #1e40af; font-weight: bold; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Oppdragsbekreftelse</h1>
</div>
<div class="content">
<p>Dette bekrefter følgende oppdrag:</p>
<div class="mission-box">
<h2 style="margin-top: 0; color: #1e40af;">{{mission_title}}</h2>
<div class="detail-row"><strong>Status:</strong> <span class="status">{{mission_status}}</span></div>
<div class="detail-row"><strong>Lokasjon:</strong> {{mission_location}}</div>
<div class="detail-row"><strong>Tidspunkt:</strong> {{mission_date}}</div>
</div>
<p>Med vennlig hilsen,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`,

  admin_new_user: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
.user-info { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #1e40af; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Ny bruker venter på godkjenning</h1>
</div>
<div class="content">
<p>En ny bruker har registrert seg og venter på godkjenning.</p>
<div class="user-info">
<p><strong>Navn:</strong> {{new_user_name}}</p>
<p><strong>E-post:</strong> {{new_user_email}}</p>
<p><strong>Selskap:</strong> {{company_name}}</p>
</div>
<p>Logg inn i AviSafe for å godkjenne eller avslå denne brukeren.</p>
</div>
</div>
</body>
</html>`,

  incident_notification: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
.incident-box { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; }
.severity { display: inline-block; padding: 4px 12px; border-radius: 4px; color: white; background: #f59e0b; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Ny hendelse rapportert</h1>
</div>
<div class="content">
<div class="incident-box">
<h2 style="margin-top: 0;">{{incident_title}}</h2>
<p><strong>Alvorlighetsgrad:</strong> <span class="severity">{{incident_severity}}</span></p>
<p><strong>Lokasjon:</strong> {{incident_location}}</p>
<p><strong>Beskrivelse:</strong></p>
<p>{{incident_description}}</p>
</div>
<p>Logg inn i AviSafe for å se detaljer og følge opp hendelsen.</p>
<p>Med vennlig hilsen,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`,

  mission_notification: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
.mission-box { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Nytt oppdrag planlagt</h1>
</div>
<div class="content">
<div class="mission-box">
<h2 style="margin-top: 0;">{{mission_title}}</h2>
<table style="width: 100%;">
<tr><td style="padding: 8px 0; color: #666;"><strong>Status:</strong></td><td>{{mission_status}}</td></tr>
<tr><td style="padding: 8px 0; color: #666;"><strong>Lokasjon:</strong></td><td>{{mission_location}}</td></tr>
<tr><td style="padding: 8px 0; color: #666;"><strong>Tidspunkt:</strong></td><td>{{mission_date}}</td></tr>
</table>
<p style="margin-top: 15px;"><strong>Beskrivelse:</strong></p>
<p>{{mission_description}}</p>
</div>
<p>Logg inn i AviSafe for mer informasjon.</p>
<p>Med vennlig hilsen,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`,

  followup_assigned: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
.incident-box { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #f59e0b; }
.severity { display: inline-block; padding: 4px 12px; border-radius: 4px; color: white; background: #f59e0b; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Oppfølgingsansvarlig tildelt</h1>
</div>
<div class="content">
<p>Hei {{user_name}},</p>
<p>Du har blitt tildelt som oppfølgingsansvarlig for følgende hendelse:</p>
<div class="incident-box">
<h2 style="margin-top: 0;">{{incident_title}}</h2>
<p><strong>Alvorlighetsgrad:</strong> <span class="severity">{{incident_severity}}</span></p>
<p><strong>Lokasjon:</strong> {{incident_location}}</p>
<p><strong>Beskrivelse:</strong></p>
<p>{{incident_description}}</p>
</div>
<p>Logg inn i AviSafe for å se detaljer og følge opp hendelsen.</p>
<p>Med vennlig hilsen,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`,

  mission_mention_notification: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
.content { background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px; }
.mission-info { background: white; padding: 18px; border-radius: 8px; margin: 16px 0; border: 1px solid #e5e7eb; }
.note-box { background: white; padding: 20px; border-radius: 8px; margin: 18px 0; border-left: 4px solid #3b82f6; }
.button { display: inline-block; background: #1e40af; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1 style="margin: 0;">Du er tagget i et oppdrag</h1>
</div>
<div class="content">
<p>Hei {{user_name}},</p>
<p><strong>{{sender_name}}</strong> har tagget deg i merknader på et oppdrag i AviSafe.</p>
<div class="mission-info">
<h2 style="margin-top: 0; color: #1e40af;">{{mission_title}}</h2>
<p><strong>Lokasjon:</strong> {{mission_location}}</p>
<p><strong>Tidspunkt:</strong> {{mission_date}}</p>
</div>
<div class="note-box">
<p style="margin: 0 0 8px 0;"><strong>Merknad:</strong></p>
<p style="margin: 0;">{{mission_note}}</p>
</div>
<p>Logg inn i appen for å se oppdraget, rute, ressurser og øvrig kontekst.</p>
<p style="text-align: center;">
<a href="{{app_url}}" class="button">Åpne oppdraget i AviSafe</a>
</p>
<p>Med vennlig hilsen,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`,

  password_reset: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
.content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
.button { display: inline-block; background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
.warning { background: #fef3c7; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #f59e0b; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Tilbakestill passord</h1>
</div>
<div class="content">
<p>Hei {{user_name}},</p>
<p>Vi har mottatt en forespørsel om å tilbakestille passordet ditt. Klikk på knappen nedenfor for å fortsette:</p>
<a href="{{reset_link}}" class="button">Tilbakestill passord</a>
<div class="warning">
<p><strong>Viktig:</strong> Denne lenken utløper om 1 time av sikkerhetsgrunner.</p>
</div>
<p>Hvis du ikke har bedt om å tilbakestille passordet ditt, kan du ignorere denne e-posten.</p>
<p>Med vennlig hilsen,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`,

  maintenance_reminder: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
.content { background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px; }
.items-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb; }
.items-list { white-space: pre-line; font-family: monospace; background: #f3f4f6; padding: 15px; border-radius: 6px; }
.count-badge { display: inline-block; background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 20px; font-weight: bold; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1 style="margin: 0;">🔧 Vedlikeholdspåminnelse</h1>
</div>
<div class="content">
<p>Hei {{user_name}},</p>
<p>Følgende ressurser har vedlikehold eller inspeksjon som nærmer seg:</p>
<div class="items-box">
<p><span class="count-badge">{{item_count}} ressurser</span></p>
<div class="items-list">{{items_list}}</div>
</div>
<p>Logg inn i AviSafe for å se detaljer og registrere vedlikehold.</p>
<p>Med vennlig hilsen,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`,

  document_reminder: `<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
.container { max-width: 600px; margin: 0 auto; padding: 20px; }
.header { background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
.content { background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px; }
.document-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444; }
.expiry-date { color: #dc2626; font-weight: bold; font-size: 18px; }
.button { display: inline-block; background: #1e40af; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1 style="margin: 0;">⚠️ Dokument utløper snart</h1>
</div>
<div class="content">
<p>Dette er en påminnelse om at følgende dokument snart utløper:</p>
<div class="document-box">
<h2 style="margin-top: 0;">{{document_title}}</h2>
<p><strong>Utløpsdato:</strong> <span class="expiry-date">{{expiry_date}}</span></p>
</div>
<p>Vi anbefaler at du fornyer eller oppdaterer dette dokumentet så snart som mulig.</p>
<p style="text-align: center;">
<a href="https://app.avisafe.no" class="button">Gå til dokumenter</a>
</p>
<p>Med vennlig hilsen,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`,
  user_invite: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Invitasjon</title>
<style>
body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
.container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
.header { background: linear-gradient(135deg, #1a365d 0%, #2d5a8e 100%); color: white; padding: 30px; text-align: center; }
.header h1 { margin: 0; font-size: 24px; }
.content { padding: 30px; color: #333; line-height: 1.6; }
.code-box { background: #f0f4f8; border: 2px dashed #2d5a8e; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
.code-box .code { font-size: 28px; font-weight: bold; color: #1a365d; letter-spacing: 3px; }
.button { display: inline-block; background: #2d5a8e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; }
ol { padding-left: 20px; }
ol li { margin-bottom: 8px; }
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Du er invitert til {{company_name}}</h1>
</div>
<div class="content">
<p>Hei!</p>
<p>Du har blitt invitert til å bli med i <strong>{{company_name}}</strong> på AviSafe – en plattform for droneoperasjoner.</p>
<p>For å komme i gang, følg disse stegene:</p>
<ol>
<li>Gå til <a href="{{app_url}}">{{app_url}}</a></li>
<li>Klikk «Registrer deg»</li>
<li>Bruk følgende registreringskode:</li>
</ol>
<div class="code-box">
<div class="code">{{registration_code}}</div>
</div>
<p>Etter registrering vil en administrator godkjenne kontoen din.</p>
<p style="text-align: center;">
<a href="{{app_url}}" class="button">Gå til AviSafe</a>
</p>
<p>Med vennlig hilsen,<br>{{company_name}}</p>
</div>
</div>
</body>
</html>`,
};

// Basic templates available to all admins
const basicTemplateTypes = [
  {
    value: "user_approved",
    label: "Bruker godkjent",
    variables: ["{{user_name}}", "{{company_name}}"],
    defaultSubject: "Din konto er godkjent - {{company_name}}",
    previewData: {
      user_name: "Kari Nordmann",
      company_name: "Ditt Selskap AS",
    },
  },
  {
    value: "user_welcome",
    label: "Velkommen ny bruker",
    variables: ["{{user_name}}", "{{company_name}}"],
    defaultSubject: "Velkommen til {{company_name}}",
    previewData: {
      user_name: "Kari Nordmann",
      company_name: "Ditt Selskap AS",
    },
  },
  {
    value: "customer_welcome",
    label: "Ny kunde",
    variables: ["{{customer_name}}", "{{company_name}}"],
    defaultSubject: "Velkommen som kunde hos {{company_name}}",
    previewData: {
      customer_name: "Ola Nordmann",
      company_name: "Ditt Selskap AS",
    },
  },
  {
    value: "user_invite",
    label: "Inviter ny bruker",
    variables: ["{{company_name}}", "{{registration_code}}", "{{app_url}}"],
    defaultSubject: "Du er invitert til {{company_name}}",
    previewData: {
      company_name: "Ditt Selskap AS",
      registration_code: "ABC123",
      app_url: "https://app.avisafe.no",
    },
  },
  {
    value: "mission_confirmation",
    label: "Oppdragsbekreftelse",
    variables: [
      "{{mission_title}}",
      "{{mission_location}}",
      "{{mission_date}}",
      "{{mission_status}}",
      "{{mission_description}}",
      "{{company_name}}",
    ],
    defaultSubject: "Oppdragsbekreftelse: {{mission_title}}",
    previewData: {
      mission_title: "Drone inspeksjon av vindmøller",
      mission_location: "Oslo, Norge",
      mission_date: "15. januar 2025 kl. 10:00",
      mission_status: "Planlagt",
      mission_description: "Visuell inspeksjon av vindturbiner.",
      company_name: "Ditt Selskap AS",
    },
  },
];

// Advanced templates only for superadmins (notification emails from profile settings)
const superadminTemplateTypes = [
  {
    value: "admin_new_user",
    label: "Ny bruker venter (Superadmin)",
    variables: ["{{new_user_name}}", "{{new_user_email}}", "{{company_name}}"],
    defaultSubject: "Ny bruker venter på godkjenning",
    previewData: {
      new_user_name: "Ole Hansen",
      new_user_email: "ole.hansen@eksempel.no",
      company_name: "Ditt Selskap AS",
    },
  },
  {
    value: "incident_notification",
    label: "Ny hendelse (Superadmin)",
    variables: ["{{incident_title}}", "{{incident_severity}}", "{{incident_location}}", "{{incident_description}}", "{{company_name}}"],
    defaultSubject: "Ny hendelse: {{incident_title}}",
    previewData: {
      incident_title: "Nødlanding ved testing",
      incident_severity: "Middels",
      incident_location: "Oslo Lufthavn",
      incident_description: "Dronen måtte nødlande grunnet lavt batteri under testflyging.",
      company_name: "Ditt Selskap AS",
    },
  },
  {
    value: "mission_notification",
    label: "Nytt oppdrag (Superadmin)",
    variables: ["{{mission_title}}", "{{mission_location}}", "{{mission_date}}", "{{mission_status}}", "{{mission_description}}", "{{company_name}}"],
    defaultSubject: "Nytt oppdrag: {{mission_title}}",
    previewData: {
      mission_title: "Inspeksjon av vindmøller",
      mission_location: "Fosen, Trøndelag",
      mission_date: "15. januar 2025 kl. 10:00",
      mission_status: "Planlagt",
      mission_description: "Visuell inspeksjon av vindturbiner i vindparken.",
      company_name: "Ditt Selskap AS",
    },
  },
  {
    value: "followup_assigned",
    label: "Oppfølgingsansvarlig tildelt (Superadmin)",
    variables: ["{{user_name}}", "{{incident_title}}", "{{incident_severity}}", "{{incident_location}}", "{{incident_description}}", "{{company_name}}"],
    defaultSubject: "Du er tildelt som oppfølgingsansvarlig: {{incident_title}}",
    previewData: {
      user_name: "Kari Nordmann",
      incident_title: "Nødlanding ved testing",
      incident_severity: "Middels",
      incident_location: "Oslo Lufthavn",
      incident_description: "Dronen måtte nødlande grunnet lavt batteri under testflyging.",
      company_name: "Ditt Selskap AS",
    },
  },
  {
    value: "mission_mention_notification",
    label: "Tagget i oppdrag (Superadmin)",
    variables: ["{{user_name}}", "{{sender_name}}", "{{mission_title}}", "{{mission_location}}", "{{mission_date}}", "{{mission_note}}", "{{company_name}}", "{{app_url}}"],
    defaultSubject: "Du er tagget i et oppdrag: {{mission_title}}",
    previewData: {
      user_name: "Kari Nordmann",
      sender_name: "Ole Hansen",
      mission_title: "Inspeksjon av vindmøller",
      mission_location: "Fosen, Trøndelag",
      mission_date: "15. januar 2025 kl. 10:00",
      mission_note: "@Kari Nordmann kan du vurdere værvindu og bekrefte at ruten er innenfor operatørens prosedyrer?",
      company_name: "Ditt Selskap AS",
      app_url: "https://app.avisafe.no/oppdrag",
    },
  },
  {
    value: "password_reset",
    label: "Passord tilbakestilling (Superadmin)",
    variables: ["{{user_name}}", "{{reset_link}}", "{{company_name}}"],
    defaultSubject: "Tilbakestill passord - AviSafe",
    previewData: {
      user_name: "Kari Nordmann",
      reset_link: "https://login.avisafe.no/reset-password?token=xxx",
      company_name: "Ditt Selskap AS",
    },
  },
  {
    value: "maintenance_reminder",
    label: "Vedlikeholdspåminnelse (Superadmin)",
    variables: ["{{user_name}}", "{{items_list}}", "{{item_count}}", "{{company_name}}"],
    defaultSubject: "Vedlikeholdspåminnelse: {{item_count}} ressurser krever oppmerksomhet",
    previewData: {
      user_name: "Kari Nordmann",
      items_list: "Drone: DJI Mavic 3 - 20. januar 2025 (om 5 dager)\nUtstyr: Termisk kamera - 22. januar 2025 (om 7 dager)",
      item_count: "2",
      company_name: "Ditt Selskap AS",
    },
  },
  {
    value: "document_reminder",
    label: "Dokumentpåminnelse (Superadmin)",
    variables: ["{{document_title}}", "{{expiry_date}}", "{{company_name}}"],
    defaultSubject: "Dokument utløper snart: {{document_title}}",
    previewData: {
      document_title: "Droneoperatørsertifikat A2",
      expiry_date: "31. desember 2025",
      company_name: "Ditt Selskap AS",
    },
  },
];

interface EmailTemplateEditorProps {
  onOpenEmailSettings: () => void;
}

const ALL_COMPANIES_ID = "__ALL_COMPANIES__";

export const EmailTemplateEditor = ({ onOpenEmailSettings }: EmailTemplateEditorProps) => {
  const { companyId } = useAuth();
  const { isSuperAdmin } = useRoleCheck();
  const isMobile = useIsMobile();
  const [selectedTemplateType, setSelectedTemplateType] = useState("user_approved");
  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"visual" | "html">("visual");
  const quillRef = useRef<ReactQuill>(null);
  
  // Superadmin company selection
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  
  // Attachments
  const [attachments, setAttachments] = useState<AttachmentDocument[]>([]);
  const [attachmentPickerOpen, setAttachmentPickerOpen] = useState(false);
  
  // Get available template types based on role
  const templateTypes = useMemo(() => {
    if (isSuperAdmin) {
      return [...basicTemplateTypes, ...superadminTemplateTypes];
    }
    return basicTemplateTypes;
  }, [isSuperAdmin]);

  // Fetch companies for superadmin
  useEffect(() => {
    const fetchCompanies = async () => {
      if (!isSuperAdmin) return;
      
      setLoadingCompanies(true);
      try {
        const { data, error } = await supabase
          .from("companies")
          .select("id, navn")
          .eq("aktiv", true)
          .order("navn");

        if (error) throw error;
        setCompanies(data || []);
        
        // Set initial company
        if (data && data.length > 0 && !selectedCompanyId) {
          setSelectedCompanyId(companyId || data[0].id);
        }
      } catch (error) {
        console.error("Error fetching companies:", error);
      } finally {
        setLoadingCompanies(false);
      }
    };

    fetchCompanies();
  }, [isSuperAdmin, companyId]);

  // Set initial selected company when not superadmin
  useEffect(() => {
    if (!isSuperAdmin && companyId) {
      setSelectedCompanyId(companyId);
    }
  }, [isSuperAdmin, companyId]);

  const isAllCompaniesMode = selectedCompanyId === ALL_COMPANIES_ID;
  const activeCompanyId = isSuperAdmin ? (isAllCompaniesMode ? companyId : selectedCompanyId) : companyId;

  // Handle image upload to Supabase Storage
  const handleImageUpload = async () => {
    const input = document.createElement("input");
    input.setAttribute("type", "file");
    input.setAttribute("accept", "image/*");
    input.click();

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      try {
        const fileExt = file.name.split(".").pop();
        const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
        const filePath = `${activeCompanyId}/${fileName}`;

        const { error: uploadError } = await supabase.storage.from("email-images").upload(filePath, file);

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("email-images").getPublicUrl(filePath);

        const img = new Image();
        img.onload = () => {
          const maxWidth = 560;
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          const quill = quillRef.current?.getEditor();
          if (quill) {
            const range = quill.getSelection(true);
            const imageHtml = `<img src="${publicUrl}" alt="Bilde" width="${width}" height="${height}" style="max-width: 100%; height: auto; display: block;" />`;
            quill.clipboard.dangerouslyPasteHTML(range.index, imageHtml);
            quill.setSelection(range.index + 1, 0);
          }

          toast.success("Bilde lastet opp");
        };

        img.onerror = () => {
          toast.error("Kunne ikke lese bildedimensjoner");
        };

        img.src = publicUrl;
      } catch (error) {
        console.error("Error uploading image:", error);
        toast.error("Kunne ikke laste opp bilde");
      }
    };
  };

  const modules = useMemo(
    () => ({
      toolbar: {
        container: [
          [{ header: [1, 2, 3, false] }],
          ["bold", "italic", "underline", "strike"],
          [{ color: [] }, { background: [] }],
          [{ list: "ordered" }, { list: "bullet" }],
          [{ align: [] }],
          ["link", "image"],
          ["clean"],
        ],
        handlers: {
          image: handleImageUpload,
        },
      },
    }),
    [activeCompanyId],
  );

  const formats = [
    "header",
    "bold",
    "italic",
    "underline",
    "strike",
    "color",
    "background",
    "list",
    "bullet",
    "align",
    "link",
    "image",
  ];

  useEffect(() => {
    fetchTemplate();
  }, [activeCompanyId, selectedTemplateType]);

  const fetchTemplate = async () => {
    if (!activeCompanyId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .eq("company_id", activeCompanyId)
        .eq("template_type", selectedTemplateType)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setTemplate(data);
        setSubject(data.subject);
        setContent(data.content);
        
        // Fetch attachments for this template
        const { data: attachmentData, error: attachmentError } = await supabase
          .from("email_template_attachments")
          .select(`
            document_id,
            documents:document_id (
              id,
              tittel,
              fil_url,
              fil_navn
            )
          `)
          .eq("template_id", data.id);
        
        if (!attachmentError && attachmentData) {
          const docs = attachmentData
            .map((a: any) => a.documents)
            .filter((d: any) => d !== null) as AttachmentDocument[];
          setAttachments(docs);
        } else {
          setAttachments([]);
        }
      } else {
        // Use default template if no custom template exists
        setTemplate(null);
        const currentTemplateType = templateTypes.find((t) => t.value === selectedTemplateType);
        const defaultContent = defaultTemplateContent[selectedTemplateType] || "";
        const defaultSubject = currentTemplateType?.defaultSubject || "";
        setSubject(defaultSubject);
        setContent(defaultContent);
        setAttachments([]);
      }
    } catch (error: any) {
      console.error("Error fetching template:", error);
      toast.error("Kunne ikke laste mal");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!activeCompanyId && !isAllCompaniesMode) {
      toast.error("Velg en bedrift først");
      return;
    }

    setSaving(true);
    try {
      if (isAllCompaniesMode) {
        // Save template to all companies
        let successCount = 0;
        let errorCount = 0;
        
        for (const company of companies) {
          try {
            // Check if template exists for this company
            const { data: existingTemplate } = await supabase
              .from("email_templates")
              .select("id")
              .eq("company_id", company.id)
              .eq("template_type", selectedTemplateType)
              .maybeSingle();
            
            if (existingTemplate) {
              // Update existing
              const { error } = await supabase
                .from("email_templates")
                .update({ subject, content })
                .eq("id", existingTemplate.id);
              
              if (error) throw error;
            } else {
              // Insert new
              const { error } = await supabase.from("email_templates").insert({
                company_id: company.id,
                template_type: selectedTemplateType,
                subject,
                content,
              });
              
              if (error) throw error;
            }
            successCount++;
          } catch (err) {
            console.error(`Error saving template for ${company.navn}:`, err);
            errorCount++;
          }
        }
        
        if (errorCount === 0) {
          toast.success(`Mal lagret til alle ${successCount} selskaper`);
        } else {
          toast.warning(`Lagret til ${successCount} selskaper, ${errorCount} feilet`);
        }
      } else {
        // Save to single company
        let templateId = template?.id;
        
        if (template) {
          const { error } = await supabase
            .from("email_templates")
            .update({
              subject,
              content,
            })
            .eq("id", template.id);

          if (error) throw error;
        } else {
          const { data: newTemplate, error } = await supabase.from("email_templates").insert({
            company_id: activeCompanyId,
            template_type: selectedTemplateType,
            subject,
            content,
          }).select().single();

          if (error) throw error;
          templateId = newTemplate?.id;
        }
        
        // Save attachments if we have a template ID
        if (templateId) {
          // Delete existing attachments
          await supabase
            .from("email_template_attachments")
            .delete()
            .eq("template_id", templateId);
          
          // Insert new attachments
          if (attachments.length > 0) {
            const attachmentInserts = attachments.map((doc) => ({
              template_id: templateId,
              document_id: doc.id,
            }));
            
            const { error: attachmentError } = await supabase
              .from("email_template_attachments")
              .insert(attachmentInserts);
            
            if (attachmentError) {
              console.error("Error saving attachments:", attachmentError);
              toast.warning("Mal lagret, men vedlegg kunne ikke lagres");
            }
          }
        }
        
        toast.success("Mal lagret");
        fetchTemplate();
      }
    } catch (error: any) {
      console.error("Error saving template:", error);
      toast.error("Kunne ikke lagre mal: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAttachment = (docId: string) => {
    setAttachments((prev) => prev.filter((doc) => doc.id !== docId));
  };

  const handleAddAttachments = (docs: AttachmentDocument[]) => {
    // Merge new docs with existing, avoiding duplicates
    setAttachments((prev) => {
      const existingIds = new Set(prev.map((d) => d.id));
      const newDocs = docs.filter((d) => !existingIds.has(d.id));
      return [...prev, ...newDocs];
    });
  };

  const handleReset = () => {
    if (template) {
      setSubject(template.subject);
      setContent(template.content);
      toast.info("Endringer tilbakestilt");
    }
  };

  const handleResetToDefault = () => {
    const defaultContent = defaultTemplateContent[selectedTemplateType] || "";
    const currentTemplateType = templateTypes.find((t) => t.value === selectedTemplateType);
    const defaultSubject = currentTemplateType?.defaultSubject || "";
    
    setSubject(defaultSubject);
    setContent(defaultContent);
    toast.info("Tilbakestilt til standardmal");
  };

  const getPreviewContent = () => {
    const currentTemplateType = templateTypes.find((t) => t.value === selectedTemplateType);
    let previewContent = content;
    let previewSubject = subject;

    if (currentTemplateType?.previewData) {
      const data = currentTemplateType.previewData;
      Object.entries(data).forEach(([key, value]) => {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        previewContent = previewContent.replace(regex, value);
        previewSubject = previewSubject.replace(regex, value);
      });
    }

    return { content: previewContent, subject: previewSubject };
  };

  const wrapContentInEmailTemplate = (htmlContent: string) => {
    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <style>
      body { 
        font-family: Arial, sans-serif; 
        line-height: 1.6; 
        color: #333; 
        margin: 0;
        padding: 0;
        background-color: #f4f4f4;
      }
      .container { 
        max-width: 600px; 
        margin: 20px auto; 
        background: white;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      .content { 
        padding: 30px; 
      }
      .footer { 
        background: #f9f9f9;
        padding: 20px 30px;
        text-align: center; 
        font-size: 12px; 
        color: #888;
        border-top: 1px solid #eee;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="content">
        ${htmlContent}
      </div>
      <div class="footer">
      </div>
    </div>
  </body>
</html>`;
  };

  const handleVisualEditorChange = (value: string) => {
    const wrappedContent = wrapContentInEmailTemplate(value);
    setContent(wrappedContent);
  };

  const getVisualEditorContent = () => {
    const match = content.match(/<div class="content">([\s\S]*?)<\/div>/);
    if (match && match[1]) {
      return match[1].trim();
    }
    return content;
  };

  const currentTemplateType = templateTypes.find((t) => t.value === selectedTemplateType);
  const preview = getPreviewContent();

  if (loading && !loadingCompanies) {
    return (
      <GlassCard className="p-3 sm:p-6">
        <div className="flex items-center justify-center py-6 sm:py-8">
          <p className="text-sm sm:text-base text-muted-foreground">Laster mal...</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <>
      <GlassCard className="p-3 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-4 sm:mb-6">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            <h2 className="text-base sm:text-xl font-semibold">E-postmaler</h2>
            <Button
              onClick={onOpenEmailSettings}
              variant="outline"
              size={isMobile ? "sm" : "default"}
              className="gap-2"
            >
              <Settings className={isMobile ? "h-3 w-3" : "h-4 w-4"} />
              {isMobile ? "Innstillinger" : "E-postinnstillinger"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={handleResetToDefault}
              size={isMobile ? "sm" : "default"}
              className={isMobile ? "flex-1" : ""}
              title="Tilbakestill til standardmal"
            >
              <RotateCcw className={`${isMobile ? "h-3 w-3 mr-1" : "h-4 w-4 mr-2"}`} />
              {isMobile ? "Standard" : "Standardmal"}
            </Button>
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={!template}
              size={isMobile ? "sm" : "default"}
              className={isMobile ? "flex-1" : ""}
            >
              <RefreshCw className={`${isMobile ? "h-3 w-3 mr-1" : "h-4 w-4 mr-2"}`} />
              {isMobile ? "Tilbake" : "Tilbakestill"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setPreviewOpen(true)}
              size={isMobile ? "sm" : "default"}
              className={isMobile ? "flex-1" : ""}
            >
              <Eye className={`${isMobile ? "h-3 w-3 mr-1" : "h-4 w-4 mr-2"}`} />
              {isMobile ? "Vis" : "Forhåndsvis"}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              size={isMobile ? "sm" : "default"}
              className={isMobile ? "flex-1" : ""}
            >
              <Save className={`${isMobile ? "h-3 w-3 mr-1" : "h-4 w-4 mr-2"}`} />
              {saving ? "Lagrer..." : "Lagre"}
            </Button>
          </div>
        </div>

        <div className="space-y-4 sm:space-y-6">
          {/* Superadmin company selector */}
          {isSuperAdmin && (
            <div className="space-y-2">
              <Label htmlFor="company-select" className="text-xs sm:text-sm flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Velg bedrift
              </Label>
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger className={isMobile ? "h-9 text-sm" : ""}>
                  <SelectValue placeholder="Velg bedrift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_COMPANIES_ID} className="text-xs sm:text-sm font-semibold">
                    <span className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Alle selskaper
                    </span>
                  </SelectItem>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id} className="text-xs sm:text-sm">
                      {company.navn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isAllCompaniesMode && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Malen vil bli lagret til alle {companies.length} selskaper når du klikker "Lagre".
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="template-type" className="text-xs sm:text-sm">
              Maltype
            </Label>
            <Select value={selectedTemplateType} onValueChange={setSelectedTemplateType}>
              <SelectTrigger className={isMobile ? "h-9 text-sm" : ""}>
                <SelectValue placeholder="Velg maltype" />
              </SelectTrigger>
              <SelectContent>
                {templateTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value} className="text-xs sm:text-sm">
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4">
            <h3 className="font-semibold text-xs sm:text-sm mb-2">Tilgjengelige variabler:</h3>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {currentTemplateType?.variables.map((variable) => (
                <code
                  key={variable}
                  className="bg-white dark:bg-gray-800 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-xs cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
                  onClick={() => {
                    navigator.clipboard.writeText(variable);
                    toast.success("Variabel kopiert");
                  }}
                  title="Klikk for å kopiere"
                >
                  {variable}
                </code>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Klikk på en variabel for å kopiere den</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject" className="text-xs sm:text-sm">
              E-post emne
            </Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={currentTemplateType?.defaultSubject || "Skriv inn e-post emne..."}
              className={isMobile ? "h-9 text-sm" : ""}
            />
          </div>

          {/* Attachments Section */}
          <div className="space-y-2">
            <Label className="text-xs sm:text-sm flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              Vedlegg
            </Label>
            <div className="flex flex-wrap gap-2 items-center">
              {attachments.map((doc) => (
                <Badge key={doc.id} variant="secondary" className="gap-1 py-1.5 px-3">
                  <Paperclip className="h-3 w-3" />
                  <span className="max-w-[150px] truncate">{doc.tittel}</span>
                  <X
                    className="h-3 w-3 cursor-pointer hover:text-destructive ml-1"
                    onClick={() => handleRemoveAttachment(doc.id)}
                  />
                </Badge>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAttachmentPickerOpen(true)}
                className="gap-1"
              >
                <Plus className="h-4 w-4" />
                Legg til vedlegg
              </Button>
            </div>
            {attachments.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {attachments.length} vedlegg valgt. Disse vil bli sendt med alle e-poster som bruker denne malen.
              </p>
            )}
          </div>

          <Tabs value={editorMode} onValueChange={(v) => setEditorMode(v as "visual" | "html")}>
            <TabsList className={`grid w-full grid-cols-2 ${isMobile ? "h-8" : "max-w-md"}`}>
              <TabsTrigger value="visual" className={`flex items-center gap-1 sm:gap-2 ${isMobile ? "text-xs" : ""}`}>
                <EyeIcon className={`${isMobile ? "h-3 w-3" : "h-4 w-4"}`} />
                {isMobile ? "Visuell" : "Visuell Editor"}
              </TabsTrigger>
              <TabsTrigger value="html" className={`flex items-center gap-1 sm:gap-2 ${isMobile ? "text-xs" : ""}`}>
                <Code className={`${isMobile ? "h-3 w-3" : "h-4 w-4"}`} />
                {isMobile ? "HTML" : "HTML Kode"}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="visual" className="mt-3 sm:mt-4">
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">E-post innhold (Visuell editor)</Label>
                <div className="border rounded-lg overflow-hidden bg-white">
                  <style>{`
                    .quill-editor-container .ql-container {
                      min-height: ${isMobile ? "500px" : "600px"};
                    }
                    .quill-editor-container .ql-editor {
                      min-height: ${isMobile ? "460px" : "560px"};
                    }
                  `}</style>
                  <ReactQuill
                    ref={quillRef}
                    theme="snow"
                    value={getVisualEditorContent()}
                    onChange={handleVisualEditorChange}
                    modules={modules}
                    formats={formats}
                    placeholder="Skriv inn e-postinnholdet her..."
                    className="quill-editor-container"
                  />
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Bruk verktøylinjen ovenfor for å formatere teksten. Du kan bruke variabler fra listen ovenfor i
                  teksten.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="html" className="mt-3 sm:mt-4">
              <div className="space-y-2">
                <Label htmlFor="content" className="text-xs sm:text-sm">
                  E-post innhold (HTML)
                </Label>
                <Textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Skriv inn HTML-innhold..."
                  rows={isMobile ? 20 : 25}
                  className={`font-mono ${isMobile ? "text-xs" : "text-sm"}`}
                />
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Du kan bruke HTML og inline CSS for å style e-posten.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </GlassCard>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          className={`${isMobile ? "max-w-[95vw] max-h-[85vh]" : "max-w-3xl max-h-[90vh]"} overflow-y-auto`}
        >
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Forhåndsvisning av e-post</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4">
            <div>
              <Label className="text-xs sm:text-sm text-muted-foreground">Maltype:</Label>
              <p className="font-semibold text-sm sm:text-base">{currentTemplateType?.label}</p>
            </div>
            <div>
              <Label className="text-xs sm:text-sm text-muted-foreground">Emne:</Label>
              <p className="font-semibold text-sm sm:text-base">{preview.subject || "Ingen emne"}</p>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <div
                dangerouslySetInnerHTML={{ __html: preview.content }}
                className={`bg-white ${isMobile ? "text-sm" : ""}`}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Attachment Picker Dialog */}
      <AttachmentPickerDialog
        open={attachmentPickerOpen}
        onOpenChange={setAttachmentPickerOpen}
        selectedDocumentIds={attachments.map((d) => d.id)}
        onSelect={handleAddAttachments}
        companyId={activeCompanyId}
      />
    </>
  );
};
