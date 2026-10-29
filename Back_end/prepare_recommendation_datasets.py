import re
from pathlib import Path
from urllib.parse import urlparse

import pandas as pd
from sklearn.model_selection import GroupShuffleSplit

if __package__:
    from .recommendation_model import (
        CATALOG_COLUMNS,
        LABEL_COLUMN,
        normalized_model_group,
        recommendation_labels,
    )
else:
    from recommendation_model import (
        CATALOG_COLUMNS,
        LABEL_COLUMN,
        normalized_model_group,
        recommendation_labels,
    )


BACKEND_DIR = Path(__file__).resolve().parent
SOURCE_PATH = BACKEND_DIR / "Smartphone_2024_enhanced_4.csv"
CATALOG_PATH = BACKEND_DIR / "Phone_Recommendation_Catalog_Verified.csv"
TRAINING_PATH = BACKEND_DIR / "Smartphone_Recommendation_Training_Verified.csv"
SENSOR_ATTRIBUTES_PATH = BACKEND_DIR / "Phone_Sensor_Verified_Attributes.csv"
SENSOR_COLUMNS = ("Has_Fingerprint", "Has_Face_Unlock")
SENSOR_SOURCE_COLUMNS = {
    "Has_Fingerprint": "Fingerprint_Source_URL",
    "Has_Face_Unlock": "Face_Unlock_Source_URL",
}


