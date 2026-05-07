# DroneLog API Reference

> Kilde: https://dronelogapi.com/docs  
> Sist oppdatert: 2026-02-23

## Oversikt

DroneLog API er en REST API for parsing og behandling av DJI drone-flylogger. Den konverterer DJI flylogg-filer (TXT/ZIP) til strukturert CSV-data.

**Base URL:** `https://dronelogapi.com/api/v1`

---

## Autentisering

Alle forespørsler krever en Bearer token i `Authorization`-headeren:

```
Authorization: Bearer <din-api-nøkkel>
```

---

## Endepunkter

### 1. API-nøkler

#### Liste API-nøkler
```
GET /api/v1/keys
```

**Respons:**
```json
{
  "statusCode": 200,
  "message": "Success",
  "result": [
    {
      "key": "abc123...",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### Opprett API-nøkkel
```
POST /api/v1/keys
```

#### Slett API-nøkkel
```
DELETE /api/v1/keys/{key}
```

---

### 2. DJI-konto

#### Hent DJI-konto-ID
```
POST /api/v1/accounts/dji
```

**Body:**
```json
{
  "email": "bruker@eksempel.no",
  "password": "ditt-dji-passord"
}
```

> **Merk:** E-post og passord sendes direkte til DJI og lagres ikke av DroneLog.

**Respons:**
```json
{
  "statusCode": 200,
  "message": "Success",
  "result": {
    "accountId": "123456789"
  }
}
```

---

### 3. Flylogg-felter

#### Liste alle tilgjengelige felter
```
GET /api/v1/fields
```

**Respons:**
```json
{
  "statusCode": 200,
  "message": "Success",
  "result": [
    "OSD.latitude",
    "OSD.longitude",
    "OSD.altitude",
    "OSD.flyTimeMilliseconds",
    "OSD.speed",
    "OSD.height",
    "BATTERY.chargeLevel",
    "GIMBAL.pitch",
    "GIMBAL.roll",
    "GIMBAL.yaw"
  ]
}
```

#### Hent metadata for ett felt
```
GET /api/v1/fields/{fieldName}
```

**Eksempel:** `GET /api/v1/fields/OSD.latitude`

---

### 4. Flylogger - Prosessering

#### Prosesser flylogg fra URL
```
POST /api/v1/logs
```

**Body:**
```json
{
  "url": "https://eksempel.no/flylogg.txt",
  "fields": ["OSD.latitude", "OSD.longitude", "OSD.altitude", "OSD.flyTimeMilliseconds"]
}
```

**Respons:** CSV-data med valgte felter.

#### Last opp flylogg-fil
```
POST /api/v1/logs/upload
```

**Body:** `multipart/form-data`
- `file`: Flylogg-fil (TXT eller ZIP, DJI-format)
- `fields`: Kommaseparert liste over ønskede felter

**JavaScript-eksempel:**
```javascript
const formData = new FormData();
formData.append('file', flyloggFil);
formData.append('fields', 'OSD.latitude,OSD.longitude,OSD.altitude,OSD.flyTimeMilliseconds');

const response = await fetch('https://dronelogapi.com/api/v1/logs/upload', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <din-api-nøkkel>'
  },
  body: formData
});

const csvData = await response.text();
```

---

### 5. Flylogger - Liste (DJI-konto)

#### Liste flylogger for en DJI-konto
```
GET /api/v1/logs/{accountId}
```

**Query-parametere:**
| Parameter | Type | Beskrivelse |
|---|---|---|
| `page` | number | Sidenummer (paginering) |
| `limit` | number | Antall per side |

**Respons:**
```json
{
  "statusCode": 200,
  "message": "Success",
  "result": {
    "logs": [
      {
        "id": "log-id",
        "date": "2024-01-01",
        "duration": 600,
        "aircraft": "DJI Mavic 3"
      }
    ],
    "total": 42,
    "page": 1,
    "limit": 10
  }
}
```

---

### 6. API-bruk

#### Hent bruksstatistikk
```
GET /api/v1/usage
```

**Query-parametere:**
| Parameter | Type | Beskrivelse |
|---|---|---|
| `startDate` | string | Startdato (YYYY-MM-DD) |
| `endDate` | string | Sluttdato (YYYY-MM-DD) |
| `page` | number | Sidenummer |
| `limit` | number | Antall per side |

---

## Respons-format

Alle responser følger dette mønsteret:

```json
{
  "statusCode": 200,
  "message": "Success",
  "result": { ... }
}
```

### Feilkoder

| Kode | Beskrivelse |
|---|---|
| 200 | Suksess |
| 400 | Ugyldig forespørsel |
| 401 | Ikke autorisert (manglende/ugyldig token) |
| 404 | Ressurs ikke funnet |
| 500 | Serverfeil |

---

## Støttede filformater

- **TXT** — Standard DJI flylogg-format
- **ZIP** — Komprimert DJI flylogg

---

## Nyttige felter for AviSafe-integrasjon

> **Viktig:** Feltnavn inkluderer enhetssuffiks i brackets. CSV-responsen bruker disse fulle navnene som kolonneoverskrifter. Se `docs/dronelog-api-fields.md` for komplett feltliste.

| Felt | Beskrivelse |
|---|---|
| `OSD.latitude` | GPS breddegrad |
| `OSD.longitude` | GPS lengdegrad |
| `OSD.altitude [m]` | Høyde (MSL) i meter |
| `OSD.height [m]` | Høyde over bakken (AGL) i meter |
| `OSD.flyTime [ms]` | Flytid i millisekunder |
| `OSD.hSpeed [m/s]` | Horisontal hastighet (m/s) |
| `OSD.hSpeed [km/h]` | Horisontal hastighet (km/t) |
| `OSD.vSpeed [m/s]` | Vertikal hastighet (m/s) |
| `BATTERY.chargeLevel [%]` | Batterinivå (prosent) |
| `GIMBAL.pitch [°]` | Gimbal pitch-vinkel |
| `GIMBAL.roll [°]` | Gimbal roll-vinkel |
| `GIMBAL.yaw [°]` | Gimbal yaw-vinkel |
