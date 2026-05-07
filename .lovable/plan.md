## Revidert plan — behold frekvenser, fjern de unødvendige DB-kallene

Du har rett: vi må beholde rytmen for å oppfylle SafeSky-kravene og holde live-kart oppdatert.

- `safesky-cron-refresh` (50s): nødvendig for advisory-push til SafeSky → **uendret**
- `safesky-beacons-norway` (10s): nødvendig for at fly skal bevege seg jevnt på kartet → **uendret**

Det reelle problemet er ikke frekvensen, men at hver kjøring gjør **dyre, unødvendige DB-operasjoner**, særlig DELETE uten indeks.

## Endringer

### 1. Indeks på `safesky_beacons.updated_at` (migration)
DELETE `WHERE updated_at < cutoff` gjør i dag full table scan hvert 10s.
```sql
CREATE INDEX IF NOT EXISTS idx_safesky_beacons_updated_at
  ON public.safesky_beacons (updated_at);
```
Dette alene bør fjerne mesteparten av CPU-trykket.

### 2. Skip cleanup-DELETE når det ikke er noe å rydde
I `safesky-beacons-fetch`: i dag kjøres `DELETE ... lt('updated_at', cutoff)` ubetinget hver 10s, selv når tabellen nettopp er tømt.

Endring: kall DELETE kun når vi nettopp har upserted beacons (eller maks hvert 60s ved tom tabell). Reduserer write-load betydelig under stille perioder.

### 3. Skip heartbeat/active_flights-sjekk når funksjonen ble kalt fra cron AND nylig hadde 0 viewers
Mindre vinning, men cacher resultatet 30s i en liten `safesky_runtime_state`-rad så vi unngår 2 SELECT hvert 10. sek når ingen ser på kartet.

### 4. Indeks-sjekk på `map_viewer_heartbeats.last_seen`
Allerede finnes (`idx_map_viewer_heartbeats_last_seen`, 668k scans) — OK, ingen endring.

### 5. Behold `safesky-cron-refresh` (50s) urørt
Den kjører `No active flights - skipping beacon fetch` raskt når ingen flyr, så den er allerede billig. Eneste forbedring: del indeks-fordel fra punkt 1.

## Tekniske detaljer

**Filer**
- Ny migration: indeks på `safesky_beacons.updated_at`
- `supabase/functions/safesky-beacons-fetch/index.ts`: betinget DELETE + tidlig retur uten DELETE når ingenting endret seg

**Ingen endring i**
- Cron-frekvens (10s / 50s beholdes)
- Klient-side polling/realtime
- SafeSky API-kall

## Forventet effekt
- DELETE går fra full scan på `safesky_beacons` → indeksoppslag (10–100× raskere)
- Antall write-operasjoner per minutt mot `safesky_beacons` faller drastisk når ingen er aktive
- CPU-spiker som den 13:48 bør forsvinne uten å påvirke live-kart eller SafeSky-compliance
