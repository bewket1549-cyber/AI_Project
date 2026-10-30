import hashlib
import hmac
import io
import re
import sqlite3
import contextlib
import secrets
import time
import textwrap
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from typing import Literal, Optional
from urllib.parse import quote_plus

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
from pydantic import BaseModel, Field
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    balanced_accuracy_score,
    classification_report,
    cohen_kappa_score,
    confusion_matrix,
    f1_score,
    log_loss,
    matthews_corrcoef,
    precision_score,
    recall_score,
    roc_auc_score,
)

if __package__:
    from .recommendation_model import (
        LINK_COLUMNS,
        LABEL_COLUMN,
        MODEL_FEATURE_COLUMNS,
        SERIES_TIER_CODES,
        SOURCE_LABEL_COLUMN,
        build_classifier,
        build_model_features,
        normalized_model_group,
        parse_ram_gb,
        price_values,
        recommendation_labels,
    )
else:
    from recommendation_model import (
        LINK_COLUMNS,
        LABEL_COLUMN,
        MODEL_FEATURE_COLUMNS,
        SERIES_TIER_CODES,
        SOURCE_LABEL_COLUMN,
        build_classifier,
        build_model_features,
        normalized_model_group,
        parse_ram_gb,
        price_values,
        recommendation_labels,
    )

app = FastAPI(title="Smartphone Recommendation API")
INR_TO_USD_RATE = 0.010513
EXCHANGE_RATE_DATE = "2026-10-27"
DATASET_PATH = Path(__file__).with_name("SmartphoneDataset_Catalog_Clean.csv")
TRAINING_DATASET_PATH = Path(__file__).with_name(
    "SmartphoneDataset_Training_Clean.csv"
)
TEST_DATASET_PATH = Path(__file__).with_name("SmartphoneDataset_Test.csv")
AUTH_DATABASE_PATH = Path(__file__).with_name("admin_auth.sqlite3")
POPULARITY_DATABASE_PATH = Path(__file__).with_name("phone_popularity.sqlite3")
SESSION_TTL_SECONDS = 8 * 60 * 60
PASSWORD_ITERATIONS = 310_000
TEXT_SEARCH_THRESHOLD = 0.72
ID_COLUMN = "Phone_ID"
SOURCE_DATASET_COLUMNS = (
    ID_COLUMN,
    *MODEL_FEATURE_COLUMNS,
    SOURCE_LABEL_COLUMN,
    *LINK_COLUMNS,
)
EXPECTED_SOURCE_COLUMNS = {
    *SOURCE_DATASET_COLUMNS,
}

# Enable CORS for React Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def validate_source_dataset(dataset_name, dataset):
    unexpected_columns = set(dataset.columns).difference(EXPECTED_SOURCE_COLUMNS)
    missing_columns = EXPECTED_SOURCE_COLUMNS.difference(dataset.columns)
    if unexpected_columns:
        raise ValueError(
            f"The {dataset_name} dataset contains unexpected columns: "
            f"{sorted(unexpected_columns)}"
        )
    if missing_columns:
        raise ValueError(
            f"The {dataset_name} dataset is missing columns: "
            f"{sorted(missing_columns)}"
        )
    if dataset.empty:
        raise ValueError(f"The {dataset_name} dataset has no rows.")
    if dataset[ID_COLUMN].isna().any() or dataset[ID_COLUMN].duplicated().any():
        raise ValueError(f"The {dataset_name} dataset has invalid phone IDs.")
    if not set(pd.to_numeric(dataset[SOURCE_LABEL_COLUMN], errors="coerce")).issubset(
        {0, 1}
    ):
        raise ValueError(
            f"The {dataset_name} dataset must use binary {SOURCE_LABEL_COLUMN} labels."
        )
    if dataset[list(MODEL_FEATURE_COLUMNS)].isna().any().any():
        raise ValueError(f"The {dataset_name} dataset has missing model features.")


raw_df = pd.read_csv(DATASET_PATH)
raw_training_df = pd.read_csv(TRAINING_DATASET_PATH)
raw_test_df = pd.read_csv(TEST_DATASET_PATH)
for dataset_name, dataset in (
    ("catalog", raw_df),
    ("training", raw_training_df),
    ("test", raw_test_df),
):
    validate_source_dataset(dataset_name, dataset)

if set(raw_training_df[ID_COLUMN]) & set(raw_test_df[ID_COLUMN]):
    raise ValueError("A phone ID appears in both training and test datasets.")
if raw_df.drop(columns=[SOURCE_LABEL_COLUMN]).duplicated().any():
    raise ValueError("The smartphone dataset contains duplicate phone records.")


def build_api_dataset(source):
    frame = source.copy()
    frame["Price"] = frame["Price_USD"].map(lambda value: f"${value:.2f}")
    frame["Specification"] = frame["Network_Connectivity"]
    frame["RAM"] = frame["RAM_GB"].map(lambda value: f"{value:g} GB RAM")
    frame["Camera"] = frame["Camera_Spec"]
    frame["Memory"] = "Not listed"
    frame["Internal_Storage"] = frame["Storage_GB"].map(
        lambda value: f"{value:g} GB" if value > 0 else "Not listed"
    )
    for column in ("Has_Fingerprint", "Has_Face_Unlock"):
        frame[column] = frame[column].map(
            {
                1: "Yes",
                1.0: "Yes",
                "1": "Yes",
                "1.0": "Yes",
                0: "No",
                0.0: "No",
                "0": "No",
                "0.0": "No",
            }
        ).fillna("Not listed")
    frame[LABEL_COLUMN] = frame[SOURCE_LABEL_COLUMN].map(
        {1: "Recommended", 0: "Not Recommended"}
    )
    return frame


df = build_api_dataset(raw_df)
training_df = build_api_dataset(raw_training_df)
test_df = build_api_dataset(raw_test_df)
df["_price_usd"] = price_values(df)
training_df["_price_usd"] = price_values(training_df)
test_df["_price_usd"] = price_values(test_df)
for dataset_name, dataset in (
    ("catalog", df),
    ("training", training_df),
    ("test", test_df),
):
    if dataset["_price_usd"].isna().any():
        raise ValueError(f"The {dataset_name} dataset has invalid smartphone prices.")


