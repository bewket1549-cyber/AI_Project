from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
from pydantic import BaseModel
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder

app = FastAPI(title="Smartphone Authenticity Detection API")

# Enable CORS for React Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load dataset and train model on startup
df = pd.read_csv("Smartphone_2024_enhanced_4.csv")

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