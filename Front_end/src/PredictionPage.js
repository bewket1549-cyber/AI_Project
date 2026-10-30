import React, { useEffect, useState } from "react";
import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";

const initialForm = {
  model: "",
  brand: "",
  series_tier: "",
  price_usd: "",
  processor: "",
  ram_gb: "",
  storage_gb: "",
  battery_mah: "",
  display_size_inches: "",
  refresh_rate_hz: "",
  main_camera_mp: "",
  operating_system: "",
  network_connectivity: "",
  has_fingerprint: "",
  has_face_unlock: "",
};

const labels = {
  en: {
    back: "Back to home",
    eyebrow: "NEW PHONE PREDICTION",
    title: "Predict a phone recommendation",
    subtitle: "Enter the phone details below. We will compare it with the 11 closest catalog phones and show the majority recommendation.",
    product: "Phone details",
    model: "Phone model",
    brand: "Brand",
    seriesTier: "Series tier",
    price: "Price (USD)",
    processor: "Processor",
    ram: "RAM (GB)",
    storage: "Storage (GB)",
    battery: "Battery (mAh)",
    displaySize: "Display size (inches)",
    refreshRate: "Refresh rate (Hz)",
    mainCamera: "Main camera (MP)",
    operatingSystem: "Operating system",
    connectivity: "Network connectivity",
    fingerprint: "Fingerprint sensor",
    faceUnlock: "Face unlock",
    choose: "Choose",
    yes: "Yes",
    no: "No",
    predict: "Find 11 matches and predict",
    predicting: "Comparing phones...",
    error: "Could not predict this phone. Check the details and try again.",
    result: "Prediction from the 11 closest phones",
    recommended: "Recommended",
    notRecommended: "Not Recommended",
    neighborVotes: "{yes} of 11 closest phones recommend it; {no} do not.",
    forest: "Random Forest prediction",
    similarity: "{score}% match",
    modelNameMatch: "Name match: {score}%",
    closestPhones: "11 closest catalog phones",
    testScores: "Random Forest test scores",
    testRows: "Evaluated on {count} held-out phones",
    accuracy: "Accuracy",
    precision: "Precision",
    recall: "Recall",
    f1: "F1 score",
    metricsLoading: "Loading model test scores...",
    metricsError: "Model test scores could not be loaded.",
    optionsError: "Suggestions could not load; you can still enter the values manually.",
  },
  am: {
    back: "ወደ መነሻ ተመለስ",
    eyebrow: "የአዲስ ስልክ ትንበያ",
    title: "የስልክ ምክር ይተንብዩ",
    subtitle: "ከታች ያሉትን የስልክ መረጃዎች ያስገቡ። ከ11 በጣም ተመሳሳይ ስልኮች ጋር አነጻጽረን የብዙሃኑን ምክር እናሳያለን።",
    product: "የስልክ መረጃ",
    model: "የስልክ ሞዴል",
    brand: "ብራንድ",
    seriesTier: "የምርት ደረጃ",
    price: "ዋጋ (USD)",
    processor: "ፕሮሰሰር",
    ram: "RAM (GB)",
    storage: "ማከማቻ (GB)",
    battery: "ባትሪ (mAh)",
    displaySize: "የስክሪን መጠን (ኢንች)",
    refreshRate: "የማደሻ ፍጥነት (Hz)",
    mainCamera: "ዋና ካሜራ (MP)",
    operatingSystem: "ኦፕሬቲንግ ሲስተም",
    connectivity: "የኔትወርክ ግንኙነት",
    fingerprint: "የጣት አሻራ",
    faceUnlock: "የፊት መክፈቻ",
    choose: "ይምረጡ",
    yes: "አዎ",
    no: "አይ",
    predict: "11 ተመሳሳይ ስልኮችን ፈልግና ተንብይ",
    predicting: "ስልኮችን በማነጻጸር ላይ...",
    error: "የስልኩን ትንበያ ማዘጋጀት አልተቻለም። መረጃዎቹን አረጋግጠው እንደገና ይሞክሩ።",
    result: "ከ11 ተመሳሳይ ስልኮች የተገኘ ትንበያ",
    recommended: "ይመከራል",
    notRecommended: "አይመከርም",
    neighborVotes: "ከ11 ተመሳሳይ ስልኮች {yes} ይመክራሉ፤ {no} አይመክሩም።",
    forest: "የRandom Forest ትንበያ",
    similarity: "{score}% ተመሳሳይነት",
    modelNameMatch: "የሞዴል ስም ተዛማጅነት፦ {score}%",
    closestPhones: "11 በጣም ተመሳሳይ ስልኮች",
    testScores: "የRandom Forest የሙከራ ውጤቶች",
    testRows: "ባልተጠቀመባቸው {count} ስልኮች ላይ ተገምግሟል",
    accuracy: "ትክክለኛነት",
    precision: "ትክክለኛ ትንበያ",
    recall: "ማስታወስ",
    f1: "F1 ውጤት",
    metricsLoading: "የሞዴሉ የሙከራ ውጤቶች በመጫን ላይ...",
    metricsError: "የሞዴሉን የሙከራ ውጤቶች ማግኘት አልተቻለም።",
    optionsError: "የምርጫ ጥቆማዎች አልተጫኑም፤ መረጃዎቹን በእጅ ማስገባት ይችላሉ።",
  },
};

