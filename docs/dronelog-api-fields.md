# DroneLog API – Complete Field Reference

> Hentet fra DroneLog API `/api/v1/fields` endepunktet  
> Sist oppdatert: 2026-02-24

## Oversikt

DroneLog API tilbyr 200+ felter organisert i kategorier. Disse feltene kan brukes i `fields`-parameteren ved prosessering av flylogger.

**Viktig:** Feltnavn inkluderer ofte enhetssuffiks i brackets, f.eks. `OSD.altitude [m]`. CSV-responsen bruker disse fulle navnene som kolonneoverskrifter.

---

## APP

| Felt | Beskrivelse |
|---|---|
| `APP.tip` | App tip/melding |
| `APP.warn` | App advarsel |

## APPGPS

| Felt | Beskrivelse |
|---|---|
| `APPGPS.latitude` | App GPS breddegrad |
| `APPGPS.longitude` | App GPS lengdegrad |
| `APPGPS.altitude [m]` | App GPS høyde (meter) |

## BATTERY

| Felt | Beskrivelse |
|---|---|
| `BATTERY.cellVoltage1 [V]` | Celle 1 spenning |
| `BATTERY.cellVoltage2 [V]` | Celle 2 spenning |
| `BATTERY.cellVoltage3 [V]` | Celle 3 spenning |
| `BATTERY.cellVoltage4 [V]` | Celle 4 spenning |
| `BATTERY.cellVoltage5 [V]` | Celle 5 spenning |
| `BATTERY.cellVoltage6 [V]` | Celle 6 spenning |
| `BATTERY.cellVoltage7 [V]` | Celle 7 spenning (enterprise-droner) |
| `BATTERY.cellVoltage8 [V]` | Celle 8 spenning (enterprise-droner) |
| `BATTERY.cellVoltage9 [V]` | Celle 9 spenning (enterprise-droner) |
| `BATTERY.cellVoltage10 [V]` | Celle 10 spenning (enterprise-droner) |
| `BATTERY.cellVoltage11 [V]` | Celle 11 spenning (enterprise-droner) |
| `BATTERY.cellVoltage12 [V]` | Celle 12 spenning (enterprise-droner) |
| `BATTERY.cellVoltage13 [V]` | Celle 13 spenning (enterprise-droner) |
| `BATTERY.cellVoltage14 [V]` | Celle 14 spenning (enterprise-droner) |
| `BATTERY.cellVoltageDeviation [V]` | Celleavvik per rad (API-beregnet, støtter alle celleantall) |
| `BATTERY.isCellVoltageDeviationHigh` | Boolean-flagg når avvik er over terskel |
| `BATTERY.maxCellVoltageDeviation [V]` | Maks celleavvik i hele flyturen |
| `BATTERY.chargeLevel [%]` | Batterinivå (prosent) |
| `BATTERY.current [A]` | Strøm (ampere) |
| `BATTERY.currentCapacity [mAh]` | Gjeldende kapasitet |
| `BATTERY.currentPower [W]` | Gjeldende effekt |
| `BATTERY.fullCapacity [mAh]` | Full kapasitet |
| `BATTERY.life [%]` | Batterilevetid (prosent) |
| `BATTERY.loopNum` | Antall sykluser |
| `BATTERY.status` | Batteristatus |
| `BATTERY.temperature [°C]` | Batteritemperatur |
| `BATTERY.totalVoltage [V]` | Total spenning |

## BATTERY1 / BATTERY2

Samme felter som BATTERY, men for drone med dobbelt batteri.

## CALC

| Felt | Beskrivelse |
|---|---|
| `CALC.currentElevation [m]` | Kalkulert terrengelevasjon |
| `CALC.currentFlightTime [s]` | Gjeldende flytid (sekunder) |
| `CALC.currentTravelDistance [m]` | Gjeldende reisedistanse |
| `CALC.distance2D [m]` | 2D avstand fra hjemmeposisjon |
| `CALC.distance3D [m]` | 3D avstand fra hjemmeposisjon |
| `CALC.directionYaw [°]` | Retning (yaw) |
| `CALC.totalFlightTime [s]` | Total flytid (sekunder) |
| `CALC.totalTravelDistance [m]` | Total reisedistanse |