def prepare_datasets():
    source = pd.read_csv(SOURCE_PATH)
    required = set(CATALOG_COLUMNS)
    missing = required.difference(source.columns)
    if missing:
        raise ValueError(f"Source catalog is missing required columns: {sorted(missing)}")
    verified_sensors = pd.read_csv(SENSOR_ATTRIBUTES_PATH).fillna("")
    required_sensor_columns = {
        "Model_Pattern",
        "Manufacturer_Domain",
        *SENSOR_COLUMNS,
        *SENSOR_SOURCE_COLUMNS.values(),
    }
    missing_sensor_columns = required_sensor_columns.difference(
        verified_sensors.columns
    )
    if missing_sensor_columns:
        raise ValueError(
            "Verified sensor data is missing columns: "
            f"{sorted(missing_sensor_columns)}"
        )
    if verified_sensors["Model_Pattern"].duplicated().any():
        raise ValueError("Verified sensor data contains duplicate model patterns.")
    for _, sensor_record in verified_sensors.iterrows():
        for column, source_column in SENSOR_SOURCE_COLUMNS.items():
            value = str(sensor_record[column]).strip()
            source_url = str(sensor_record[source_column]).strip()
            manufacturer_domain = str(
                sensor_record["Manufacturer_Domain"]
            ).strip().casefold()
            if value not in {"Yes", "No", "Not listed"}:
                raise ValueError(
                    f"Invalid {column} value for "
                    f"{sensor_record['Model_Pattern']}: {value!r}"
                )
            if value in {"Yes", "No"}:
                parsed_url = urlparse(source_url)
                source_host = (parsed_url.hostname or "").casefold()
                if (
                    parsed_url.scheme != "https"
                    or not manufacturer_domain
                    or not (
                        source_host == manufacturer_domain
                        or source_host.endswith(f".{manufacturer_domain}")
                    )
                ):
                    raise ValueError(
                        f"{column} for {sensor_record['Model_Pattern']} needs "
                        "an HTTPS source hosted by its manufacturer."
                    )

    source["Model_Base"] = source["Model"].map(
        normalized_model_group
    )
    source[list(SENSOR_COLUMNS)] = "Not listed"
    for _, sensor_record in verified_sensors.iterrows():
        model_pattern = normalized_model_group(sensor_record["Model_Pattern"])
        matched_models = source["Model_Base"].eq(model_pattern)
        if not matched_models.any():
            raise ValueError(
                f"No source phones match verified model "
                f"{sensor_record['Model_Pattern']!r}."
            )
        for column in SENSOR_COLUMNS:
            source.loc[matched_models, column] = sensor_record[column]
    source = source.loc[
        ~source["Model"].astype(str).str.startswith("Synthetic ", na=False)
    ].copy()
    if source.empty:
        raise ValueError("No catalog phones remain after excluding synthetic replicas.")

    model_groups = source["Model_Base"]
    if model_groups.eq("").any():
        raise ValueError("Every phone must have a non-empty model name.")

    for split_seed in range(42, 142):
        splitter = GroupShuffleSplit(
            n_splits=1, test_size=0.2, random_state=split_seed
        )
        training_indices, catalog_indices = next(
            splitter.split(source, groups=model_groups)
        )
        split_frames = (
            source.iloc[training_indices],
            source.iloc[catalog_indices],
        )
        if all(
            frame[column].nunique(dropna=True) > 1
            for frame in split_frames
            for column in SENSOR_COLUMNS
        ):
            break
    else:
        raise ValueError(
            "Could not create a model-disjoint split with both known and "
            "unknown values for every sensor field."
        )
    training_models = set(model_groups.iloc[training_indices])
    catalog_models = set(model_groups.iloc[catalog_indices])
    if training_models & catalog_models:
        raise ValueError("A base phone model appears in both datasets.")
    training = source.iloc[training_indices].copy()
    catalog = source.iloc[catalog_indices].copy()

    labels = recommendation_labels(training, source)
    source[LABEL_COLUMN] = labels
    training[LABEL_COLUMN] = source.loc[training.index, LABEL_COLUMN]
    catalog[LABEL_COLUMN] = source.loc[catalog.index, LABEL_COLUMN]

    for frame in (training, catalog):
        frame["Price"] = pd.to_numeric(
            frame["Price"].astype(str).str.replace(r"[^0-9.]", "", regex=True),
            errors="coerce",
        ).map(lambda value: f"${value:.2f}")
        frame["RAM"] = frame["RAM"].map(
            lambda value: f"{float(re.search(r'(\d+(?:\.\d+)?)\s*GB\s*RAM', str(value), re.I).group(1)):g} GB RAM"
            if re.search(r"(\d+(?:\.\d+)?)\s*GB\s*RAM", str(value), re.I)
            else "Not listed"
        )
    training = training.loc[:, [*CATALOG_COLUMNS, LABEL_COLUMN]].copy()
    catalog = catalog.loc[:, [*CATALOG_COLUMNS, LABEL_COLUMN]].copy()
    for frame in (training, catalog):
        frame.sort_values("Phone_ID", kind="stable", inplace=True)

    if training["Phone_ID"].isin(catalog["Phone_ID"]).any():
        raise ValueError("Phone IDs overlap between training and catalog datasets.")
    for split_name, frame in (
        ("training", training),
        ("test/catalog", catalog),
    ):
        for column in SENSOR_COLUMNS:
            if frame[column].isna().any() or frame[column].nunique() < 2:
                raise ValueError(
                    f"The {split_name} split needs multiple verified/unknown "
                    f"values in {column}; add source-backed sensor data instead "
                    "of generating values."
                )
    duplicate_columns = [
        column for column in training.columns
        if column in catalog.columns and column not in {"Phone_ID", LABEL_COLUMN}
    ]
    if training[duplicate_columns].apply(tuple, axis=1).isin(
        catalog[duplicate_columns].apply(tuple, axis=1)
    ).any():
        raise ValueError("An identical phone record appears in both datasets.")

    training_temporary = TRAINING_PATH.with_suffix(".tmp")
    catalog_temporary = CATALOG_PATH.with_suffix(".tmp")
    for dataset_path in (TRAINING_PATH, CATALOG_PATH):
        if not dataset_path.exists():
            continue
        try:
            with dataset_path.open("r+b"):
                pass
        except OSError as error:
            raise PermissionError(
                f"Cannot update {dataset_path}; close applications using the "
                "dataset and try again."
            ) from error
    training.to_csv(training_temporary, index=False, encoding="utf-8-sig")
    catalog.to_csv(catalog_temporary, index=False, encoding="utf-8-sig")
    catalog_temporary.replace(CATALOG_PATH)
    training_temporary.replace(TRAINING_PATH)
    return training, catalog


if __name__ == "__main__":
    training_data, catalog_data = prepare_datasets()
    print(
        f"Created {len(training_data)} training rows and {len(catalog_data)} "
        f"held-out catalog/test rows."
    )
    print("Training label counts:")
    print(training_data[LABEL_COLUMN].value_counts().to_string())
    print("Catalog/test label counts:")
    print(catalog_data[LABEL_COLUMN].value_counts().to_string())
