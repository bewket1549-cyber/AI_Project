# Mela Smartphone Finder

## Run the application

Install the frontend dependencies and start the React app:

```powershell
cd Front_end
npm ci
npm start
```

The frontend uses `http://127.0.0.1:8000` for the backend by default. To use a different backend URL, set `REACT_APP_API_URL` before starting the frontend.

## Run the backend

From the repository root, start the FastAPI application:

```powershell
python -m uvicorn Back_end.main:app --reload
```

The catalog is stored in `Back_end/Smartphone_2024_enhanced_4.csv`. The existing `Price` column is stored and displayed in USD, converted from the source INR prices at the reference rate recorded by the API. No extra price column is added. Converted prices are estimates, not US retail prices or manufacturer MSRPs.

## Admin catalog

Open **Admin** on the welcome page or finder. The admin interface supports English and Amharic. The first admin visit allows one-time account creation with a name, email, and matching passwords of at least 8 characters. Create this account on a trusted local network before exposing the backend publicly: the first signup claims the single admin account. The account and salted password hash are stored in the ignored `Back_end/admin_auth.sqlite3` database; only the first signup succeeds. After signup, sign in to manage the catalog. Admin sessions expire after eight hours; the frontend keeps the session token in memory and the backend stores only its hash. Admins can add, update, and delete records; changes are saved to the CSV and the prediction model is retrained. The admin catalog is sorted by date added (newest first); historical records without dates do not display a placeholder date. Use HTTPS when exposing the backend beyond local development.

The welcome screen has one **Find my phone** action. Keypad/feature phones are removed from the dataset. Rows explicitly marked as non-touchscreen but showing a smartphone display larger than 3 inches, or identified as an iPhone, are retained and corrected to touchscreen; other non-touchscreen rows are removed. Users can explore phones popular in searches even without entering a budget or specifications. Popularity stores only per-phone aggregate search counts in the ignored `Back_end/phone_popularity.sqlite3` database; it does not persist search queries, names, or IP addresses. Users can download the filtered results or an individual phone's specification sheet as a PDF containing the available catalog fields; empty MSRP metadata and missing dates are omitted.

### Resetting admin access

There is no password-reset form. To create a new admin account, stop the backend (Ctrl+C in its terminal), back up the auth database, then remove the database and its SQLite sidecar files. This resets admin credentials/sessions only; it does not change the phone catalog:

```powershell
$backupFolder = Join-Path $env:LOCALAPPDATA "Mela"
New-Item -ItemType Directory -Force -Path $backupFolder | Out-Null
Copy-Item .\Back_end\admin_auth.sqlite3 (Join-Path $backupFolder "admin_auth.sqlite3.bak")
Remove-Item .\Back_end\admin_auth.sqlite3
if (Test-Path .\Back_end\admin_auth.sqlite3-wal) { Remove-Item .\Back_end\admin_auth.sqlite3-wal }
if (Test-Path .\Back_end\admin_auth.sqlite3-shm) { Remove-Item .\Back_end\admin_auth.sqlite3-shm }
python -m uvicorn Back_end.main:app --reload
```

After restarting the frontend, open **Admin** and sign up again. Keep the backup private and remove it after confirming the new account works.

## Tests

```powershell
cd Front_end
npm test -- --watchAll=false
```
