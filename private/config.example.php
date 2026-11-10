<?php
/**
 * Configuration for the contact form endpoint (app/contact.php).
 *
 * Copy to  private/config.php  on the server, fill in the values and protect it:
 *   chown root:www-data private/config.php && chmod 640 private/config.php
 * This directory is outside the web root and must never be served by nginx.
 */

declare(strict_types=1);

return [
    // Random secret for signing anti-spam tokens and hashing IPs.
    // Generate with:  php -r 'echo bin2hex(random_bytes(32)), PHP_EOL;'
    'secret' => 'CHANGE-ME',

    // Exact origins that may submit the form (scheme + host, no trailing slash).
    'allowed_origins' => ['https://tabris.berlin'],

    'mail' => [
        'to'        => 'info@tabris.berlin',
        // Must be an address your mail server is allowed to send for (SPF/DKIM/DMARC).
        'from'      => 'website@tabris.berlin',
        'from_name' => 'tabris.berlin Kontaktformular',

        // 'smtp' (recommended, authenticated + TLS) or 'mail' (local MTA via PHP mail()).
        'transport' => 'smtp',
        'smtp' => [
            'host'       => 'smtp.example.com',
            'port'       => 587,
            'encryption' => 'starttls',   // 'starttls' (587) or 'smtps' (465)
            'username'   => 'website@tabris.berlin',
            'password'   => '',
        ],
    ],

    // Writable by the PHP-FPM user only (rate-limit counters and used tokens, no message content).
    'var_dir' => __DIR__ . '/var',

    'limits' => [
        'per_ip_per_hour' => 5,
        'global_per_hour' => 40,
    ],
];