@contextlib.contextmanager
def get_auth_connection():
    connection = sqlite3.connect(AUTH_DATABASE_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    try:
        with connection:
            yield connection
    finally:
        connection.close()


@contextlib.contextmanager
def get_popularity_connection():
    connection = sqlite3.connect(POPULARITY_DATABASE_PATH, timeout=10)
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def initialize_auth_database():
    with get_auth_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS admin_account (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                full_name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_salt BLOB NOT NULL,
                password_hash BLOB NOT NULL,
                created_at INTEGER NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS admin_sessions (
                token_hash TEXT PRIMARY KEY,
                expires_at INTEGER NOT NULL
            )
            """
        )


initialize_auth_database()


def initialize_popularity_database():
    with get_popularity_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS phone_search_interest (
                phone_id INTEGER PRIMARY KEY,
                search_count INTEGER NOT NULL DEFAULT 0 CHECK (search_count >= 0)
            )
            """
        )


initialize_popularity_database()


model = build_classifier(training_df)


def evaluate_model(test_data):
    test_labels = test_data[LABEL_COLUMN].astype(str)
    test_features = build_model_features(test_data)
    test_predictions = model.predict(test_features)
    positive_class = "Recommended"
    negative_class = "Not Recommended"
    class_labels = [negative_class, positive_class]
    positive_class_index = list(model.classes_).index(positive_class)
    predicted_probabilities = model.predict_proba(test_features)[
        :, positive_class_index
    ]
    matrix = confusion_matrix(
        test_labels, test_predictions, labels=class_labels
    )
    true_negative, false_positive, false_negative, true_positive = (
        int(value) for value in matrix.ravel()
    )
    specificity = (
        true_negative / (true_negative + false_positive)
        if true_negative + false_positive
        else 0.0
    )
    report = classification_report(
        test_labels,
        test_predictions,
        labels=class_labels,
        output_dict=True,
        zero_division=0,
    )

    def format_class_metrics(metrics):
        return {
            metric: round(float(value), 4) if metric != "support" else int(value)
            for metric, value in metrics.items()
        }

    return {
        "test_rows": int(len(test_data)),
        "accuracy": round(float(accuracy_score(test_labels, test_predictions)), 4),
        "balanced_accuracy": round(
            float(balanced_accuracy_score(test_labels, test_predictions)), 4
        ),
        "precision": round(
            float(
                precision_score(
                    test_labels,
                    test_predictions,
                    pos_label=positive_class,
                    zero_division=0,
                )
            ),
            4,
        ),
        "recall": round(
            float(
                recall_score(
                    test_labels,
                    test_predictions,
                    pos_label=positive_class,
                    zero_division=0,
                )
            ),
            4,
        ),
        "f1": round(
            float(
                f1_score(
                    test_labels,
                    test_predictions,
                    pos_label=positive_class,
                    zero_division=0,
                )
            ),
            4,
        ),
        "specificity": round(specificity, 4),
        "roc_auc": round(
            float(roc_auc_score(test_labels, predicted_probabilities)), 4
        ),
        "average_precision": round(
            float(
                average_precision_score(
                    test_labels,
                    predicted_probabilities,
                    pos_label=positive_class,
                )
            ),
            4,
        ),
        "matthews_correlation_coefficient": round(
            float(matthews_corrcoef(test_labels, test_predictions)), 4
        ),
        "cohen_kappa": round(
            float(cohen_kappa_score(test_labels, test_predictions)), 4
        ),
        "log_loss": round(
            float(
                log_loss(
                    test_labels,
                    model.predict_proba(test_features),
                    labels=model.classes_,
                )
            ),
            4,
        ),
        "per_class_metrics": {
            label: format_class_metrics(report[label])
            for label in class_labels
        },
        "macro_avg": format_class_metrics(report["macro avg"]),
        "weighted_avg": format_class_metrics(report["weighted avg"]),
        "confusion_matrix": {
            "labels": class_labels,
            "matrix": matrix.tolist(),
            "true_negative": true_negative,
            "false_positive": false_positive,
            "false_negative": false_negative,
            "true_positive": true_positive,
        },
        "training_rows": int(len(training_df)),
        "training_model_groups": int(training_df["Model"].map(normalized_model_group).nunique()),
        "test_model_groups": int(test_data["Model"].map(normalized_model_group).nunique()),
    }


model_metrics = evaluate_model(test_df)


@app.get("/model/metrics")
def get_model_metrics():
    return {
        "model": "RandomForestClassifier",
        "text_features": "TF-IDF word and word-pair features from phone model names",
        "target": SOURCE_LABEL_COLUMN,
        "feature_columns": list(MODEL_FEATURE_COLUMNS),
        "excluded_columns": [ID_COLUMN, *LINK_COLUMNS],
        "label_source": "Dataset-provided recommendation labels; not human-verified",
        **model_metrics,
    }


def persist_dataset(updated_df):
    temporary_path = DATASET_PATH.with_suffix(".tmp")
    source = updated_df.loc[:, SOURCE_DATASET_COLUMNS].copy()
    for column in ("Has_Fingerprint", "Has_Face_Unlock"):
        source[column] = source[column].map(
            {"Yes": 1, "No": 0}
        ).fillna(source[column])
    source.to_csv(
        temporary_path, index=False, encoding="utf-8-sig"
    )
    temporary_path.replace(DATASET_PATH)


def valid_email(email):
    return bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email.strip()))


def hash_admin_password(password, salt):
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS
    )


def require_admin(x_admin_token: Optional[str] = Header(default=None)):
    if not x_admin_token:
        raise HTTPException(status_code=401, detail="Admin sign-in is required.")
    token_hash = hashlib.sha256(x_admin_token.encode("utf-8")).hexdigest()
    now = int(time.time())
    with get_auth_connection() as connection:
        connection.execute("DELETE FROM admin_sessions WHERE expires_at <= ?", (now,))
        session = connection.execute(
            "SELECT 1 FROM admin_sessions WHERE token_hash = ? AND expires_at > ?",
            (token_hash, now),
        ).fetchone()
    if not session:
        raise HTTPException(status_code=401, detail="Admin session is invalid or expired.")


def create_admin_session(connection):
    token = secrets.token_urlsafe(32)
    connection.execute(
        "INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)",
        (
            hashlib.sha256(token.encode("utf-8")).hexdigest(),
            int(time.time()) + SESSION_TTL_SECONDS,
        ),
    )
    return token