function PredictionPage({ language, onBack }) {
  const text = labels[language] || labels.en;
  const [form, setForm] = useState(initialForm);
  const [options, setOptions] = useState({});
  const [optionsError, setOptionsError] = useState(false);
  const [modelMetrics, setModelMetrics] = useState(null);
  const [metricsError, setMetricsError] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    axios.get(`${API_URL}/phones/options`)
      .then((response) => {
        if (active) setOptions(response.data);
      })
      .catch(() => {
        if (active) setOptionsError(true);
      });
    axios.get(`${API_URL}/model/metrics`)
      .then((response) => {
        if (active) setModelMetrics(response.data);
      })
      .catch(() => {
        if (active) setMetricsError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const update = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    const numericFields = [
      "price_usd",
      "ram_gb",
      "storage_gb",
      "battery_mah",
      "display_size_inches",
      "refresh_rate_hz",
      "main_camera_mp",
    ];
    const payload = { ...form };
    numericFields.forEach((field) => {
      payload[field] = Number(payload[field]);
    });
    try {
      const response = await axios.post(`${API_URL}/phones/predict-new`, payload);
      setResult(response.data);
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail || text.error
      );
    } finally {
      setLoading(false);
    }
  };

  const field = (name, label, type = "text", values = [], extra = {}) => (
    <div className="prediction-field">
      <label htmlFor={`prediction-${name}`}>{label}</label>
      <input
        id={`prediction-${name}`}
        name={name}
        type={type}
        value={form[name]}
        onChange={update}
        required
        list={values.length ? `prediction-options-${name}` : undefined}
        min={type === "number" ? "0" : undefined}
        step={type === "number" ? "any" : undefined}
        {...extra}
      />
      {values.length > 0 && (
        <datalist id={`prediction-options-${name}`}>
          {values.map((value) => <option key={value} value={value} />)}
        </datalist>
      )}
    </div>
  );

  const select = (name, label) => (
    <div className="prediction-field">
      <label htmlFor={`prediction-${name}`}>{label}</label>
      <select
        id={`prediction-${name}`}
        name={name}
        value={form[name]}
        onChange={update}
        required
      >
        <option value="">{text.choose}</option>
        <option value="Yes">{text.yes}</option>
        <option value="No">{text.no}</option>
      </select>
    </div>
  );

  const seriesTierSelect = () => (
    <div className="prediction-field">
      <label htmlFor="prediction-series_tier">{text.seriesTier}</label>
      <select
        id="prediction-series_tier"
        name="series_tier"
        value={form.series_tier}
        onChange={update}
        required
      >
        <option value="">{text.choose}</option>
        {(options.series_tiers?.length
          ? options.series_tiers
          : ["Budget", "Mid-Range", "Flagship"]
        ).map((tier) => (
          <option key={tier} value={tier}>{tier}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="prediction-screen">
      <header className="topbar">
        <a className="wordmark" href="#prediction" aria-label="Mela home">
          <span className="wordmark-mark">M</span>
          <span>MELA</span>
        </a>
        <button type="button" className="admin-open" onClick={onBack}>{text.back}</button>
      </header>
      <main className={`prediction-content ${language === "am" ? "amharic" : ""}`}>
        <section className="prediction-heading">
          <p className="eyebrow">{text.eyebrow}</p>
          <h1>{text.title}</h1>
          <p>{text.subtitle}</p>
        </section>
        <div className="prediction-scroll-area">
          <form className="prediction-form" onSubmit={submit}>
            <h2>{text.product}</h2>
            <div className="prediction-grid">
              {field("model", text.model)}
              {field("brand", text.brand, "text", options.brands || [])}
              {seriesTierSelect()}
              {field("price_usd", text.price, "number", [], { min: "0.01" })}
              {field("processor", text.processor, "text", options.processors || [])}
              {field("ram_gb", text.ram, "number", options.ram_gb || [])}
              {field("storage_gb", text.storage, "number", options.storage_gb || [])}
              {field("battery_mah", text.battery, "number", options.battery_mah || [])}
              {field("display_size_inches", text.displaySize, "number", options.display_size_inches || [])}
              {field("refresh_rate_hz", text.refreshRate, "number", options.refresh_rate_hz || [])}
              {field("main_camera_mp", text.mainCamera, "number", options.camera_mp || [])}
              {field("operating_system", text.operatingSystem, "text", options.operating_systems || [])}
              {field("network_connectivity", text.connectivity, "text", options.network_connectivities || [])}
              {select("has_fingerprint", text.fingerprint)}
              {select("has_face_unlock", text.faceUnlock)}
            </div>
            {optionsError && <p className="prediction-hint">{text.optionsError}</p>}
            {error && <p className="error-message" role="alert">{error}</p>}
            <button className="search-button prediction-submit" type="submit" disabled={loading}>
              {loading ? text.predicting : text.predict}
            </button>
          </form>

          {result && (
            <section className="prediction-results" aria-live="polite">
              <div className={`prediction-verdict ${result.recommended ? "is-recommended" : "is-not-recommended"}`}>
                <p className="eyebrow">{text.result}</p>
                <h2>
                  <span className={`prediction-label ${result.recommended ? "is-recommended" : "is-not-recommended"}`}>
                    {result.recommended ? text.recommended : text.notRecommended}
                  </span>
                </h2>
                <p>{text.neighborVotes
                  .replace("{yes}", result.vote_counts.Recommended)
                  .replace("{no}", result.vote_counts["Not Recommended"])}</p>
                <p>{text.forest}: {result.random_forest_prediction} ({result.random_forest_confidence}%)</p>
              </div>
              <section className="prediction-test-scores" aria-label={text.testScores}>
                <div className="prediction-test-scores-heading">
                  <h3>{text.testScores}</h3>
                  {modelMetrics && (
                    <p>{text.testRows.replace("{count}", modelMetrics.test_rows)}</p>
                  )}
                </div>
                {metricsError ? (
                  <p className="prediction-metrics-error" role="status">{text.metricsError}</p>
                ) : modelMetrics ? (
                  <dl className="prediction-metrics-grid">
                    {[
                      ["accuracy", text.accuracy],
                      ["precision", text.precision],
                      ["recall", text.recall],
                      ["f1", text.f1],
                    ].map(([key, label]) => (
                      <div key={key} className={`prediction-metric prediction-metric-${key}`}>
                        <dt>{label}</dt>
                        <dd>{(modelMetrics[key] * 100).toFixed(1)}%</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="prediction-metrics-loading" role="status">{text.metricsLoading}</p>
                )}
              </section>
              <h2>{text.closestPhones}</h2>
              <ol className="prediction-neighbor-list">
                {result.neighbors.map((phone) => (
                  <li key={phone.phone_id}>
                    <div>
                      <strong>{phone.model}</strong>
                      <span>
                        <span className={`neighbor-recommendation ${phone.recommendation_label === "Recommended" ? "is-recommended" : "is-not-recommended"}`}>
                          {phone.recommendation_label}
                        </span>
                        <span className="neighbor-model-name-match">
                          {text.modelNameMatch.replace("{score}", phone.model_name_similarity_score)}
                        </span>
                        {" · "}
                        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(phone.price_usd)}
                        {" · "}{phone.ram_gb} GB RAM · {phone.storage_gb} GB
                      </span>
                    </div>
                    <span>{text.similarity.replace("{score}", phone.similarity_score)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

export default PredictionPage;
