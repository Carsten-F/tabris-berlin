#!/usr/bin/env bash
# Security regression tests for tabris.berlin.
#
# Usage:
#   tests/security-tests.sh                       # against https://tabris.berlin (live)
#   RESOLVE_IP=127.0.0.1 tests/security-tests.sh  # against a local/staging server answering for tabris.berlin
#   MAILCAP=/tmp/mailcap ...                      # optional: directory where a fake sendmail drops messages
#   SKIP_FORM=1 ...                               # skip tests that actually submit the contact form
#
# The form tests send a handful of real requests (max. 5 mails with the subject "SECURITY-TEST").
# API calls are paced to stay below the nginx rate limit; the full run takes about three minutes.

set -u
HOST="${HOST:-tabris.berlin}"
BASE="https://$HOST"
ORIGIN="${ORIGIN:-$BASE}"
MAILCAP="${MAILCAP:-}"
CURL=(curl -s --max-time 20 --noproxy "${RESOLVE_IP:+*}")
if [ -n "${RESOLVE_IP:-}" ]; then
  CURL+=(-k --resolve "$HOST:443:$RESOLVE_IP" --resolve "$HOST:80:$RESOLVE_IP" --resolve "www.$HOST:443:$RESOLVE_IP")
fi

pass=0; fail=0
ok()   { pass=$((pass + 1)); printf '  \033[32mPASS\033[0m %s\n' "$1"; }
bad()  { fail=$((fail + 1)); printf '  \033[31mFAIL\033[0m %s\n' "$1"; }
check(){ if [ "$2" = "$3" ]; then ok "$1 ($3)"; else bad "$1 – expected $2, got $3"; fi; }
code() { "${CURL[@]}" -o /dev/null -w '%{http_code}' "$@"; }
hdr()  { "${CURL[@]}" -o /dev/null -D - "$1" | tr -d '\r' | grep -i "^$2:" | head -1 | cut -d' ' -f2-; }
section(){ printf '\n\033[1m%s\033[0m\n' "$1"; }

# ---------------------------------------------------------------------------
section "1. Transport security"
check "HTTP redirects to HTTPS" "301" "$(code "http://$HOST/")"
loc=$("${CURL[@]}" -o /dev/null -w '%{redirect_url}' "http://$HOST/any/path?x=1")
check "HTTP redirect keeps host and path" "https://$HOST/any/path?x=1" "$loc"
loc=$("${CURL[@]}" -o /dev/null -w '%{redirect_url}' "https://www.$HOST/en/")
check "www redirects to apex" "https://$HOST/en/" "$loc"
for v in 1.0 1.1; do
  if "${CURL[@]}" -o /dev/null --tlsv$v --tls-max $v "$BASE/" 2>/dev/null; then bad "TLS $v must be refused"; else ok "TLS $v refused"; fi
done
for v in 1.2 1.3; do
  if "${CURL[@]}" -o /dev/null --tlsv$v --tls-max $v "$BASE/"; then ok "TLS $v accepted"; else bad "TLS $v should work"; fi
done
if [ -n "${RESOLVE_IP:-}" ]; then
  if curl -sk --noproxy '*' --max-time 8 -o /dev/null --resolve "evil.example:443:$RESOLVE_IP" "https://evil.example/" 2>/dev/null; then
    bad "Unknown Host/SNI must not be served"; else ok "Unknown Host/SNI: TLS handshake rejected"; fi
  c=$(curl -s --noproxy '*' --max-time 8 -o /dev/null -w '%{http_code}' -H 'Host: evil.example' "http://$RESOLVE_IP/" 2>/dev/null)
  check "Unknown Host over HTTP: connection closed" "000" "$c"
fi

# ---------------------------------------------------------------------------
section "2. Security headers"
for path in / /en/ /impressum/ /does-not-exist /assets/css/site.css /api/contact /robots.txt; do
  h=$("${CURL[@]}" -o /dev/null -D - "$BASE$path" | tr -d '\r' | tr 'A-Z' 'a-z')
  miss=""
  for want in "content-security-policy: default-src 'none'" "strict-transport-security: max-age=" \
              "x-content-type-options: nosniff" "x-frame-options: deny" "referrer-policy:" \
              "permissions-policy:" "cross-origin-opener-policy: same-origin"; do
    case "$h" in *"$want"*) ;; *) miss="$miss [$want]";; esac
  done
  if [ -z "$miss" ]; then ok "All security headers on $path"; else bad "Missing on $path:$miss"; fi
