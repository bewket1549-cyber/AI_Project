import React, { useState } from "react";
import axios from "axios";

function App() {
  const [formData, setFormData] = useState({
    ram_gb: 8,
    storage_gb: 128,
    battery_mah: 5000,
    display_size_inches: 6.7,
    refresh_rate_hz: 120,
    main_camera_mp: 50,
  });

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post(
        "http://127.0.0.1:8000/predict",
        formData
      );
      setResult(response.data);
    } catch (error) {
      console.error("Error connecting to backend:", error);
      alert("ከባክኤንድ ሰርቨር ጋር መገናኘት አልተቻለም!");
    }
    setLoading(false);
  };

  return (
    <div style={{ fontFamily: "Arial", padding: "40px", maxWidth: "600px", margin: "auto" }}>
      <h2>📱 የስልኮች ትክክለኛነት ማረጋገጫ (Smartphone Authenticity AI)</h2>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "15px" }}>
        <div>
          <label><b>RAM (GB):</b> </label><br/>
          <input type="number" name="ram_gb" value={formData.ram_gb} onChange={handleChange} style={{ width: "100%", padding: "8px", marginTop: "5px" }} />
        </div>
        <div>
          <label><b>Storage (GB):</b> </label><br/>
          <input type="number" name="storage_gb" value={formData.storage_gb} onChange={handleChange} style={{ width: "100%", padding: "8px", marginTop: "5px" }} />
        </div>
        <div>
          <label><b>Battery (mAh):</b> </label><br/>
          <input type="number" name="battery_mah" value={formData.battery_mah} onChange={handleChange} style={{ width: "100%", padding: "8px", marginTop: "5px" }} />
        </div>
        <div>
          <label><b>Display Size (Inches):</b> </label><br/>
          <input type="number" step="0.1" name="display_size_inches" value={formData.display_size_inches} onChange={handleChange} style={{ width: "100%", padding: "8px", marginTop: "5px" }} />
        </div>
        <div>
          <label><b>Refresh Rate (Hz):</b> </label><br/>
          <input type="number" name="refresh_rate_hz" value={formData.refresh_rate_hz} onChange={handleChange} style={{ width: "100%", padding: "8px", marginTop: "5px" }} />
        </div>
        <div>
          <label><b>Main Camera (MP):</b> </label><br/>
          <input type="number" name="main_camera_mp" value={formData.main_camera_mp} onChange={handleChange} style={{ width: "100%", padding: "8px", marginTop: "5px" }} />
        </div>
        
        <button type="submit" style={{ padding: "12px", background: "#007BFF", color: "white", border: "none", cursor: "pointer", fontSize: "16px", fontWeight: "bold", borderRadius: "5px" }}>
          {loading ? "በማጣራት ላይ..." : "ውጤቱን አሳይ (Check Authenticity)"}
        </button>
      </form>

      {result && (
        <div style={{ marginTop: "30px", padding: "20px", background: result.prediction === "Original" ? "#d4edda" : "#f8d7da", border: "1px solid #ccc", borderRadius: "5px" }}>
          <h3>የትንበያ ውጤት (Result):</h3>
          <p><b>ሁኔታ (Status):</b> {result.prediction}</p>
          <p><b>እርግጠኝነት (Confidence):</b> {result.confidence}%</p>
          <p><b>መልዕክት (Message):</b> {result.message}</p>
        </div>
      )}
    </div>
  );
}

export default App;