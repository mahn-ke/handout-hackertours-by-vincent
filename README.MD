# handout.hackertours.by.vincent.mahn.ke

Hosts the container serving [handout.hackertours.by.vincent.mahn.ke](https://handout.hackertours.by.vincent.mahn.ke).

## Query parameters

| parameter | example value | description |
| --- | --- | --- |
| `from` | Congresszentrum Hamburg | starting point of the tour |
| `to` | Neuer Jungfernstieg 5 | destination of the tour |
| `arriveBy` | 2026-03-03T14:20 | desired arrival time in ISO 8601 format |
| `tourname` | Hafenrundfahrt (Anleger 7) | only changes the document title |
| `passphrase` | _available on request_ | requried for responses |

## Examples
```
https://handout.hackertours.by.vincent.mahn.ke/
    ?from=Congresszentrum%20Hamburg
    &to=Neuer%20Jungfernstieg%205
    &arriveBy=2026-03-03T14:20
    &tourname=Hafenrundfahrt%20(Anleger%207)
    &passphrase=madeyoulook
```
```
https://handout.hackertours.by.vincent.mahn.ke/
    ?from=Congresszentrum%20Hamburg
    &to=Fuhlsbüttler%20Strasse%20490,%2022309%20Hamburg
    &arriveBy=2026-03-06T12:00
    &tourname=Hafenrundfahrt%20(Anleger%207)
    &passphrase=ohsoclose
```