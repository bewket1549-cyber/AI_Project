from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split

if __package__:
    from .recommendation_model import (
        LINK_COLUMNS,
        MODEL_FEATURE_COLUMNS,
        SERIES_TIER_CODES,
        SOURCE_LABEL_COLUMN,
    )
else:
    from recommendation_model import (
        LINK_COLUMNS,
        MODEL_FEATURE_COLUMNS,
        SERIES_TIER_CODES,
        SOURCE_LABEL_COLUMN,
    )


BACKEND_DIR = Path(__file__).resolve().parent
SOURCE_PATH = BACKEND_DIR / "Smartphone_Full_Dataset.csv"
CATALOG_PATH = BACKEND_DIR / "SmartphoneDataset_Catalog_Clean.csv"
TRAINING_PATH = BACKEND_DIR / "SmartphoneDataset_Training_Clean.csv"
TEST_PATH = BACKEND_DIR / "SmartphoneDataset_Test.csv"
ID_COLUMN = "Phone_ID"
NUMERIC_FEATURES = {
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
DATASET_COLUMNS = (
    ID_COLUMN,
    *MODEL_FEATURE_COLUMNS,
    SOURCE_LABEL_COLUMN,
    *LINK_COLUMNS,
)


def clean_source():
    source = pd.read_csv(SOURCE_PATH)
    missing_columns = set(DATASET_COLUMNS).difference(source.columns)
    if missing_columns:
        raise ValueError(
            f"Smartphone dataset is missing columns: {sorted(missing_columns)}"
        )
    unexpected_columns = set(source.columns).difference(DATASET_COLUMNS)
    if unexpected_columns:
        raise ValueError(
            f"Smartphone dataset contains unexpected columns: "
            f"{sorted(unexpected_columns)}"
        )
    source = source.loc[:, DATASET_COLUMNS].copy()

    source[ID_COLUMN] = pd.to_numeric(source[ID_COLUMN], errors="coerce")
    if (
        source[ID_COLUMN].isna().any()
        or source[ID_COLUMN].duplicated().any()
        or not source[ID_COLUMN].mod(1).eq(0).all()
    ):
        raise ValueError("Phone_ID values must be unique integers.")
    source[ID_COLUMN] = source[ID_COLUMN].astype(int)

    for column in NUMERIC_FEATURES | {SOURCE_LABEL_COLUMN}:
        source[column] = pd.to_numeric(source[column], errors="coerce")
        if source[column].isna().any():
            raise ValueError(f"{column} contains missing or invalid values.")
    for column in ("Has_Fingerprint", "Has_Face_Unlock", SOURCE_LABEL_COLUMN):
        if not set(source[column].unique()).issubset({0, 1}):
            raise ValueError(f"{column} values must be binary 0/1.")
    source["Series_Tier_Code"] = pd.to_numeric(
        source["Series_Tier_Code"], errors="coerce"
    )
    expected_tier_codes = source["Series_Tier"].map(SERIES_TIER_CODES)
    if source["Series_Tier_Code"].isna().any() or not source[
        "Series_Tier_Code"
    ].eq(expected_tier_codes).all():
        raise ValueError("Series_Tier_Code does not match Series_Tier.")
    for column in set(MODEL_FEATURE_COLUMNS).difference(NUMERIC_FEATURES):
        source[column] = source[column].fillna("").astype(str).str.strip()
        if source[column].eq("").any():
            raise ValueError(f"{column} contains missing or blank values.")
    for column in LINK_COLUMNS:
        source[column] = source[column].fillna("").astype(str).str.strip()
    if source.duplicated().any():
        raise ValueError("Smartphone dataset contains duplicate rows.")
    return source


def split_training_test(source):
    training, test = train_test_split(
        source,
        test_size=int(len(source) * 0.2),
        random_state=42,
        stratify=source[SOURCE_LABEL_COLUMN],
    )
    training = training.sort_values(ID_COLUMN, kind="stable")
    test = test.sort_values(ID_COLUMN, kind="stable")
    if len(training) + len(test) != len(source):
        raise ValueError("The training/test split does not include every source row.")
    if set(training[ID_COLUMN]) & set(test[ID_COLUMN]):
        raise ValueError("Phone IDs overlap between training and test datasets.")
    return training, test


def write_datasets(training, test, catalog):
    output_frames = (
        (TRAINING_PATH, training),
        (TEST_PATH, test),
        (CATALOG_PATH, catalog),
    )
    temporary_paths = []
    for dataset_path, frame in output_frames:
        if dataset_path.exists():
            try:
                with dataset_path.open("r+b"):
                    pass
            except OSError as error:
                raise PermissionError(
                    f"Cannot update {dataset_path}; close applications using "
                    "the dataset and try again."
                ) from error
        temporary_path = dataset_path.with_suffix(".tmp")
        frame.to_csv(temporary_path, index=False, encoding="utf-8-sig")
        temporary_paths.append((temporary_path, dataset_path))
    for temporary_path, dataset_path in temporary_paths:
        temporary_path.replace(dataset_path)


def prepare_datasets():
    catalog = clean_source()
    training, test = split_training_test(catalog)
    write_datasets(training, test, catalog)
    return training, test, catalog


if __name__ == "__main__":
    training_data, test_data, _ = prepare_datasets()
    print(
        f"Created {len(training_data)} training rows and {len(test_data)} "
        "held-out test rows."
    )
    print("Training target counts:")
    print(training_data[SOURCE_LABEL_COLUMN].value_counts().sort_index().to_string())
    print("Test target counts:")
    print(test_data[SOURCE_LABEL_COLUMN].value_counts().sort_index().to_string())