class AdminLogin(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str


class AdminSignup(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=256)


class AdminPhoneInput(BaseModel):
    model: str = Field(min_length=1, max_length=120)
    brand: str = Field(min_length=1, max_length=80)
    series_tier: Literal["Budget", "Mid-Range", "Flagship"]
    price_usd: float = Field(gt=0)
    rating: float = Field(ge=0, le=100)
    processor: str = Field(min_length=1, max_length=120)
    operating_system: str = Field(default="", max_length=80)
    specification: str = Field(default="", max_length=1000)
    ram_gb: int = Field(gt=0, le=1024)
    storage_gb: int = Field(gt=0, le=100000)
    battery_mah: int = Field(gt=0, le=100000)
    display_size_inches: float = Field(gt=0, le=100)
    refresh_rate_hz: int = Field(gt=0, le=1000)
    camera: str = Field(default="", max_length=300)
    camera_mp: int = Field(gt=0, le=10000)
    memory: str = Field(default="", max_length=300)
    has_fingerprint: Literal["Yes", "No", "Not listed"] = "Not listed"
    has_face_unlock: Literal["Yes", "No", "Not listed"] = "Not listed"
    market: str = Field(default="US", max_length=80)
    image_search_url: str = Field(default="", max_length=2000)
    video_search_url: str = Field(default="", max_length=2000)
    gif_search_url: str = Field(default="", max_length=2000)


class NewPhonePredictionInput(BaseModel):
    model: str = Field(min_length=1, max_length=120)
    brand: str = Field(min_length=1, max_length=80)
    series_tier: Literal["Budget", "Mid-Range", "Flagship"]
    price_usd: float = Field(gt=0)
    rating: Optional[float] = Field(default=None, ge=0, le=100)
    processor: str = Field(min_length=1, max_length=300)
    ram_gb: float = Field(ge=0, le=1024)
    storage_gb: float = Field(ge=0, le=100000)
    battery_mah: float = Field(ge=0, le=100000)
    display_spec: Optional[str] = Field(default=None, max_length=1000)
    display_size_inches: float = Field(ge=0, le=100)
    refresh_rate_hz: float = Field(ge=0, le=1000)
    camera_spec: Optional[str] = Field(default=None, max_length=1000)
    main_camera_mp: float = Field(ge=0, le=10000)
    operating_system: str = Field(min_length=1, max_length=120)
    network_connectivity: str = Field(min_length=1, max_length=500)
    has_fingerprint: Literal["Yes", "No"]
    has_face_unlock: Literal["Yes", "No"]
    market: Optional[str] = Field(default=None, max_length=80)


class PhoneSearchInterest(BaseModel):
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    ram_gb: Optional[int] = None
    storage_gb: Optional[int] = None
    battery_mah: Optional[int] = None
    display_size_inches: Optional[float] = None
    refresh_rate_hz: Optional[int] = None
    camera_mp: Optional[int] = None
    model: Optional[str] = None
    processor: Optional[str] = None
    operating_system: Optional[str] = None
    rating: Optional[float] = None
    specification: Optional[str] = None
    memory: Optional[str] = None
    market: Optional[str] = None
    has_fingerprint: Optional[Literal["Yes", "No", "Not listed"]] = None
    has_face_unlock: Optional[Literal["Yes", "No", "Not listed"]] = None


def admin_phone_record(phone):
    def text_value(column):
        value = phone[column]
        return "" if pd.isna(value) else str(value)

    return {
        "phone_id": int(phone["Phone_ID"]),
        "model": text_value("Model"),
        "brand": text_value("Brand"),
        "series_tier": text_value("Series_Tier"),
        "price_usd": float(phone["_price_usd"]),
        "rating": float(phone["Rating"]) if pd.notna(phone["Rating"]) else 0,
        "processor": text_value("Processor"),
        "operating_system": text_value("OperatingSystem"),
        "specification": text_value("Specification"),
        "ram_gb": int(parse_ram_gb(phone["RAM"])),
        "storage_gb": int(phone["Storage_GB"]),
        "battery_mah": int(phone["Battery_mAh"]),
        "display_size_inches": float(phone["Display_Size_Inches"]),
        "refresh_rate_hz": int(phone["Refresh_Rate_Hz"]),
        "camera": text_value("Camera"),
        "camera_mp": int(phone["Main_Camera_MP"]),
        "memory": text_value("Memory"),
        "has_fingerprint": text_value("Has_Fingerprint"),
        "has_face_unlock": text_value("Has_Face_Unlock"),
        "market": text_value("Market"),
        "image_search_url": text_value("Image_Search_URL"),
        "video_search_url": text_value("Video_Search_URL"),
        "gif_search_url": text_value("GIF_Search_URL"),
    }


def apply_admin_phone(phone, values, phone_id):
    updated = phone.copy()
    query = quote_plus(
        f'{values["model"]} {values["ram_gb"]}GB RAM {values["storage_gb"]}GB storage'
    )
    updated.update(
        {
            "Phone_ID": int(phone_id),
            "Model": values["model"].strip(),
            "Brand": values["brand"].strip(),
            "Series_Tier": values["series_tier"],
            "Series_Tier_Code": SERIES_TIER_CODES[values["series_tier"]],
            "Price_USD": values["price_usd"],
            "Price": f'${values["price_usd"]:.2f}',
            "Rating": values["rating"],
            "Specification": values["specification"].strip() or (
                f'{values["ram_gb"]} GB RAM, {values["storage_gb"]} GB storage, '
                f'{values["battery_mah"]} mAh battery, '
                f'{values["display_size_inches"]} inch display'
            ),
            "Processor": values["processor"].strip(),
            "OperatingSystem": values["operating_system"].strip(),
            "RAM_GB": values["ram_gb"],
            "RAM": f'{values["ram_gb"]} GB RAM',
            "Internal_Storage": f'{values["storage_gb"]} GB',
            "Storage_GB": values["storage_gb"],
            "Battery_mAh": values["battery_mah"],
            "Display_Size_Inches": values["display_size_inches"],
            "Display_Spec": (
                f'{values["display_size_inches"]:g} inches, '
                f'{values["refresh_rate_hz"]} Hz display'
            ),
            "Refresh_Rate_Hz": values["refresh_rate_hz"],
            "Camera": values["camera"].strip() or f'{values["camera_mp"]} MP',
            "Camera_Spec": values["camera"].strip()
            or f'{values["camera_mp"]} MP camera',
            "Main_Camera_MP": values["camera_mp"],
            "Memory": values["memory"].strip(),
            "Has_Fingerprint": values["has_fingerprint"].strip(),
            "Has_Face_Unlock": values["has_face_unlock"].strip(),
            "Market": values["market"].strip(),
            "Network_Connectivity": values["specification"].strip()
            or "Not listed",
            "Image_Search_URL": values["image_search_url"].strip()
            or f"https://www.google.com/search?tbm=isch&q={query}",
            "Video_Search_URL": values["video_search_url"].strip()
            or f"https://www.youtube.com/results?search_query={query}",
            "GIF_Search_URL": values["gif_search_url"].strip()
            or f"https://tenor.com/search/{query}-gifs",
        }
    )
    return updated


def save_admin_dataset(updated_df):
    global df
    updated_df["_price_usd"] = price_values(updated_df)
    persist_dataset(updated_df)
    df = updated_df


class PhoneRecommendationInput(BaseModel):
    max_price: Optional[float] = Field(default=None, gt=0)
    model: Optional[str] = Field(default=None, max_length=120)
    ram_gb: Optional[int] = Field(default=None, gt=0, le=1024)
    storage_gb: Optional[int] = Field(default=None, gt=0, le=100000)
    battery_mah: Optional[int] = Field(default=None, gt=0, le=100000)
    display_size_inches: Optional[float] = Field(default=None, gt=0, le=100)
    refresh_rate_hz: Optional[int] = Field(default=None, gt=0, le=1000)
    camera_mp: Optional[int] = Field(default=None, gt=0, le=10000)
    rating: Optional[float] = Field(default=None, ge=0, le=100)
    processor: Optional[str] = Field(default=None, max_length=120)
    operating_system: Optional[str] = Field(default=None, max_length=80)
    specification: Optional[str] = Field(default=None, max_length=1000)
    memory: Optional[str] = Field(default=None, max_length=300)
    market: Optional[str] = Field(default=None, max_length=80)
    has_fingerprint: Optional[Literal["Yes", "No", "Not listed"]] = None
    has_face_unlock: Optional[Literal["Yes", "No", "Not listed"]] = None
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=24, ge=1, le=100)


@app.get("/phones/options")
def get_phone_filter_options():
    available_phones = df

    def text_options(column):
        return sorted(
            value
            for value in available_phones[column].dropna().astype(str).unique()
            if value and value != "Not listed"
        )

    def numeric_options(column, integer=True, positive_only=True):
        values = pd.to_numeric(
            available_phones[column], errors="coerce"
        ).dropna().unique()
        values = sorted(
            value for value in values if value > 0 or (not positive_only and value == 0)
        )
        return [int(value) for value in values] if integer else [float(value) for value in values]

    return {
        "ram_gb": sorted(
            float(value)
            for value in available_phones["RAM"].map(parse_ram_gb).dropna().unique()
            if value > 0
        ),
        "storage_gb": numeric_options("Storage_GB"),
        "battery_mah": numeric_options("Battery_mAh"),
        "display_size_inches": numeric_options(
            "Display_Size_Inches", integer=False
        ),
        "refresh_rate_hz": numeric_options("Refresh_Rate_Hz"),
        "camera_mp": numeric_options("Main_Camera_MP"),
        "models": text_options("Model"),
        "brands": text_options("Brand"),
        "series_tiers": text_options("Series_Tier"),
        "processors": text_options("Processor"),
        "operating_systems": text_options("OperatingSystem"),
        "specifications": text_options("Specification"),
        "display_specs": text_options("Display_Spec"),
        "camera_specs": text_options("Camera_Spec"),
        "network_connectivities": text_options("Network_Connectivity"),
        "memories": text_options("Memory"),
        "markets": text_options("Market"),
        "ratings": numeric_options("Rating", integer=False, positive_only=False),
        "has_fingerprint": sorted(
            available_phones["Has_Fingerprint"].dropna().astype(str).unique()
        ),
        "has_face_unlock": sorted(
            available_phones["Has_Face_Unlock"].dropna().astype(str).unique()
        ),
        "cameras": text_options("Camera"),
        "prices": numeric_options("_price_usd", integer=False),
        "min_price": float(available_phones["_price_usd"].min()),
        "max_price": float(available_phones["_price_usd"].max()),
        "inr_to_usd_rate": INR_TO_USD_RATE,
        "exchange_rate_date": EXCHANGE_RATE_DATE,
    }