done
csp=$(hdr "$BASE/" content-security-policy)
case "$csp" in *unsafe-inline*|*unsafe-eval*|*"*"*|*data:*|*http:*) bad "CSP contains a weak source: $csp";; *) ok "CSP has no unsafe-inline / unsafe-eval / wildcard / data:";; esac
case "$csp" in *"frame-ancestors 'none'"*"") ok "CSP forbids framing (clickjacking)";; *"frame-ancestors 'none'"*) ok "CSP forbids framing (clickjacking)";; *) bad "CSP frame-ancestors missing";; esac
srv=$(hdr "$BASE/" server)
case "$srv" in *[0-9]*) bad "Server header leaks a version: $srv";; *) ok "Server header has no version ($srv)";; esac
[ -z "$(hdr "$BASE/api/contact" x-powered-by)" ] && ok "No X-Powered-By header" || bad "X-Powered-By leaks PHP"
[ -z "$(hdr "$BASE/" access-control-allow-origin)" ] && ok "No CORS header (no cross-origin reads)" || bad "Unexpected Access-Control-Allow-Origin"
[ -z "$(hdr "$BASE/" set-cookie)" ] && ok "No cookies set" || bad "Site sets a cookie"

# ---------------------------------------------------------------------------
section "3. Information disclosure and forbidden paths"
n=0; leaks=0
for p in /.git/config /.git/HEAD /.env /.htaccess /.gitignore /.well-known/../.git/config \
         /composer.json /composer.lock /vendor/autoload.php /vendor/phpmailer/phpmailer/src/PHPMailer.php \
         /vendor/phpmailer/phpmailer/VERSION /app/contact.php /private/config.php /private/config.example.php \
         /private/var/rate/global /tools/build.py /src/pages/imprint.de.html /README.md /SECURITY.md \
         /deploy/nginx/tabris.berlin.conf /tests/security-tests.sh /api/ /api/contact.php /api/contact/ \
         /api/contact/x.php /index.php /info.php /phpinfo.php /wp-login.php /wp-admin/ /xmlrpc.php /admin/ \
         /server-status /nginx_status /backup.zip /index.html.bak /assets/css/site.css.bak /assets/js/site.js.map \
         /cgi-bin/test.cgi /.DS_Store /config.yml /dump.sql; do
  c=$(code "$BASE$p"); n=$((n + 1))
  if [ "$c" != "404" ]; then bad "$p must return 404, got $c"; leaks=$((leaks + 1)); fi
done
[ "$leaks" -eq 0 ] && ok "All $n sensitive paths (dotfiles, config, vendor, source, PHP, backups) return 404"
for p in /assets/ /assets/img/ /assets/fonts/ /en/legal-notice/../../assets/; do
  body=$("${CURL[@]}" "$BASE$p")
  case "$body" in *"Index of"*) bad "Directory listing on $p";; *) ok "No directory listing on $p";; esac
done

section "4. Path traversal"
for p in '/assets/../../private/config.php' '/assets/..%2f..%2fprivate/config.php' '/assets/%2e%2e/%2e%2e/private/config.php' \
         '/..%2f..%2f..%2fetc/passwd' '/assets/....//....//private/config.php' '/assets/..%5c..%5cprivate/config.php' \
         '/assets/%252e%252e/%252e%252e/private/config.php' '/assets/css/site.css%00.php' '/..;/private/config.php' \
         '/assets/..%c0%af..%c0%afprivate/config.php' '//private/config.php' '/api/contact/../../private/config.php'; do
  out=$("${CURL[@]}" --path-as-is -w '\n%{http_code}' "$BASE$p")
  c=${out##*$'\n'}
  case "$out" in *"<?php"*|*"root:"*|*"'secret'"*) bad "Traversal leaked data: $p";;
    *) case "$c" in 400|404) ok "Traversal blocked ($c): $p";; *) bad "Traversal $p returned $c";; esac;; esac
done

