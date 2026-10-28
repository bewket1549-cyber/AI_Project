import React, { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";

const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";
const PAGE_SIZE = 24;

const translations = {
  en: {
    eyebrow: "SMARTPHONE FINDER",
    title: "Find your next phone",
    subtitle: "Compare phone specifications with catalog prices converted to USD.",
    budgetMode: "By budget",
    specsMode: "By specifications",
    bothMode: "Budget + specs",
    budgetTitle: "Start with your budget",
    specsTitle: "Choose what matters",
    bothTitle: "Combine budget and specs",
    budgetHint: "Enter one maximum price or a range such as 300-800 USD.",
    specsHint: "Search specifications only. Price filters are disabled in this mode.",
    bothHint: "Enter one maximum price or a range, then add specifications.",
    priceInputLabel: "Budget (USD)",
    pricePlaceholder: "e.g. 800 or 300-800",
    priceRange: "Catalog range: USD {min} – USD {max}",
    exchangeNote: "Converted from INR using the reference rate dated {date}; not a US retail price.",
    model: "Model name",
    modelPlaceholder: "e.g. Galaxy, Redmi, iPhone",
    ram: "RAM",
    storage: "Internal storage",
    ramPlaceholder: "Any RAM",
    storagePlaceholder: "Any storage",
    processor: "Processor",
    processorPlaceholder: "e.g. Snapdragon, Dimensity",
    operatingSystem: "Operating system",
    osPlaceholder: "Type or choose an OS",
    moreSpecifications: "More specifications",
    batteryCapacity: "Battery (mAh)",
    displaySize: "Display size (inches)",
    refreshRate: "Refresh rate (Hz)",
    cameraResolution: "Main camera (MP)",
    search: "Show matching phones",
    clear: "Clear filters",
    budgetRequired: "Enter one maximum price or a minimum-maximum range to search by budget.",
    invalidRange: "Minimum price cannot be greater than maximum price.",
    invalidPrice: "Enter a number or a range such as 300-800.",
    searchModeLabel: "Search mode",
    languageLabel: "Language",
    results: "Matching phones",
    showing: "Showing {shown} of {total} phones",
    emptyTitle: "No phones match these filters",
    emptyText: "Try a higher budget or remove one of the selected specifications.",
    loadMore: "Load more ({count} remaining)",
    loading: "Loading phones...",
    loadingSearch: "Finding matches...",
    error: "Could not reach the phone catalog. Check that the backend is running.",
    price: "Price",
    rating: "Rating",
    battery: "Battery",
    display: "Display",
    camera: "Camera",
    details: "Network and features",
    images: "Images",
    videos: "Videos",
    gifs: "GIFs",
    moreDetails: "More phone details",
    notListed: "Not listed",
    memory: "Memory / card support",
    fingerprint: "Fingerprint sensor",
    faceUnlock: "Face unlock",
    classification: "Dataset classification",
    catalog: "2024 source catalog",
  },
  am: {
    eyebrow: "የስልክ መፈለጊያ",
    title: "ቀጣዩን ስልክዎን ያግኙ",
    subtitle: "የስልኮችን መረጃና ወደ ዶላር የተቀየሩ ዋጋዎችን ያወዳድሩ።",
    budgetMode: "በበጀት",
    specsMode: "በመረጃዎች",
    bothMode: "በበጀትና መረጃ",
    budgetTitle: "በበጀትዎ ይጀምሩ",
    specsTitle: "የሚፈልጉትን ይምረጡ",
    bothTitle: "በበጀትና መረጃዎች በአንድነት ይፈልጉ",
    budgetHint: "አንድ ከፍተኛ ዋጋ ወይም እንደ 300-800 የዋጋ ክልል በዶላር ያስገቡ።",
    specsHint: "ዋጋ ሳያስገቡ በስልክ መረጃዎች ብቻ ይፈልጉ።",
    bothHint: "አንድ ከፍተኛ ዋጋ ወይም የዋጋ ክልል በዶላር ያስገቡ፤ ከዚያ መረጃዎችን ይምረጡ።",
    priceInputLabel: "በጀት (USD)",
    pricePlaceholder: "ለምሳሌ 800 ወይም 300-800",
    priceRange: "የዝርዝሩ የዋጋ ክልል፦ USD {min} – USD {max}",
    exchangeNote: "ከINR ወደ USD ተቀይሯል፤ የልወጣ ቀን {date} ነው። ይህ የUS ችርቻሮ ዋጋ አይደለም።",
    model: "የሞዴል ስም",
    modelPlaceholder: "ለምሳሌ Galaxy፣ Redmi፣ iPhone",
    ram: "RAM",
    storage: "የውስጥ ማከማቻ",
    ramPlaceholder: "ማንኛውም RAM",
    storagePlaceholder: "ማንኛውም ማከማቻ",
    processor: "ፕሮሰሰር",
    processorPlaceholder: "ለምሳሌ Snapdragon፣ Dimensity",
    operatingSystem: "ኦፕሬቲንግ ሲስተም",
    osPlaceholder: "ይጻፉ ወይም ይምረጡ",
    moreSpecifications: "ተጨማሪ መረጃዎች",
    batteryCapacity: "ባትሪ (mAh)",
    displaySize: "የስክሪን መጠን (ኢንች)",
    refreshRate: "የማደሻ ፍጥነት (Hz)",
    cameraResolution: "ዋና ካሜራ (MP)",
    search: "የሚመሳሰሉ ስልኮችን ፈልግ",
    clear: "ማጣሪያዎችን አጽዳ",
    budgetRequired: "በበጀት ለመፈለግ አንድ ከፍተኛ ዋጋ ወይም ዝቅተኛ-ከፍተኛ ክልል ያስገቡ።",
    invalidRange: "ዝቅተኛው ዋጋ ከከፍተኛው መብለጥ አይችልም።",
    invalidPrice: "ቁጥር ወይም እንደ 300-800 ያለ ክልል ያስገቡ።",
    searchModeLabel: "የፍለጋ አይነት",
    languageLabel: "ቋንቋ",
    results: "የተገኙ ስልኮች",
    showing: "ከ{total} ስልኮች {shown} እየታዩ ነው",
    emptyTitle: "ከእነዚህ ማጣሪያዎች ጋር የሚስማማ ስልክ አልተገኘም",
    emptyText: "በጀቡን ይጨምሩ ወይም ከተመረጡት መረጃዎች አንዱን ያስወግዱ።",
    loadMore: "ተጨማሪ አሳይ ({count} ቀርተዋል)",
    loading: "ስልኮች በመጫን ላይ...",
    loadingSearch: "ተመሳሳዮችን በመፈለግ ላይ...",
    error: "የስልክ ዝርዝሩን ማግኘት አልተቻለም። ባክኤንዱ መስራቱን ያረጋግጡ።",
    price: "ዋጋ",
    rating: "ደረጃ",
    battery: "ባትሪ",
    display: "ስክሪን",
    camera: "ካሜራ",
    details: "ኔትወርክና ተጨማሪ መረጃ",
    images: "ምስሎች",
    videos: "ቪዲዮዎች",
    gifs: "GIFዎች",
    moreDetails: "ስለ ስልኩ ተጨማሪ መረጃ",
    notListed: "በዳታው ውስጥ የለም",
    memory: "ማህደር / የማስታወሻ ካርድ",
    fingerprint: "የጣት አሻራ ማንበቢያ",
    faceUnlock: "በፊት መክፈቻ",
    classification: "የዳታ ምደባ",
    catalog: "የ2024 መነሻ ዳታ",
  },
};

const emptyFilters = {
  price_range: "",
  model: "",
  ram_gb: "",
  storage_gb: "",
  battery_mah: "",
  display_size_inches: "",
  refresh_rate_hz: "",
  camera_mp: "",
  processor: "",
  operating_system: "",
};

const parseBudgetRange = (value) => {
  const parts = value.trim().split(/\s*(?:-|–|to)\s*/i);
  if (parts.length > 2 || parts.some((part) => part === "")) return null;
  const prices = parts.map((part) => Number(part.replace(/[$,\s]/g, "")));
  if (prices.some((price) => !Number.isFinite(price) || price <= 0)) return null;
  if (prices.length === 1) return { min_price: "", max_price: String(prices[0]) };
  return { min_price: String(prices[0]), max_price: String(prices[1]) };
};

const getStorageLabel = (phone, notListed) => {
  const storage = phone.storage == null ? "" : String(phone.storage).trim();
  if (storage && !["unknown", "n/a", "na"].includes(storage.toLowerCase())) return storage;
  return phone.storage_gb > 0 ? `${phone.storage_gb} GB` : notListed;
};

function App() {
  const [language, setLanguage] = useState("en");
  const [mode, setMode] = useState("budget");
  const [filters, setFilters] = useState(emptyFilters);
  const [options, setOptions] = useState({
    ram_gb: [],
    storage_gb: [],
    battery_mah: [],
    display_size_inches: [],
    refresh_rate_hz: [],
    camera_mp: [],
    models: [],
    processors: [],
    operating_systems: [],
    min_price: 650,
    max_price: 184999,
    inr_to_usd_rate: 0.010513,
    exchange_rate_date: "2026-10-27",
  });
  const [phones, setPhones] = useState([]);
  const [total, setTotal] = useState(0);
  const [activeSearchParams, setActiveSearchParams] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const text = translations[language];

  useEffect(() => {
    let active = true;
    Promise.all([
      axios.get(`${API_URL}/phones/options`),
      axios.get(`${API_URL}/phones`, { params: { limit: PAGE_SIZE, offset: 0 } }),
    ])
      .then(([optionsResponse, phonesResponse]) => {
        if (!active) return;
        setOptions(optionsResponse.data);
        setPhones(phonesResponse.data.items);
        setTotal(phonesResponse.data.total);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const updateFilter = (event) => {
    setFilters({ ...filters, [event.target.name]: event.target.value });
    setValidationError("");
  };

  const requestParams = (values, offset = 0) => {
    const params = { limit: PAGE_SIZE, offset };
    Object.entries(values).forEach(([key, value]) => {
      if (value !== "") params[key] = value;
    });
    return params;
  };

  const searchFilterValues = (values) => {
    const specificationFields = [
      "model",
      "ram_gb",
      "storage_gb",
      "battery_mah",
      "display_size_inches",
      "refresh_rate_hz",
      "camera_mp",
      "processor",
      "operating_system",
    ];
    const fields = mode === "budget"
      ? []
      : mode === "specs"
        ? specificationFields
        : specificationFields;
    const params = Object.fromEntries(fields.filter((key) => values[key] !== "").map((key) => [key, values[key]]));
    if (mode !== "specs" && values.price_range.trim()) {
      const priceRange = parseBudgetRange(values.price_range);
      const rate = options.inr_to_usd_rate;
      if (priceRange.min_price) params.min_price = String(Math.round(Number(priceRange.min_price) / rate));
      if (priceRange.max_price) params.max_price = String(Math.round(Number(priceRange.max_price) / rate));
    }
    return params;
  };

  const searchPhones = async (event, values = filters) => {
    if (event) event.preventDefault();
    if (mode === "budget" && !values.price_range.trim()) {
      setValidationError("budget");
      return;
    }
    if (mode !== "specs" && values.price_range.trim()) {
      const priceRange = parseBudgetRange(values.price_range);
      if (!priceRange) {
        setValidationError("price");
        return;
      }
      if (
        priceRange.min_price &&
        priceRange.max_price &&
        Number(priceRange.min_price) > Number(priceRange.max_price)
      ) {
        setValidationError("range");
        return;
      }
    }
    setValidationError("");
    const params = searchFilterValues(values);
    setActiveSearchParams(params);
    setLoading(true);
    setError(false);
    setHasSearched(true);
    try {
      const response = await axios.get(`${API_URL}/phones`, {
        params: requestParams(params),
      });
      setPhones(response.data.items);
      setTotal(response.data.total);
    } catch (requestError) {
      setError(true);
      setPhones([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setFilters({ ...emptyFilters });
    setValidationError("");
    if (mode === "budget") {
      setPhones([]);
      setTotal(0);
      setActiveSearchParams({});
      setHasSearched(true);
      setValidationError("budget");
      return;
    }
    searchPhones(null, emptyFilters);
  };

  const loadMore = async () => {
    setLoadingMore(true);
    setError(false);
    try {
      const response = await axios.get(`${API_URL}/phones`, {
        params: requestParams(activeSearchParams, phones.length),
      });
      setPhones((currentPhones) => [...currentPhones, ...response.data.items]);
      setTotal(response.data.total);
    } catch (requestError) {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const field = (name, label, content, className = "") => (
    <div className={`filter-field ${className}`}>
      <label htmlFor={name}>{label}</label>
      {content}
    </div>
  );

  const shownText = text.showing
    .replace("{shown}", phones.length.toLocaleString())
    .replace("{total}", total.toLocaleString());

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Mela home">
          <span className="wordmark-mark">M</span>
          <span>MELA</span>
        </a>
        <div className="topbar-meta">
          <span className="catalog-label">{text.catalog}</span>
          <div className="language-switch" aria-label={text.languageLabel}>
            <button
              type="button"
              className={language === "en" ? "active" : ""}
              aria-pressed={language === "en"}
              onClick={() => setLanguage("en")}
            >
              EN
            </button>
            <button
              type="button"
              className={language === "am" ? "active" : ""}
              aria-pressed={language === "am"}
              onClick={() => setLanguage("am")}
            >
              አማ
            </button>
          </div>
        </div>
      </header>

      <main id="top" className={`main-content ${language === "am" ? "amharic" : ""}`}>
        <section className="intro">
          <p className="eyebrow">{text.eyebrow}</p>
          <h1>{text.title}</h1>
          <p className="intro-copy">{text.subtitle}</p>
        </section>

        <section className="finder-layout" aria-label={text.eyebrow}>
          <aside className="filter-panel">
            <div className="mode-switch" role="tablist" aria-label={text.searchModeLabel}>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "budget"}
                className={mode === "budget" ? "active" : ""}
                onClick={() => { setMode("budget"); setValidationError(""); }}
              >
                {text.budgetMode}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "specs"}
                className={mode === "specs" ? "active" : ""}
                onClick={() => { setMode("specs"); setValidationError(""); }}
              >
                {text.specsMode}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "both"}
                className={mode === "both" ? "active" : ""}
                onClick={() => { setMode("both"); setValidationError(""); }}
              >
                {text.bothMode}
              </button>
            </div>
            <div className="filter-heading">
              <h2>{mode === "budget" ? text.budgetTitle : mode === "specs" ? text.specsTitle : text.bothTitle}</h2>
              <p>{mode === "budget" ? text.budgetHint : mode === "specs" ? text.specsHint : text.bothHint}</p>
            </div>

            <form className="filters-form" onSubmit={searchPhones}>
              <div className={`filter-grid ${mode}-mode`}>
                {(mode === "budget" || mode === "both") && <>
                  {field("price_range", text.priceInputLabel, <div className="input-with-prefix"><span>$</span><input id="price_range" name="price_range" type="text" inputMode="decimal" value={filters.price_range} onChange={updateFilter} placeholder={text.pricePlaceholder} /></div>, "price-field")}
                </>}
                {(mode === "specs" || mode === "both") && <>
                  {field("model", text.model, <input id="model" name="model" type="search" list="model-options" value={filters.model} onChange={updateFilter} placeholder={text.modelPlaceholder} />, "model-field")}
                  {field("ram_gb", text.ram, <input id="ram_gb" name="ram_gb" type="number" min="1" list="ram-options" value={filters.ram_gb} onChange={updateFilter} placeholder={text.ramPlaceholder} />, "ram-field")}
                  {field("storage_gb", text.storage, <input id="storage_gb" name="storage_gb" type="number" min="1" list="storage-options" value={filters.storage_gb} onChange={updateFilter} placeholder={text.storagePlaceholder} />, "storage-field")}
                  {field("processor", text.processor, <input id="processor" name="processor" type="search" list="processor-options" value={filters.processor} onChange={updateFilter} placeholder={text.processorPlaceholder} />, "processor-field")}
                  {field("operating_system", text.operatingSystem, <input id="operating_system" name="operating_system" type="search" list="os-options" value={filters.operating_system} onChange={updateFilter} placeholder={text.osPlaceholder} />, "os-field")}
                  <details className="advanced-specs">
                    <summary>{text.moreSpecifications}</summary>
                    <div className="advanced-specs-grid">
                      {field("battery_mah", text.batteryCapacity, <input id="battery_mah" name="battery_mah" type="number" min="1" list="battery-options" value={filters.battery_mah} onChange={updateFilter} />)}
                      {field("display_size_inches", text.displaySize, <input id="display_size_inches" name="display_size_inches" type="number" min="1" step="0.01" list="display-options" value={filters.display_size_inches} onChange={updateFilter} />)}
                      {field("refresh_rate_hz", text.refreshRate, <input id="refresh_rate_hz" name="refresh_rate_hz" type="number" min="1" list="refresh-options" value={filters.refresh_rate_hz} onChange={updateFilter} />)}
                      {field("camera_mp", text.cameraResolution, <input id="camera_mp" name="camera_mp" type="number" min="1" list="camera-options" value={filters.camera_mp} onChange={updateFilter} />)}
                    </div>
                  </details>
                </>}
              </div>
              {(mode === "budget" || mode === "both") && (
                <p className="price-range-note">
                  {text.priceRange
                    .replace("{min}", (options.min_price * options.inr_to_usd_rate).toLocaleString("en-US", { maximumFractionDigits: 0 }))
                    .replace("{max}", (options.max_price * options.inr_to_usd_rate).toLocaleString("en-US", { maximumFractionDigits: 0 }))}
                </p>
              )}
              {(mode === "budget" || mode === "both") && (
                <p className="exchange-note">
                  {text.exchangeNote.replace("{date}", options.exchange_rate_date)}
                </p>
              )}
              {validationError && (
                <p className="validation-message" role="alert">
                  {validationError === "budget" ? text.budgetRequired : validationError === "price" ? text.invalidPrice : text.invalidRange}
                </p>
              )}
              <datalist id="model-options">{options.models.map((value) => <option key={value} value={value} />)}</datalist>
              <datalist id="ram-options">{options.ram_gb.map((value) => <option key={value} value={value} />)}</datalist>
              <datalist id="storage-options">{options.storage_gb.map((value) => <option key={value} value={value} />)}</datalist>
              <datalist id="processor-options">{options.processors.map((value) => <option key={value} value={value} />)}</datalist>
              <datalist id="os-options">{options.operating_systems.map((value) => <option key={value} value={value} />)}</datalist>
              <datalist id="battery-options">{options.battery_mah.map((value) => <option key={value} value={value} />)}</datalist>
              <datalist id="display-options">{options.display_size_inches.map((value) => <option key={value} value={value} />)}</datalist>
              <datalist id="refresh-options">{options.refresh_rate_hz.map((value) => <option key={value} value={value} />)}</datalist>
              <datalist id="camera-options">{options.camera_mp.map((value) => <option key={value} value={value} />)}</datalist>
              <div className="filter-actions">
                <button className="search-button" type="submit" disabled={loading}>
                  {loading && hasSearched ? text.loadingSearch : text.search}
                </button>
                <button className="clear-button" type="button" onClick={clearFilters}>
                  {text.clear}
                </button>
              </div>
            </form>
          </aside>

          <section className="results-panel" aria-live="polite">
            <div className="results-heading">
              <div>
                <p className="eyebrow">{text.results}</p>
                <h2>{shownText}</h2>
              </div>
              <span className="results-count">{total.toLocaleString()}</span>
            </div>

            {error && <p className="error-message" role="alert">{text.error}</p>}
            {loading ? (
              <div className="empty-state"><p>{text.loading}</p></div>
            ) : phones.length === 0 ? (
              <div className="empty-state">
                <span className="empty-mark">0</span>
                <h3>{text.emptyTitle}</h3>
                <p>{text.emptyText}</p>
              </div>
            ) : (
              <>
                <div className="phone-grid">
                  {phones.map((phone) => (
                    <article className="phone-card" key={phone.model}>
                      <div className="phone-card-top">
                        <div className="phone-title">
                          <span className="phone-kicker">{phone.operating_system || text.catalog}</span>
                          <h3>{phone.model}</h3>
                          <div className="media-links" aria-label={`${phone.model} media links`}>
                            <a className="media-link image-link" href={phone.image_search_url} target="_blank" rel="noreferrer">{text.images}</a>
                            <a className="media-link video-link" href={phone.video_search_url} target="_blank" rel="noreferrer">{text.videos}</a>
                            <a className="media-link gif-link" href={phone.gif_search_url} target="_blank" rel="noreferrer">{text.gifs}</a>
                          </div>
                        </div>
                        <div className="phone-price">
                          <span>{text.price}</span>
                          <strong>
                            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
                              .format(phone.price_inr * options.inr_to_usd_rate)}
                          </strong>
                        </div>
                      </div>
                      {phone.rating != null && (
                        <div className="rating-line">
                          <span className="rating-star">★</span> {text.rating} {phone.rating}/100
                        </div>
                      )}
                      <div className="phone-specs">
                        <div><span>{text.ram}</span><strong>{phone.ram_gb ? `${phone.ram_gb} GB` : phone.ram || "—"}</strong></div>
                        <div><span>{text.storage}</span><strong>{getStorageLabel(phone, text.notListed)}</strong></div>
                        <div><span>{text.processor}</span><strong>{phone.processor || "—"}</strong></div>
                        <div><span>{text.battery}</span><strong>{phone.battery || "—"}</strong></div>
                        <div><span>{text.display}</span><strong>{phone.display || "—"}</strong></div>
                        <div><span>{text.camera}</span><strong>{phone.camera || "—"}</strong></div>
                      </div>
                      <details className="phone-more">
                        <summary>{text.moreDetails}</summary>
                        <dl>
                          <div><dt>{text.operatingSystem}</dt><dd>{phone.operating_system || text.notListed}</dd></div>
                          <div><dt>{text.storage}</dt><dd>{getStorageLabel(phone, text.notListed)}</dd></div>
                          <div><dt>{text.ram}</dt><dd>{phone.ram || (phone.ram_gb ? `${phone.ram_gb} GB` : text.notListed)}</dd></div>
                          <div><dt>{text.batteryCapacity}</dt><dd>{phone.battery_mah ? `${phone.battery_mah} mAh` : phone.battery || text.notListed}</dd></div>
                          <div><dt>{text.displaySize}</dt><dd>{phone.display_size_inches ? `${phone.display_size_inches} inches` : phone.display || text.notListed}</dd></div>
                          <div><dt>{text.refreshRate}</dt><dd>{phone.refresh_rate_hz ? `${phone.refresh_rate_hz} Hz` : text.notListed}</dd></div>
                          <div><dt>{text.cameraResolution}</dt><dd>{phone.camera_mp ? `${phone.camera_mp} MP` : phone.camera || text.notListed}</dd></div>
                          <div><dt>{text.details}</dt><dd>{phone.specification || text.notListed}</dd></div>
                          <div><dt>{text.memory}</dt><dd>{phone.memory || text.notListed}</dd></div>
                          <div><dt>{text.fingerprint}</dt><dd>{phone.has_fingerprint || text.notListed}</dd></div>
                          <div><dt>{text.faceUnlock}</dt><dd>{phone.has_face_unlock || text.notListed}</dd></div>
                          <div><dt>{text.classification}</dt><dd>{phone.is_original || text.notListed}</dd></div>
                        </dl>
                      </details>
                    </article>
                  ))}
                </div>
                {phones.length < total && (
                  <button className="load-more" type="button" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore
                      ? text.loadingSearch
                      : text.loadMore.replace("{count}", (total - phones.length).toLocaleString())}
                  </button>
                )}
              </>
            )}
          </section>
        </section>
      </main>
    </div>
  );
}

export default App;