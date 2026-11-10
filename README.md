# tabris.berlin

Website der **Tabris UG (haftungsbeschränkt)** – Holdinggesellschaft, Berlin.
Statischer, zweisprachiger One-Pager (Deutsch unter `/`, Englisch unter `/en/`) mit Impressum und
Datenschutzerklärung. Kein CMS, keine Datenbank, keine Cookies, keine Drittanbieter-Ressourcen.

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `public/` | **Web-Root** – ausschließlich statische Dateien (HTML, CSS, JS, Bilder, Schriften) |
| `app/contact.php` | Einziger serverseitiger Code: Endpunkt des Kontaktformulars (liegt **außerhalb** des Web-Roots) |
| `private/config.example.php` | Vorlage für die Konfiguration des Kontaktformulars (Secret, SMTP) |
| `deploy/nginx/` | Gehärtete nginx-Konfiguration (TLS, Security-Header, CSP, Rate-Limits) |
| `tools/build.py` | Generator: erzeugt alle HTML-Seiten, `sitemap.xml`, `robots.txt`, `llms.txt` (nur Python-Standardbibliothek) |
| `src/pages/` | Texte von Impressum und Datenschutzerklärung (DE/EN) |
| `tests/security-tests.sh` | Sicherheitstests (ca. 150 Prüfungen), jederzeit gegen die Live-Seite wiederholbar |

Die fertigen HTML-Dateien liegen bereits in `public/`. Ein Build ist nur nach Text- oder Strukturänderungen nötig:

```bash
python3 tools/build.py
```

## Eingesetzte Software (Stand 10.11.2026)

| Komponente | Version | Hinweis |
| --- | --- | --- |
| nginx | 1.24.0 (Ubuntu 24.04 LTS, Sicherheitsupdates über `apt`) | wie auf dem bestehenden Server |
| PHP-FPM | 8.3 (Ubuntu 24.04 LTS) | nur für `/api/contact` |
| PHPMailer | 7.2.0 (veröffentlicht 07.11.2026) | einzige Fremdbibliothek, `composer audit`: keine bekannten Schwachstellen |
| Inter / Fraunces | Fontsource 5.3.0 | lokal eingebunden (SIL Open Font License) |
| JavaScript | – | reines Vanilla-JS ohne Bibliotheken, kein Build-Schritt |

## Deployment

Zielstruktur auf dem Server:

```
/var/www/tabris.berlin/
├── public/     ← Web-Root (root:www-data, nur lesbar)
├── app/        ← contact.php
├── vendor/     ← PHPMailer (per Composer)
└── private/    ← config.php + var/ (nicht über HTTP erreichbar)
```

1. Pakete installieren:

   ```bash
   apt install nginx php8.3-fpm php8.3-mbstring composer
   ```

2. Dateien kopieren und Abhängigkeiten installieren:

   ```bash
   mkdir -p /var/www/tabris.berlin/private/var
   cp -a public app composer.json composer.lock /var/www/tabris.berlin/
   cd /var/www/tabris.berlin && composer install --no-dev --optimize-autoloader
   ```

3. Kontaktformular konfigurieren (Secret erzeugen, SMTP-Zugang eintragen):

   ```bash
   cp private/config.example.php /var/www/tabris.berlin/private/config.php
   php -r 'echo bin2hex(random_bytes(32)), PHP_EOL;'   # Wert als 'secret' eintragen
   ```

4. Rechte setzen – der Webserver darf nur lesen, PHP darf nur in `private/var` schreiben:

   ```bash
   chown -R root:www-data /var/www/tabris.berlin
   chmod -R u=rwX,g=rX,o= /var/www/tabris.berlin
   chmod 640 /var/www/tabris.berlin/private/config.php
   chown www-data:www-data /var/www/tabris.berlin/private/var && chmod 700 /var/www/tabris.berlin/private/var
   ```

5. nginx einrichten (Zertifikatspfade in `tabris.berlin.conf` ggf. anpassen):

   ```bash
   cp deploy/nginx/snippets/*.conf /etc/nginx/snippets/
   cp deploy/nginx/tabris.berlin.conf /etc/nginx/sites-available/tabris.berlin
   ln -s ../sites-available/tabris.berlin /etc/nginx/sites-enabled/tabris.berlin
   rm -f /etc/nginx/sites-enabled/default
   nginx -t && systemctl reload nginx
   ```

6. Prüfen:

   ```bash
   SKIP_FORM=1 tests/security-tests.sh      # ohne Testmails
   tests/security-tests.sh                  # inkl. Formular (sendet max. 5 Testmails „SECURITY-TEST“)
   ```

Die bisherige React-App (`/assets/index-*.js`, `/images/…`) wird vollständig ersetzt und kann gelöscht werden.
Die alte Adresse `/legal-notice` wird automatisch weitergeleitet.

## Kontaktformular

- `GET /api/contact` liefert ein signiertes, zwei Stunden gültiges Einmal-Token, `POST /api/contact` (JSON) versendet
  genau eine Nur-Text-E-Mail an `info@tabris.berlin`. Die Adresse des Absenders steht ausschließlich im `Reply-To`.
- Schutzmechanismen: Same-Origin-Prüfung, JSON-only (kein klassisches Formular-Posting von Fremdseiten möglich),
  HMAC-Token mit Mindestalter und Einmalverwendung, Honeypot, strikte Validierung, Rate-Limit pro IP und global
  (in PHP und zusätzlich in nginx), 16-KB-Limit, keine Uploads, keine HTML-Mails.
- Gespeichert werden nur kurzlebige Zähler (HMAC-Hash der IP, max. 24 h) – keine Nachrichteninhalte.
- Ohne PHP bleibt die Seite voll funktionsfähig; das Formular verweist dann auf die E-Mail-Adresse.

## Sicherheit

Ergebnisse und Maßnahmen der Sicherheitsprüfung: siehe [SECURITY.md](SECURITY.md).
Laufende Pflege: `apt upgrade` (unattended-upgrades aktivieren), gelegentlich `composer update && composer audit`.

## Inhalte pflegen

- Texte der Startseite, Marken, Stellenanzeigen, FAQ: `tools/build.py` (Abschnitt „Content“), danach `python3 tools/build.py`.
- Impressum / Datenschutz: `src/pages/*.html`, danach Build.
- `UPDATED` in `tools/build.py` setzt das Änderungsdatum in Sitemap und strukturierten Daten.
