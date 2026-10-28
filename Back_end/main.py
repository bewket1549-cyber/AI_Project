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
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional
from urllib.parse import quote_plus

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
from pydantic import BaseModel, Field
from sklearn.ensemble import RandomForestClassifier

app = FastAPI(title="Smartphone Authenticity Detection API")
INR_TO_USD_RATE = 0.010513
EXCHANGE_RATE_DATE = "2026-10-27"
DATASET_PATH = Path(__file__).with_name("Smartphone_2024_enhanced_4.csv")
AUTH_DATABASE_PATH = Path(__file__).with_name("admin_auth.sqlite3")
POPULARITY_DATABASE_PATH = Path(__file__).with_name("phone_popularity.sqlite3")
SESSION_TTL_SECONDS = 8 * 60 * 60
PASSWORD_ITERATIONS = 310_000
FEATURES = [
    "RAM_GB",
    "Storage_GB",
    "Battery_mAh",
    "Display_Size_Inches",
    "Refresh_Rate_Hz",
    "Main_Camera_MP",
]

# Enable CORS for React Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def price_in_inr(dataframe):
    return pd.to_numeric(
        dataframe["Price"].astype(str).str.replace(r"[^0-9.]", "", regex=True),
        errors="coerce",
    )


df = pd.read_csv(DATASET_PATH)
needs_date_added_migration = "Date_Added" not in df.columns
if needs_date_added_migration:
    df["Date_Added"] = ""
touchscreen_flags = df["Touchscreen"].astype(str).str.strip().str.lower().isin(
    {"true", "yes", "1"}
)
display_sizes = pd.to_numeric(df["Display_Size_Inches"], errors="coerce")
iphone_models = df["Model"].astype(str).str.contains(r"\biphone\b", case=False, na=False)
touchscreen_evidence = ~touchscreen_flags & ((display_sizes > 3) | iphone_models)
keypad_phones = ~touchscreen_flags & ~touchscreen_evidence
needs_touchscreen_cleanup = bool(keypad_phones.any() or touchscreen_evidence.any())
df = df.loc[~keypad_phones].copy()
df.loc[touchscreen_evidence.loc[df.index], "Touchscreen"] = True
empty_msrp_columns = []
for column in ("US_MSRP_USD", "US_MSRP_SOURCE_URL", "US_MSRP_UPDATED_AT"):
    if column in df.columns and (
        df[column].isna().all()
        or df[column].astype(str).str.strip().eq("").all()
    ):
        empty_msrp_columns.append(column)
needs_empty_msrp_cleanup = bool(empty_msrp_columns)
if empty_msrp_columns:
    df = df.drop(columns=empty_msrp_columns)
price_is_inr = df["Price"].astype(str).str.contains(r"[₹]|INR", case=False, regex=True).any()
price_usd_values = (
    pd.to_numeric(df["Price_USD"], errors="coerce")
    if "Price_USD" in df.columns
    else pd.Series(dtype=float)
)
has_usd_price_column = price_usd_values.notna().any()
price_is_formatted_usd = df["Price"].astype(str).str.fullmatch(r"\$\d+\.\d{2}").all()
needs_price_migration = (
    "Price_USD" in df.columns or price_is_inr or not price_is_formatted_usd
)
if has_usd_price_column:
    df["_price_usd"] = price_usd_values
elif price_is_inr:
    df["_price_usd"] = (price_in_inr(df) * INR_TO_USD_RATE).round(2)
else:
    df["_price_usd"] = pd.to_numeric(
        df["Price"].astype(str).str.replace(r"[^0-9.]", "", regex=True),
        errors="coerce",
    )
if "Price_USD" in df.columns:
    df = df.drop(columns=["Price_USD"])
if df["_price_usd"].isna().any():
    raise ValueError(f"{DATASET_PATH} contains missing or invalid smartphone prices.")
df["Price"] = df["_price_usd"].map(lambda price: f"${price:.2f}")
if (
    needs_price_migration
    or needs_date_added_migration
    or needs_touchscreen_cleanup
    or needs_empty_msrp_cleanup
):
    df.drop(columns=["_price_usd"]).to_csv(DATASET_PATH, index=False, encoding="utf-8-sig")


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


def train_model():
    classifier = RandomForestClassifier(n_estimators=100, random_state=42)
    classifier.fit(df[FEATURES].apply(pd.to_numeric, errors="coerce").fillna(0), df["Is_Original"])
    return classifier


model = train_model()


