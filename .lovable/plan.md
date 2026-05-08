## Hvorfor Aikido treffer produksjon

Aikido-loggen viser ikke bare feil backend — den viser at agenten faktisk er på `app.avisafe.no` og bruker produksjons-Supabase `pmucsvrypogtttrajqxq.supabase.co`.

Det kan skje av to grunner:

1. **Aikido har fortsatt `app.avisafe.no` i scope/allowed domains/test-oppsett** fra tidligere assessment.
2. **Pentest-domenet redirecter til produksjon etter auth-flow**, fordi `src/config/domains.ts` hardkoder `APP_DOMAIN = 'app.avisafe.no'`, og `pentest.avisafe.no` regnes ikke som preview/dev/test-domene.

Viktig: Hvis agenten virkelig startet på `pentest.avisafe.no`, men senere havner på `app.avisafe.no`, må vi endre domenelogikken. Hvis den starter direkte på `app.avisafe.no`, må Aikido-scope ryddes.

## Plan

1. **Rydd Aikido-oppsettet først**
   - Fjern `app.avisafe.no` fra Scope, Allowed Domains og eventuelle lagrede login/test-user flows.
   - Behold kun:
     - `https://pentest.avisafe.no`
     - `https://uxubtwvcplkfifwoncgj.supabase.co`
   - Start helst en helt ny assessment, ikke resume av den gamle, så gamle scope-data ikke gjenbrukes.

2. **Endre appens domenelogikk for pentest-miljø**
   - Legg til `pentest.avisafe.no` som test-/same-origin-domene i `src/config/domains.ts`.
   - Sørg for at `getAppUrl()` og `redirectToApp()` returnerer relative paths på `pentest.avisafe.no`, ikke `https://app.avisafe.no/...`.
   - Behold dagens produksjonsoppførsel for `login.avisafe.no` og `app.avisafe.no`.

3. **Sjekk auth-redirects**
   - Gå gjennom `Auth.tsx` for hardkodede `https://app.avisafe.no/auth` og `https://login.avisafe.no/auth`.
   - For `pentest.avisafe.no` skal OAuth/email/auth callbacks holde seg på `pentest.avisafe.no` der det er relevant.
   - Produksjon skal fortsatt bruke split-domain flow: `login.avisafe.no` → `app.avisafe.no`.

4. **Verifiser før ny pentest**
   - Åpne `https://pentest.avisafe.no/auth` i inkognito.
   - Logg inn med testbruker.
   - Bekreft at URL fortsatt er `pentest.avisafe.no`.
   - Bekreft at Network viser `uxubtwvcplkfifwoncgj.supabase.co`, ikke `pmucsvrypogtttrajqxq.supabase.co`.

## Teknisk endring

Primært i `src/config/domains.ts`:

```ts
const TEST_DOMAINS = ['pentest.avisafe.no'];

export const isTestDomain = () => TEST_DOMAINS.includes(window.location.hostname);

export const isDevelopment = () => {
  const hostname = window.location.hostname;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.includes('lovableproject.com') ||
    hostname.endsWith('.lovable.app') ||
    isTestDomain()
  );
};
```

Deretter justeres eventuelle auth-redirects som fortsatt hardkoder produksjonsdomener.

## Anbefaling

Ja: dette bør fikses før du kjører Aikido igjen. Ellers risikerer du at pentesten enten feiler login eller begynner å teste produksjon ved et uhell.