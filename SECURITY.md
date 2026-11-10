# Sicherheitsprüfung tabris.berlin

Stand: 10.11.2026. Geprüft wurde ein lokaler Nachbau des Produktivsystems (nginx 1.24.0 und PHP-FPM 8.3 unter
Ubuntu 24.04, mit der Konfiguration aus `deploy/`). Der bestehende Live-Server wurde nur lesend betrachtet.

Schwachstellen bitte an `info@tabris.berlin` melden (siehe `/.well-known/security.txt`).

## Angriffsfläche

| Bereich | Stand |
| --- | --- |
| Web-Root | ausschließlich statische Dateien, kein CMS, keine Datenbank, kein Login, keine Uploads |
| Serverseitiger Code | eine Datei (`app/contact.php`), außerhalb des Web-Roots, nur über `/api/contact` erreichbar |
| Fremdcode | PHPMailer 7.2.0 (`composer audit` ohne Befund); im Browser keine Bibliotheken |
| Externe Ressourcen | keine – Schriften, Bilder und Skripte liegen lokal |
| Cookies / Speicher im Browser | keine |

## Durchgeführte Tests

`tests/security-tests.sh` enthält alle Prüfungen und ist gegen die Live-Seite wiederholbar.
Letzter Lauf gegen den lokalen Nachbau: **113 bestanden, 0 fehlgeschlagen.**

| Angriff | Ergebnis |
| --- | --- |
| TLS 1.0 / 1.1, unbekannter Hostname (Host-Header-Angriff) | abgelehnt, Verbindung wird ohne Antwort geschlossen |
| Zugriff auf `.git`, `.env`, `composer.*`, `vendor/`, `private/`, `app/`, Backups, fremde PHP-Dateien (40 Pfade) | durchgehend 404 |
| Path Traversal (12 Varianten, u. a. doppelt kodiert, Null-Byte, `..;/`) | blockiert, keine Datei ausgelesen |
| Verzeichnislisten | nicht vorhanden |
| Schreibende Methoden und Upload-Versuch auf statische Pfade | 405 |
| Open Redirect, `X-Forwarded-Host`, `X-Original-URL` | keine Wirkung |
| Clickjacking, Inline-Skripte, fremde Skriptquellen | durch CSP (`default-src 'none'`, kein `unsafe-inline`) und `X-Frame-Options` unterbunden |
| CSRF auf das Formular (fremde Origin, `null`, ähnlich klingende Domain, klassisches HTML-Formular) | 403 bzw. 415 |
| Token fälschen, manipulieren, sofort verwenden, wiederverwenden | 403 |
| E-Mail-Header-Injection (CRLF, Unicode-Zeilentrenner, mehrere Empfänger) | abgelehnt oder entschärft; kein zusätzlicher Header oder Empfänger in den erzeugten Mails |
| HTML-, Template- und PHP-Code in der Nachricht | wird als reiner Text zugestellt, nichts wird ausgeführt |
| Übergroße und fehlerhafte Anfragen, Typverwechslung | 400, 413 bzw. 422 |
| Massenversand (6. Anfrage pro Stunde, gefälschte `X-Forwarded-For`) | 429 |
| Anfrageflut auf den Endpunkt | von nginx gedrosselt, bevor PHP erreicht wird |
| Fehlermeldungen | enthalten keine Pfade, Warnungen oder Stacktraces |

Zusätzlich wurden alle Seiten und das Formular im Browser durchgespielt: keine CSP-Verstöße, keine
Konsolenfehler, Anfragen gehen ausschließlich an `tabris.berlin`.

## Unabhängiger Code-Review

Ein zweiter, unabhängiger Review von PHP-Endpunkt, nginx-Konfiguration und JavaScript fand folgende Punkte.
Alle wurden behoben und sind – soweit automatisiert prüfbar – in der Testsuite abgedeckt.

| Schwere | Befund | Behebung |
| --- | --- | --- |
| Mittel | Open Redirect über `//fremde.domain/index.html` | Weiterleitung erlaubt nur noch einfache Pfadsegmente und nennt die eigene Domain ausdrücklich |
| Mittel | Abgelehnte Anfragen konnten unbegrenzt Zustandsdateien anlegen (Speicher erschöpfbar) | Rate-Limit greift jetzt vor dem Anlegen; Aufräumen ohne `glob()` |
| Niedrig | IPv6-Clients konnten das nginx-Limit durch Adresswechsel im eigenen /64-Netz umgehen | nginx zählt IPv6 pro /64-Netz |
| Niedrig | Honeypot-Treffer verbrauchten das globale Stundenkontingent | Honeypot wird vor den Zählern geprüft |
| Niedrig | Jede Anfrage erzeugte eine Warnung im nginx-Log | Variable wird initialisiert |
| Niedrig | Autoresponder im Zielpostfach könnten über `Reply-To` Dritte anschreiben | Mails tragen `Auto-Submitted: auto-generated` |
| Niedrig | Gemeinsamer PHP-FPM-Pool mit anderen Seiten | eigener Pool und Benutzer (`deploy/php-fpm/tabris.conf`) |
| Info | OCSP-Stapling ohne Wirkung, doppelte Header | entfernt |

Nicht geändert: E-Mail-Adressen mit Umlaut-Domain (z. B. `name@münchen.de`) lehnt das Formular ab.

## Beobachtungen am bestehenden Live-Server (nur lesend)

- Es werden keine Security-Header gesendet (kein HSTS, keine CSP, kein Schutz vor Framing).
- Der `Server`-Header nennt die genaue nginx-Version.
- `www.tabris.berlin` liefert die Seite ohne Weiterleitung aus (doppelte Inhalte).

Die Konfiguration in `deploy/nginx/` behebt alle drei Punkte.

## Nicht geprüft / außerhalb dieses Repositorys

- Betriebssystem, SSH-Zugang, Firewall und Zertifikatsverwaltung des Servers.
- Zustellbarkeit der Formular-Mails (SPF, DKIM, DMARC für die Absenderadresse).
- HSTS ist bewusst ohne `includeSubDomains` gesetzt, damit andere Subdomains nicht unerwartet ausfallen;
  nach Prüfung aller Subdomains kann es ergänzt werden.
