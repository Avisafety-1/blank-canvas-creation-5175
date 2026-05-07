# AviSafe – Security Documentation

**System for Operations and Safety Management for Drone Operators**

*Last updated: March 2026*

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Infrastructure & Architecture](#2-infrastructure--architecture)
3. [Authentication](#3-authentication)
4. [Authorization & Role-Based Access Control](#4-authorization--role-based-access-control)
5. [Data Isolation (Multi-Tenant)](#5-data-isolation-multi-tenant)
6. [Row Level Security (RLS)](#6-row-level-security-rls)
7. [Encryption](#7-encryption)
8. [Domain Separation](#8-domain-separation)
9. [Session Management](#9-session-management)
10. [Secrets & API Key Management](#10-secrets--api-key-management)
11. [Backend Logic (Edge Functions)](#11-backend-logic-edge-functions)
12. [File Storage](#12-file-storage)
13. [Offline Support & PWA](#13-offline-support--pwa)
14. [Push Notifications](#14-push-notifications)
15. [External Integrations](#15-external-integrations)
16. [Logging & Monitoring](#16-logging--monitoring)
17. [Data Types Stored](#17-data-types-stored)
18. [GDPR Compliance](#18-gdpr-compliance)
19. [Availability & Backups](#19-availability--backups)
20. [Updates & Maintenance](#20-updates--maintenance)
21. [Responsibility](#21-responsibility)
22. [Contact](#22-contact)

---

## 1. System Overview

AviSafe is a cloud-based platform for operations and safety management (SMS) for drone operators. The system supports:

- Flight operations and active flight tracking
- Risk assessments (SORA – Specific Operations Risk Assessment)
- Incident reporting (including ECCAIRS 2.0 integration)
- Equipment and drone registry with maintenance tracking
- Flight logs (manual and automated via DJI/DroneLog)
- Map-based situational awareness with airspace data
- Document management with expiry notifications
- Personnel competency management
- Calendar and mission planning
- Marketing and communication tools
- Push notifications
- AI-powered search and risk assessment

The system is delivered as Software as a Service (SaaS).

---

## 2. Infrastructure & Architecture

AviSafe uses the following technology components:

| Component | Technology |
|---|---|
| **Frontend** | React (TypeScript) with Vite, Tailwind CSS, shadcn/ui |
| **Backend** | Supabase (PostgreSQL 15+, Auth, Storage, Realtime) |
| **Serverless functions** | Supabase Edge Functions (Deno runtime) |
| **Database** | PostgreSQL with Row Level Security (RLS) |
| **Hosting** | Supabase Cloud (AWS-based infrastructure) |
| **Map data** | Mapbox, OpenStreetMap, OpenAIP, Kartverket |
| **Weather data** | MET (Norwegian Meteorological Institute), Open-Meteo |
| **Terrain data** | Open-Meteo Elevation API |
| **CDN/Frontend hosting** | Lovable.dev (Cloudflare-backed) |

### Architecture Diagram (Conceptual)

```
[User Browser / PWA]
        │
        ├── HTTPS/TLS 1.2+ ──→ [login.avisafe.no] (Auth pages)
        │
        ├── HTTPS/TLS 1.2+ ──→ [app.avisafe.no] (Application)
        │                              │
        │                              ├──→ [Supabase REST API] (PostgREST)
        │                              ├──→ [Supabase Auth]
        │                              ├──→ [Supabase Realtime] (WebSocket)
        │                              ├──→ [Supabase Storage]
        │                              └──→ [Supabase Edge Functions]
        │                                          │
        │                                          ├──→ SafeSky API
        │                                          ├──→ DroneLog API
        │                                          ├──→ DJI FlightHub
        │                                          ├──→ Meta Graph API
        │                                          ├──→ OpenAIP API
        │                                          ├──→ ECCAIRS E2 Gateway
        │                                          ├──→ OpenAI API
        │                                          └──→ SMTP (Email)
        │
        └── [Service Worker] (Offline cache, push notifications)
```

---

## 3. Authentication

AviSafe uses **Supabase Auth** for all authentication.

### Supported Authentication Methods

| Method | Description |
|---|---|
| **Email & Password** | Standard registration with email confirmation |
| **Google OAuth** | Sign in via Google account |
| **Magic Link** | Passwordless email-based login |
| **Password Reset** | Two-step verification flow resistant to email link scanners |

### Security Measures

- **Passwords are never stored in plaintext** — Supabase Auth uses bcrypt hashing
- **Email confirmation required** — New accounts must verify their email address
- **Approval workflow** — After registration and email verification, an administrator must approve the user before they gain access to the platform. Users with `approved = false` in their profile are blocked from accessing application features
- **OAuth redirect validation** — OAuth callbacks are validated before processing
- **Session tokens** — JWT-based session tokens with automatic refresh
- **Auto-refresh** — Tokens are automatically refreshed before expiry

---

## 4. Authorization & Role-Based Access Control

### Role System

AviSafe implements a **dedicated role table** (`user_roles`) separate from user profiles, following security best practices to prevent privilege escalation attacks.

#### Defined Roles

| Role | Enum Value | Description |
|---|---|---|
| **User** | `bruker` | Standard user with access to their company's data |
| **Administrator** | `administrator` | Company administrator with user management capabilities |
| **Super Admin** | `superadmin` | Platform-wide administrator with cross-company access |

#### Role Storage

```sql
-- Role enum type
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user', 'superadmin', 'administrator', 'bruker');

-- Dedicated roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    UNIQUE (user_id, role)
);
```

#### Role Checking (Server-Side)

Roles are **always verified server-side** using `SECURITY DEFINER` functions that bypass RLS to prevent recursive policy evaluation:

```sql
-- Check if user has a specific role
CREATE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Check superadmin status
CREATE FUNCTION public.is_superadmin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'superadmin'
  )
$$;

-- Get user's role
CREATE FUNCTION public.get_user_role(_user_id UUID)
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::TEXT FROM public.user_roles
  WHERE user_id = _user_id LIMIT 1
$$;
```

> **Critical Security Note:** Admin status is **never** checked via client-side storage (localStorage, sessionStorage) or hardcoded credentials. All authorization decisions are enforced at the database level via RLS policies that call these `SECURITY DEFINER` functions.

#### Client-Side Role Check (UI Only)

The frontend uses `useAdminCheck` hook which calls `supabase.rpc('has_role', ...)` — this executes the server-side function and is used **only for UI rendering decisions**, not for security enforcement.

---

## 5. Data Isolation (Multi-Tenant)

AviSafe is a **multi-tenant** system where all data is strictly isolated between organizations.

### Isolation Mechanism

Every data table includes a `company_id` column that references the `companies` table. A `SECURITY DEFINER` function retrieves the current user's company:

```sql
CREATE FUNCTION public.get_user_company_id(_user_id UUID)
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles
  WHERE id = _user_id
$$;
```

### Isolation Guarantees

- Users can **only read and write data belonging to their own company**
- Direct REST API calls (bypassing the UI) are **equally restricted** by RLS
- Superadmins have controlled cross-company access for platform administration
- Join tables (e.g., `mission_drones`, `mission_equipment`, `mission_personnel`) are secured via subquery joins on the parent table's `company_id`

---

## 6. Row Level Security (RLS)

**All tables** in the database have Row Level Security (RLS) enabled.

### Policy Pattern

```sql
-- Typical RLS policy for data tables
CREATE POLICY "Users can view own company data"
ON public.some_table
FOR SELECT
TO authenticated
USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can insert own company data"
ON public.some_table
FOR INSERT
TO authenticated
WITH CHECK (company_id = get_user_company_id(auth.uid()));
```

### Join Table Security

Join tables without a direct `company_id` are secured via subqueries:

```sql
-- Example: mission_drones secured via missions table
CREATE POLICY "Users can view mission drones"
ON public.mission_drones
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.missions
    WHERE missions.id = mission_drones.mission_id
    AND missions.company_id = get_user_company_id(auth.uid())
  )
);
```

### Secure Database Views

Views that expose filtered data use `security_invoker = on` to ensure they respect the underlying table's RLS policies:

```sql
CREATE VIEW eccairs_integrations_safe
WITH (security_invoker = on)
AS SELECT ... FROM eccairs_integrations;

CREATE VIEW email_settings_safe
WITH (security_invoker = on)
AS SELECT ... FROM email_settings;
```

---

## 7. Encryption

### Encryption in Transit

All traffic is secured with **HTTPS / TLS 1.2+**:

| Connection | Protocol |
|---|---|
| User ↔ AviSafe Frontend | HTTPS/TLS 1.2+ |
| Frontend ↔ Supabase API | HTTPS/TLS 1.2+ |
| Edge Functions ↔ External APIs | HTTPS/TLS 1.2+ |
| Realtime WebSocket | WSS (TLS-encrypted) |

### Encryption at Rest

- **Database:** Supabase uses AES-256 disk encryption on all PostgreSQL volumes
- **File Storage:** Supabase Storage buckets use encrypted cloud storage (AWS S3 with server-side encryption)
- **Backups:** All automated backups are encrypted at rest
- **Sensitive fields:** Certain fields (e.g., `dji_password_encrypted`, `e2_client_secret_encrypted`) are encrypted at the application level before storage

---

## 8. Domain Separation

In production, AviSafe uses **separate domains** for authentication and application:

| Domain | Purpose |
|---|---|
| `login.avisafe.no` | Authentication pages (login, registration, password reset) |
| `app.avisafe.no` | Main application (requires authentication) |

### DomainGuard

A `DomainGuard` React component enforces domain-based routing:

- **Authenticated users on `login.avisafe.no`** → Redirected to `app.avisafe.no`
- **Unauthenticated users on `app.avisafe.no`** → Redirected to `login.avisafe.no`
- **Offline users** → No redirect (they may be using cached PWA content)
- **OAuth callback pages** → Exempted from redirect to allow OAuth flow completion

---

## 9. Session Management

### Idle Timeout

AviSafe implements an **automatic idle timeout** to protect unattended sessions:

| Parameter | Value |
|---|---|
| **Warning shown after** | 55 minutes of inactivity |
| **Auto-logout after** | 60 minutes of inactivity |
| **Countdown timer** | 5 minutes (300 seconds) |
| **Exception** | Active flights bypass idle timeout |

### Activity Detection

User activity is tracked via the following DOM events:
- `mousemove`, `keydown`, `scroll`, `touchstart`, `click`

Activity timestamps are synchronized across browser tabs via `localStorage`.

### Session Persistence

- Sessions are persisted in `localStorage` for PWA/offline support
- JWT tokens are automatically refreshed by the Supabase client
- Profile data is cached locally for fast loading with background revalidation

---

## 10. Secrets & API Key Management

### Principle

**No private API keys are stored in frontend code.** Only publishable/anonymous keys (Supabase anon key, Mapbox public token, VAPID public key) are exposed to the client.

### Secret Storage

All sensitive credentials are stored in **Supabase environment variables** (Edge Function secrets):

| Secret | Purpose |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin operations |
| `VAPID_PRIVATE_KEY` | Push notification signing |
| `OPENAI_API_KEY` | AI-powered features |
| `SAFESKY_API_KEY` | Air traffic data |
| `SAFESKY_HMAC_SECRET` | SafeSky HMAC authentication |
| `OPENAIP_API_KEY` | Airspace data |
| `FACEBOOK_PAGE_TOKEN` | Facebook publishing |
| `INSTAGRAM_ACCESS_TOKEN` | Instagram publishing |
| `DJI_ENCRYPTION_KEY` | DJI credential encryption |
| SMTP credentials | Email delivery (per-company) |

### Access Pattern

```
[Client] → HTTPS → [Edge Function] → reads secret from env → [External API]
```

The client never has access to private keys. Edge Functions act as secure proxies.

---

## 11. Backend Logic (Edge Functions)

Server-side functionality is handled by **47 Supabase Edge Functions** running in isolated Deno runtimes.

### JWT Verification Configuration

| Setting | Functions | Purpose |
|---|---|---|
| `verify_jwt = true` | `ai-risk-assessment`, `ai-search`, `drone-regulations-ai`, `marketing-ai`, `marketing-visual`, `push-subscribe` | User-initiated actions requiring authentication |
| `verify_jwt = false` | Cron jobs, webhooks, email handlers, public endpoints | Automated/system-triggered functions |

### Security Properties

- **Isolated runtime** — Each function runs in its own Deno isolate
- **No direct database exposure** — Functions use the service role key server-side only
- **CORS headers** — All functions include proper CORS configuration
- **Input validation** — Request payloads are validated before processing

### Key Function Categories

| Category | Examples |
|---|---|
| **Email** | `send-notification-email`, `send-user-welcome-email`, `invite-user` |
| **Cron/Scheduled** | `check-document-expiry`, `check-maintenance-expiry`, `auto-complete-missions` |
| **AI** | `ai-risk-assessment`, `ai-search`, `drone-regulations-ai` |
| **Integrations** | `safesky-beacons`, `process-dronelog`, `dji-auto-sync` |
| **Publishing** | `publish-facebook`, `publish-instagram`, `publish-scheduled` |
| **Push** | `push-subscribe`, `send-push-notification` |

---

## 12. File Storage

### Storage Configuration

AviSafe uses **Supabase Storage** with private buckets:

| Bucket | Access | Purpose |
|---|---|---|
| `documents` | **Private** | Company documents, certificates, checklists |

### Security Measures

- **Company-isolated paths:** Files are stored under `{company_id}/...` paths
- **RLS-protected:** Storage policies enforce company isolation
- **Signed URLs:** Document access uses time-limited signed URLs (not public URLs)
- **No direct public access:** All file access requires authentication and authorization

---

## 13. Offline Support & PWA

AviSafe is a **Progressive Web Application (PWA)** with offline capabilities.

### Service Worker

- Built with **Workbox** for reliable caching strategies
- **Cache-first** for static assets (JS, CSS, images)
- **Network-first** for API calls with fallback to cached data
- **TTL-based cache expiry** to ensure data freshness

### Offline Queue

When the user is offline, data mutations (creates, updates) are:

1. Queued in `localStorage` (via `offlineQueue.ts`)
2. Synced to the server when connectivity is restored
3. Conflicts are handled with server-wins strategy

### Offline Indicators

- Visual offline banner when connectivity is lost
- Online/offline indicator in the UI
- Network status monitoring via `useNetworkStatus` hook

---

## 14. Push Notifications

### Implementation

- **Web Push API** with VAPID (Voluntary Application Server Identification)
- Push subscriptions stored in `push_subscriptions` table
- Server-side notification delivery via Edge Function

### Security

- VAPID keys ensure only AviSafe can send notifications
- Subscriptions are company-scoped
- Invalid/expired subscriptions are automatically cleaned up (410 Gone handling)
- Push payloads are encrypted end-to-end per the Web Push standard

---

## 15. External Integrations

| Integration | Data Shared | Purpose | Security |
|---|---|---|---|
| **SafeSky** | Location, altitude | Air traffic awareness | HMAC-signed requests, API key server-side |
| **DroneLog API** | Flight log data | Automated flight log import | API key per company, stored server-side |
| **DJI FlightHub** | DJI credentials, flight data | DJI flight log sync | Credentials encrypted at rest, processed server-side |
| **Meta Graph API** | Marketing content | Facebook/Instagram publishing | OAuth tokens stored server-side |
| **OpenAIP** | None (read-only) | Airspace data | API key server-side |
| **ECCAIRS E2** | Incident reports | Regulatory incident reporting | OAuth client credentials, server-side only |
| **Open-Meteo** | Coordinates | Weather & terrain data | Public API, no credentials |
| **MET (yr.no)** | Coordinates | Norwegian weather data | Public API, no credentials |
| **SSB** | None (read-only) | Statistical data layers | Public data |
| **Miljødirektoratet** | None (read-only) | Environmental restriction zones | Public WMS/WFS |
| **Kartverket** | None (read-only) | Norwegian map tiles & geodata | Public API |
| **OpenAI** | Anonymized prompts | AI risk assessment, search, regulations | API key server-side, no PII sent |
| **Mapbox** | Map tile requests | Map rendering | Public token (client-side, read-only) |

### Data Minimization

Only **necessary data** is shared with third-party services. Personal identifiable information (PII) is not transmitted to external APIs unless explicitly required for the integration's purpose.

---

## 16. Logging & Monitoring

### Application Logging

| Layer | What is logged |
|---|---|
| **Edge Functions** | API responses, errors, push notification results |
| **Platform Activity Log** | Admin actions, user management events (via `platform-activity-log` function) |
| **Supabase Dashboard** | Database queries, auth events, function invocations |
| **Client Console** | Domain guard decisions, auth state changes, offline/online transitions |

### Incident Tracking

- Incidents are stored in the `incidents` table with full audit trail
- ECCAIRS export history tracked in `eccairs_exports` with status and error logging

### Capabilities

- Identify and diagnose errors
- Analyze security events
- Monitor system usage patterns
- Track user approval and role changes

---

## 17. Data Types Stored

| Data Category | Examples | Sensitivity |
|---|---|---|
| **User Profiles** | Name, email, phone, role | Personal data |
| **Organization Data** | Company name, address, org number | Business data |
| **Flight Operations** | Active flights, flight logs, routes | Operational data |
| **Drone/Equipment** | Serial numbers, maintenance schedules, inspections | Asset data |
| **Documents** | Certificates, checklists, manuals | Business documents |
| **Incidents** | Incident reports, ECCAIRS attributes | Safety data |
| **Missions** | Planning data, risk assessments, locations | Operational data |
| **Calendar Events** | Dates, descriptions | Scheduling data |
| **Personnel Competencies** | Certifications, expiry dates | Personal data |
| **Marketing Content** | Drafts, visuals, publishing history | Business content |
| **Push Subscriptions** | Endpoint URLs, encryption keys | Technical data |
| **Credentials** | DJI passwords (encrypted), API keys (encrypted) | Sensitive credentials |

---

## 18. GDPR Compliance

### Legal Basis

AviSafe processes personal data based on:

- **Contractual necessity** (Art. 6(1)(b)) — Processing required to fulfill the SaaS service agreement
- **Legitimate interest** (Art. 6(1)(f)) — Safety management, regulatory compliance
- **Legal obligation** (Art. 6(1)(c)) — Aviation safety reporting requirements

### Data Minimization

- Only data necessary for operations and safety management is collected
- No tracking pixels, behavioral analytics, or advertising data collection
- External API calls include only the minimum required data

### Data Subject Rights

| Right | Implementation |
|---|---|
| **Right of Access** | Users can view all their data within the application |
| **Right to Rectification** | Users can edit their profile and operational data |
| **Right to Erasure** | Admin can delete users via `admin-delete-user` Edge Function; `ON DELETE CASCADE` ensures all related data is removed |
| **Right to Data Portability** | Flight logs, incidents, and documents can be exported (PDF, KMZ formats) |
| **Right to Restriction** | Administrators can deactivate users (set `approved = false`) |

### Data Retention

- Active data is retained for the duration of the service agreement
- User deletion cascades through all related records via PostgreSQL foreign key constraints:
  - `ON DELETE CASCADE` — Related records are automatically deleted
  - `ON DELETE SET NULL` — References are nullified where appropriate
- Automated backups follow Supabase's retention policy

### Data Processing Agreements

- **Supabase** acts as a data processor (DPA available via Supabase)
- **External integrations** process data only as necessary for specific functions
- Company-specific SMTP settings allow organizations to use their own email infrastructure

### Cross-Border Transfers

- Supabase Cloud infrastructure is hosted on **AWS** (region-specific)
- Data transfer safeguards follow Supabase's compliance framework (SOC 2 Type II)

---

## 19. Availability & Backups

### Supabase Infrastructure

| Feature | Details |
|---|---|
| **Redundancy** | Multi-AZ PostgreSQL deployment |
| **High Availability** | Automatic failover |
| **Automated Backups** | Daily database backups |
| **Point-in-Time Recovery** | Available on Supabase Pro plan |
| **Uptime SLA** | Per Supabase service agreement |

### Application Resilience

- **PWA offline mode** — Application remains functional during connectivity issues
- **Offline queue** — Data mutations are queued and synced when connectivity returns
- **Cached map data** — Map tiles and airspace data cached for offline use
- **Force reload mechanism** — Version-based cache busting ensures users get latest updates

---

## 20. Updates & Maintenance

### Update Process

- The system is **continuously updated** via the Lovable.dev development platform
- Updates include security patches, improvements, and new features
- **Changelog** — All changes are tracked in the in-app changelog (`changelog_entries` table)
- **System status** — Operational status of subsystems visible via `changelog_systems` table
- **Maintenance mode** — Configurable maintenance banner via `changelog_maintenance` table

### Dependency Management

- Frontend dependencies are regularly audited for security vulnerabilities
- Supabase Edge Functions use pinned dependency versions
- Security updates are prioritized and deployed promptly

---

## 21. Responsibility

AviSafe is developed and operated by:

**AviSafe AS**

The platform is built on Lovable.dev with Supabase as the backend infrastructure provider.

---

## 22. Contact

**Gard Haug-Hansen**
CEO – AviSafe

📧 kontakt@avisafe.no
🌐 https://avisafe.no