@app.get("/phones")
def search_phones(
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    ram_gb: Optional[int] = None,
    storage_gb: Optional[int] = None,
    battery_mah: Optional[int] = None,
    display_size_inches: Optional[float] = None,
    refresh_rate_hz: Optional[int] = None,
    camera_mp: Optional[int] = None,
    rating: Optional[float] = None,
    model: Optional[str] = None,
    processor: Optional[str] = None,
    operating_system: Optional[str] = None,
    specification: Optional[str] = None,
    memory: Optional[str] = None,
    market: Optional[str] = None,
    has_fingerprint: Optional[Literal["Yes", "No", "Not listed"]] = None,
    has_face_unlock: Optional[Literal["Yes", "No", "Not listed"]] = None,
    sort: Literal["model", "price_asc", "price_desc"] = "model",
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=60, ge=1, le=100),
):
    preferences = {
        key: value
        for key, value in {
            "min_price": min_price,
            "max_price": max_price,
            "ram_gb": ram_gb,
            "storage_gb": storage_gb,
            "battery_mah": battery_mah,
            "display_size_inches": display_size_inches,
            "refresh_rate_hz": refresh_rate_hz,
            "camera_mp": camera_mp,
            "rating": rating,
            "model": model,
            "processor": processor,
            "operating_system": operating_system,
            "specification": specification,
            "memory": memory,
            "market": market,
            "has_fingerprint": has_fingerprint,
            "has_face_unlock": has_face_unlock,
        }.items()
        if value is not None and value != ""
    }
    ranked = rank_phone_matches(preferences, sort)
    total = len(ranked)
    page = ranked.iloc[offset : offset + limit]
    items = [
        {
            **phone_public_record(phone),
            "exact_match": bool(phone["_exact_match"]),
            "match_score": float(phone["_match_score"]),
        }
        for _, phone in page.iterrows()
    ]
    return {"items": items, "total": total, "offset": offset, "limit": limit}


def phone_public_record(phone):
    storage = phone["Internal_Storage"]
    storage_gb = pd.to_numeric(phone["Storage_GB"], errors="coerce")
    if pd.isna(storage) or str(storage).strip().lower() in {"", "unknown", "n/a"}:
        storage = (
            f"{int(storage_gb)} GB"
            if pd.notna(storage_gb) and storage_gb > 0
            else "Not listed"
        )
    return {
        "model": phone["Model"],
        "brand": phone["Brand"],
        "series_tier": phone["Series_Tier"],
        "phone_id": int(phone["Phone_ID"]),
        "price_usd": float(phone["_price_usd"]),
        "rating": float(phone["Rating"]) if pd.notna(phone["Rating"]) else None,
        "processor": phone["Processor"],
        "ram": phone["RAM"],
        "ram_gb": int(parse_ram_gb(phone["RAM"]))
        if pd.notna(parse_ram_gb(phone["RAM"]))
        else None,
        "storage": storage,
        "storage_gb": int(phone["Storage_GB"])
        if pd.notna(phone["Storage_GB"])
        else None,
        "battery_mah": int(phone["Battery_mAh"])
        if pd.notna(phone["Battery_mAh"])
        else None,
        "display_size_inches": float(phone["Display_Size_Inches"])
        if pd.notna(phone["Display_Size_Inches"])
        else None,
        "refresh_rate_hz": int(phone["Refresh_Rate_Hz"])
        if pd.notna(phone["Refresh_Rate_Hz"])
        else None,
        "camera_mp": int(phone["Main_Camera_MP"])
        if pd.notna(phone["Main_Camera_MP"])
        else None,
        "camera": phone["Camera"],
        "memory": phone["Memory"],
        "operating_system": phone["OperatingSystem"],
        "specification": phone["Specification"],
        "market": phone["Market"],
        "has_fingerprint": phone["Has_Fingerprint"],
        "has_face_unlock": phone["Has_Face_Unlock"],
        "image_search_url": phone["Image_Search_URL"],
        "video_search_url": phone["Video_Search_URL"],
        "gif_search_url": phone["GIF_Search_URL"],
    }


def rank_phone_matches(preferences, sort="model"):
    numeric_columns = {
        "min_price": "_price_usd",
        "max_price": "_price_usd",
        "ram_gb": "RAM",
        "storage_gb": "Storage_GB",
        "battery_mah": "Battery_mAh",
        "display_size_inches": "Display_Size_Inches",
        "refresh_rate_hz": "Refresh_Rate_Hz",
        "camera_mp": "Main_Camera_MP",
        "rating": "Rating",
    }
    text_columns = {
        "model": "Model",
        "processor": "Processor",
        "operating_system": "OperatingSystem",
        "specification": "Specification",
        "memory": "Memory",
        "market": "Market",
    }
    sensor_columns = {
        "has_fingerprint": "Has_Fingerprint",
        "has_face_unlock": "Has_Face_Unlock",
    }
    scored = []
    reference = df

    def numeric_value(frame, preference, column):
        if preference == "ram_gb":
            if isinstance(frame, pd.Series):
                return parse_ram_gb(frame[column])
            return frame[column].map(parse_ram_gb)
        return pd.to_numeric(frame[column], errors="coerce")

    for _, phone in df.iterrows():
        scores = []
        exact = bool(preferences)
        for preference, column in numeric_columns.items():
            target = preferences.get(preference)
            if target is None:
                continue
            value = (
                float(phone["_price_usd"])
                if column == "_price_usd"
                else numeric_value(phone, preference, column)
            )
            target = float(target)
            if preference == "max_price":
                difference = max(0.0, value - target)
            elif preference == "min_price":
                difference = max(0.0, target - value)
            else:
                difference = abs(float(value) - target) if pd.notna(value) else float("inf")
                exact = exact and difference < 1e-8
            if preference in {"min_price", "max_price"}:
                exact = exact and difference == 0

            reference_values = numeric_value(reference, preference, column).dropna()
            feature_range = (
                float(reference_values.max() - reference_values.min())
                if not reference_values.empty
                else 0.0
            )
            scale = max(feature_range * 0.25, abs(target) * 0.1, 1.0)
            scores.append(max(0.0, 1.0 - difference / scale))

        for preference, column in text_columns.items():
            target = preferences.get(preference)
            if target is None:
                continue
            target_text = str(target).strip().casefold()
            value = "" if pd.isna(phone[column]) else str(phone[column]).strip()
            normalized_value = value.casefold()
            if target_text == normalized_value:
                score = 1.0
            elif target_text in normalized_value or normalized_value in target_text:
                score = 0.85
            else:
                score = SequenceMatcher(None, target_text, normalized_value).ratio()
            exact = exact and score == 1.0
            scores.append(score)

        for preference, column in sensor_columns.items():
            target = preferences.get(preference)
            if target is None:
                continue
            score = 1.0 if str(phone[column]).casefold() == str(target).casefold() else 0.0
            exact = exact and score == 1.0
            scores.append(score)

        scored.append(
            {
                **phone.to_dict(),
                "_exact_match": exact,
                "_match_score": round(sum(scores) / len(scores) * 100, 1)
                if scores
                else 100.0,
            }
        )

    ranked = pd.DataFrame(scored)
    if not preferences and sort == "price_asc":
        return ranked.sort_values(["_price_usd", "Model"], ascending=[True, True], kind="stable")
    if not preferences and sort == "price_desc":
        return ranked.sort_values(["_price_usd", "Model"], ascending=[False, True], kind="stable")
    if not preferences:
        return ranked.sort_values(
            "Model",
            key=lambda values: values.astype(str).str.casefold(),
            kind="stable",
        )
    return ranked.sort_values(
        ["_exact_match", "_match_score", "_price_usd", "Model"],
        ascending=[False, False, sort != "price_desc", True],
        key=lambda values: values.astype(str).str.casefold()
        if values.name == "Model"
        else values,
        kind="stable",
    )


