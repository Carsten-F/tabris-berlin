<?php
/**
 * tabris.berlin – contact form endpoint.
 *
 * GET  /api/contact  → issues a short-lived, signed anti-spam token
 * POST /api/contact  → validates the JSON payload and sends one plain-text e-mail
 *
 * This file lives OUTSIDE the web root. nginx maps exactly one URL to it;
 * no other PHP file is reachable over HTTP. Nothing is stored except
 * short-lived rate-limit counters (HMAC-hashed IP, no message content).
 */

declare(strict_types=1);

namespace Tabris\Contact;

use PHPMailer\PHPMailer\Exception as MailException;
use PHPMailer\PHPMailer\PHPMailer;

require dirname(__DIR__) . '/vendor/autoload.php';

const MAX_BODY_BYTES   = 16384;
const TOKEN_MIN_AGE    = 3;      // seconds a human needs at least to fill in the form
const TOKEN_MAX_AGE    = 7200;   // seconds
const WINDOW           = 3600;   // rate-limit window in seconds
const STATE_TTL        = 86400;  // hard upper bound for any state file
const TOPICS = [
    'partnership' => 'Partnerschaft / Partnership',
    'investor'    => 'Investoren / Investors',
    'press'       => 'Presse / Press',
    'career'      => 'Karriere / Careers',
    'other'       => 'Sonstiges / Other',
];

final class HttpError extends \RuntimeException
{
    /** @param array<string,mixed> $payload */
    public function __construct(public readonly int $status, public readonly array $payload = [])
    {
        parent::__construct('http ' . $status);
    }
}

/** @param array<string,mixed> $data */
function respond(int $status, array $data): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

/** @return array<string,mixed> */
function loadConfig(): array
{
    $path = getenv('TABRIS_CONFIG') ?: dirname(__DIR__) . '/private/config.php';
    if (!is_file($path)) {
        throw new \RuntimeException('config file missing');
    }
    $config = require $path;
    if (!is_array($config) || !is_string($config['secret'] ?? null) || strlen($config['secret']) < 32) {
        throw new \RuntimeException('config invalid: secret must be at least 32 characters');
    }
    if (preg_match('/^(change|replace|example)/i', $config['secret'])) {
        throw new \RuntimeException('config invalid: default secret in use');
    }
    return $config;
}

function b64url(string $bin): string
{
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function issueToken(string $secret): string
{
    $payload = time() . '.' . b64url(random_bytes(16));
    return $payload . '.' . b64url(hash_hmac('sha256', $payload, $secret, true));
}

/** Returns the nonce if the token is authentic and inside its validity window. */
function verifyToken(string $token, string $secret): ?string
{
    if (strlen($token) > 120 || !preg_match('/^(\d{10})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/', $token, $m)) {
        return null;
    }
    $expected = b64url(hash_hmac('sha256', $m[1] . '.' . $m[2], $secret, true));
    if (!hash_equals($expected, $m[3])) {
        return null;
    }
    $age = time() - (int) $m[1];
    return ($age >= TOKEN_MIN_AGE && $age <= TOKEN_MAX_AGE) ? $m[2] : null;
}

function stateDir(array $config, string $sub): string
{
    $dir = rtrim((string) ($config['var_dir'] ?? dirname(__DIR__) . '/private/var'), '/') . '/' . $sub;
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        throw new \RuntimeException('state directory not writable');
    }
    return $dir;
}

/** Marks a nonce as used. Returns false if it was used before (replay). */
function consumeNonce(array $config, string $nonce): bool
{
    $file = stateDir($config, 'nonces') . '/' . hash('sha256', $nonce);
    $handle = @fopen($file, 'x'); // atomic: fails if the file already exists
    if ($handle === false) {
        return false;
    }
    fclose($handle);
    return true;
}