def persist_dataset(updated_df):
    temporary_path = DATASET_PATH.with_suffix(".tmp")
    updated_df.drop(columns=["_price_usd"], errors="ignore").to_csv(
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
    price_usd: float = Field(gt=0)
    rating: float = Field(ge=0, le=100)
    processor: str = Field(min_length=1, max_length=120)
    operating_system: str = Field(min_length=1, max_length=80)
    ram_gb: int = Field(gt=0, le=1024)
    storage_gb: int = Field(gt=0, le=100000)
    battery_mah: int = Field(gt=0, le=100000)
    display_size_inches: float = Field(gt=0, le=100)
    refresh_rate_hz: int = Field(gt=0, le=1000)
    camera_mp: int = Field(gt=0, le=10000)
    is_original: Literal["Original", "Fake/Replica"]


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


def admin_phone_record(phone):
    date_added = phone.get("Date_Added", "")
    return {
        "phone_id": int(phone["Phone_ID"]),
        "model": phone["Model"],
        "date_added": "" if pd.isna(date_added) else str(date_added),
        "price_usd": float(phone["_price_usd"]),
        "rating": float(phone["Rating"]) if pd.notna(phone["Rating"]) else 0,
        "processor": phone["Processor"],
        "operating_system": phone["OperatingSystem"],
        "ram_gb": int(phone["RAM_GB"]),
        "storage_gb": int(phone["Storage_GB"]),
        "battery_mah": int(phone["Battery_mAh"]),
        "display_size_inches": float(phone["Display_Size_Inches"]),
        "refresh_rate_hz": int(phone["Refresh_Rate_Hz"]),
        "camera_mp": int(phone["Main_Camera_MP"]),
        "is_original": str(phone["Is_Original"]),
    }


def apply_admin_phone(phone, values, phone_id):
    updated = phone.copy()
    query = quote_plus(
        f'{values["model"]} {values["ram_gb"]}GB RAM {values["storage_gb"]}GB storage'
    )
    updated.update(
        {
            "Phone_ID": str(phone_id),
            "Model": values["model"].strip(),
            "Date_Added": (
                updated.get("Date_Added")
                if pd.notna(updated.get("Date_Added"))
                and str(updated.get("Date_Added")).strip()
                else datetime.now(timezone.utc).date().isoformat()
            ),
            "Price": f'${values["price_usd"]:.2f}',
            "Rating": values["rating"],
            "Specification": (
                f'{values["ram_gb"]} GB RAM, {values["storage_gb"]} GB storage, '
                f'{values["battery_mah"]} mAh battery, touchscreen display'
            ),
            "Processor": values["processor"].strip(),
            "OperatingSystem": values["operating_system"].strip(),
            "RAM": f'{values["ram_gb"]} GB RAM',
            "RAM_GB": values["ram_gb"],
            "Internal_Storage": f'{values["storage_gb"]} GB',
            "Storage_GB": values["storage_gb"],
            "Battery": f'{values["battery_mah"]} mAh',
            "Battery_mAh": values["battery_mah"],
            "Display": f'{values["display_size_inches"]} inches, {values["refresh_rate_hz"]} Hz',
            "Display_Size_Inches": values["display_size_inches"],
            "Refresh_Rate_Hz": values["refresh_rate_hz"],
            "Camera": f'{values["camera_mp"]} MP',
            "Main_Camera_MP": values["camera_mp"],
            "Is_Original": values["is_original"],
            "Touchscreen": "True",
            "Image_Search_URL": f"https://www.google.com/search?tbm=isch&q={query}",
            "Video_Search_URL": f"https://www.youtube.com/results?search_query={query}",
            "GIF_Search_URL": f"https://tenor.com/search/{query}-gifs",
        }
    )
    return updated


def save_admin_dataset(updated_df):
    global df, model
    updated_df["_price_usd"] = pd.to_numeric(
        updated_df["Price"].astype(str).str.replace(r"[^0-9.]", "", regex=True),
        errors="coerce",
    )
    persist_dataset(updated_df)
    df = updated_df
    model = train_model()


class SmartphoneInput(BaseModel):
    ram_gb: int
    storage_gb: int
    battery_mah: int
    display_size_inches: float
    refresh_rate_hz: int
    main_camera_mp: int


@app.get("/phones/options")
def get_phone_filter_options():
    catalog = get_touchscreen_phones()

    def text_options(column):
        return sorted(value for value in catalog[column].dropna().astype(str).unique() if value)

    def numeric_options(column, integer=True):
        values = pd.to_numeric(catalog[column], errors="coerce").dropna().unique()
        values = sorted(value for value in values if value > 0)
        return [int(value) for value in values] if integer else [float(value) for value in values]

    return {
            "ram_gb": sorted(int(value) for value in catalog["RAM_GB"].dropna().unique() if value > 0),
            "storage_gb": sorted(
                    int(value) for value in catalog["Storage_GB"].dropna().unique() if value > 0
            ),
            "battery_mah": numeric_options("Battery_mAh"),
            "display_size_inches": numeric_options("Display_Size_Inches", integer=False),
            "refresh_rate_hz": numeric_options("Refresh_Rate_Hz"),
            "camera_mp": numeric_options("Main_Camera_MP"),
            "models": text_options("Model"),
            "processors": text_options("Processor"),
            "operating_systems": text_options("OperatingSystem"),
            "min_price": float(catalog["_price_usd"].min()),
            "max_price": float(catalog["_price_usd"].max()),
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
        model: Optional[str] = None,
        processor: Optional[str] = None,
        operating_system: Optional[str] = None,
        offset: int = Query(default=0, ge=0),
        limit: int = Query(default=60, ge=1, le=100),
):
    matches = filter_phones(
        min_price, max_price, ram_gb, storage_gb, battery_mah,
        display_size_inches, refresh_rate_hz, camera_mp, model, processor,
        operating_system,
    )
    total = len(matches)
    page = matches.iloc[offset : offset + limit]
    items = []
    for _, phone in page.iterrows():
        storage = phone["Internal_Storage"]
        storage_gb = pd.to_numeric(phone["Storage_GB"], errors="coerce")
        if pd.isna(storage) or str(storage).strip().lower() in {"", "unknown", "n/a"}:
            storage = f"{int(storage_gb)} GB" if pd.notna(storage_gb) and storage_gb > 0 else "Not listed"
        items.append(
                {
                        "model": phone["Model"],
                        "phone_id": int(phone["Phone_ID"]),
                        "touchscreen": True,
                        "price_usd": float(phone["_price_usd"]),
                        "rating": float(phone["Rating"]) if pd.notna(phone["Rating"]) else None,
                        "processor": phone["Processor"],
                        "ram": phone["RAM"],
                        "ram_gb": int(phone["RAM_GB"]) if pd.notna(phone["RAM_GB"]) else None,
                        "storage": storage,
                        "storage_gb": int(phone["Storage_GB"])
                        if pd.notna(phone["Storage_GB"])
                        else None,
                        "battery": phone["Battery"],
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
                        "display": phone["Display"],
                        "camera": phone["Camera"],
                        "memory": phone["Memory"],
                        "operating_system": phone["OperatingSystem"],
                        "specification": phone["Specification"],
                        "has_fingerprint": phone["Has_Fingerprint"],
                        "has_face_unlock": phone["Has_Face_Unlock"],
                        "is_original": phone["Is_Original"],
                        "image_search_url": phone["Image_Search_URL"],
                        "video_search_url": phone["Video_Search_URL"],
                        "gif_search_url": phone["GIF_Search_URL"],
                }
        )
    return {"items": items, "total": total, "offset": offset, "limit": limit}


def filter_phones(
    min_price, max_price, ram_gb, storage_gb, battery_mah,
    display_size_inches, refresh_rate_hz, camera_mp, model, processor,
    operating_system,
):
    matches = get_touchscreen_phones()
    if min_price is not None:
        matches = matches[matches["_price_usd"] >= min_price]
    if max_price is not None:
        matches = matches[matches["_price_usd"] <= max_price]
    for column, value in (
            ("RAM_GB", ram_gb),
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
                    matches[column].astype(str).str.contains(re.escape(value), case=False, na=False)
            ]

    return matches.sort_values(
        "Model",
        key=lambda values: values.astype(str).str.casefold(),
        kind="stable",
    )


def get_touchscreen_phones():
    touchscreen = df["Touchscreen"].astype(str).str.strip().str.lower().isin(
        {"true", "yes", "1"}
    )
    return df[touchscreen]


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
        "RAM_GB",
        "Storage_GB",
        "Battery_mAh",
        "Display_Size_Inches",
        "Refresh_Rate_Hz",
        "Main_Camera_MP",
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
            if column.startswith("_") or column in excluded_columns or column in {"Model", "Price_USD"}:
                continue
            value = phone[column]
            if column == "Date_Added" and (
                pd.isna(value) or not str(value).strip()
            ):
                continue
            if phones[column].isna().all() or phones[column].astype(str).str.strip().eq("").all():
                continue
            value = "Not listed" if pd.isna(value) or not str(value).strip() else str(value)
            section = (
                "Hardware"
                if column in hardware_columns
                else "Catalog details"
                if column in {"Phone_ID", "Date_Added", "Rating", "IsOriginal"}
                else "Features and media"
            )
            wrapped_value = textwrap.wrap(
                value, width=68, break_long_words=True, break_on_hyphens=True
            ) or [""]
            section_rows.append(
                (section, column.replace("_", " "), wrapped_value, max(17, 8 * len(wrapped_value) + 6))
            )
        section_order = {"Catalog details": 0, "Hardware": 1, "Features and media": 2}
        section_rows.sort(key=lambda row: (section_order[row[0]], row[1].casefold()))
        pages = []
        page_rows = []
        page_height = 0
        current_section = None
        for section, label, wrapped_value, row_height in section_rows:
            section_height = 17 if section != current_section else 0
            if page_rows and page_height + section_height + row_height > 620:
                pages.append(page_rows)
                page_rows = []
                page_height = 0
                current_section = None
                section_height = 17
            page_rows.append((section, label, wrapped_value, row_height))
            page_height += section_height + row_height
            current_section = section
        if page_rows or not pages:
            pages.append(page_rows)
        price_value = pd.to_numeric(phone.get("Price_USD"), errors="coerce")
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
                y_position -= 16
                current_section = section
            fill = "0.91 0.95 0.92" if int(y_position) % 2 else "1 1 1"
            commands.append(f"q {fill} rg 44 {y_position - row_height + 5} 507 {row_height} re f Q")
            commands.append(f"BT /F2 7.5 Tf 53 {y_position - 8} Td ({pdf_text(label[:27])}) Tj ET")
            for line_index, line in enumerate(wrapped_value):
                commands.append(
                    f"BT /F1 7.5 Tf 190 {y_position - 8 - line_index * 8} Td ({pdf_text(line)}) Tj ET"
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
):
    phones = filter_phones(
        min_price, max_price, ram_gb, storage_gb, battery_mah,
        display_size_inches, refresh_rate_hz, camera_mp, model, processor,
        operating_system,
    )
    return Response(
        content=build_phone_pdf(phones),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="mela-smartphone-catalog.pdf"'},
    )


@app.get("/phones/{phone_id}/pdf")
def export_single_phone_pdf(phone_id: int):
    phone = get_touchscreen_phones()
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
    matches = filter_phones(
        filters["min_price"],
        filters["max_price"],
        filters["ram_gb"],
        filters["storage_gb"],
        filters["battery_mah"],
        filters["display_size_inches"],
        filters["refresh_rate_hz"],
        filters["camera_mp"],
        filters["model"],
        filters["processor"],
        filters["operating_system"],
    )
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
    phones = get_touchscreen_phones()
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
        _model_sort=df["Model"].astype(str).str.casefold(),
        _date_sort=pd.to_datetime(df["Date_Added"], errors="coerce"),
    ).sort_values(
        ["_date_sort", "_model_sort"],
        ascending=[False, True],
        na_position="last",
        kind="stable",
    )
    return {
        "items": [
            {
                "phone_id": int(phone["Phone_ID"]),
                "model": phone["Model"],
                "date_added": "" if pd.isna(phone["Date_Added"]) else str(phone["Date_Added"]),
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


@app.post("/admin/phones", status_code=201)
def create_admin_phone(
    data: AdminPhoneInput,
    _: None = Depends(require_admin),
):
    phone_id = int(pd.to_numeric(df["Phone_ID"], errors="coerce").max()) + 1
    row = {column: "" for column in df.columns if not column.startswith("_")}
    row = apply_admin_phone(row, data.model_dump(), phone_id)
    updated_df = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
    save_admin_dataset(updated_df)
    return admin_phone_record(df.iloc[-1])


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
    updated_df.loc[index] = apply_admin_phone(original, data.model_dump(), phone_id)
    save_admin_dataset(updated_df)
    return admin_phone_record(df.loc[index])


@app.delete("/admin/phones/{phone_id}")
def delete_admin_phone(phone_id: int, _: None = Depends(require_admin)):
    updated_df = df[df["Phone_ID"].astype(str) != str(phone_id)].copy()
    if len(updated_df) == len(df):
        raise HTTPException(status_code=404, detail="Phone not found.")
    save_admin_dataset(updated_df.reset_index(drop=True))
    return {"deleted": phone_id}


@app.post("/predict")
def predict_authenticity(data: SmartphoneInput):
  input_data = [[
      data.ram_gb,
      data.storage_gb,
      data.battery_mah,
      data.display_size_inches,
      data.refresh_rate_hz,
      data.main_camera_mp,
  ]]

  prediction = model.predict(input_data)[0]
  probability = max(model.predict_proba(input_data)[0]) * 100

  return {
      "prediction": prediction,
      "confidence": round(probability, 2),
      "message": (
          f"ስልኩ {prediction} መሆኑ ተረጋግጧል!"
          if prediction == "Original"
          else "ማስጠንቀቂያ፡ ይህ ስልክ ሐሰተኛ (Fake/Replica) ሊሆን ይችላል!"
      ),
  }


@app.get("/")
def home():
  return {"message": "Smartphone AI API is running successfully!"}