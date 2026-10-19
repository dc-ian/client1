<?php
// TurboParts – configuration. Laragon defaults: user "root", empty password.
const DB_HOST = '127.0.0.1';
const DB_PORT = 3306;
const DB_NAME = 'turboparts';
const DB_USER = 'root';
const DB_PASS = '';

const TAX_RATE  = 0.12;  // VAT, 12%
const LOW_STOCK = 10;    // "Low stock" when quantity is this number or fewer

// Printed at the top and bottom of every receipt. Use \n for a line break in the address.
const STORE_NAME      = 'TurboParts';
const STORE_ADDRESS   = '';
const STORE_PHONE     = '';
const RECEIPT_FOOTER  = 'Thank you for shopping at TurboParts.';

// Set to true on your own computer to see technical error details. Keep false on a live server.
const DEBUG = false;

const MAX_LOGIN_FAILS = 5;   // wrong passwords before the account is locked
const LOCK_MINUTES    = 5;   // how long the lock lasts

function db_options(): array {
    return [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ];
}

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4';
        $pdo = new PDO($dsn, DB_USER, DB_PASS, db_options());
    }
    return $pdo;
}

// Sessions are scoped to this folder so other apps on localhost do not share the login.
function start_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $dir  = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/') . '/';
    session_name('turboparts_sid');
    session_set_cookie_params([
        'lifetime' => 0, 'path' => $dir, 'httponly' => true, 'samesite' => 'Lax',
        'secure'   => !empty($_SERVER['HTTPS']),
    ]);
    session_start();
}