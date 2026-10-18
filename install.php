<?php
// Run once: http://localhost/turboparts/install.php   (add ?reset=1 to wipe and reinstall demo data)
require __DIR__ . '/config.php';
header('Content-Type: text/html; charset=utf-8');

function page(string $title, string $body, bool $ok = true): void {
    $c = $ok ? '#047857' : '#B91C1C';
    echo '<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TurboParts setup</title>'
       . '<body style="font-family:system-ui,Segoe UI,sans-serif;background:#F4F6FA;color:#0F172A;display:grid;place-items:center;min-height:100vh;margin:0">'
       . '<div style="background:#fff;border:1px solid #E3E8EF;border-radius:16px;padding:32px;max-width:520px;box-shadow:0 8px 30px -12px rgba(15,23,42,.2)">'
       . '<h1 style="margin:0 0 8px;font-size:22px;color:' . $c . '">' . htmlspecialchars($title) . '</h1>'
       . '<div style="line-height:1.6;color:#334155">' . $body . '</div></div></body>';
    exit;
}

function has_table(PDO $pdo, string $t): bool {
    $s = $pdo->prepare('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
    $s->execute([$t]); return (bool) $s->fetchColumn();
}
function has_col(PDO $pdo, string $t, string $c): bool {
    $s = $pdo->prepare('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
    $s->execute([$t, $c]); return (bool) $s->fetchColumn();
}
function ean13(string $twelve): string {
    $sum = 0;
    for ($i = 0; $i < 12; $i++) $sum += (int)$twelve[$i] * ($i % 2 ? 3 : 1);
    return $twelve . ((10 - $sum % 10) % 10);
}
function temp_password(): string {
    $alpha = 'abcdefghjkmnpqrstuvwxyz23456789'; $out = '';
    for ($i = 0; $i < 10; $i++) $out .= $alpha[random_int(0, strlen($alpha) - 1)];
    return $out;
}
// Creates the owner and cashier accounts when the users table is empty. Returns the one-time passwords.
function seed_users(PDO $pdo): array {
    if ((int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() > 0) return [];
    $made = [];
    $ins = $pdo->prepare('INSERT INTO users (username, display_name, password_hash, role, must_change) VALUES (?,?,?,?,1)');
    foreach ([['owner', 'Store Owner', 'owner'], ['cashier', 'Cashier', 'cashier']] as [$u, $n, $r]) {
        $pw = temp_password();
        $ins->execute([$u, $n, password_hash($pw, PASSWORD_DEFAULT), $r]);
        $made[] = [$u, $pw, $r];
    }
    return $made;
}
function creds_html(array $made): string {
    if (!$made) return '';
    $h = '<div style="margin-top:16px;padding:14px 16px;background:#FEF3C7;border-radius:12px"><b>Sign-in details (shown only once, write them down)</b><table style="margin-top:8px;border-collapse:collapse">';
    foreach ($made as [$u, $pw, $r]) {
        $h .= '<tr><td style="padding:2px 14px 2px 0">' . ucfirst($r) . '</td><td style="padding:2px 14px 2px 0">user <code>' . $u . '</code></td><td>password <code>' . htmlspecialchars($pw) . '</code></td></tr>';
    }
    return $h . '</table><div style="margin-top:8px;font-size:13px">Each person must choose a new password at first sign-in.</div></div>';
}
// Brings an existing (older) database up to date without touching its data.
function upgrade_schema(PDO $pdo): array {
    $did = [];
    if (!has_table($pdo, 'users')) { create_users_table($pdo); $did[] = 'users table'; }
    if (!has_col($pdo, 'products', 'barcode')) {
        $pdo->exec('ALTER TABLE products ADD COLUMN barcode VARCHAR(64) NULL AFTER category, ADD UNIQUE KEY uq_barcode (barcode)');
        $did[] = 'product barcodes';
    }
    if (!has_col($pdo, 'sales', 'cashier_id')) {
        $pdo->exec("ALTER TABLE sales ADD COLUMN cashier_id INT UNSIGNED NULL, ADD COLUMN cashier_name VARCHAR(80) NOT NULL DEFAULT ''");
        $did[] = 'cashier on sales';
    }
    return $did;
}
function create_users_table(PDO $pdo): void {
    $pdo->exec("CREATE TABLE users (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(40) NOT NULL UNIQUE,
        display_name VARCHAR(80) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('owner','cashier') NOT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        must_change TINYINT(1) NOT NULL DEFAULT 1,
        failed_attempts INT NOT NULL DEFAULT 0,
        locked_until DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

try {
    $root = new PDO('mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';charset=utf8mb4', DB_USER, DB_PASS, db_options());
    $root->exec('CREATE DATABASE IF NOT EXISTS `' . DB_NAME . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $pdo = db();

    $installed = (bool) $pdo->query("SHOW TABLES LIKE 'products'")->fetch();
    if ($installed && !isset($_GET['reset'])) {
        $did  = upgrade_schema($pdo);
        $made = seed_users($pdo);
        $msg  = $did ? 'Your existing data was kept and the database was upgraded (' . implode(', ', $did) . ').<br><br>' : 'The database <b>' . DB_NAME . '</b> is ready and up to date.<br><br>';
        page($did || $made ? 'Upgrade complete' : 'Already installed',
            $msg . '<a href="./">Open TurboParts</a>' . creds_html($made)
            . ($made ? '' : '<br><br>To wipe everything and reload the demo data, <a href="?reset=1">reinstall</a> (owner sign-in required).'));
    }
    if ($installed && isset($_GET['reset']) && has_table($pdo, 'users') && (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() > 0) {
        // A reinstall deletes all data, so once accounts exist only a signed-in owner may do it.
        start_session();
        $uid = (int) ($_SESSION['uid'] ?? 0);
        $q = $pdo->prepare("SELECT 1 FROM users WHERE id = ? AND role = 'owner' AND active = 1"); $q->execute([$uid]);
        if (!$q->fetchColumn()) {
            page('Owner sign-in required', 'Reinstalling deletes every product and sale. Sign in to <a href="./">TurboParts</a> as the owner first, then open this link again.', false);
        }
    }

    $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
    foreach (['sale_items', 'sales', 'products', 'users'] as $t) $pdo->exec("DROP TABLE IF EXISTS `$t`");
    $pdo->exec('SET FOREIGN_KEY_CHECKS=1');

    $pdo->exec("CREATE TABLE products (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(160) NOT NULL,
        brand VARCHAR(80) NOT NULL DEFAULT '',
        category VARCHAR(60) NOT NULL,
        barcode VARCHAR(64) NULL,
        price DECIMAL(10,2) NOT NULL,
        cost DECIMAL(10,2) NOT NULL DEFAULT 0,
        stock INT NOT NULL DEFAULT 0,
        description TEXT NULL,
        specs TEXT NULL,
        image VARCHAR(255) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_barcode (barcode)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    create_users_table($pdo);

    $pdo->exec("CREATE TABLE sales (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        subtotal DECIMAL(10,2) NOT NULL,
        tax DECIMAL(10,2) NOT NULL,
        total DECIMAL(10,2) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'Paid',
        cashier_id INT UNSIGNED NULL,
        cashier_name VARCHAR(80) NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL,
        INDEX (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE sale_items (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        sale_id INT UNSIGNED NOT NULL,
        product_id INT UNSIGNED NULL,
        name VARCHAR(160) NOT NULL,
        qty INT NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
        CONSTRAINT fk_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    // name, brand, category, price, cost, stock, description, specs
    $products = [
        ['Synthetic Motor Oil 5W-30 (4L)', 'VelocityX', 'Motor Oils', 42.90, 27.00, 48, 'Full synthetic oil that keeps engines clean and protected in heat and stop-and-go traffic. Suits most petrol cars built after 2010.', "Viscosity: 5W-30\nVolume: 4 L\nSpec: API SP / ILSAC GF-6\nChange interval: 10,000 km"],
        ['Full Synthetic Motor Oil 0W-20 (1L)', 'VelocityX', 'Motor Oils', 14.50, 8.50, 9, 'Thin, fast-flowing oil for modern hybrids and fuel-efficient engines.', "Viscosity: 0W-20\nVolume: 1 L\nSpec: API SP"],
        ['High Performance Brake Oil DOT 4', 'StopTech', 'Brakes', 11.90, 6.20, 30, 'High boiling point brake fluid for a firm pedal feel under hard braking.', "Standard: DOT 4\nVolume: 500 ml\nDry boiling point: 260 °C"],
        ['Ceramic Brake Pads (Front)', 'StopTech', 'Brakes', 58.00, 34.00, 14, 'Quiet, low-dust ceramic pads with shims included. Confirm fitment for your vehicle before purchase.', "Position: Front axle\nMaterial: Ceramic\nIncludes: Wear sensor, shims"],
        ['Oil Filter, Spin-on', 'PureFlow', 'Filters', 8.75, 4.10, 60, 'Reliable spin-on filter with an anti-drain valve. Replace at every oil change.', "Thread: M20 x 1.5\nHeight: 85 mm"],
        ['Cabin Air Filter', 'PureFlow', 'Filters', 16.20, 8.00, 7, 'Activated-carbon filter that traps dust, pollen and odors.', "Type: Activated carbon\nChange interval: 12 months"],
        ['Iridium Spark Plug (Set of 4)', 'IgniTek', 'Spark Plugs', 39.90, 22.00, 25, 'Long-life iridium tips for sharper starts and a smoother idle.', "Quantity: 4 plugs\nGap: 0.8 mm\nLife: up to 100,000 km"],
        ['All-Season Tire 205/55 R16', 'RoadGrip', 'Tires', 96.00, 68.00, 16, 'Balanced grip, low noise and long tread life for daily driving.', "Size: 205/55 R16\nSpeed rating: V (240 km/h)\nWarranty: 5 years"],
        ['AGM Battery 12V 60Ah', 'VoltMax', 'Batteries', 134.00, 96.00, 5, 'Maintenance-free AGM battery built for start-stop vehicles.', "Voltage: 12 V\nCapacity: 60 Ah\nCold cranking: 640 A\nWarranty: 24 months"],
        ['LED Headlight Bulb H7 (Pair)', 'LumaPro', 'Accessories', 29.00, 15.00, 0, 'Bright 6000K white LED bulbs with plug-and-play installation.', "Fitment: H7\nOutput: 8000 lm per pair\nColor: 6000K"],
    ];
    $ins = $pdo->prepare('INSERT INTO products (name,brand,category,price,cost,stock,description,specs,barcode) VALUES (?,?,?,?,?,?,?,?,?)');
    foreach ($products as $i => $p) { $p[] = ean13('2000000' . sprintf('%05d', $i + 1)); $ins->execute($p); }  // demo EAN-13 barcodes

    // Demo sales history: [days ago, hour, [[product id, qty], ...]]
    $history = [
        [6, 10, [[1, 2], [5, 2]]], [6, 15, [[8, 4]]], [5, 11, [[4, 1], [3, 2]]], [4, 9, [[7, 2], [5, 1]]],
        [3, 14, [[9, 1]]], [3, 17, [[1, 1], [2, 3]]], [2, 10, [[8, 2], [6, 2]]], [1, 12, [[4, 2], [5, 3]]],
        [1, 16, [[1, 3]]], [0, 7, [[3, 1], [7, 1]]],
    ];
    $byId = [];
    foreach ($pdo->query('SELECT id,name,price,cost FROM products') as $r) $byId[(int)$r['id']] = $r;
    $insSale = $pdo->prepare("INSERT INTO sales (subtotal,tax,total,status,created_at) VALUES (?,?,?,'Paid', TIMESTAMP(DATE_SUB(CURDATE(), INTERVAL ? DAY), MAKETIME(?,15,0)))");
    $insItem = $pdo->prepare('INSERT INTO sale_items (sale_id,product_id,name,qty,unit_price,unit_cost) VALUES (?,?,?,?,?,?)');
    foreach ($history as [$days, $hour, $lines]) {
        $sub = 0;
        foreach ($lines as [$pid, $qty]) $sub += $byId[$pid]['price'] * $qty;
        $sub = round($sub, 2); $tax = round($sub * TAX_RATE, 2);
        $insSale->execute([$sub, $tax, $sub + $tax, $days, $hour]);
        $sid = (int)$pdo->lastInsertId();
        foreach ($lines as [$pid, $qty]) {
            $b = $byId[$pid];
            $insItem->execute([$sid, $pid, $b['name'], $qty, $b['price'], $b['cost']]);
        }
    }

    $made = seed_users($pdo);
    page('Installation complete', 'Database <b>' . DB_NAME . '</b> was created with demo products, sales and two accounts.<br><br><a href="./" style="display:inline-block;background:#DC2626;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">Open TurboParts</a>' . creds_html($made));
} catch (Throwable $e) {
    page('Setup failed', 'Could not complete setup. Make sure MySQL is running in Laragon and that the credentials in <code>config.php</code> are correct.<br><br><code>' . htmlspecialchars($e->getMessage()) . '</code>', false);
}