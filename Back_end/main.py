import re
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
from pydantic import BaseModel
from sklearn.ensemble import RandomForestClassifier

app = FastAPI(title="Smartphone Authenticity Detection API")
INR_TO_USD_RATE = 0.010513
EXCHANGE_RATE_DATE = "2026-10-27"

# Enable CORS for React Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load dataset and train model on startup
df = pd.read_csv(Path(__file__).with_name("Smartphone_2024_enhanced_4.csv"))
df["_price_inr"] = pd.to_numeric(
    df["Price"].astype(str).str.replace(r"[^0-9.]", "", regex=True),
    errors="coerce",
)

# Select features for prediction
features = [
    "RAM_GB",
    "Storage_GB",
    "Battery_mAh",
    "Display_Size_Inches",
    "Refresh_Rate_Hz",
    "Main_Camera_MP",
]

X = df[features].fillna(0)
y = df["Is_Original"]

# Train Random Forest Classifier
model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X, y)


class SmartphoneInput(BaseModel):
    ram_gb: int
    storage_gb: int
    battery_mah: int
    display_size_inches: float
    refresh_rate_hz: int
    main_camera_mp: int


@app.get("/phones/options")
def get_phone_filter_options():
    def text_options(column):
        return sorted(value for value in df[column].dropna().astype(str).unique() if value)

    def numeric_options(column, integer=True):
        values = pd.to_numeric(df[column], errors="coerce").dropna().unique()
        values = sorted(value for value in values if value > 0)
        return [int(value) for value in values] if integer else [float(value) for value in values]

    return {
            "ram_gb": sorted(int(value) for value in df["RAM_GB"].dropna().unique() if value > 0),
            "storage_gb": sorted(
                    int(value) for value in df["Storage_GB"].dropna().unique() if value > 0
            ),
            "battery_mah": numeric_options("Battery_mAh"),
            "display_size_inches": numeric_options("Display_Size_Inches", integer=False),
            "refresh_rate_hz": numeric_options("Refresh_Rate_Hz"),
            "camera_mp": numeric_options("Main_Camera_MP"),
            "models": text_options("Model"),
            "processors": text_options("Processor"),
            "operating_systems": text_options("OperatingSystem"),
            "min_price": int(df["_price_inr"].min()),
            "max_price": int(df["_price_inr"].max()),
                "inr_to_usd_rate": INR_TO_USD_RATE,
                "exchange_rate_date": EXCHANGE_RATE_DATE,
    }


@app.get("/phones")
def search_phones(
    min_price: Optional[int] = None,
        max_price: Optional[int] = None,
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
    matches = df
    if min_price is not None:
        matches = matches[matches["_price_inr"] >= min_price]
    if max_price is not None:
        matches = matches[matches["_price_inr"] <= max_price]
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

    matches = matches.sort_values(["_price_inr", "Model"], kind="stable")
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
                        "price_inr": int(phone["_price_inr"]),
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