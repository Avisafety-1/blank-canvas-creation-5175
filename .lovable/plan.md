# Pentest-forberedelse av TESTMILJØ AviSafe v2

Mål: Behold all data-struktur og operasjonell historikk i TESTMILJØ Supabase (`uxubtwvcplkfifwoncgj`), men erstatt all PII med fake-verdier, fjern tredjepartstokens, tøm fil-buckets, og opprett nye testbrukere på alle nivåer.

**Påvirker IKKE produksjon.** Alt skjer kun mot TESTMILJØ.

---

## Steg 1 — Backup-snapshot (manuelt, anbefalt)

Før noe slettes/endres: ta en database-backup i Supabase-dashbordet for TESTMILJØ slik at du kan rulle tilbake hvis noe går galt.
- Supabase → Database → Backups → "Create backup"

## Steg 2 — Anonymisering av PII (SQL-migrasjon)

Erstatter persondata in-place med deterministiske fake-verdier basert på row-id, slik at relasjoner forblir intakte og operasjonell historikk er realistisk.

**Tabeller som anonymiseres:**
- `profiles` — `email`, `full_name`, `phone`, `signature_url`, `address` → fake
- `companies` — `name`, `org_number`, `contact_email`, `contact_phone`, `address` → fake (selskapsnavn blir "Testbedrift 1", "Testbedrift 2" osv.)
- `customers` — `name`, `email`, `phone`, `contact_person`, `org_number` → fake
- `incidents` — `reporter_name`, `reporter_email`, `reporter_phone`, `description`/`narrative` → scrub
- `incident_comments` — `comment` → "[anonymisert]"
- `mission_personnel` — fritekst-felter scrubbes
- `personnel_competencies` — sertifikatnumre scrubbes
- `drone_personnel` — fritekst scrubbes
- `notification_preferences` — kontakt-felter scrubbes
- `marketing_drafts`, `marketing_content_ideas`, `bulk_email_campaigns`, `newsletter_broadcasts`, `weekly_report_sends` → tømmes (innhold + mottakere)
- `email_templates`, `email_template_attachments` → tømmes
- `revenue_calculator_scenarios` → tømmes
- `app_config` (kontakt-info) → scrubbes

**Bevares som er** (operasjonell historikk for realisme):
- `missions`, `flight_logs`, `flight_events`, `drone_telemetry`, `drone_log_entries`, `equipment_log_entries`, `personnel_log_entries`
- `drones`, `equipment`, `drone_models`, `drone_accessories`, `drone_documents`, `drone_inspections`
- Geo-data: `aip_restriction_zones`, `nsm_restriction_zones`, `vern_restriction_zones`, `naturvern_zones`, `rpas_5km_zones`, `rpas_ctr_tiz`, `notams`, `openaip_obstacles`, `terrain_elevation_cache`
- Hierarki: `user_companies`, `company_mission_roles`, `drone_department_visibility`, `equipment_department_visibility`

## Steg 3 — Slett tredjepartstokens (SQL)

Sletter rader i:
- `company_fh2_credentials` (alle FH2-tokens)
- `dji_credentials`
- `eccairs_integrations`
- `linkedin_tokens`
- `dronetag_devices`, `dronetag_positions`
- `safesky_beacons`
- `passkeys` (WebAuthn — pentester bør lage egne)
- `push_subscriptions`

**I tillegg** bør edge function-secrets som peker på prod-API-nøkler roteres manuelt etter at planen er kjørt:
- `RESEND_API_KEY`, `OPENAI_API_KEY`, `OPENAIP_API_KEY`, `BARENTSWATCH_*`, `STRIPE_SECRET_KEY`, `SENTRY_DSN`, `NINOX_*`, `META_*`, `LINKEDIN_*`
- Vurder å sette dem til test/sandbox-verdier eller fjerne dem helt under pentest.

Jeg lister opp eksisterende secrets etter at planen er godkjent slik at vi vet nøyaktig hvilke som finnes i TESTMILJØ.

## Steg 4 — Tøm storage buckets (SQL via storage.objects)

Sletter alle filer (men beholder bucket-definisjonene + RLS-policies):
- `documents`
- `logbook-images`
- `signatures` (hvis finnes)
- `mission-documents`, `drone-documents`, `incident-attachments` (alle øvrige buckets oppdaget i prosjektet)

Vi enumererer faktiske buckets med `SELECT id FROM storage.buckets` og sletter `storage.objects` per bucket.

## Steg 5 — Slett alle eksisterende auth-brukere

Bruker en SECURITY DEFINER-funksjon som sletter alt fra `auth.users` (cascade fjerner sessions, refresh_tokens, identities, mfa_factors osv.).
- `profiles`, `user_roles`, `user_companies` rader peker på user_id med `ON DELETE SET NULL`/`CASCADE` — disse renses tilsvarende.

## Steg 6 — Opprett nye testbrukere

Lager 6 brukere via en SECURITY DEFINER-funksjon som inserter direkte i `auth.users` (med kryptert passord) + `profiles` + `user_roles` + `user_companies`.

| E-post | Passord | Rolle | Selskap |
|---|---|---|---|
| `superadmin@pentest.test` | `Pentest!Super2026` | superadmin | Testbedrift 1 |
| `admin-a@pentest.test` | `Pentest!AdminA26` | admin | Testbedrift 1 |
| `user-a@pentest.test` | `Pentest!UserA26` | user | Testbedrift 1 |
| `admin-b@pentest.test` | `Pentest!AdminB26` | admin | Testbedrift 2 |
| `user-b@pentest.test` | `Pentest!UserB26` | user | Testbedrift 2 |
| `user-sub@pentest.test` | `Pentest!Sub26` | user | Testbedrift 1 → Underavd. |

Hierarki: Testbedrift 1 har en sub-department slik at pentester kan teste `get_user_visible_company_ids()`-cross-access mellom parent og child.

E-poster bekreftes automatisk (`email_confirmed_at = now()`) så det går ikke ut e-post fra TESTMILJØ.

## Steg 7 — Verifisering

Etter migrasjonen kjører jeg lese-spørringer for å bekrefte:
- Antall brukere i `auth.users` = 6
- 0 rader i `*_credentials`/`linkedin_tokens`/`dji_credentials`/`eccairs_integrations`
- 0 rader i `storage.objects`
- Stikkprøver på `profiles.email`, `companies.name`, `customers.name` viser fake-data
- `missions`, `flight_logs` antall = uendret (struktur intakt)

## Tekniske detaljer

- Alt kjøres via **én database-migrasjon** (ikke insert-tool) fordi det inneholder DELETE-er på auth-skjemaet som krever SECURITY DEFINER-funksjon.
- Anonymisering bruker `md5(id::text)` for å lage deterministiske fake-strenger, slik at relasjoner og søk fortsatt gir mening.
- Funksjoner som røres i `auth`-skjemaet kjøres som engangs-funksjoner (DROP etter bruk) for å ikke etterlate angrepsflate til pentester.
- TEST-tabellen fra forrige steg beholdes inntil videre som markør på at vi er i TESTMILJØ.

## Etter planen

Du må selv:
1. **Rotere/fjerne edge function secrets** (Cloud → Secrets) — jeg viser deg listen
2. **Slå av cron jobs** under pentest hvis du vil unngå støy: `SELECT cron.unschedule(...)` på NOTAM sync osv.
3. **Vurder å disable e-postutsending** i Supabase Auth settings (slik at pentest-aktivitet ikke spammer ekte e-poster)
4. Lever testbruker-credentials + scope til pentester