## CAMERA

| Felt | Beskrivelse |
|---|---|
| `CAMERA.fileIndex` | Filindeks |
| `CAMERA.mode` | Kameramodus |
| `CAMERA.sdCardFreeSpace [MB]` | Ledig plass på SD-kort |
| `CAMERA.sdCardTotalSpace [MB]` | Total plass på SD-kort |

## CUSTOM

| Felt | Beskrivelse |
|---|---|
| `CUSTOM.dateTime` | Dato og tid |
| `CUSTOM.distance [m]` | Avstand |
| `CUSTOM.hSpeed [m/s]` | Horisontal hastighet |
| `CUSTOM.totalTime [s]` | Total tid |
| `CUSTOM.updateTime [ms]` | Oppdateringstid |

## DETAILS

| Felt | Beskrivelse |
|---|---|
| `DETAILS.aircraftName` | Dronens navn |
| `DETAILS.aircraftSN` | Dronens serienummer |
| `DETAILS.appType` | App-type |
| `DETAILS.appVersion` | App-versjon |
| `DETAILS.batterySN` | Batteriets serienummer |
| `DETAILS.cameraSN` | Kameraets serienummer |
| `DETAILS.cityName` | Bynavn |
| `DETAILS.droneType` | Dronetype |
| `DETAILS.fcSN` | Flight controller serienummer |
| `DETAILS.gimbalSN` | Gimbal serienummer |
| `DETAILS.maxAltitude [m]` | Maks høyde |
| `DETAILS.maxDistance [m]` | Maks avstand |
| `DETAILS.maxHSpeed [m/s]` | Maks horisontal hastighet |
| `DETAILS.maxVSpeed [m/s]` | Maks vertikal hastighet |
| `DETAILS.rcSN` | Fjernkontroll serienummer |
| `DETAILS.startTime` | Starttid |
| `DETAILS.subStreet` | Undergate |
| `DETAILS.totalDistance [m]` | Total avstand |
| `DETAILS.totalTime [s]` | Total tid |

## GIMBAL

| Felt | Beskrivelse |
|---|---|
| `GIMBAL.mode` | Gimbal-modus |
| `GIMBAL.pitch [°]` | Gimbal pitch-vinkel |
| `GIMBAL.roll [°]` | Gimbal roll-vinkel |
| `GIMBAL.yaw [°]` | Gimbal yaw-vinkel |
| `GIMBAL.yawAngle [°]` | Gimbal yaw-vinkel (alternativ) |

## HOME

| Felt | Beskrivelse |
|---|---|
| `HOME.altitude [m]` | Hjemmeposisjon høyde |
| `HOME.goHomeMode` | Go-home modus |
| `HOME.goHomeStatus` | Go-home status |
| `HOME.hasGoHome` | Har go-home |
| `HOME.isBeginnerMode` | Nybegynnermodus |
| `HOME.isDynamicHomePoint` | Dynamisk hjemmeposisjon |
| `HOME.isHomeRecord` | Er hjemmeposisjon registrert |
| `HOME.isMultiMode` | Flermodus |
| `HOME.isReachedLimitDistance` | Nådd grenseavstand |
| `HOME.isReachedLimitHeight` | Nådd grensehøyde |
| `HOME.latitude` | Hjemmeposisjon breddegrad |
| `HOME.longitude` | Hjemmeposisjon lengdegrad |
| `HOME.maxAllowedHeight [m]` | Maks tillatt høyde |

## MC

| Felt | Beskrivelse |
|---|---|
| `MC.mcDeviceType` | MC enhet type |

## OSD (On-Screen Display) — Hovedkategori

