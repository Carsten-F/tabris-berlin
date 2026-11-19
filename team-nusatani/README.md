# Team Nusatani

Einfache, zweisprachige (English / Bahasa Melayu) Web-App für die Koordination der Nusatani-Direktoren.
Läuft im Browser auf Desktop und Handy und lässt sich als App installieren (PWA). Die Daten liegen in Supabase.
Adresse: **https://team.nusatani.com**

## Funktionen

| Bereich | Was man damit macht |
| --- | --- |
| **Start** | Persönliche Übersicht: „Braucht deine Aufmerksamkeit“ (Abstimmungen, Terminumfragen, überfällige / heute fällige / neue Aufgaben), nächste Meetings mit „Beitreten“-Knopf, meine Aufgaben, Entscheidungen, neueste Updates. Beim Öffnen ein Pop-up mit allem Dringenden. |
| **Aufgaben** | Jeder legt Aufgaben an und weist sie zu (Verantwortlicher, Fälligkeit, Priorität, Status). Beschreibung mit Formatierung (fett, kursiv, Überschriften, Listen, Checklisten, Zitat, Markierung, Links). Kommentar-Thread, Anhänge (direkt in der App ansehen). Neue Aufgaben sind beim Verantwortlichen **NEU** markiert, bis er sie öffnet. |
| **Entscheidungen** | Verbindliche Abstimmungen: Ja / Nein / eigene Formulierung. Dringlichkeit, Ablaufdatum, Teilnehmerauswahl, Mehrheit = mehr als die Hälfte der Teilnehmer (bei 3 Direktoren: 2). Stimmen sind **geheim**, bis die Abstimmung entschieden oder abgelaufen ist – nur der Admin sieht den Zwischenstand. Stimmen können nicht geändert werden; das Ergebnis wird mit allen Stimmen und Zeitpunkten dokumentiert (druckbar als PDF). |
| **Meetings** | Board- oder Ad-hoc-Meeting anlegen, mehrere Zeiten vorschlagen, alle antworten mit ✓ / ? / ✕, weitere Zeiten vorschlagen. Organisator legt den Termin fest, trägt den Zoom-Link ein und schickt ihn an alle. Kalender-Export (.ics, Google Calendar), Agenda, Erinnerungen 24 h und 1 h vorher. |
| **Protokolle** | Meeting-Protokolle (v. a. Board Meetings): Anwesende, Gäste, Diskussion, Beschlüsse, daraus resultierende Aufgaben und Abstimmungen, Anhänge. Entwurf → „Final“ (danach nur noch der Admin änderbar). Druck/PDF mit Logo. Direkt aus einem Meeting heraus anlegbar. |
| **Updates** | Dokumentierte Informationen für alle, mit Anpinnen, Anhängen, Kommentaren und „Gesehen von“. |
| **Dokumente** | Gemeinsame Ablage (PDF, Word, Excel, Bilder … bis 50 MB) mit Ordnern, Suche, Ansicht in der App, Download. Jeder kann eigene Dateien löschen (Admin alle). Dateien lassen sich mit Aufgaben, Protokollen, Entscheidungen, Meetings und Updates verknüpfen. |
| **Team** | Kontaktkarten (E-Mail, Telefon, WhatsApp). Für den Admin: neue Registrierungen freigeben/ablehnen, Admin-Rechte vergeben, Zugänge sperren. |
| **Suche** | Über Aufgaben, Entscheidungen, Meetings, Protokolle, Updates und Dokumente. |
| **Benachrichtigungen** | Glocke mit Zähler, Live-Pop-ups in der App, Desktop-/Handy-Benachrichtigungen; optional auch bei geschlossener App (Web Push). |
| **Einstellungen** | Sprache EN/BM, Profil, „App installieren“-Knopf, Benachrichtigungen einschalten, Passwort, Abmelden. |

Ohne Datenbank (leere `config.js`) startet ein **Demo-Modus** mit Beispieldaten – zum Ausprobieren im Browser:
`cd public && python3 -m http.server 8080` → http://localhost:8080, als Carsten / Ahmad / Siti anmelden.

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `public/` | Die komplette App (statisches HTML/CSS/Vanilla-JS, kein Build-Schritt) |
| `public/config.js` | Supabase-URL, öffentlicher Anon-Key, VAPID-Public-Key (keine Geheimnisse) |
| `public/vendor/` | supabase-js 2.118.0, DOMPurify 3.4.17 (lokal eingebunden, kein CDN) |
| `supabase/migrations/` | Datenbankschema inkl. Rechte (RLS), Abstimmungslogik, Benachrichtigungen, Erinnerungen |
| `supabase/functions/push/` | Edge Function für Push-Nachrichten bei geschlossener App (optional) |
| `deploy/nginx/` | nginx-Konfiguration für server7 (TLS, CSP, Security-Header) |
| `Dockerfile` | Alternative: statischer nginx-Container |
| `tests/` | Datenbanktests (`run-db-tests.sh`, 74 Prüfungen), Übersetzungsprüfung (`check-i18n.mjs`) |

## Einrichtung

### 1. Supabase-Projekt (Konto carsten@nusatani.com)

