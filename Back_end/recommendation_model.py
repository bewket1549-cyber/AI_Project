import re

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sklearn.feature_extraction.text import TfidfVectorizer


LABEL_COLUMN = "Recommendation_Label"
SOURCE_LABEL_COLUMN = "Recommendation"
LABEL_THRESHOLD = 0.64
SERIES_TIER_CODES = {"Budget": 1, "Mid-Range": 2, "Flagship": 3}
LINK_COLUMNS = (
    "Image_Search_URL",
    "Video_Search_URL",
    "GIF_Search_URL",
)
MODEL_FEATURE_COLUMNS = (
    "Model",
    "Brand",
    "Series_Tier",
    "Series_Tier_Code",
    "Price_USD",
    "Rating",
    "Processor",
    "RAM_GB",
    "Storage_GB",
    "Battery_mAh",
    "Display_Spec",
    "Display_Size_Inches",
    "Refresh_Rate_Hz",
    "Camera_Spec",
    "Main_Camera_MP",
    "OperatingSystem",
    "Network_Connectivity",
    "Has_Fingerprint",
    "Has_Face_Unlock",
    "Market",
)
MODEL_NUMERIC_FEATURES = (
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
)
MODEL_CATEGORICAL_FEATURES = (
    "Brand",
    "Series_Tier",
    "Processor",
    "Display_Spec",
    "Camera_Spec",
    "OperatingSystem",
    "Network_Connectivity",
    "Market",
)
CATALOG_COLUMNS = (
    "Phone_ID",
    "Model",
    "Price",
    "Rating",
    "Specification",
    "Processor",
    "RAM",
    "Camera",
    "Memory",
    "OperatingSystem",
    "Internal_Storage",
    "Storage_GB",
    "Battery_mAh",
    "Display_Size_Inches",
    "Refresh_Rate_Hz",
    "Main_Camera_MP",
    "Has_Fingerprint",
    "Has_Face_Unlock",
    "Image_Search_URL",
    "Video_Search_URL",
    "GIF_Search_URL",
    "Market",
)
NUMERIC_FEATURES = [
    "Price_USD",
    "Rating",
    "RAM_Value",
    "Storage_GB",
    "Battery_mAh",
    "Display_Size_Inches",
    "Refresh_Rate_Hz",
    "Main_Camera_MP",
]
CATEGORICAL_FEATURES = [
    "Processor",
    "OperatingSystem",
    "Specification",
    "Camera",
    "Memory",
    "Market",
    "Has_Fingerprint",
    "Has_Face_Unlock",
]


def parse_ram_gb(value):
    if isinstance(value, (int, float, np.integer, np.floating)):
        return float(value)
    match = re.search(r"(\d+(?:\.\d+)?)\s*GB\s*RAM", str(value), re.IGNORECASE)
    return float(match.group(1)) if match else np.nan


def normalized_model_group(value):
    model = str(value).strip()
    if re.search(r"\(\s*\d+(?:\.\d+)?\s*GB\b", model, re.IGNORECASE):
        model = model.split(" (", 1)[0]
    return re.sub(r"[^a-z0-9]+", " ", model.casefold()).strip()


def price_values(frame):
    price_column = "Price_USD" if "Price_USD" in frame else "Price"
    return pd.to_numeric(
        frame[price_column].astype(str).str.replace(r"[^0-9.]", "", regex=True),
        errors="coerce",
    )


def build_model_features(records):
    frame = (
        records.to_frame().T
        if isinstance(records, pd.Series)
        else records.copy()
    )
    missing_columns = set(MODEL_FEATURE_COLUMNS).difference(frame.columns)
    if missing_columns:
        raise ValueError(
            "Phone records are missing model feature columns: "
            f"{sorted(missing_columns)}"
        )
    features = frame.loc[:, MODEL_FEATURE_COLUMNS].copy()
    for column in MODEL_NUMERIC_FEATURES:
        if column in {"Has_Fingerprint", "Has_Face_Unlock"}:
            features[column] = features[column].map(
                {
                    "Yes": 1,
                    "No": 0,
                    "1": 1,
                    "1.0": 1,
                    "0": 0,
                    "0.0": 0,
                    "Not listed": np.nan,
                }
            ).fillna(features[column])
        features[column] = pd.to_numeric(features[column], errors="coerce")
    for column in MODEL_CATEGORICAL_FEATURES:
        features[column] = features[column].fillna("Not listed").astype(str)
    features["Model"] = features["Model"].fillna("").astype(str)
    return features


def recommendation_scores(reference, candidates):
    reference_features = build_model_features(reference)
    candidate_features = build_model_features(candidates)
    columns = [
        "Rating",
        "RAM_GB",
        "Storage_GB",
        "Battery_mAh",
        "Display_Size_Inches",
        "Refresh_Rate_Hz",
        "Main_Camera_MP",
    ]
    component_scores = []
    for column in columns:
        reference_values = pd.to_numeric(
            reference_features[column], errors="coerce"
        ).dropna().to_numpy()
        values = pd.to_numeric(
            candidate_features[column], errors="coerce"
        ).fillna(float(np.median(reference_values)))
        percentiles = np.searchsorted(
            np.sort(reference_values), values.to_numpy(), side="right"
        ) / len(reference_values)
        if column == "Display_Size_Inches":
            percentiles = 0.5 + (percentiles - 0.5) * 0.4
        component_scores.append(percentiles)

    reference_prices = price_values(reference).dropna().to_numpy()
    candidate_prices = price_values(candidates).fillna(
        float(np.median(reference_prices))
    )
    affordability = 1 - np.searchsorted(
        np.sort(reference_prices), candidate_prices.to_numpy(), side="right"
    ) / len(reference_prices)
    component_scores.append(affordability)
    return np.mean(component_scores, axis=0)


def recommendation_labels(reference, candidates):
    scores = recommendation_scores(reference, candidates)
    return np.where(scores >= LABEL_THRESHOLD, "Recommended", "Not Recommended")


def build_classifier(training):
    preprocessors = [
        ("numeric", SimpleImputer(strategy="median"), MODEL_NUMERIC_FEATURES),
        (
            "categorical",
            Pipeline(
                [
                    ("imputer", SimpleImputer(strategy="most_frequent")),
                    ("encoder", OneHotEncoder(handle_unknown="ignore")),
                ]
            ),
            MODEL_CATEGORICAL_FEATURES,
        ),
        (
            "model_text",
            TfidfVectorizer(
                lowercase=True,
                ngram_range=(1, 2),
                token_pattern=r"(?u)\b\w+\b",
                max_features=5000,
            ),
            "Model",
        ),
    ]
    classifier = Pipeline(
        [
            ("preprocessing", ColumnTransformer(preprocessors)),
            (
                "classifier",
                RandomForestClassifier(
                    n_estimators=200,
                    class_weight="balanced_subsample",
                    random_state=42,
                ),
            ),
        ]
    )
    if SOURCE_LABEL_COLUMN in training:
        labels = pd.to_numeric(
            training[SOURCE_LABEL_COLUMN], errors="raise"
        ).map({0: "Not Recommended", 1: "Recommended"})
        if labels.isna().any():
            raise ValueError(
                f"{SOURCE_LABEL_COLUMN} values must be binary 0/1 labels."
            )
    elif LABEL_COLUMN in training:
        labels = training[LABEL_COLUMN].astype(str)
    else:
        raise ValueError(
            f"Training data must include {SOURCE_LABEL_COLUMN}."
        )
    classifier.fit(
        build_model_features(training),
        labels,
    )
    return classifier