| Felt | Beskrivelse |
|---|---|
| `OSD.altitude [m]` | Høyde over havet (MSL) |
| `OSD.directionYaw [°]` | Retning (yaw) |
| `OSD.droneType` | Dronetype |
| `OSD.flyTime [ms]` | Flytid i millisekunder |
| `OSD.flycCommand` | Flygkommando |
| `OSD.flycState` | Flygkontrolltilstand |
| `OSD.gpsLevel` | GPS-nivå |
| `OSD.gpsNum` | Antall GPS-satellitter |
| `OSD.groundOrSky` | Bakke eller luft |
| `OSD.hSpeed [km/h]` | Horisontal hastighet (km/t) |
| `OSD.hSpeed [m/s]` | Horisontal hastighet (m/s) |
| `OSD.height [m]` | Høyde over bakken (AGL) |
| `OSD.isGPSUsed` | GPS i bruk |
| `OSD.isGpsValid` | GPS gyldig |
| `OSD.isIMUPreheated` | IMU forvarmet |
| `OSD.isMotorUp` | Motorer startet |
| `OSD.isVisionUsed` | Vision i bruk |
| `OSD.latitude` | GPS breddegrad |
| `OSD.longitude` | GPS lengdegrad |
| `OSD.motorStartFailedCause` | Årsak til motorstartfeil |
| `OSD.nonGPSCause` | Årsak til ikke-GPS |
| `OSD.pitch [°]` | Pitch-vinkel |
| `OSD.roll [°]` | Roll-vinkel |
| `OSD.vSpeed [m/s]` | Vertikal hastighet (m/s) |
| `OSD.xSpeed [m/s]` | X-hastighet |
| `OSD.ySpeed [m/s]` | Y-hastighet |

## RC (Fjernkontroll)

| Felt | Beskrivelse |
|---|---|
| `RC.aileron` | Aileron-verdi |
| `RC.elevator` | Elevator-verdi |
| `RC.rudder` | Rudder-verdi |
| `RC.throttle` | Throttle-verdi |

## RECOVER

| Felt | Beskrivelse |
|---|---|
| `RECOVER.appType` | App-type ved gjenoppretting |
| `RECOVER.droneType` | Dronetype ved gjenoppretting |
| `RECOVER.latitude` | Gjenopprettingsposisjon breddegrad |
| `RECOVER.longitude` | Gjenopprettingsposisjon lengdegrad |

## RTK (Real-Time Kinematic)

| Felt | Beskrivelse |
|---|---|
| `RTK.isConnected` | RTK tilkoblet |
| `RTK.latitude` | RTK breddegrad |
| `RTK.longitude` | RTK lengdegrad |

## SERIAL

| Felt | Beskrivelse |
|---|---|
| `SERIAL.aircraftSN` | Dronens serienummer |

## WEATHER

| Felt | Beskrivelse |
|---|---|
| `WEATHER.temperature [°C]` | Temperatur |
| `WEATHER.windDirection [°]` | Vindretning |
| `WEATHER.windSpeed [m/s]` | Vindhastighet |

---

## Felter brukt i AviSafe-integrasjonen

Følgende felter brukes i `process-dronelog` edge-funksjonen:

| Forespurt felt | CSV-header i respons | Beskrivelse |
|---|---|---|
| `OSD.latitude` | `OSD.latitude` | GPS breddegrad |
| `OSD.longitude` | `OSD.longitude` | GPS lengdegrad |
| `OSD.altitude [m]` | `OSD.altitude [m]` | Høyde MSL |
| `OSD.height [m]` | `OSD.height [m]` | Høyde AGL |
| `OSD.flyTime [ms]` | `OSD.flyTime [ms]` | Flytid millisekunder |
| `OSD.hSpeed [m/s]` | `OSD.hSpeed [m/s]` | Hastighet m/s |
| `BATTERY.chargeLevel [%]` | `BATTERY.chargeLevel [%]` | Batterinivå |
