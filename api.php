<?php
require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function out($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
    exit;
}
function fail(string $msg, int $code = 400): void { out(['error' => $msg], $code); }
function slen(string $s): int { return function_exists('mb_strlen') ? mb_strlen($s) : strlen($s); }
function must_post(): void { if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Use POST for this action.', 405); }
function body(): array { $j = json_decode(file_get_contents('php://input'), true); return is_array($j) ? $j : []; }

set_exception_handler(function (Throwable $e) {
    $msg = $e instanceof PDOException ? 'Database error. Did you run install.php? (' . $e->getMessage() . ')' : $e->getMessage();
    fail($msg, 500);
});

// Cashiers never receive the purchase cost, only owners do.
function shape(array $r, bool $withCost = true): array {
    $p = [
        'id' => (int)$r['id'], 'name' => $r['name'], 'brand' => $r['brand'], 'category' => $r['category'],
        'barcode' => $r['barcode'] !== null ? (string)$r['barcode'] : '',
        'price' => (float)$r['price'], 'cost' => (float)$r['cost'], 'stock' => (int)$r['stock'],
        'description' => (string)$r['description'], 'specs' => (string)$r['specs'],
        'image' => $r['image'] ? 'uploads/' . $r['image'] : null,
    ];
    if (!$withCost) unset($p['cost']);
    return $p;
}
function get_product(int $id): ?array {
    $s = db()->prepare('SELECT * FROM products WHERE id=?'); $s->execute([$id]);
    $r = $s->fetch(); return $r ? shape($r) : null;
}
function app_config(): array {
    return ['tax' => TAX_RATE, 'low' => LOW_STOCK, 'store_name' => STORE_NAME, 'store_address' => STORE_ADDRESS,
            'store_phone' => STORE_PHONE, 'receipt_footer' => RECEIPT_FOOTER];
}
function public_user(array $u): array {
    return ['id' => (int)$u['id'], 'username' => $u['username'], 'name' => $u['display_name'], 'role' => $u['role'], 'must_change' => (bool)$u['must_change']];
}
function current_user(): ?array {
    $id = (int)($_SESSION['uid'] ?? 0);
    if ($id <= 0) return null;
    $s = db()->prepare('SELECT id,username,display_name,role,must_change FROM users WHERE id=? AND active=1');
    $s->execute([$id]);
    $u = $s->fetch();
    return $u ?: null;   // role is read from the database on every request, so changes apply at once
}
function load_sale(int $id): ?array {
    $s = db()->prepare('SELECT * FROM sales WHERE id=?'); $s->execute([$id]);
    $r = $s->fetch(); if (!$r) return null;
    $i = db()->prepare('SELECT name, qty, unit_price FROM sale_items WHERE sale_id=? ORDER BY id'); $i->execute([$id]);
    $items = [];
    foreach ($i->fetchAll() as $it) $items[] = ['name' => $it['name'], 'qty' => (int)$it['qty'], 'unit_price' => (float)$it['unit_price']];
    return ['id' => (int)$r['id'], 'created_at' => $r['created_at'], 'subtotal' => (float)$r['subtotal'], 'tax' => (float)$r['tax'],
            'total' => (float)$r['total'], 'status' => $r['status'], 'cashier' => $r['cashier_name'], 'cashier_id' => $r['cashier_id'] !== null ? (int)$r['cashier_id'] : null,
            'items' => $items];
}
function delete_image(?string $file): void {
    if (!$file) return;
    $path = __DIR__ . '/uploads/' . basename($file);
    if (is_file($path)) @unlink($path);
}
function save_upload(): ?string {
    if (!isset($_FILES['image']) || $_FILES['image']['error'] === UPLOAD_ERR_NO_FILE) return null;
    $f = $_FILES['image'];
    if ($f['error'] !== UPLOAD_ERR_OK) fail('Photo upload failed (error code ' . $f['error'] . ').');
    if ($f['size'] > 5 * 1024 * 1024) fail('Photo is larger than 5 MB.');
    $info = @getimagesize($f['tmp_name']);
    $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'][$info['mime'] ?? ''] ?? null;
    if (!$ext) fail('Photo must be a JPG, PNG, WebP or GIF image.');
    if (!is_dir(__DIR__ . '/uploads')) mkdir(__DIR__ . '/uploads', 0775, true);
    $name = bin2hex(random_bytes(10)) . '.' . $ext;
    if (!move_uploaded_file($f['tmp_name'], __DIR__ . '/uploads/' . $name)) fail('Could not save the photo. Check the uploads folder permissions.', 500);
    return $name;
}

$action = $_GET['action'] ?? '';
$pdo = db();
start_session();

const OWNER_ONLY = ['product_save', 'product_delete', 'stock', 'stats', 'ledger'];
$user = current_user();
if (!in_array($action, ['login', 'me'], true)) {
    if (!$user) fail('Please sign in.', 401);
    if ($user['must_change'] && !in_array($action, ['logout', 'password_change'], true)) fail('Choose a new password first.', 403);
    if (in_array($action, OWNER_ONLY, true) && $user['role'] !== 'owner') fail('Your account is not allowed to do this.', 403);
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {   // CSRF: the token is only known to pages we served to this session
        $sent = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
        if ($sent === '' || !hash_equals((string)($_SESSION['csrf'] ?? ''), $sent)) fail('Your session expired. Reload the page and sign in again.', 403);
    }
}
$isOwner = $user && $user['role'] === 'owner';
// Release the session lock so parallel requests do not queue behind each other (only these actions write to it).
if (!in_array($action, ['login', 'logout', 'password_change'], true)) session_write_close();

switch ($action) {

case 'me':
    out(['user' => $user ? public_user($user) : null, 'csrf' => $user ? (string)($_SESSION['csrf'] ?? '') : '', 'config' => app_config()]);

case 'login':
    must_post();
    $in = body(); $un = trim((string)($in['username'] ?? '')); $pw = (string)($in['password'] ?? '');
    if ($un === '' || $pw === '') fail('Enter your username and password.');
    $s = $pdo->prepare('SELECT *, (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked FROM users WHERE username=? AND active=1');
    $s->execute([$un]); $u = $s->fetch();
    if ($u && $u['is_locked']) fail('Too many wrong passwords. Try again in ' . LOCK_MINUTES . ' minutes.', 429);
    // Always run one hash check, even for unknown usernames, so response time does not reveal which usernames exist.
    $okpw = password_verify($pw, $u ? $u['password_hash'] : '$2y$10$8UgeK2WZFDvdj78RHXdmve/loMiG/1MVrjk9/COLLhcCERfQpI.Pi');
    if (!$u || !$okpw) {
        if ($u) {
            $n = (int)$u['failed_attempts'] + 1;
            if ($n >= MAX_LOGIN_FAILS) $pdo->prepare('UPDATE users SET failed_attempts=0, locked_until=DATE_ADD(NOW(), INTERVAL ' . (int)LOCK_MINUTES . ' MINUTE) WHERE id=?')->execute([$u['id']]);
            else $pdo->prepare('UPDATE users SET failed_attempts=? WHERE id=?')->execute([$n, $u['id']]);
        }
        fail('Wrong username or password.', 401);
    }
    $pdo->prepare('UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=?')->execute([$u['id']]);
    session_regenerate_id(true);
    $_SESSION['uid'] = (int)$u['id'];
    $_SESSION['csrf'] = bin2hex(random_bytes(16));
    out(['user' => public_user($u), 'csrf' => $_SESSION['csrf'], 'config' => app_config()]);

case 'logout':
    must_post();
    $_SESSION = [];
    session_destroy();
    out(['ok' => true]);

case 'password_change':
    must_post();
    $in = body(); $cur = (string)($in['current'] ?? ''); $new = (string)($in['next'] ?? '');
    $row = $pdo->prepare('SELECT password_hash FROM users WHERE id=?'); $row->execute([$user['id']]);
    if (!password_verify($cur, (string)$row->fetchColumn())) fail('Your current password is not correct.', 422);
    if (strlen($new) < 8) fail('Use at least 8 characters for the new password.', 422);
    if ($new === $cur) fail('The new password must be different from the current one.', 422);
    $pdo->prepare('UPDATE users SET password_hash=?, must_change=0 WHERE id=?')->execute([password_hash($new, PASSWORD_DEFAULT), $user['id']]);
    session_regenerate_id(true);
    out(['ok' => true]);

case 'barcode':
    $code = trim((string)($_GET['code'] ?? ''));
    if ($code === '') fail('Scan or type a barcode.');
    $s = $pdo->prepare('SELECT * FROM products WHERE barcode=?'); $s->execute([$code]);
    $r = $s->fetch();
    if (!$r) fail('No product has the barcode “' . $code . '”.', 404);
    out(['product' => shape($r, $isOwner)]);

case 'receipt':
    $sale = load_sale((int)($_GET['id'] ?? 0));
    // Cashiers can only reopen receipts they rang up themselves.
    if (!$sale || (!$isOwner && $sale['cashier_id'] !== (int)$user['id'])) fail('Receipt not found.', 404);
    unset($sale['cashier_id']);
    out(['sale' => $sale]);

case 'products':
    $rows = $pdo->query('SELECT * FROM products ORDER BY name')->fetchAll();
    out(['products' => array_map(function ($r) use ($isOwner) { return shape($r, $isOwner); }, $rows), 'config' => app_config()]);

case 'product_save':
    must_post();
    $id    = (int)($_POST['id'] ?? 0);
    $name  = trim($_POST['name'] ?? '');
    $brand = trim($_POST['brand'] ?? '');
    $cat   = trim($_POST['category'] ?? '');
    $desc  = trim($_POST['description'] ?? '');
    $specs = trim($_POST['specs'] ?? '');
    if ($name === '' || slen($name) > 160) fail('Enter an item name (up to 160 characters).');
    if ($cat === '' || slen($cat) > 60) fail('Choose a category.');
    if (!is_numeric($_POST['price'] ?? '') || (float)$_POST['price'] < 0) fail('Enter a valid unit price.');
    if (!preg_match('/^\d{1,9}$/', (string)($_POST['stock'] ?? ''))) fail('Stock must be a whole number of 0 or more.');
    $barcode = trim((string)($_POST['barcode'] ?? ''));
    if ($barcode === '') $barcode = null;
    elseif (!preg_match('/^[A-Za-z0-9._-]{3,64}$/', $barcode)) fail('A barcode can use letters, numbers, dots and dashes (3 to 64 characters).');
    if ($barcode !== null) {
        $dup = $pdo->prepare('SELECT name FROM products WHERE barcode=? AND id<>?'); $dup->execute([$barcode, $id]);
        if ($n = $dup->fetchColumn()) fail('That barcode already belongs to “' . $n . '”.', 409);
    }
    $price = round((float)$_POST['price'], 2);
    $cost  = is_numeric($_POST['cost'] ?? '') && $_POST['cost'] !== '' ? round(max(0, (float)$_POST['cost']), 2) : round($price * 0.6, 2);
    $stock = (int)$_POST['stock'];
    $new   = save_upload();
    $remove = ($_POST['remove_image'] ?? '') === '1';

    if ($id > 0) {
        $old = $pdo->prepare('SELECT image FROM products WHERE id=?'); $old->execute([$id]);
        $row = $old->fetch();
        if (!$row) { delete_image($new); fail('Product not found.', 404); }
        $image = $row['image'];
        if ($new) { delete_image($image); $image = $new; }
        elseif ($remove) { delete_image($image); $image = null; }
        try {
            $pdo->prepare('UPDATE products SET name=?,brand=?,category=?,barcode=?,price=?,cost=?,stock=?,description=?,specs=?,image=? WHERE id=?')
                ->execute([$name, $brand, $cat, $barcode, $price, $cost, $stock, $desc, $specs, $image, $id]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') { delete_image($new); fail('That barcode is already used by another product.', 409); }
            throw $e;
        }
    } else {
        try {
            $pdo->prepare('INSERT INTO products (name,brand,category,barcode,price,cost,stock,description,specs,image) VALUES (?,?,?,?,?,?,?,?,?,?)')
                ->execute([$name, $brand, $cat, $barcode, $price, $cost, $stock, $desc, $specs, $new]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') { delete_image($new); fail('That barcode is already used by another product.', 409); }
            throw $e;
        }
        $id = (int)$pdo->lastInsertId();
    }
    out(['product' => get_product($id)]);

case 'product_delete':
    must_post();
    $id = (int)(body()['id'] ?? 0);
    $s = $pdo->prepare('SELECT image FROM products WHERE id=?'); $s->execute([$id]);
    $row = $s->fetch();
    if (!$row) fail('Product not found.', 404);
    $pdo->prepare('DELETE FROM products WHERE id=?')->execute([$id]);
    delete_image($row['image']);
    out(['ok' => true]);

case 'stock':
    must_post();
    $in = body(); $id = (int)($in['id'] ?? 0); $delta = (int)($in['delta'] ?? 0);
    if ($delta < -100000 || $delta > 100000) fail('Invalid stock change.');
    $pdo->prepare('UPDATE products SET stock = GREATEST(0, stock + ?) WHERE id=?')->execute([$delta, $id]);
    $p = get_product($id);
    if (!$p) fail('Product not found.', 404);
    out(['product' => $p]);

case 'checkout':
    must_post();
    $lines = [];
    foreach ((body()['items'] ?? []) as $it) {
        $pid = (int)($it['id'] ?? 0); $qty = (int)($it['qty'] ?? 0);
        if ($pid > 0 && $qty > 0) $lines[$pid] = ($lines[$pid] ?? 0) + $qty;
    }
    if (!$lines) fail('The order is empty.');
    ksort($lines);
    $pdo->beginTransaction();
    try {
        $sel = $pdo->prepare('SELECT id,name,price,cost,stock FROM products WHERE id=? FOR UPDATE');
        $rows = []; $sub = 0.0;
        foreach ($lines as $pid => $qty) {
            $sel->execute([$pid]); $p = $sel->fetch();
            if (!$p) throw new DomainException('A product in your order no longer exists.');
            if ((int)$p['stock'] < $qty) throw new DomainException('Not enough stock for “' . $p['name'] . '” (' . (int)$p['stock'] . ' left).');
            $rows[] = [$p, $qty];
            $sub += round((float)$p['price'] * $qty, 2);
        }
        $sub = round($sub, 2); $tax = round($sub * TAX_RATE, 2); $total = round($sub + $tax, 2);
        $pdo->prepare("INSERT INTO sales (subtotal,tax,total,status,cashier_id,cashier_name,created_at) VALUES (?,?,?,'Paid',?,?,NOW())")->execute([$sub, $tax, $total, $user['id'], $user['display_name']]);
        $sid = (int)$pdo->lastInsertId();
        $insI = $pdo->prepare('INSERT INTO sale_items (sale_id,product_id,name,qty,unit_price,unit_cost) VALUES (?,?,?,?,?,?)');
        $upd  = $pdo->prepare('UPDATE products SET stock = stock - ? WHERE id=?');
        foreach ($rows as [$p, $qty]) {
            $insI->execute([$sid, $p['id'], $p['name'], $qty, $p['price'], $p['cost']]);
            $upd->execute([$qty, $p['id']]);
        }
        $pdo->commit();
    } catch (DomainException $e) {
        $pdo->rollBack(); fail($e->getMessage(), 409);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    $sale = load_sale($sid);
    unset($sale['cashier_id']);
    out(['sale' => $sale]);

case 'stats':
    $k = $pdo->query('SELECT COALESCE(SUM(total),0) revenue, COUNT(*) orders FROM sales')->fetch();
    $sold = (int)$pdo->query('SELECT COALESCE(SUM(qty),0) FROM sale_items')->fetchColumn();
    $inv = $pdo->query('SELECT COALESCE(SUM(stock),0) units, COUNT(*) products, COALESCE(SUM(stock <= ' . LOW_STOCK . '),0) low FROM products')->fetch();
    $profit = (float)$pdo->query('SELECT COALESCE(SUM((si.unit_price - si.unit_cost) * si.qty),0) FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE DATE(s.created_at)=CURDATE()')->fetchColumn();
    $today = new DateTime((string)$pdo->query('SELECT CURDATE()')->fetchColumn());
    $byDay = [];
    foreach ($pdo->query('SELECT DATE(created_at) d, SUM(total) t FROM sales WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) GROUP BY DATE(created_at)') as $r) $byDay[$r['d']] = (float)$r['t'];
    $daily = [];
    for ($i = 6; $i >= 0; $i--) {
        $d = (clone $today)->modify("-$i day");
        $daily[] = ['label' => $d->format('D'), 'total' => $byDay[$d->format('Y-m-d')] ?? 0];
    }
    $recent = $pdo->query("SELECT s.id, s.created_at, s.total, GROUP_CONCAT(CONCAT(si.qty, 'x ', si.name) SEPARATOR ', ') summary
        FROM sales s JOIN sale_items si ON si.sale_id = s.id GROUP BY s.id, s.created_at, s.total ORDER BY s.created_at DESC, s.id DESC LIMIT 6")->fetchAll();
    foreach ($recent as &$r) { $r['id'] = (int)$r['id']; $r['total'] = (float)$r['total']; } unset($r);
    $lowItems = $pdo->query('SELECT id,name,stock FROM products WHERE stock <= ' . LOW_STOCK . ' ORDER BY stock, name')->fetchAll();
    out([
        'kpi' => ['revenue' => (float)$k['revenue'], 'orders' => (int)$k['orders'], 'sold' => $sold,
                  'inventory' => (int)$inv['units'], 'products' => (int)$inv['products'], 'low' => (int)$inv['low']],
        'today_profit' => $profit, 'daily' => $daily, 'recent' => $recent, 'low_items' => $lowItems,
    ]);

case 'ledger':
    $rows = $pdo->query('SELECT s.id order_id, s.created_at, s.status, s.cashier_name cashier, si.name, si.qty, si.unit_price
        FROM sale_items si JOIN sales s ON s.id = si.sale_id ORDER BY s.created_at DESC, s.id DESC, si.id LIMIT 500')->fetchAll();
    foreach ($rows as &$r) { $r['order_id'] = (int)$r['order_id']; $r['qty'] = (int)$r['qty']; $r['unit_price'] = (float)$r['unit_price']; } unset($r);
    out(['rows' => $rows]);

default:
    fail('Unknown action.', 404);
}