section "5. HTTP methods"
for m in POST PUT DELETE PATCH TRACE CONNECT PROPFIND; do
  c=$(code -X "$m" "$BASE/")
  case "$c" in 405|400) ok "$m / rejected ($c)";; *) bad "$m / returned $c";; esac
done
for m in PUT DELETE PATCH TRACE; do
  c=$(code -X "$m" "$BASE/api/contact")
  case "$c" in 404|405|403) ok "$m /api/contact rejected ($c)";; *) bad "$m /api/contact returned $c";; esac
done
c=$(code -X POST -H 'Content-Type: text/html' --data '<?php phpinfo();' "$BASE/assets/img/shell.php")
check "Upload attempt via POST to static path" "405" "$c"

section "6. Redirect and host-header handling"
for p in '//evil.example/' '/%5Cevil.example/' '//evil.example/%2e%2e' '/en' '/impressum' '/legal-notice'; do
  loc=$("${CURL[@]}" --path-as-is -o /dev/null -w '%{redirect_url}' "$BASE$p")
  case "$loc" in ""|"$BASE"/*) ok "No off-site redirect for $p (${loc:-none})";; *) bad "Open redirect: $p -> $loc";; esac
done
loc=$("${CURL[@]}" -o /dev/null -w '%{redirect_url}' -H 'X-Forwarded-Host: evil.example' -H 'X-Forwarded-Proto: http' "$BASE/impressum")
case "$loc" in *evil*) bad "X-Forwarded-Host poisons redirect: $loc";; *) ok "X-Forwarded-Host ignored in redirects";; esac
body=$("${CURL[@]}" -H 'X-Forwarded-Host: evil.example' -H 'X-Original-URL: /private/config.php' -H 'X-Rewrite-URL: /private/config.php' "$BASE/")
case "$body" in *evil.example*|*"'secret'"*) bad "Header-based cache poisoning / URL override";; *) ok "X-Original-URL / X-Rewrite-URL / X-Forwarded-Host have no effect";; esac

section "7. Static content checks"
for path in / /en/ /impressum/ /datenschutz/ /en/legal-notice/ /en/privacy-policy/; do
  html=$("${CURL[@]}" "$BASE$path")
  issues=""
  printf '%s' "$html" | grep -Eqi '<script(>|[^>]*[^"]>)[^<]' && printf '%s' "$html" | grep -Ei '<script' | grep -Evq 'src=|application/ld\+json' && issues="$issues inline-script"
  printf '%s' "$html" | grep -Eqi ' on(click|load|error|mouseover|focus|submit)=' && issues="$issues inline-handler"
  printf '%s' "$html" | grep -Eqi '<style|[[:space:]]style="' && issues="$issues inline-style"
  printf '%s' "$html" | grep -Eqi 'javascript:' && issues="$issues javascript-url"
  printf '%s' "$html" | grep -Eqi '(src|srcset)="(https?:)?//' && issues="$issues external-resource"
  printf '%s' "$html" | grep -Eqi '<link[^>]+href="(https?:)?//[^"]+"[^>]*rel="stylesheet|rel="stylesheet"[^>]+href="(https?:)?//' && issues="$issues external-css"
  if printf '%s' "$html" | grep -Eo '<a [^>]*target="_blank"[^>]*>' | grep -vq 'rel="noopener noreferrer"'; then issues="$issues missing-noopener"; fi
  if [ -z "$issues" ]; then ok "No inline code, external resources or unsafe links on $path"; else bad "$path:$issues"; fi
done
js=$("${CURL[@]}" "$BASE/assets/js/site.js")
case "$js" in *innerHTML*=*|*"eval("*|*"document.write"*|*"new Function"*|*insertAdjacentHTML*|*outerHTML*) bad "site.js uses a dangerous DOM sink";; *) ok "site.js: no innerHTML / eval / document.write sinks";; esac
case "$js" in *localStorage*|*sessionStorage*|*"document.cookie"*) bad "site.js stores data on the device";; *) ok "site.js: no cookies / web storage (no consent banner needed)";; esac

if [ "${SKIP_FORM:-0}" = "1" ]; then
  printf '\nSkipping contact form tests (SKIP_FORM=1)\n'
else
# ---------------------------------------------------------------------------
section "8. Contact form endpoint"
API="$BASE/api/contact"
pace() { sleep 3.3; }   # stay below the nginx request-rate limit
mails() { [ -n "$MAILCAP" ] && ls "$MAILCAP" 2>/dev/null | wc -l || echo 0; }
post() { # post <json> [extra curl args...]
  local json=$1; shift; pace
  "${CURL[@]}" -o /tmp/tabris-test-body -w '%{http_code}' -X POST -H "Origin: $ORIGIN" -H 'Content-Type: application/json' "$@" --data-binary "$json" "$API"
}
tokens=()
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  pace; t=$("${CURL[@]}" "$API" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p'); tokens+=("$t")
done
[ ${#tokens[0]} -gt 60 ] && ok "Token endpoint issues signed tokens" || bad "Token endpoint did not return a token"
T() { printf '%s' "${tokens[$1]}"; }
payload() { # payload <token> [name] [email] [topic] [message] [website]
  printf '{"name":"%s","company":"Security Test","email":"%s","topic":"%s","message":"%s","website":"%s","lang":"en","token":"%s"}' \
    "${2:-SECURITY-TEST}" "${3:-security-test@example.com}" "${4:-other}" "${5:-Automated security test message, please ignore.}" "${6:-}" "$1"
}
good=$(payload "$(T 0)")

check "POST without Origin header" "403" "$(pace; "${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data-binary "$good" "$API")"
check "POST from foreign origin (CSRF)" "403" "$(post "$good" -H 'Origin: https://evil.example')"
check "POST with Origin: null" "403" "$(post "$good" -H 'Origin: null')"
check "POST with look-alike origin" "403" "$(post "$good" -H "Origin: $ORIGIN.evil.example")"
check "POST flagged cross-site by browser" "403" "$(post "$good" -H 'Sec-Fetch-Site: cross-site')"
check "POST as HTML form (urlencoded)" "415" "$(post 'name=a&email=b' -H 'Content-Type: application/x-www-form-urlencoded')"
check "POST as multipart upload" "415" "$(post 'x' -H 'Content-Type: multipart/form-data; boundary=x')"
check "POST as text/plain" "415" "$(post "$good" -H 'Content-Type: text/plain')"
check "Malformed JSON" "400" "$(post '{"name":')"
check "JSON array instead of object" "400" "$(post '["a","b"]')"
check "Deeply nested JSON" "400" "$(post '{"a":{"b":{"c":{"d":{"e":1}}}}}')"
check "Missing token" "403" "$(post '{"name":"x","email":"a@example.com","topic":"other","message":"0123456789 test"}')"
check "Forged token" "403" "$(post "$(payload '1700000000.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')")"
tampered="9${tokens[1]:1}"
check "Tampered token timestamp" "403" "$(post "$(payload "$tampered")")"
check "Token as array (type confusion)" "403" "$(post '{"name":"x","email":"a@example.com","topic":"other","message":"0123456789 test","token":["a"]}')"
fresh=$("${CURL[@]}" "$API" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
check "Token used instantly (bot speed)" "403" "$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST -H "Origin: $ORIGIN" -H 'Content-Type: application/json' --data-binary "$(payload "$fresh")" "$API")"
big=$(head -c 20000 /dev/zero | tr '\0' 'A')
c=$(post "$(payload "$(T 1)" SECURITY-TEST security-test@example.com other "$big")")
case "$c" in 413) ok "Oversized body rejected (413)";; *) bad "Oversized body returned $c";; esac

# --- validation / injection (rejected before any mail is sent) ---
check "E-mail header injection via CRLF in e-mail" "422" "$(post "$(payload "$(T 1)" SECURITY-TEST 'a@example.com\r\nBcc: victim@example.com')")"
check "Multiple recipients in e-mail field" "422" "$(post "$(payload "$(T 1)" SECURITY-TEST 'a@example.com, victim@example.com')")"
check "Angle-bracket address injection" "422" "$(post "$(payload "$(T 1)" SECURITY-TEST 'x <victim@example.com>')")"
check "Unknown topic value" "422" "$(post "$(payload "$(T 1)" SECURITY-TEST security-test@example.com '../../etc/passwd')")"
check "Field as array (type confusion)" "422" "$(post "{\"name\":[\"a\"],\"email\":\"a@example.com\",\"topic\":\"other\",\"message\":\"0123456789 test\",\"token\":\"$(T 1)\"}")"
check "Too short message" "422" "$(post "$(payload "$(T 1)" SECURITY-TEST security-test@example.com other 'hi')")"
check "Link spam message" "422" "$(post "$(payload "$(T 1)" SECURITY-TEST security-test@example.com other 'http://a.example http://b.example http://c.example http://d.example http://e.example http://f.example')")"
c=$(post "$(printf '{"name":"\xff\xfe bad","email":"a@example.com","topic":"other","message":"0123456789 test","token":"%s"}' "$(T 1)")")
case "$c" in 400|422) ok "Invalid UTF-8 rejected ($c)";; *) bad "Invalid UTF-8 returned $c";; esac

# --- accepted submissions (max. 5 per hour and IP) ---
before=$(mails)
check "Valid submission accepted" "200" "$(post "$good")"
[ -n "$MAILCAP" ] && check "Exactly one mail sent" "$((before + 1))" "$(mails)"
check "Token replay rejected" "403" "$(post "$good")"

before=$(mails)
check "Honeypot filled: fake success" "200" "$(post "$(payload "$(T 2)" SECURITY-TEST security-test@example.com other 'Automated security test message, please ignore.' 'https://spam.example')")"
[ -n "$MAILCAP" ] && check "Honeypot: no mail sent" "$before" "$(mails)"

inj='SECURITY-TEST\r\nBcc: victim@example.com\r\nX-Injected: yes\r\n\r\nInjected body'
check "CRLF in name is neutralised, not executed" "200" "$(post "$(payload "$(T 3)" "$inj")")"
xss='<script>alert(1)</script><img src=x onerror=alert(1)> {{7*7}} ${7*7} <?php system(\"id\"); ?> %0d%0aBcc: victim@example.com'
check "Markup / template / PHP payload in message accepted as plain text" "200" "$(post "$(payload "$(T 4)" SECURITY-TEST security-test@example.com other "$xss")")"
uni=$(printf 'SECURITY-TEST\xe2\x80\xa8Bcc: victim@example.com')
check "Unicode line separator in name neutralised" "200" "$(post "$(payload "$(T 5)" "$uni")")"
if [ -n "$MAILCAP" ]; then
  if grep -rlEi '^(Bcc|Cc|X-Injected):' "$MAILCAP" >/dev/null 2>&1; then bad "Injected header found in an outgoing mail"; else ok "No injected Bcc/Cc/X-Injected header in any outgoing mail"; fi
  if grep -rh '^ARGS:' "$MAILCAP" | grep -q 'victim@example.com'; then bad "Injected recipient passed to MTA"; else ok "No injected recipient passed to the mail transport"; fi
  if grep -rh '^To:' "$MAILCAP" | grep -vq 'info@tabris.berlin'; then bad "Mail sent to an unexpected recipient"; else ok "All mails go to the configured recipient only"; fi
  if grep -rhi '^Content-Type:' "$MAILCAP" | grep -qi 'text/html'; then bad "HTML mail generated"; else ok "Mails are plain text only (no HTML rendering of payloads)"; fi
fi

check "Rate limit: 6th submission within an hour" "429" "$(post "$(payload "$(T 6)")")"
check "Rate limit holds for further attempts" "429" "$(post "$(payload "$(T 7)")")"
check "Rate limit cannot be bypassed with X-Forwarded-For" "429" "$(post "$(payload "$(T 8)")" -H 'X-Forwarded-For: 203.0.113.9' -H 'X-Real-IP: 203.0.113.9' -H 'Client-IP: 203.0.113.9')"

# --- burst: nginx must throttle before PHP is reached ---
throttled=0
for i in $(seq 1 30); do [ "$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$API")" = "429" ] && throttled=$((throttled + 1)); done
[ "$throttled" -ge 15 ] && ok "Request flood throttled by nginx ($throttled of 30 requests answered 429)" || bad "Flood not throttled ($throttled/30)"
body=$(cat /tmp/tabris-test-body 2>/dev/null); rm -f /tmp/tabris-test-body
case "$body" in *"Warning"*|*"Fatal"*|*"Stack trace"*|*"/var/www"*) bad "Error output leaks internals";; *) ok "Error responses leak no paths, warnings or stack traces";; esac
fi

printf '\n\033[1mResult: %d passed, %d failed\033[0m\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