@app.post("/phones/recommendations")
def recommend_phones(preferences: PhoneRecommendationInput):
    preference_data = preferences.model_dump()
    preference_values = {
        key: value
        for key, value in preference_data.items()
        if key not in {"offset", "limit"} and value is not None
    }
    if not preference_values and preferences.max_price is None:
        raise HTTPException(
            status_code=422,
            detail="Provide at least one budget or phone preference.",
        )

    candidates = df
    if preferences.max_price is not None:
        candidates = candidates[candidates["_price_usd"] <= preferences.max_price]
    if preferences.model:
        candidates = candidates[
            candidates["Model"].map(
                lambda candidate: fuzzy_text_match(candidate, preferences.model)
            )
        ]

    scored_items = []
    for _, phone in candidates.iterrows():
        input_data = build_model_features(phone)
        for preference, column in (
            ("has_fingerprint", "Has_Fingerprint"),
            ("has_face_unlock", "Has_Face_Unlock"),
        ):
            selected_value = preference_data.get(preference)
            if selected_value is not None:
                input_data.loc[
                    :, column
                ] = 1 if selected_value == "Yes" else 0
        probabilities = model.predict_proba(input_data)[0]
        recommended_probability = float(
            probabilities[list(model.classes_).index("Recommended")] * 100
        )
        prediction = str(model.classes_[int(probabilities.argmax())])
        match_score = calculate_preference_match(phone, preference_values)
        recommended = prediction == "Recommended" and (
            not preference_values or match_score >= 50
        )
        recommendation_reason = explain_recommendation(
            phone, preference_values, recommended
        )
        recommendation_score = round(
            match_score * 0.35 + recommended_probability * 0.65, 1
        )
        scored_items.append(
            {
                **phone_public_record(phone),
                "recommended": recommended,
                "recommendation_reason": recommendation_reason,
                "recommendation_score": recommendation_score,
                "match_score": match_score,
                "predicted_label": prediction,
                "confidence": round(float(probabilities.max() * 100), 2),
                "recommendation_probability": round(recommended_probability, 2),
            }
        )

    scored_items.sort(
        key=lambda item: (
            not item["recommended"],
            -item["recommendation_score"],
            -item["match_score"],
            item["price_usd"],
            item["model"].casefold(),
        )
    )
    total = len(scored_items)
    page = scored_items[preferences.offset : preferences.offset + preferences.limit]
    return {
        "items": page,
        "total": total,
        "offset": preferences.offset,
        "limit": preferences.limit,
    }


@app.post("/phones/{phone_id}/recommendation")
def recommend_phone(phone_id: int, preferences: PhoneRecommendationInput):
    phone_rows = df[df["Phone_ID"].astype(str) == str(phone_id)]
    if phone_rows.empty:
        raise HTTPException(status_code=404, detail="Phone not found.")

    phone = phone_rows.iloc[0]
    preference_values = {
        key: value
        for key, value in preferences.model_dump().items()
        if key not in {"offset", "limit"} and value is not None
    }
    probabilities = model.predict_proba(build_model_features(phone))[0]
    recommended_probability = float(
        probabilities[list(model.classes_).index("Recommended")] * 100
    )
    prediction = str(model.classes_[int(probabilities.argmax())])
    match_score = calculate_preference_match(phone, preference_values)
    recommended = prediction == "Recommended" and (
        not preference_values or match_score >= 50
    )
    return {
        **phone_public_record(phone),
        "recommended": recommended,
        "label": "Recommended" if recommended else "Not Recommended",
        "recommendation_reason": explain_recommendation(
            phone, preference_values, recommended
        ),
        "recommendation_score": round(
            match_score * 0.35 + recommended_probability * 0.65, 1
        ),
        "match_score": match_score,
        "predicted_label": prediction,
        "confidence": round(float(probabilities.max() * 100), 2),
        "recommendation_probability": round(recommended_probability, 2),
    }


def new_phone_similarity_scores(candidate):
    numeric_columns = {
        "Series_Tier_Code",
        "Price_USD",
        "Rating",
        "RAM_GB",
        "Storage_GB",
        "Battery_mAh",
        "Display_Size_Inches",
        "Refresh_Rate_Hz",
        "Main_Camera_MP",
        "Has_Fingerprint",
        "Has_Face_Unlock",
    }
    catalog_features = df.loc[:, MODEL_FEATURE_COLUMNS].copy()
    for column in ("Has_Fingerprint", "Has_Face_Unlock"):
        catalog_features[column] = catalog_features[column].map(
            {"Yes": 1, "No": 0}
        )
    numeric_ranges = {
        column: pd.to_numeric(catalog_features[column], errors="coerce")
        for column in numeric_columns
    }
    feature_ranges = {
        column: float(values.max() - values.min())
        for column, values in numeric_ranges.items()
    }
    similarities = []
    model_name_similarities = []
    for _, phone in catalog_features.iterrows():
        candidate_model = str(candidate["Model"]).strip().casefold()
        phone_model = str(phone["Model"]).strip().casefold()
        model_name_similarity = SequenceMatcher(
            None, candidate_model, phone_model
        ).ratio()
        attribute_scores = []
        for column in MODEL_FEATURE_COLUMNS:
            if column == "Model":
                continue
            candidate_value = candidate[column]
            if candidate_value is None or pd.isna(candidate_value):
                continue
            phone_value = phone[column]
            if column in numeric_columns:
                feature_range = feature_ranges[column]
                numeric_phone_value = pd.to_numeric(
                    pd.Series([phone_value]), errors="coerce"
                ).iloc[0]
                if pd.isna(numeric_phone_value):
                    score = 0.5
                else:
                    difference = abs(float(candidate_value) - float(numeric_phone_value))
                    score = (
                        1.0
                        if feature_range == 0 and difference == 0
                        else 0.0
                        if feature_range == 0
                        else max(0.0, 1.0 - difference / feature_range)
                    )
            else:
                candidate_text = str(candidate_value).strip().casefold()
                phone_text = str(phone_value).strip().casefold()
                score = SequenceMatcher(
                    None, candidate_text, phone_text
                ).ratio()
            attribute_scores.append(score)
        attribute_similarity = (
            sum(attribute_scores) / len(attribute_scores)
            if attribute_scores
            else 0.5
        )
        similarities.append(
            round((model_name_similarity * 0.6 + attribute_similarity * 0.4) * 100, 2)
        )
        model_name_similarities.append(round(model_name_similarity * 100, 2))
    return similarities, model_name_similarities


@app.post("/phones/predict-new")
def predict_new_phone(phone_input: NewPhonePredictionInput):
    if len(df) < 11:
        raise HTTPException(
            status_code=503,
            detail="At least 11 catalog phones are required for similarity voting.",
        )

    input_values = phone_input.model_dump()
    required_text_fields = (
        "model",
        "processor",
        "operating_system",
        "network_connectivity",
    )
    if any(not str(input_values[field]).strip() for field in required_text_fields):
        raise HTTPException(
            status_code=422,
            detail="All phone description fields must contain non-blank values.",
        )
    candidate = {
        "Model": input_values["model"].strip(),
        "Brand": input_values["brand"].strip(),
        "Series_Tier": input_values["series_tier"],
        "Series_Tier_Code": SERIES_TIER_CODES[input_values["series_tier"]],
        "Price_USD": input_values["price_usd"],
        "Rating": input_values["rating"],
        "Processor": input_values["processor"].strip(),
        "RAM_GB": input_values["ram_gb"],
        "Storage_GB": input_values["storage_gb"],
        "Battery_mAh": input_values["battery_mah"],
        "Display_Spec": input_values["display_spec"],
        "Display_Size_Inches": input_values["display_size_inches"],
        "Refresh_Rate_Hz": input_values["refresh_rate_hz"],
        "Camera_Spec": input_values["camera_spec"],
        "Main_Camera_MP": input_values["main_camera_mp"],
        "OperatingSystem": input_values["operating_system"].strip(),
        "Network_Connectivity": input_values["network_connectivity"].strip(),
        "Has_Fingerprint": 1 if input_values["has_fingerprint"] == "Yes" else 0,
        "Has_Face_Unlock": 1 if input_values["has_face_unlock"] == "Yes" else 0,
        "Market": input_values["market"],
    }
    candidate_frame = pd.DataFrame([candidate])
    probabilities = model.predict_proba(build_model_features(candidate_frame))[0]
    random_forest_prediction = str(model.classes_[int(probabilities.argmax())])
    random_forest_confidence = round(float(probabilities.max() * 100), 2)

    similarity_scores, model_name_similarity_scores = new_phone_similarity_scores(
        candidate
    )
    nearest_indices = sorted(
        range(len(similarity_scores)),
        key=lambda index: (-similarity_scores[index], int(df.iloc[index][ID_COLUMN])),
    )[:11]
    neighbors = []
    for index in nearest_indices:
        source_phone = df.iloc[index]
        recommendation = (
            "Recommended"
            if int(source_phone[SOURCE_LABEL_COLUMN]) == 1
            else "Not Recommended"
        )
        neighbors.append(
            {
                **phone_public_record(df.iloc[index]),
                "similarity_score": similarity_scores[index],
                "model_name_similarity_score": model_name_similarity_scores[index],
                "recommendation_label": recommendation,
            }
        )

    recommended_votes = sum(
        neighbor["recommendation_label"] == "Recommended"
        for neighbor in neighbors
    )
    not_recommended_votes = len(neighbors) - recommended_votes
    prediction = (
        "Recommended"
        if recommended_votes > not_recommended_votes
        else "Not Recommended"
    )
    return {
        "recommendation": prediction,
        "recommended": prediction == "Recommended",
        "recommendation_reason": (
            f"{recommended_votes} of the 11 most similar catalog phones are "
            f"labeled Recommended; {not_recommended_votes} are labeled "
            "Not Recommended."
        ),
        "neighbors_used": len(neighbors),
        "vote_counts": {
            "Recommended": recommended_votes,
            "Not Recommended": not_recommended_votes,
        },
        "random_forest_prediction": random_forest_prediction,
        "random_forest_confidence": random_forest_confidence,
        "neighbors": neighbors,
    }


