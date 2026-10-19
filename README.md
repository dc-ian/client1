# Automotive Service + TurboParts

A car-service booking website with customer and admin dashboards, plus an embedded **TurboParts** parts store and point-of-sale (PHP + MySQL).

## What is in this project

| Part | Files | Runs on |
|---|---|---|
| Website, booking, dashboards | `index.html`, `about.html`, `contact.html`, `book.html`, `history.html`, `dashboard.html`, `bookings.html`, `customers.html`, `login.html`, `terms.html`, `privacy.html`, `style.css`, `auth.js`, `app.js` | Any web server, or just open in a browser. Data is kept in the browser (demo). |
| TurboParts store and POS | `parts.js`, `parts.css`, `api.php`, `config.php`, `install.php` | PHP 8+ and MySQL (for example Laragon) |

## Quick start

**Website only:** put the folder in any web server (or open `index.html`). 

**With TurboParts (Laragon):**
1. Copy the folder to `C:\laragon\www\turboparts`.
2. Start Apache and MySQL.
3. Open `http://localhost/turboparts/install.php` once. Write down the owner and cashier passwords it shows (shown once only).
4. Open `http://localhost/turboparts/`.
5. **Delete or block `install.php`** before putting the site on a real server.

## Demo accounts (website)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@automotive.com` | `admin123` |
| Customer | Create one on the login page | your choice (6+ characters) |

Change the admin password before any real use. Passwords are stored as salted SHA-256 hashes, but because everything lives in the visitor's own browser this is a **demo**: for a real launch, move accounts and bookings to a server database.

## Booking rules

- Open Monday to Saturday. Sundays and past times cannot be booked.
- Each time slot accepts up to 3 bookings (`SLOT_CAP` in `app.js`).
- Customers can cancel their own Pending or Confirmed bookings from **History**.
- Admins can filter, search, change status and export bookings to CSV.

## Settings

Edit `config.php`: database login, tax rate, low-stock level, receipt text, and `DEBUG` (keep `false` on a live server so technical errors are not shown to visitors).
