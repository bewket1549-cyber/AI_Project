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

The API uses `Back_end/SmartphoneDataset_Catalog_Clean.csv` for the phone finder, trains from `Back_end/SmartphoneDataset_Training_Clean.csv`, and evaluates on `Back_end/SmartphoneDataset_Test.csv`. These are generated from `Back_end/Smartphone_Full_Dataset.csv`. Regenerate them from the repository root with `python Back_end/prepare_recommendation_datasets.py`. The preparation script makes a reproducible stratified 80/20 split: 2,400 training rows and 600 held-out test rows for the 3,000-row full dataset. The classifier uses every dataset predictor except `Phone_ID`, `Image_Search_URL`, `Video_Search_URL`, and `GIF_Search_URL`; `Recommendation` is the target label. The model includes Brand, Series Tier, and Series Tier Code. The catalog retains link columns for the existing UI, while IDs and links are never model features.

## Admin catalog

Open **Admin** on the welcome page or finder. The admin interface supports English and Amharic. The first admin visit allows one-time account creation with a name, email, and matching passwords of at least 8 characters. Create this account on a trusted local network before exposing the backend publicly: the first signup claims the single admin account. The account and salted password hash are stored in the ignored `Back_end/admin_auth.sqlite3` database; only the first signup succeeds. After signup, sign in to manage the catalog. Admin sessions expire after eight hours; the frontend keeps the session token in memory and the backend stores only its hash. Admins can add, update, and delete records; changes are saved to the catalog, but do not modify or retrain on the separate training data. The admin catalog is sorted alphabetically by model. Use HTTPS when exposing the backend beyond local development.

The welcome screen offers **Find my phone** to open the catalog finder and **Predict a new phone** to enter a phone's specifications and get a recommendation. Users can explore phones popular in searches even without entering a budget or specifications. Popularity stores only per-phone aggregate search counts in the ignored `Back_end/phone_popularity.sqlite3` database; it does not persist search queries, names, or IP addresses. Users can download filtered results or an individual phone's specification sheet as a PDF.

## Recommendation classification

The finder uses one unified search form. Budget, model, RAM, storage, processor, operating system, rating, battery, display, camera, specification, market, fingerprint, and face-unlock criteria can be combined. Search suggestions are generated from the full selectable catalog. Exact matches are marked and ranked first; when none exist, the closest matches are ranked by attribute similarity. Text similarity is approximate and is not an NLP model. The lowest- and highest-price shortcuts sort the catalog by price.

The Random Forest uses all 20 dataset predictors to predict the **Recommendation** target (`1` = Recommended, `0` = Not Recommended). A phone card still offers its detailed recommendation modal through `/phones/{phone_id}/recommendation`. The **Predict a new phone** form omits rating, display specification, camera specification, and market inputs; those features are treated as unknown, excluded from similarity scoring, and imputed by the model pipeline where needed. It also asks for Brand and Series Tier; Series Tier Code is derived automatically. It submits to `/phones/predict-new`, which returns a Random Forest prediction and finds the 11 most similar catalog phones. Similarity weights the entered model-name match at 60% and the available specification matches at 40%; both overall and model-name scores are shown. The final recommendation is the majority label among those 11. The prediction page also displays held-out test accuracy, precision, recall, and F1 scores. The model is trained only from `SmartphoneDataset_Training_Clean.csv`. `/model/metrics` evaluates it on the held-out `SmartphoneDataset_Test.csv` and reports accuracy, balanced accuracy, precision, recall, F1, specificity, ROC-AUC, average precision (PR-AUC), Matthews correlation coefficient, Cohen's kappa, log loss, per-class and macro/weighted classification metrics, and the confusion matrix.

Recommendation labels are dataset-provided and may not be human-verified judgments, so metrics measure agreement with those labels—not real-world user satisfaction. Treat model confidence and recommendation scores as estimates, not guarantees. Recommendation reasons explain price, hardware quality, budget fit, and preference match. Admin changes update the serving catalog but do not retrain the classifier or change the held-out evaluation data.

Phone IDs and the three link columns are retained for catalog/UI behavior but excluded from model features. The preparation script preserves all dataset predictor fields and the binary recommendation target in its training and test files.

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