/** Sliding-window counter. Returns false when the limit is exceeded. */
function rateLimit(array $config, string $key, int $limit): bool
{
    $file = stateDir($config, 'rate') . '/' . $key;
    $handle = fopen($file, 'c+');
    if ($handle === false || !flock($handle, LOCK_EX)) {
        throw new \RuntimeException('rate limit state not writable');
    }
    try {
        $now = time();
        $raw = stream_get_contents($handle) ?: '';
        $hits = array_values(array_filter(
            array_map('intval', $raw === '' ? [] : explode("\n", $raw)),
            static fn (int $ts): bool => $ts > $now - WINDOW && $ts <= $now
        ));
        if (count($hits) >= $limit) {
            return false;
        }
        $hits[] = $now;
        ftruncate($handle, 0);
        rewind($handle);
        fwrite($handle, implode("\n", $hits));
        return true;
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function pruneState(array $config): void
{
    if (random_int(1, 25) !== 1) {
        return;
    }
    foreach (['nonces' => TOKEN_MAX_AGE + 60, 'rate' => STATE_TTL] as $sub => $ttl) {
        foreach (glob(stateDir($config, $sub) . '/*') ?: [] as $file) {
            if (is_file($file) && filemtime($file) < time() - $ttl) {
                @unlink($file);
            }
        }
    }
}

/** Pseudonymous client key: HMAC of the IP (IPv6 reduced to its /64 network). Never trusts proxy headers. */
function clientKey(string $secret): string
{
    $packed = @inet_pton((string) ($_SERVER['REMOTE_ADDR'] ?? ''));
    if ($packed === false) {
        $packed = 'unknown';
    } elseif (strlen($packed) === 16) {
        $packed = substr($packed, 0, 8);
    }
    return hash_hmac('sha256', 'ip|' . $packed, $secret);
}

function cleanLine(string $value): string
{
    // Single-line fields: drop every control / line-separator character, collapse whitespace.
    $value = preg_replace('/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/u', ' ', $value) ?? '';
    return trim(preg_replace('/\s+/u', ' ', $value) ?? '');
}

function cleanText(string $value): string
{
    $value = str_replace(["\r\n", "\r"], "\n", $value);
    $value = preg_replace('/[^\P{Cc}\n\t]+/u', '', $value) ?? '';   // control chars except \n and \t
    $value = preg_replace('/[\p{Cf}\p{Zl}\p{Zp}]+/u', '', $value) ?? '';
    return trim(preg_replace('/\n{4,}/', "\n\n\n", $value) ?? '');
}

/**
 * @param array<string,mixed> $in
 * @return array{name:string,company:string,email:string,topic:string,message:string,lang:string}
 */
function validate(array $in): array
{
    $errors = [];
    $str = static function (string $key) use ($in): string {
        $value = $in[$key] ?? '';
        if (!is_string($value) || !mb_check_encoding($value, 'UTF-8')) {
            throw new HttpError(422, ['ok' => false, 'error' => 'validation', 'fields' => [$key]]);
        }
        return $value;
    };

    $name = cleanLine($str('name'));
    if (mb_strlen($name) < 2 || mb_strlen($name) > 100) {
        $errors[] = 'name';
    }
    $company = cleanLine($str('company'));
    if (mb_strlen($company) > 120) {
        $errors[] = 'company';
    }
    $email = trim($str('email'));
    if (strlen($email) > 254 || preg_match('/[\s\p{Cc}<>,;:"()\[\]\\\\]/u', $email)
        || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        $errors[] = 'email';
    }
    $topic = $str('topic');
    if (!array_key_exists($topic, TOPICS)) {
        $errors[] = 'topic';
    }
    $message = cleanText($str('message'));
    if (mb_strlen($message) < 10 || mb_strlen($message) > 5000) {
        $errors[] = 'message';
    } elseif (preg_match_all('~(?:https?://|www\.)~i', $message) > 5) {
        $errors[] = 'message'; // link spam
    }
    if ($errors !== []) {
        throw new HttpError(422, ['ok' => false, 'error' => 'validation', 'fields' => $errors]);
    }
    return [
        'name' => $name, 'company' => $company, 'email' => $email, 'topic' => $topic,
        'message' => $message, 'lang' => $str('lang') === 'en' ? 'en' : 'de',
    ];
}

/**
 * @param array<string,mixed> $config
 * @param array{name:string,company:string,email:string,topic:string,message:string,lang:string} $data
 */
function sendMail(array $config, array $data): void
{
    $cfg = $config['mail'];
    $mail = new PHPMailer(true);
    $mail->CharSet = PHPMailer::CHARSET_UTF8;
    $mail->Encoding = PHPMailer::ENCODING_BASE64;
    $mail->XMailer = ' ';
    $mail->Timeout = 10;

    if (($cfg['transport'] ?? 'smtp') === 'smtp') {
        $smtp = $cfg['smtp'];
        $mail->isSMTP();
        $mail->Host = (string) $smtp['host'];
        $mail->Port = (int) ($smtp['port'] ?? 587);
        $mail->SMTPSecure = ($smtp['encryption'] ?? 'starttls') === 'smtps'
            ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
        $mail->SMTPAuth = ($smtp['username'] ?? '') !== '';
        $mail->Username = (string) ($smtp['username'] ?? '');
        $mail->Password = (string) ($smtp['password'] ?? '');
    } else {
        $mail->isMail();
    }

    // The visitor's address is ONLY ever used as Reply-To – never as sender or recipient.
    $mail->setFrom((string) $cfg['from'], (string) ($cfg['from_name'] ?? 'tabris.berlin'));
    $mail->addAddress((string) $cfg['to']);
    $mail->addReplyTo($data['email'], $data['name']);
    $mail->isHTML(false);
    $mail->Subject = sprintf('[tabris.berlin] %s – %s', TOPICS[$data['topic']], $data['name']);
    $mail->Body = implode("\n", [
        'Neue Anfrage über das Kontaktformular auf tabris.berlin',
        str_repeat('-', 60),
        'Name:        ' . $data['name'],
        'Unternehmen: ' . ($data['company'] !== '' ? $data['company'] : '–'),
        'E-Mail:      ' . $data['email'],
        'Anliegen:    ' . TOPICS[$data['topic']],
        'Sprache:     ' . $data['lang'],
        'Zeitpunkt:   ' . gmdate('Y-m-d H:i') . ' UTC',
        str_repeat('-', 60),
        '',
        $data['message'],
        '',
    ]);
    $mail->send();
}

function handle(): never
{
    $config = loadConfig();
    $secret = $config['secret'];
    $method = $_SERVER['REQUEST_METHOD'] ?? '';

    if ($method === 'GET') {
        respond(200, ['token' => issueToken($secret)]);
    }
    if ($method !== 'POST') {
        header('Allow: GET, POST');
        throw new HttpError(405, ['ok' => false, 'error' => 'method']);
    }

    // Same-origin only. Browsers always send Origin on a fetch() POST.
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    if (!in_array($origin, (array) ($config['allowed_origins'] ?? []), true)) {
        throw new HttpError(403, ['ok' => false, 'error' => 'origin']);
    }
    $fetchSite = (string) ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? 'same-origin');
    if ($fetchSite !== 'same-origin') {
        throw new HttpError(403, ['ok' => false, 'error' => 'origin']);
    }
    // JSON only: an HTML form on another site cannot produce this content type.
    $type = strtolower(trim(explode(';', (string) ($_SERVER['CONTENT_TYPE'] ?? ''))[0]));
    if ($type !== 'application/json') {
        throw new HttpError(415, ['ok' => false, 'error' => 'content-type']);
    }
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > MAX_BODY_BYTES) {
        throw new HttpError(413, ['ok' => false, 'error' => 'too-large']);
    }
    $raw = (string) file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
    if (strlen($raw) > MAX_BODY_BYTES) {
        throw new HttpError(413, ['ok' => false, 'error' => 'too-large']);
    }
    try {
        $in = json_decode($raw, true, 3, JSON_THROW_ON_ERROR);
    } catch (\JsonException) {
        throw new HttpError(400, ['ok' => false, 'error' => 'json']);
    }
    if (!is_array($in) || array_is_list($in)) {
        throw new HttpError(400, ['ok' => false, 'error' => 'json']);
    }

    pruneState($config);

    // Cheap checks first, so invalid requests never touch the mail server.
    $nonce = is_string($in['token'] ?? null) ? verifyToken($in['token'], $secret) : null;
    if ($nonce === null) {
        throw new HttpError(403, ['ok' => false, 'error' => 'token']);
    }
    $data = validate($in);

    if (!consumeNonce($config, $nonce)) {
        throw new HttpError(403, ['ok' => false, 'error' => 'token']);
    }
    $limits = $config['limits'] ?? [];
    if (!rateLimit($config, clientKey($secret), (int) ($limits['per_ip_per_hour'] ?? 5))
        || !rateLimit($config, 'global', (int) ($limits['global_per_hour'] ?? 40))) {
        header('Retry-After: ' . WINDOW);
        throw new HttpError(429, ['ok' => false, 'error' => 'rate']);
    }

    // Honeypot: bots that fill the hidden field get a fake success and no mail is sent.
    if (($in['website'] ?? '') !== '') {
        respond(200, ['ok' => true]);
    }

    sendMail($config, $data);
    respond(200, ['ok' => true]);
}

try {
    handle();
} catch (HttpError $e) {
    respond($e->status, $e->payload);
} catch (MailException $e) {
    error_log('tabris contact: mail transport failed');           // no visitor data in logs
    respond(502, ['ok' => false, 'error' => 'mail']);
} catch (\Throwable $e) {
    error_log('tabris contact: ' . get_class($e) . ': ' . $e->getMessage());
    respond(500, ['ok' => false, 'error' => 'server']);
}