def explain_recommendation(phone, preferences, recommended):
    reference = df

    def percentile(column, value, parser=None):
        values = (
            reference[column].map(parser)
            if parser is not None
            else pd.to_numeric(reference[column], errors="coerce")
        ).dropna()
        if values.empty or pd.isna(value):
            return 0.5
        return float((values <= value).mean())

    price = float(phone["_price_usd"])
    ram = parse_ram_gb(phone["RAM"])
    storage = pd.to_numeric(phone["Storage_GB"], errors="coerce")
    battery = pd.to_numeric(phone["Battery_mAh"], errors="coerce")
    rating = pd.to_numeric(phone["Rating"], errors="coerce")
    display = pd.to_numeric(phone["Display_Size_Inches"], errors="coerce")
    price_rank = percentile("_price_usd", price)
    ram_rank = percentile("RAM", ram, parse_ram_gb)
    storage_rank = percentile("Storage_GB", storage)
    battery_rank = percentile("Battery_mAh", battery)
    rating_rank = percentile("Rating", rating)

    budget = preferences.get("max_price")
    over_budget = budget is not None and price > float(budget)
    low_hardware = []
    high_hardware = []
    for rank, label in (
        (ram_rank, "RAM"),
        (storage_rank, "storage"),
        (battery_rank, "battery capacity"),
        (rating_rank, "rating"),
    ):
        if rank <= 0.25:
            low_hardware.append(label)
        elif rank >= 0.75:
            high_hardware.append(label)

    if recommended:
        reasons = []
        if budget is not None and not over_budget:
            reasons.append(f"its ${price:,.2f} price is within your ${float(budget):,.2f} budget")
        reasons.extend(f"high {label}" for label in high_hardware[:2])
        if pd.notna(display) and 6.0 <= float(display) <= 6.9:
            reasons.append(f"an optimal {float(display):g}-inch display size")
        if not reasons:
            reasons.append(
                "its balanced price, rating, and hardware value compared with the training catalog"
            )
        return "Recommended due to " + " and ".join(reasons) + "."

    if over_budget and price_rank >= 0.75 and low_hardware:
        hardware = " and ".join(f"low {label}" for label in low_hardware[:2])
        return f"Not Recommended due to high price relative to {hardware}."
    reasons = []
    if over_budget:
        reasons.append(f"its ${price:,.2f} price exceeds your ${float(budget):,.2f} budget")
    reasons.extend(f"low {label}" for label in low_hardware[:2])
    if not reasons and price_rank >= 0.75:
        reasons.append("its high price relative to its rating and hardware")
    if not reasons:
        reasons.append(
            "its overall price, rating, and hardware profile falls below the training-catalog value threshold"
        )
    return "Not Recommended due to " + " and ".join(reasons) + "."


def calculate_preference_match(phone, preferences):
    numeric_preferences = {
        "ram_gb": "RAM",
        "storage_gb": "Storage_GB",
        "battery_mah": "Battery_mAh",
        "display_size_inches": "Display_Size_Inches",
        "refresh_rate_hz": "Refresh_Rate_Hz",
        "camera_mp": "Main_Camera_MP",
        "rating": "Rating",
        "max_price": "_price_usd",
    }
    text_preferences = {
        "model": "Model",
        "processor": "Processor",
        "operating_system": "OperatingSystem",
        "specification": "Specification",
        "memory": "Memory",
        "market": "Market",
    }
    scores = []
    for preference, column in numeric_preferences.items():
        target = preferences.get(preference)
        value = (
            parse_ram_gb(phone[column])
            if column == "RAM"
            else float(phone[column])
            if column == "_price_usd"
            else pd.to_numeric(phone[column], errors="coerce")
        )
        if target is None or pd.isna(value):
            continue
        if preference == "max_price":
            scores.append(1.0 if float(value) <= float(target) else 0.0)
            continue
        catalog_values = (
            pd.concat([df[column], training_df[column]], ignore_index=True)
            .map(parse_ram_gb)
            .dropna()
            if column == "RAM"
            else pd.to_numeric(
                pd.concat([df[column], training_df[column]], ignore_index=True),
                errors="coerce",
            ).dropna()
        )
        feature_range = float(catalog_values.max() - catalog_values.min())
        scale = max(feature_range * 0.25, abs(float(target)) * 0.1, 1)
        scores.append(max(0, 1 - abs(float(value) - float(target)) / scale))
    for preference, column in text_preferences.items():
        target = str(preferences.get(preference, "")).strip().casefold()
        value = str(phone[column]).strip().casefold()
        if not target:
            continue
        scores.append(
            1.0
            if target in value or value in target
            else SequenceMatcher(None, target, value).ratio()
        )
    for preference, column in (
        ("has_fingerprint", "Has_Fingerprint"),
        ("has_face_unlock", "Has_Face_Unlock"),
    ):
        target = preferences.get(preference)
        if target is not None:
            scores.append(
                1.0
                if str(phone[column]).strip().casefold()
                == str(target).strip().casefold()
                else 0.0
            )
    return round(sum(scores) / len(scores) * 100, 1) if scores else 100.0


def filter_phones(
    min_price, max_price, ram_gb, storage_gb, battery_mah,
    display_size_inches, refresh_rate_hz, camera_mp, model, processor,
    operating_system, sort="model",
):
    matches = df
    if min_price is not None:
        matches = matches[matches["_price_usd"] >= min_price]
    if max_price is not None:
        matches = matches[matches["_price_usd"] <= max_price]
    if ram_gb is not None:
        matches = matches[
            matches["RAM"].map(parse_ram_gb).eq(ram_gb)
        ]
    for column, value in (
        ("Storage_GB", storage_gb),
        ("Battery_mAh", battery_mah),
        ("Display_Size_Inches", display_size_inches),
        ("Refresh_Rate_Hz", refresh_rate_hz),
        ("Main_Camera_MP", camera_mp),
    ):
        if value is not None:
            matches = matches[pd.to_numeric(matches[column], errors="coerce") == value]
    for column, value in (
        ("Model", model),
        ("Processor", processor),
        ("OperatingSystem", operating_system),
    ):
        if value:
            matches = matches[
                matches[column].astype(str).map(
                    lambda candidate: fuzzy_text_match(candidate, value)
                )
            ]

    if sort == "price_asc":
        return matches.sort_values(
            ["_price_usd", "Model"],
            ascending=[True, True],
            key=lambda values: values.astype(str).str.casefold()
            if values.name == "Model"
            else values,
            kind="stable",
        )
    if sort == "price_desc":
        return matches.sort_values(
            ["_price_usd", "Model"],
            ascending=[False, True],
            key=lambda values: values.astype(str).str.casefold()
            if values.name == "Model"
            else values,
            kind="stable",
        )
    return matches.sort_values(
        "Model",
        key=lambda values: values.astype(str).str.casefold(),
        kind="stable",
    )


