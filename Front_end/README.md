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

The API reads the clean selectable catalog from `Back_end/Phone_Recommendation_Catalog_Verified.csv` and trains from `Back_end/Smartphone_Recommendation_Training_Verified.csv`. The original dataset filenames are left untouched. To regenerate both verified files from the raw source, run `python Back_end/prepare_recommendation_datasets.py` from the repository root. The preparation script creates an 80/20 split grouped by normalized base phone model, so RAM/storage variants of a model stay in one split, and rejects duplicate records across the split. It writes only the approved clean schema. The `Price` column is stored and displayed in USD; converted prices are estimates, not US retail prices or manufacturer MSRPs.

## Admin catalog

Open **Admin** on the welcome page or finder. The admin interface supports English and Amharic. The first admin visit allows one-time account creation with a name, email, and matching passwords of at least 8 characters. Create this account on a trusted local network before exposing the backend publicly: the first signup claims the single admin account. The account and salted password hash are stored in the ignored `Back_end/admin_auth.sqlite3` database; only the first signup succeeds. After signup, sign in to manage the catalog. Admin sessions expire after eight hours; the frontend keeps the session token in memory and the backend stores only its hash. Admins can add, update, and delete records; changes are saved to the catalog, but do not modify or retrain on the separate training data. The admin catalog is sorted alphabetically by model. Use HTTPS when exposing the backend beyond local development.

The welcome screen has one **Find my phone** action. Users can explore phones popular in searches even without entering a budget or specifications. Popularity stores only per-phone aggregate search counts in the ignored `Back_end/phone_popularity.sqlite3` database; it does not persist search queries, names, or IP addresses. Users can download filtered results or an individual phone's specification sheet as a PDF.

## Recommendation classification

The finder uses one unified search form. Budget, model, RAM, storage, processor, operating system, rating, battery, display, camera, specification, memory, market, fingerprint, and face-unlock criteria can be combined. Search suggestions are generated from both the training and selectable catalog datasets. Exact matches are marked and ranked first; when none exist, the closest matches are ranked by attribute similarity. Text similarity is approximate and is not an NLP model. The lowest- and highest-price shortcuts sort the catalog by price.

The `/phones/recommendations` endpoint uses a scikit-learn `RandomForestClassifier` to predict **Recommended** or **Not Recommended**. Each phone card also offers a detailed per-phone recommendation modal through `/phones/{phone_id}/recommendation`. The classifier combines numeric specifications, categorical features, and TF-IDF word and word-pair features from model names. The model is trained only from `Smartphone_Recommendation_Training_Verified.csv`; selectable phones and evaluation examples come from the separate, model-disjoint catalog file. `/model/metrics` reports accuracy, precision, recall, and F1 on that held-out catalog.

Recommendation labels are weakly supervised: a documented quality/value rule generates the training and held-out labels from available ratings, specifications, and price. They are not human-verified judgments, so the metrics measure agreement with those generated labels—not real-world user satisfaction. Treat model confidence and recommendation scores as estimates, not guarantees. Sensor values come from the manufacturer-source lookup in `Back_end/Phone_Sensor_Verified_Attributes.csv`; values without verified evidence remain “Not listed” rather than being guessed or randomized. Recommendation reasons explain price, hardware quality, budget fit, and preference match. The rule-generated label for a new admin entry is saved in the catalog, but admin changes do not retrain the classifier or change the held-out evaluation data.

The clean datasets omit unused duplicate descriptions and administrative metadata. Fingerprint and face-unlock values default to “Not listed” for new records; admins may set Yes or No only when verified. The preparation script applies the verified sensor lookup, excludes generated source rows whose model names begin with `Synthetic `, and writes only the clean recommendation schema.

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
