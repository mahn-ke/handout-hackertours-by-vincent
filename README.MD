# handout.hackertours.by.vincent.mahn.ke

Hosts the container serving [handout.hackertours.by.vincent.mahn.ke](https://handout.hackertours.by.vincent.mahn.ke).

## Query parameters

| parameter | example value | description |
| --- | --- | --- |
| `from` | Hamburg Messe (Eingang Mitte) | starting point of the tour |
| `to` | Neuer Jungfernstieg 5 | destination of the tour |
| `toLat` / `toLon` | `53.5488` / `9.9787` | optional coordinate override; the closest Geoapify address is used for routing while `to` remains the printed header |
| `arriveBy` | 2026-03-03T14:20 | desired arrival time in ISO 8601 format |
| `tourname` | Hafenrundfahrt (Anleger 7) | only changes the document title |
| `provider` | SH | public transport provider: `SH` (default) or `VRN` |
| `passphrase` | _available on request_ | requried for responses |

Coordinate overrides require `GEOAPIFY_API_KEY` in the service environment. Reverse-geocode results are cached in memory for 24 hours.

The `/generate` endpoint returns HTML by default. Send `Accept: application/pdf` to receive a PDF;
send `Accept: text/html` (or omit the header) to receive the existing HTML handout. PDF conversion
uses the internal `gotenberg:3000` Compose service, which is not published to the host.

## Examples
```
https://handout.hackertours.by.vincent.mahn.ke/generate
    ?from=Hamburg%20Messe%20(Eingang%20Mitte)
    &to=Neuer%20Jungfernstieg%205
    &arriveBy=2026-03als-03T14:20
    &tourname=Hafenrundfahrt%20(Anleger%207)
    &passphrase=madeyoulook
```
```
https://handout.hackertours.by.vincent.mahn.ke/generate
    ?from=Hamburg%20Messe%20(Eingang%20Mitte)
    &to=Fuhlsbüttler%20Strasse%20490,%2022309%20Hamburg
    &arriveBy=2026-03-06T12:00
    &tourname=Hafenrundfahrt%20(Anleger%207)
    &passphrase=ohsoclose
```