1. Neues Projekt anlegen, Region **Southeast Asia (Singapore)**.
2. *SQL Editor* → Inhalt von `supabase/migrations/20261119000000_team_nusatani.sql` einfügen → *Run*.
   Das legt alle Tabellen, Rechte, den Speicher-Bucket `documents`, Realtime und (falls verfügbar) den
   Erinnerungs-Job (`pg_cron`, alle 15 Minuten) an. Das Skript kann gefahrlos erneut ausgeführt werden.
   - Falls der Job fehlt: *Database → Extensions* → `pg_cron` aktivieren, Skript nochmals ausführen.
3. *Authentication → URL Configuration*: Site URL `https://team.nusatani.com`,
   Redirect URLs `https://team.nusatani.com/**`.
4. *Authentication → Emails → SMTP Settings*: eigenen SMTP-Server eintragen (z. B. das Postfach von nusatani.com).
   Ohne eigenen SMTP verschickt Supabase Bestätigungs- und Passwort-Mails nur sehr eingeschränkt.
5. *Project Settings → API*: **Project URL** und **anon / publishable key** in `public/config.js` eintragen.

### 2. Erster Login

Unter https://team.nusatani.com → „Create account“ mit **carsten@nusatani.com**. Diese Adresse wird automatisch
Admin (einstellbar in `app_private.settings`, Schlüssel `admin_email`). Die anderen Direktoren registrieren sich
selbst und erscheinen unter *Team* als „Wartet auf Freigabe“ – du bekommst dazu eine Benachrichtigung.

### 3. Bereitstellung auf server7

DNS: `team.nusatani.com` → A/AAAA-Record auf server7.

```bash
mkdir -p /var/www/team.nusatani.com
rsync -a --delete public/ /var/www/team.nusatani.com/public/
cp deploy/nginx/team.nusatani.com.conf /etc/nginx/sites-available/team.nusatani.com
sed -i 's/YOUR-PROJECT-REF/<project-ref>/g' /etc/nginx/sites-available/team.nusatani.com
ln -s ../sites-available/team.nusatani.com /etc/nginx/sites-enabled/team.nusatani.com
certbot certonly --webroot -w /var/www/letsencrypt -d team.nusatani.com
nginx -t && systemctl reload nginx
```

Alternativ als Container hinter dem vorhandenen Reverse Proxy: `docker build -t team-nusatani . && docker run -d --restart unless-stopped -p 127.0.0.1:8088:80 team-nusatani`
(dann die Security-Header/CSP aus `deploy/nginx/team.nusatani.com.conf` im Reverse Proxy setzen).

Wird statt Supabase Cloud das selbst gehostete Supabase auf server7 genutzt, funktioniert die App genauso:
URL/Key in `config.js` und den Host in der CSP anpassen.

Nach jeder Änderung an der App: Version in `public/sw.js` (`VERSION`) hochzählen, damit installierte Apps sofort aktualisieren.

### 4. Push-Nachrichten bei geschlossener App (optional)

Pop-ups in der geöffneten App funktionieren ohne diesen Schritt. Für Nachrichten auf den Sperrbildschirm:

```bash
npx web-push generate-vapid-keys                       # liefert Public + Private Key
supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… PUSH_SECRET=$(openssl rand -hex 24)
supabase functions deploy push --no-verify-jwt
```

Dann im SQL Editor (Extension `pg_net` muss aktiv sein):

```sql
insert into app_private.settings values
  ('push_url', 'https://<project-ref>.supabase.co/functions/v1/push'),
  ('push_secret', '<derselbe PUSH_SECRET>')
on conflict (key) do update set value = excluded.value;
```

und den **Public** Key als `vapidPublicKey` in `public/config.js` eintragen. Jeder Nutzer schaltet danach unter
*Einstellungen → Benachrichtigungen* ein. Auf iPhone/iPad geht das nur, wenn die App vorher zum Home-Bildschirm
hinzugefügt wurde (iOS 16.4+).

## Sicherheit

- Alle Rechte werden in der Datenbank erzwungen (Row Level Security), nicht nur in der Oberfläche:
  Nicht freigegebene Konten sehen nichts; niemand kann Daten im Namen anderer anlegen; Stimmen sind nur über
  die Funktion `cast_vote` möglich, einmalig und unveränderlich; fremde Stimmen sind bis zum Abschluss
  unsichtbar (außer für den Admin); abgeschlossene Abstimmungen und finale Protokolle sind gesperrt.
- Dateien liegen in einem privaten Bucket, Zugriff nur über zeitlich begrenzte signierte Links (1 Stunde).
- Formatierter Text wird beim Speichern und beim Anzeigen mit DOMPurify bereinigt (Schutz vor Script-Injection).
- Strenge Content-Security-Policy, keine externen Skripte oder Schriften, kein Tracking.
- `config.js` enthält nur öffentliche Werte. Der Service-Role-Key und der VAPID-Private-Key gehören nie in den Browser.

## Tests

```bash
tests/run-db-tests.sh        # Datenbank: Rechte, geheime/verbindliche Abstimmung, Mehrheiten, Ablauf, Meetings, Dateien, Erinnerungen
node tests/check-i18n.mjs    # alle Texte in EN und BM vorhanden
```

Die Datenbanktests laufen gegen ein lokales PostgreSQL 16 mit einer minimalen Supabase-Nachbildung
(`tests/db/00-supabase-stub.sql`).