def fuzzy_text_match(candidate, query):
    normalized_candidate = unicodedata.normalize("NFKD", str(candidate)).encode(
        "ascii", "ignore"
    ).decode("ascii").casefold()
    normalized_query = unicodedata.normalize("NFKD", str(query)).encode(
        "ascii", "ignore"
    ).decode("ascii").casefold()
    candidate_tokens = re.findall(r"[a-z0-9]+", normalized_candidate)
    query_tokens = re.findall(r"[a-z0-9]+", normalized_query)
    if not query_tokens:
        return True
    if " ".join(query_tokens) in " ".join(candidate_tokens):
        return True
    for query_token in query_tokens:
        if len(query_token) < 3:
            if query_token not in candidate_tokens:
                return False
            continue
        if not any(
            SequenceMatcher(None, query_token, candidate_token).ratio()
            >= TEXT_SEARCH_THRESHOLD
            for candidate_token in candidate_tokens
        ):
            return False
    return True


def pdf_text(value):
    normalized = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode("ascii")
    return normalized.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def build_phone_pdf(phones):
    excluded_columns = {
        "US_MSRP_USD",
        "US_MSRP_SOURCE_URL",
        "US_MSRP_UPDATED_AT",
    }
    hardware_columns = {
        "Processor",
        "OperatingSystem",
        "RAM",
        "Storage_GB",
        "Battery_mAh",
        "Display_Size_Inches",
        "Refresh_Rate_Hz",
        "Main_Camera_MP",
    }
    internal_columns = {
        LABEL_COLUMN,
        SOURCE_LABEL_COLUMN,
    }
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    ]
    page_object_numbers = []

    phone_pages = []
    for _, phone in phones.iterrows():
        section_rows = []
        for column in phones.columns:
            if (
                column.startswith("_")
                or column in excluded_columns
                or column in internal_columns
                or column in {"Model", "Price_USD"}
            ):
                continue
            value = phone[column]
            if phones[column].isna().all() or phones[column].astype(str).str.strip().eq("").all():
                continue
            value = "Not listed" if pd.isna(value) or not str(value).strip() else str(value)
            section = (
                "Hardware"
                if column in hardware_columns
                else "Catalog details"
                if column in {"Phone_ID", "Rating", "Market"}
                else "Features and media"
            )
            wrapped_value = textwrap.wrap(
                value, width=64, break_long_words=True, break_on_hyphens=True
            ) or [""]
            section_rows.append(
                (section, column.replace("_", " "), wrapped_value, 14 + 9 * len(wrapped_value))
            )
        section_order = {"Catalog details": 0, "Hardware": 1, "Features and media": 2}
        section_rows.sort(key=lambda row: (section_order[row[0]], row[1].casefold()))
        pages = []
        page_rows = []
        y_position = 710
        current_section = None
        for section, label, wrapped_value, row_height in section_rows:
            section_height = 17 if section != current_section else 0
            if page_rows and y_position - section_height - row_height < 82:
                pages.append(page_rows)
                page_rows = []
                y_position = 710
                current_section = None
                section_height = 17
            page_rows.append((section, label, wrapped_value, row_height))
            y_position -= section_height + row_height
            current_section = section
        if page_rows or not pages:
            pages.append(page_rows)
        price_value = pd.to_numeric(
            phone.get("_price_usd", phone.get("Price_USD")),
            errors="coerce",
        )
        price_label = f"${price_value:,.2f}" if pd.notna(price_value) else "Price not listed"
        phone_pages.extend(
            (phone["Model"], price_label, page_rows, page_index > 0)
            for page_index, page_rows in enumerate(pages)
        )

    if not phone_pages:
        phone_pages.append(("No phones match the selected filters.", "Not listed", [], False))

    for page_index, (model_name, price, page_rows, continuation) in enumerate(phone_pages, start=1):
        page_object = len(objects) + 1
        content_object = page_object + 1
        page_object_numbers.append(page_object)
        objects.append(
            (
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
                f"/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {content_object} 0 R >>"
            ).encode("ascii")
        )
        heading = f"{model_name} (continued)" if continuation else str(model_name)
        commands = [
            "q 0.08 0.24 0.20 rg 0 744 595 98 re f Q",
            "q 0.31 0.70 0.48 rg 42 824 34 3 re f Q",
            f"BT /F2 10 Tf 42 802 Td ({pdf_text('MELA  |  SMARTPHONE REPORT')}) Tj ET",
            f"BT /F2 17 Tf 42 777 Td ({pdf_text(str(heading)[:62])}) Tj ET",
            f"BT /F2 19 Tf 42 752 Td ({pdf_text(price)}) Tj ET",
            f"BT /F1 8 Tf 475 756 Td ({pdf_text('USD PRICE')}) Tj ET",
            "q 0.94 0.97 0.95 rg 34 70 527 654 re f Q",
        ]
        y_position = 712
        current_section = None
        for section, label, wrapped_value, row_height in page_rows:
            if section != current_section:
                commands.append(f"BT /F2 9 Tf 48 {y_position} Td ({pdf_text(section.upper())}) Tj ET")
                y_position -= 17
                current_section = section
            fill = "0.91 0.95 0.92" if int(y_position) % 2 else "1 1 1"
            commands.append(f"q {fill} rg 44 {y_position - row_height + 5} 507 {row_height} re f Q")
            commands.append(f"BT /F2 7.5 Tf 53 {y_position - 8} Td ({pdf_text(label[:27])}) Tj ET")
            for line_index, line in enumerate(wrapped_value):
                commands.append(
                    f"BT /F1 7.5 Tf 190 {y_position - 8 - line_index * 9} Td ({pdf_text(line)}) Tj ET"
                )
            y_position -= row_height
        commands.extend(
            [
                "q 0.80 0.87 0.82 RG 42 40 511 0.7 re S Q",
                f"BT /F1 8 Tf 42 25 Td ({pdf_text(f'Mela Smartphone Finder  |  Page {page_index} of {len(phone_pages)}')}) Tj ET",
            ]
        )
        content = "\n".join(commands).encode("ascii")
        objects.append(
            b"<< /Length " + str(len(content)).encode("ascii") + b" >>\nstream\n"
            + content + b"\nendstream"
        )
    objects[1] = (
        f"<< /Type /Pages /Kids [{' '.join(f'{number} 0 R' for number in page_object_numbers)}] "
        f"/Count {len(page_object_numbers)} >>"
    ).encode("ascii")

    output = io.BytesIO()
    output.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for object_number, content in enumerate(objects, start=1):
        offsets.append(output.tell())
        output.write(f"{object_number} 0 obj\n".encode("ascii"))
        output.write(content)
        output.write(b"\nendobj\n")
    xref_offset = output.tell()
    output.write(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    output.write(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.write(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.write(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode("ascii")
    )
    return output.getvalue()


@app.get("/phones/export/pdf")
def export_phone_pdf(
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    ram_gb: Optional[int] = None,
    storage_gb: Optional[int] = None,
    battery_mah: Optional[int] = None,
    display_size_inches: Optional[float] = None,
    refresh_rate_hz: Optional[int] = None,
    camera_mp: Optional[int] = None,
    model: Optional[str] = None,
    processor: Optional[str] = None,
    operating_system: Optional[str] = None,
    rating: Optional[float] = None,
    specification: Optional[str] = None,
    memory: Optional[str] = None,
    market: Optional[str] = None,
    has_fingerprint: Optional[Literal["Yes", "No", "Not listed"]] = None,
    has_face_unlock: Optional[Literal["Yes", "No", "Not listed"]] = None,
    sort: Literal["model", "price_asc", "price_desc"] = "model",
):
    phones = rank_phone_matches(
        {
            key: value
            for key, value in {
                "min_price": min_price,
                "max_price": max_price,
                "ram_gb": ram_gb,
                "storage_gb": storage_gb,
                "battery_mah": battery_mah,
                "display_size_inches": display_size_inches,
                "refresh_rate_hz": refresh_rate_hz,
                "camera_mp": camera_mp,
                "model": model,
                "processor": processor,
                "operating_system": operating_system,
                "rating": rating,
                "specification": specification,
                "memory": memory,
                "market": market,
                "has_fingerprint": has_fingerprint,
                "has_face_unlock": has_face_unlock,
            }.items()
            if value is not None
        },
        sort,
    )
    return Response(
        content=build_phone_pdf(phones),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="mela-smartphone-catalog.pdf"'},
    )


@app.get("/phones/{phone_id}/pdf")
def export_single_phone_pdf(phone_id: int):
    phone = df
    phone = phone[phone["Phone_ID"].astype(str) == str(phone_id)]
    if phone.empty:
        raise HTTPException(status_code=404, detail="Phone not found.")
    model_name = str(phone.iloc[0]["Model"])
    filename = re.sub(r"[^A-Za-z0-9._-]+", "-", model_name).strip("-") or "smartphone"
    return Response(
        content=build_phone_pdf(phone),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'},
    )


@app.post("/phones/search-interest")
def record_phone_search_interest(data: PhoneSearchInterest):
    filters = data.model_dump()
    if not any(value is not None and value != "" for value in filters.values()):
        return {"recorded": 0}
    matches = rank_phone_matches(filters).head(24)
    with get_popularity_connection() as connection:
        connection.executemany(
            """
            INSERT INTO phone_search_interest (phone_id, search_count)
            VALUES (?, 1)
            ON CONFLICT(phone_id) DO UPDATE SET search_count = search_count + 1
            """,
            ((int(phone_id),) for phone_id in matches["Phone_ID"]),
        )
    return {"recorded": len(matches)}


@app.get("/phones/popular")
def get_popular_phones(limit: int = Query(default=6, ge=1, le=20)):
    with get_popularity_connection() as connection:
        popularity = connection.execute(
            """
            SELECT phone_id, search_count
            FROM phone_search_interest
            WHERE search_count > 0
            ORDER BY search_count DESC, phone_id ASC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    if not popularity:
        return {"items": []}
    popular_by_id = {int(row[0]): int(row[1]) for row in popularity}
    phones = df
    phones = phones[phones["Phone_ID"].astype(int).isin(popular_by_id)]
    phones = phones.assign(
        _search_count=phones["Phone_ID"].astype(int).map(popular_by_id)
    ).sort_values(["_search_count", "Model"], ascending=[False, True], kind="stable")
    return {
        "items": [
            {
                "phone_id": int(phone["Phone_ID"]),
                "model": phone["Model"],
                "price_usd": float(phone["_price_usd"]),
                "search_count": int(phone["_search_count"]),
            }
            for _, phone in phones.iterrows()
        ]
    }


def admin_account_configured():
    with get_auth_connection() as connection:
        return connection.execute("SELECT 1 FROM admin_account WHERE id = 1").fetchone() is not None


@app.get("/admin/status")
def get_admin_status():
    return {"configured": admin_account_configured()}


@app.post("/admin/signup", status_code=201)
def admin_signup(data: AdminSignup):
    if not valid_email(data.email):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    salt = secrets.token_bytes(16)
    password_hash = hash_admin_password(data.password, salt)
    try:
        with get_auth_connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            if connection.execute("SELECT 1 FROM admin_account WHERE id = 1").fetchone():
                raise HTTPException(status_code=409, detail="The admin account has already been created.")
            connection.execute(
                """INSERT INTO admin_account
                (id, full_name, email, password_salt, password_hash, created_at)
                VALUES (1, ?, ?, ?, ?, ?)""",
                (data.full_name.strip(), data.email.strip().lower(), salt, password_hash, int(time.time())),
            )
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=409, detail="An admin account with that email already exists.") from error
    return {"created": True, "message": "Admin account created. Sign in to continue."}


@app.post("/admin/login")
def admin_login(data: AdminLogin):
    if not valid_email(data.email):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    with get_auth_connection() as connection:
        account = connection.execute(
            "SELECT password_salt, password_hash FROM admin_account WHERE id = 1 AND email = ?",
            (data.email.strip().lower(),),
        ).fetchone()
        if not account or not hmac.compare_digest(
            hash_admin_password(data.password, account["password_salt"]),
            account["password_hash"],
        ):
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        token = create_admin_session(connection)
    return {"access_token": token, "token_type": "bearer", "expires_in": SESSION_TTL_SECONDS}


@app.post("/admin/logout")
def admin_logout(_: None = Depends(require_admin), x_admin_token: Optional[str] = Header(default=None)):
    if x_admin_token:
        token_hash = hashlib.sha256(x_admin_token.encode("utf-8")).hexdigest()
        with get_auth_connection() as connection:
            connection.execute("DELETE FROM admin_sessions WHERE token_hash = ?", (token_hash,))
    return {"logged_out": True}


@app.get("/admin/phones")
def list_admin_phones(_: None = Depends(require_admin)):
    phones = df.assign(
        _model_sort=df["Model"].astype(str).str.casefold()
    ).sort_values("_model_sort", kind="stable")
    return {
        "items": [
            {
                "phone_id": int(phone["Phone_ID"]),
                "model": phone["Model"],
            }
            for _, phone in phones.iterrows()
        ]
    }


@app.get("/admin/phones/{phone_id}")
def get_admin_phone(phone_id: int, _: None = Depends(require_admin)):
    matches = df[df["Phone_ID"].astype(str) == str(phone_id)]
    if matches.empty:
        raise HTTPException(status_code=404, detail="Phone not found.")
    return admin_phone_record(matches.iloc[0])


def ensure_catalog_model_is_independent(model_name, excluded_phone_id=None):
    normalized_name = normalized_model_name(model_name)
    existing = df
    if excluded_phone_id is not None:
        existing = existing[existing["Phone_ID"].astype(str) != str(excluded_phone_id)]
    if normalized_name in set(existing["Model"].map(normalized_model_name)):
        raise HTTPException(
            status_code=409,
            detail="A phone with this model name already exists in the catalog.",
        )


@app.post("/admin/phones", status_code=201)
def create_admin_phone(
    data: AdminPhoneInput,
    _: None = Depends(require_admin),
):
    ensure_catalog_model_is_independent(data.model)
    phone_id = int(pd.to_numeric(df["Phone_ID"], errors="coerce").max()) + 1
    row = {column: "" for column in df.columns if not column.startswith("_")}
    row = apply_admin_phone(row, data.model_dump(), phone_id)
    row[LABEL_COLUMN] = recommendation_labels(
        training_df, pd.DataFrame([row])
    )[0]
    row[SOURCE_LABEL_COLUMN] = int(row[LABEL_COLUMN] == "Recommended")
    updated_df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
    save_admin_dataset(updated_df)
    return admin_phone_record(df[df["Phone_ID"].astype(str) == str(phone_id)].iloc[0])


@app.put("/admin/phones/{phone_id}")
def update_admin_phone(
    phone_id: int,
    data: AdminPhoneInput,
    _: None = Depends(require_admin),
):
    matches = df.index[df["Phone_ID"].astype(str) == str(phone_id)]
    if len(matches) == 0:
        raise HTTPException(status_code=404, detail="Phone not found.")
    updated_df = df.copy()
    index = matches[0]
    original = updated_df.loc[index].drop(labels=["_price_inr", "_price_usd"], errors="ignore").to_dict()
    values = data.model_dump()
    ensure_catalog_model_is_independent(data.model, phone_id)
    updated_row = apply_admin_phone(original, values, phone_id)
    updated_row[LABEL_COLUMN] = recommendation_labels(
        training_df, pd.DataFrame([updated_row])
    )[0]
    updated_row[SOURCE_LABEL_COLUMN] = int(
        updated_row[LABEL_COLUMN] == "Recommended"
    )
    for column in ("_price_inr", "_price_usd"):
        if column in updated_df.columns:
            updated_row[column] = updated_df.at[index, column]
    updated_df = pd.concat(
        [
            updated_df.drop(index=index),
            pd.DataFrame([updated_row], index=[index]),
        ]
    ).sort_index()
    save_admin_dataset(updated_df)
    return admin_phone_record(df.loc[index])


@app.delete("/admin/phones/{phone_id}")
def delete_admin_phone(phone_id: int, _: None = Depends(require_admin)):
    updated_df = df[df["Phone_ID"].astype(str) != str(phone_id)].copy()
    if len(updated_df) == len(df):
        raise HTTPException(status_code=404, detail="Phone not found.")
    save_admin_dataset(updated_df.reset_index(drop=True))
    return {"deleted": phone_id}


@app.get("/")
def home():
  return {"message": "Smartphone AI API is running successfully!"}