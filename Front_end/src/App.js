import React, { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";
import AdminPanel from "./AdminPanel";
import WelcomeScreen from "./WelcomeScreen";

const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";
const PAGE_SIZE = 24;

const translations = {
  en: {
    eyebrow: "SMARTPHONE FINDER",
    title: "Find your next phone",
    subtitle: "Search one catalog using any combination of budget and phone attributes.",
    budgetMode: "By budget",
    specsMode: "By specifications",
    bothMode: "Budget + specs",
    budgetTitle: "Start with your budget",
    specsTitle: "Choose what matters",
    bothTitle: "Search by any phone attribute",
    budgetHint: "Enter the most you want to spend, or choose the catalog's lowest price.",
    specsHint: "Search specifications only. Price filters are disabled in this mode.",
    bothHint: "Add a budget and any combination of phone attributes. Exact matches rank first; closest matches follow.",
    maxPriceLabel: "Maximum budget (USD)",
    maxPricePlaceholder: "e.g. 800",
    minPriceButton: "Show lowest-priced phones: USD {min}",
    maxPriceButton: "Show highest-priced phones: USD {max}",
    market: "Market",
    model: "Model name",
    modelPlaceholder: "e.g. Galaxy, Redmi, iPhone",
    ram: "RAM",
    storage: "Internal storage",
    ratingPreference: "Preferred rating (0-100)",
    yes: "Yes",
    no: "No",
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
    search: "Find matching phones",
    clear: "Clear filters",
    budgetRequired: "Enter a maximum budget or choose the catalog's lowest price.",
    invalidRange: "Enter a valid budget.",
    invalidPrice: "Enter a valid price greater than zero.",
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
    catalog: "2024 source catalog",
    downloadPdf: "Download results as PDF",
    downloadingPdf: "Preparing PDF...",
    pdfError: "Could not create the PDF. Please try again.",
    downloadPhonePdf: "Download phone PDF",
    popularTitle: "Most searched phones",
    popularNote: "Ranked using anonymous, aggregated search counts.",
    popularEmpty: "Popular recommendations will appear as people search.",
    popularSearchCount: "searches",
    popularityError: "Search results loaded, but popularity data could not be updated.",
    recommendationSearch: "Get AI recommendations",
    recommendationSearching: "Finding recommendations...",
    recommendationError: "Could not generate dataset-based recommendations. Please try again.",
    recommendationNeedCriteria: "Choose at least one phone feature or enter a budget.",
    recommendationNote: "A Random Forest classifies phones using a separate model-level training split. Labels are rule-generated from value and specification scores, not human-verified recommendations.",
    recommendationBadge: "AI recommendation",
    notRecommendedBadge: "Not recommended",
    recommendationScore: "Recommendation score: {score}/100",
    recommendationFit: "Preference match: {score}%",
    recommendationConfidence: "Model confidence: {score}%",
    anyOption: "Any",
    exactMatch: "Exact Match",
    closestMatch: "Closest match",
    getPhoneRecommendation: "Get AI Recommendation",
    recommendationTitle: "AI recommendation",
    recommendationReason: "Why this phone",
    recommendationClose: "Close",
    recommendationLabel: "Recommended",
    notRecommendedLabel: "Not Recommended",
    recommendationDetailsError: "Could not load this phone's recommendation. Please try again.",
  },
  am: {
    eyebrow: "የስልክ መፈለጊያ",
    title: "ቀጣዩን ስልክዎን ያግኙ",
    subtitle: "በበጀት ወይም በስልክ መረጃ የሚስማማ ስልክ ያግኙ።",
    budgetMode: "በበጀት",
    specsMode: "በመረጃዎች",
    bothMode: "በበጀትና መረጃ",
    budgetTitle: "በበጀትዎ ይጀምሩ",
    specsTitle: "የሚፈልጉትን ይምረጡ",
    bothTitle: "በበጀትና መረጃዎች በአንድነት ይፈልጉ",
    budgetHint: "ከፍተኛ የሚከፍሉትን ዋጋ ያስገቡ ወይም የዝርዝሩን ዝቅተኛ ዋጋ ይምረጡ።",
    specsHint: "ዋጋ ሳያስገቡ በስልክ መረጃዎች ብቻ ይፈልጉ።",
    bothHint: "ከፍተኛ የሚከፍሉትን ዋጋ ያስገቡና የሚፈልጉትን መረጃ ይምረጡ።",
    maxPriceLabel: "ከፍተኛ በጀት (USD)",
    maxPricePlaceholder: "ለምሳሌ 800",
    minPriceButton: "በዝቅተኛ ዋጋ ያሉ ስልኮችን አሳይ፦ USD {min}",
    maxPriceButton: "በከፍተኛ ዋጋ ያሉ ስልኮችን አሳይ፦ USD {max}",
    market: "ገበያ",
    model: "የሞዴል ስም",
    modelPlaceholder: "ለምሳሌ Galaxy፣ Redmi፣ iPhone",
    ram: "RAM",
    storage: "የውስጥ ማከማቻ",
    ratingPreference: "የሚፈልጉት ደረጃ (0-100)",
    yes: "አዎ",
    no: "አይ",
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
    budgetRequired: "ከፍተኛ በጀት ያስገቡ ወይም የዝርዝሩን ዝቅተኛ ዋጋ ይምረጡ።",
    invalidRange: "ትክክለኛ በጀት ያስገቡ።",
    invalidPrice: "ከዜሮ በላይ የሆነ ትክክለኛ ዋጋ ያስገቡ።",
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
    catalog: "የ2024 መነሻ ዳታ",
    downloadPdf: "ውጤቶቹን በPDF አውርድ",
    downloadingPdf: "PDF በማዘጋጀት ላይ...",
    pdfError: "PDF ማዘጋጀት አልተቻለም። እንደገና ይሞክሩ።",
    downloadPhonePdf: "የስልኩን PDF አውርድ",
    popularTitle: "ብዙ ጊዜ የተፈለጉ ስልኮች",
    popularNote: "ደረጃው በስም ወይም IP የማይለይ የተጠቃለለ የፍለጋ ብዛት ላይ የተመሰረተ ነው።",
    popularEmpty: "ተጠቃሚዎች ሲፈልጉ ታዋቂ ስልኮች እዚህ ይታያሉ።",
    popularSearchCount: "ፍለጋ",
    popularityError: "የፍለጋ ውጤቶቹ ተጭነዋል፣ ግን የታዋቂነት መረጃ ማዘመን አልተቻለም።",
    recommendationSearch: "በAI የተመከሩ ስልኮችን ፈልግ",
    recommendationSearching: "የሚመከሩ ስልኮችን በመፈለግ ላይ...",
    recommendationError: "በዳታ ላይ የተመሰረተ ምክር ማዘጋጀት አልተቻለም። እንደገና ይሞክሩ።",
    recommendationNeedCriteria: "ቢያንስ አንድ የስልክ ባህሪ ይምረጡ ወይም በጀት ያስገቡ።",
    recommendationNote: "Random Forest загвар нь утасны model түвшинд тусгаарласан сургалтын өгөгдлөөр сурсан. Шошгыг үнэ цэнэ, үзүүлэлтийн дүрмээр үүсгэсэн; хүн баталгаажуулаагүй.",
    recommendationBadge: "በAI የተመከረ",
    notRecommendedBadge: "አይመከርም",
    recommendationScore: "የምክር ነጥብ፦ {score}/100",
    recommendationFit: "ከፍላጎት ጋር ተዛማጅነት፦ {score}%",
    recommendationConfidence: "የзагвар итгэлцэл፦ {score}%",
    anyOption: "ማንኛውም",
    exactMatch: "ትክክለኛ ተዛማጅ",
    closestMatch: "በጣም የቀረበ ተዛማጅ",
    getPhoneRecommendation: "በAI ምክር ያግኙ",
    recommendationTitle: "የAI ምክር",
    recommendationReason: "የስልኩ ጥቅምና ጉዳት",
    recommendationClose: "ዝጋ",
    recommendationLabel: "ይመከራል",
    notRecommendedLabel: "አይመከርም",
    recommendationDetailsError: "የዚህን ስልክ ምክር ማግኘት አልተቻለም። እንደገና ይሞክሩ።",
  },
};

const emptyFilters = {
  max_price: "",
  model: "",
  ram_gb: "",
  storage_gb: "",
  battery_mah: "",
  display_size_inches: "",
  refresh_rate_hz: "",
  camera_mp: "",
  rating: "",
  processor: "",
  operating_system: "",
  specification: "",
  memory: "",
  market: "",
  has_fingerprint: "",
  has_face_unlock: "",
};

const getStorageLabel = (phone, notListed) => {
  const storage = phone.storage == null ? "" : String(phone.storage).trim();
  if (storage && !["unknown", "n/a", "na"].includes(storage.toLowerCase())) return storage;
  return phone.storage_gb > 0 ? `${phone.storage_gb} GB` : notListed;
};

function App() {
  const [language, setLanguage] = useState("en");
  const [screen, setScreen] = useState("welcome");
  const [adminToken, setAdminToken] = useState("");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const [popularityError, setPopularityError] = useState(false);
  const [popularPhones, setPopularPhones] = useState([]);
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
    specifications: [],
    memories: [],
    markets: [],
    ratings: [],
    has_fingerprint: [],
    has_face_unlock: [],
    cameras: [],
    prices: [],
    min_price: 650,
    max_price: 184999,
    inr_to_usd_rate: 0.010513,
    exchange_rate_date: "2026-10-27",
  });
  const [phones, setPhones] = useState([]);
  const [total, setTotal] = useState(0);
  const [activeSearchParams, setActiveSearchParams] = useState({});
  const [activeRecommendationParams, setActiveRecommendationParams] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [recommendationError, setRecommendationError] = useState(false);
  const [recommendationPhone, setRecommendationPhone] = useState(null);
  const [recommendationDetails, setRecommendationDetails] = useState(null);
  const [recommendationDetailsError, setRecommendationDetailsError] = useState(false);
  const [recommendationDetailsLoading, setRecommendationDetailsLoading] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const text = translations[language];

  useEffect(() => {
    let active = true;
    Promise.all([
      axios.get(`${API_URL}/phones/options`),
      axios.get(`${API_URL}/phones`, { params: { limit: PAGE_SIZE, offset: 0 } }),
      axios.get(`${API_URL}/phones/popular`),
    ])
      .then(([optionsResponse, phonesResponse, popularResponse]) => {
        if (!active) return;
        setOptions(optionsResponse.data);
        setPhones(phonesResponse.data.items);
        setTotal(phonesResponse.data.total);
        setPopularPhones(popularResponse.data.items);
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

  const refreshPhoneOptions = async () => {
    const [optionsResponse, phonesResponse, popularResponse] = await Promise.all([
      axios.get(`${API_URL}/phones/options`),
      axios.get(`${API_URL}/phones`, { params: { limit: PAGE_SIZE, offset: 0 } }),
      axios.get(`${API_URL}/phones/popular`),
    ]);
    setOptions(optionsResponse.data);
    setPhones(phonesResponse.data.items);
    setTotal(phonesResponse.data.total);
    setPopularPhones(popularResponse.data.items);
  };

  const requestParams = (values, offset = 0) => {
    const params = { limit: PAGE_SIZE, offset };
    Object.entries(values).forEach(([key, value]) => {
      if (value !== "") params[key] = value;
    });
    return params;
  };

  const searchFilterValues = (values) => Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== "")
  );

  const recommendationPreferences = () => {
    const preferences = {
      ...(activeRecommendationParams || activeSearchParams),
    };
    delete preferences.sort;
    return preferences;
  };

  const searchPhones = async (event, values = filters, sort = "model") => {
    if (event) event.preventDefault();
    const maximumPrice = values.max_price.trim() ? Number(values.max_price) : null;
    if (maximumPrice !== null && (!Number.isFinite(maximumPrice) || maximumPrice <= 0)) {
      setValidationError("price");
      return;
    }
    setValidationError("");
    const params = searchFilterValues(values);
    if (sort !== "model") params.sort = sort;
    setActiveRecommendationParams(null);
    setActiveSearchParams(params);
    setLoading(true);
    setError(false);
    setRecommendationError(false);
    setHasSearched(true);
    try {
      const response = await axios.get(`${API_URL}/phones`, {
        params: requestParams(params),
      });
      setPhones(response.data.items);
      setTotal(response.data.total);
      setPopularityError(false);
      const interestParams = Object.fromEntries(
        Object.entries(params).filter(([key]) => key !== "sort")
      );
      if (Object.keys(interestParams).length > 0) {
        try {
          await axios.post(`${API_URL}/phones/search-interest`, interestParams);
          const popularResponse = await axios.get(`${API_URL}/phones/popular`);
          setPopularPhones(popularResponse.data.items);
        } catch {
          setPopularityError(true);
        }
      }
    } catch {
      setError(true);
      setPhones([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const recommendPhones = async (event) => {
    event.preventDefault();
    const preferences = searchFilterValues(filters);
    if (preferences.max_price && (
      !Number.isFinite(Number(preferences.max_price)) || Number(preferences.max_price) <= 0
    )) {
      setValidationError("price");
      return;
    }
    if (!Object.keys(preferences).length) {
      setValidationError("recommendation");
      return;
    }
    setValidationError("");
    setLoading(true);
    setError(false);
    setRecommendationError(false);
    setHasSearched(true);
    setActiveSearchParams({});
    setActiveRecommendationParams(preferences);
    try {
      const response = await axios.post(`${API_URL}/phones/recommendations`, {
        ...preferences,
        offset: 0,
        limit: PAGE_SIZE,
      });
      setPhones(response.data.items);
      setTotal(response.data.total);
    } catch (requestError) {
      setActiveRecommendationParams(null);
      setRecommendationError(true);
      setPhones([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setFilters({ ...emptyFilters });
    setValidationError("");
    setRecommendationError(false);
    setActiveRecommendationParams(null);
    searchPhones(null, emptyFilters);
  };

  const searchPopularPhone = (phone) => {
    const nextFilters = { ...emptyFilters, model: phone.model };
    setFilters(nextFilters);
    searchPhones(null, nextFilters);
  };

  const searchLowestPricePhones = () => {
    const nextFilters = { ...emptyFilters };
    setFilters(nextFilters);
    searchPhones(null, nextFilters, "price_asc");
  };

  const searchHighestPricePhones = () => {
    const nextFilters = { ...emptyFilters };
    setFilters(nextFilters);
    searchPhones(null, nextFilters, "price_desc");
  };

  const getPhoneRecommendation = async (phone) => {
    setRecommendationPhone(phone);
    setRecommendationDetails(null);
    setRecommendationDetailsError(false);
    setRecommendationDetailsLoading(true);
    try {
      const response = await axios.post(
        `${API_URL}/phones/${phone.phone_id}/recommendation`,
        recommendationPreferences()
      );
      setRecommendationDetails(response.data);
    } catch {
      setRecommendationDetailsError(true);
    } finally {
      setRecommendationDetailsLoading(false);
    }
  };

  const closeRecommendation = () => {
    setRecommendationPhone(null);
    setRecommendationDetails(null);
    setRecommendationDetailsError(false);
  };

  const loadMore = async () => {
    setLoadingMore(true);
    setError(false);
    try {
      const response = activeRecommendationParams
        ? await axios.post(`${API_URL}/phones/recommendations`, {
            ...activeRecommendationParams,
            offset: phones.length,
            limit: PAGE_SIZE,
          })
        : await axios.get(`${API_URL}/phones`, {
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

  const downloadPdf = async (phone = null) => {
    setExportingPdf(true);
    setPdfError(false);
    try {
      const response = await axios.get(
        phone ? `${API_URL}/phones/${phone.phone_id}/pdf` : `${API_URL}/phones/export/pdf`,
        {
        params: phone ? undefined : activeSearchParams,
        responseType: "blob",
        }
      );
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = phone
        ? `${phone.model.replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`
        : "mela-smartphone-catalog.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (requestError) {
      setPdfError(true);
    } finally {
      setExportingPdf(false);
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
  const hasSearchCriteria = Object.keys(activeSearchParams).some((key) => key !== "sort");
  const hasExactMatch = phones.some((phone) => phone.exact_match);

  if (screen === "welcome") {
    return (
      <WelcomeScreen
        language={language}
        onContinue={() => setScreen("finder")}
        onAdmin={() => setScreen("admin")}
        onLanguageChange={setLanguage}
      />
    );
  }

  if (screen === "admin") {
    return (
      <AdminPanel
        adminToken={adminToken}
        language={language}
        onAuthenticated={setAdminToken}
        onBack={() => setScreen("finder")}
        onCatalogChange={refreshPhoneOptions}
        onLanguageChange={setLanguage}
        options={options}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Mela home">
          <span className="wordmark-mark">M</span>
          <span>MELA</span>
        </a>
        <div className="topbar-meta">
          <span className="catalog-label">{text.catalog}</span>
          <button type="button" className="admin-open" onClick={() => setScreen("admin")}>Admin</button>
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
            <div className="filter-heading">
              <h2>{text.bothTitle}</h2>
              <p>{text.bothHint}</p>
            </div>

            <form className="filters-form" onSubmit={searchPhones}>
              <div className="filter-grid">
                {field("max_price", text.maxPriceLabel, <div className="input-with-prefix"><span>$</span><input id="max_price" name="max_price" type="number" min="0.01" step="0.01" list="price-options" inputMode="decimal" value={filters.max_price} onChange={updateFilter} placeholder={text.maxPricePlaceholder} /></div>)}
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
                    {field("rating", text.ratingPreference, <input id="rating" name="rating" type="number" min="0" max="100" step="1" list="rating-options" value={filters.rating} onChange={updateFilter} />)}
                    {field("specification", text.details, <input id="specification" name="specification" type="search" list="specification-options" value={filters.specification} onChange={updateFilter} />)}
                    {field("memory", text.memory, <input id="memory" name="memory" type="search" list="memory-options" value={filters.memory} onChange={updateFilter} />)}
                    {field("market", text.market, <input id="market" name="market" type="search" list="market-options" value={filters.market} onChange={updateFilter} />)}
                    {field("has_fingerprint", text.fingerprint, (
                      <select id="has_fingerprint" name="has_fingerprint" value={filters.has_fingerprint} onChange={updateFilter}>
                        <option value="">{text.anyOption}</option>
                        {options.has_fingerprint.map((value) => <option key={value} value={value}>{value === "Yes" ? text.yes : value === "No" ? text.no : text.notListed}</option>)}
                      </select>
                    ))}
                    {field("has_face_unlock", text.faceUnlock, (
                      <select id="has_face_unlock" name="has_face_unlock" value={filters.has_face_unlock} onChange={updateFilter}>
                        <option value="">{text.anyOption}</option>
                        {options.has_face_unlock.map((value) => <option key={value} value={value}>{value === "Yes" ? text.yes : value === "No" ? text.no : text.notListed}</option>)}
                      </select>
                    ))}
                  </div>
                </details>
              </div>
              <div className="price-range-note">
                <button className="min-price-button" type="button" onClick={searchLowestPricePhones}>
                  {text.minPriceButton.replace("{min}", Number(options.min_price).toLocaleString("en-US", { maximumFractionDigits: 2 }))}
                </button>
                <button className="min-price-button" type="button" onClick={searchHighestPricePhones}>
                  {text.maxPriceButton.replace("{max}", Number(options.max_price).toLocaleString("en-US", { maximumFractionDigits: 2 }))}
                </button>
              </div>
              {validationError && (
                <p className="validation-message" role="alert">
                  {validationError === "budget"
                    ? text.budgetRequired
                    : validationError === "price"
                      ? text.invalidPrice
                      : validationError === "recommendation"
                        ? text.recommendationNeedCriteria
                        : text.invalidRange}
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
              <datalist id="rating-options">{options.ratings.map((value) => <option key={value} value={value} />)}</datalist>
              <datalist id="specification-options">{options.specifications.map((value) => <option key={value} value={value} />)}</datalist>
              <datalist id="memory-options">{options.memories.map((value) => <option key={value} value={value} />)}</datalist>
              <datalist id="market-options">{options.markets.map((value) => <option key={value} value={value} />)}</datalist>
              <datalist id="price-options">{options.prices.map((value) => <option key={value} value={value} />)}</datalist>
              <div className="filter-actions">
                <button className="search-button" type="submit" disabled={loading}>
                  {loading && hasSearched ? text.loadingSearch : text.search}
                </button>
                <button className="clear-button" type="button" onClick={clearFilters}>
                  {text.clear}
                </button>
              </div>
              <button
                className="recommendation-search-button"
                type="button"
                onClick={recommendPhones}
                disabled={loading}
              >
                {loading && activeRecommendationParams
                  ? text.recommendationSearching
                  : text.recommendationSearch}
              </button>
            </form>
          </aside>

          <section className="results-panel" aria-live="polite">
            <div className="results-heading">
              <div>
                <p className="eyebrow">{text.results}</p>
                <h2>{shownText}</h2>
              </div>
              <div className="results-actions">
                {!activeRecommendationParams && (
                  <button className="pdf-button" type="button" onClick={() => downloadPdf()} disabled={exportingPdf}>
                    {exportingPdf ? text.downloadingPdf : text.downloadPdf}
                  </button>
                )}
                <span className="results-count">{total.toLocaleString()}</span>
              </div>
            </div>

            {error && <p className="error-message" role="alert">{text.error}</p>}
            {recommendationError && <p className="error-message" role="alert">{text.recommendationError}</p>}
            {activeRecommendationParams && (
              <p className="recommendation-note">{text.recommendationNote}</p>
            )}
            {pdfError && <p className="error-message" role="alert">{text.pdfError}</p>}
            {popularityError && <p className="error-message" role="alert">{text.popularityError}</p>}
            <section className="popular-panel" aria-labelledby="popular-heading">
              <div className="popular-heading">
                <h3 id="popular-heading">{text.popularTitle}</h3>
                <p>{text.popularNote}</p>
              </div>
              {popularPhones.length ? (
                <div className="popular-list">
                  {popularPhones.map((phone) => (
                    <button
                      className="popular-phone"
                      key={phone.phone_id}
                      type="button"
                      onClick={() => searchPopularPhone(phone)}
                    >
                      <span>
                        <strong>{phone.model}</strong>
                        <small>
                          {phone.search_count.toLocaleString()} {text.popularSearchCount}
                        </small>
                      </span>
                      <b>
                        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
                          .format(phone.price_usd)}
                      </b>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="popular-empty">{text.popularEmpty}</p>
              )}
            </section>
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
                    <article className="phone-card" key={phone.phone_id}>
                      <div className="phone-card-top">
                        <div className="phone-title">
                          <span className="phone-kicker">{phone.operating_system || text.catalog}</span>
                          <h3>{phone.model}</h3>
                          {phone.exact_match ? (
                            <span className="exact-match-badge">{text.exactMatch}</span>
                          ) : hasSearchCriteria && !hasExactMatch ? (
                            <span className="closest-match-badge">{text.closestMatch}</span>
                          ) : null}
                          {phone.match_score != null && hasSearchCriteria && (
                            <span className="phone-match-score">
                              {text.recommendationFit.replace("{score}", phone.match_score.toLocaleString())}
                            </span>
                          )}
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
                              .format(phone.price_usd)}
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
                        <div><span>{text.battery}</span><strong>{phone.battery_mah ? `${phone.battery_mah} mAh` : "—"}</strong></div>
                        <div><span>{text.display}</span><strong>{phone.display_size_inches ? `${phone.display_size_inches} in${phone.refresh_rate_hz ? ` · ${phone.refresh_rate_hz} Hz` : ""}` : "—"}</strong></div>
                        <div><span>{text.camera}</span><strong>{phone.camera || "—"}</strong></div>
                      </div>
                      {phone.recommended !== undefined && (
                        <div className={`recommendation-badge ${phone.recommended ? "is-recommended" : "is-not-recommended"}`}>
                          <strong>{phone.recommended ? text.recommendationBadge : text.notRecommendedBadge}</strong>
                          <span>{text.recommendationScore.replace(
                            "{score}",
                            phone.recommendation_score.toLocaleString()
                          )}</span>
                          <span>{text.recommendationFit.replace(
                            "{score}",
                            phone.match_score.toLocaleString()
                          )}</span>
                          <span>{text.recommendationConfidence.replace(
                            "{score}",
                            phone.confidence.toLocaleString()
                          )}</span>
                        </div>
                      )}
                      <button
                        className="phone-recommendation-button"
                        type="button"
                        onClick={() => getPhoneRecommendation(phone)}
                      >
                        {text.getPhoneRecommendation}
                      </button>
                      <button
                        className="phone-pdf-button"
                        type="button"
                        onClick={() => downloadPdf(phone)}
                        disabled={exportingPdf}
                      >
                        {exportingPdf ? text.downloadingPdf : text.downloadPhonePdf}
                      </button>
                      <details className="phone-more">
                        <summary>{text.moreDetails}</summary>
                        <dl>
                          <div><dt>{text.operatingSystem}</dt><dd>{phone.operating_system || text.notListed}</dd></div>
                          <div><dt>{text.market}</dt><dd>{phone.market || text.notListed}</dd></div>
                          <div><dt>{text.storage}</dt><dd>{getStorageLabel(phone, text.notListed)}</dd></div>
                          <div><dt>{text.ram}</dt><dd>{phone.ram_gb ? `${phone.ram_gb} GB` : phone.ram || text.notListed}</dd></div>
                          <div><dt>{text.batteryCapacity}</dt><dd>{phone.battery_mah ? `${phone.battery_mah} mAh` : text.notListed}</dd></div>
                          <div><dt>{text.displaySize}</dt><dd>{phone.display_size_inches ? `${phone.display_size_inches} inches` : text.notListed}</dd></div>
                          <div><dt>{text.refreshRate}</dt><dd>{phone.refresh_rate_hz ? `${phone.refresh_rate_hz} Hz` : text.notListed}</dd></div>
                          <div><dt>{text.cameraResolution}</dt><dd>{phone.camera_mp ? `${phone.camera_mp} MP` : phone.camera || text.notListed}</dd></div>
                          <div><dt>{text.details}</dt><dd>{phone.specification || text.notListed}</dd></div>
                          <div><dt>{text.memory}</dt><dd>{phone.memory || text.notListed}</dd></div>
                          <div><dt>{text.fingerprint}</dt><dd>{phone.has_fingerprint || text.notListed}</dd></div>
                          <div><dt>{text.faceUnlock}</dt><dd>{phone.has_face_unlock || text.notListed}</dd></div>
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
      {recommendationPhone && (
        <div className="recommendation-modal-backdrop">
          <section
            className="recommendation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="recommendation-modal-title"
          >
            <header className="recommendation-modal-header">
              <div>
                <p className="eyebrow">{text.recommendationTitle}</p>
                <h2 id="recommendation-modal-title">{recommendationPhone.model}</h2>
              </div>
              <button type="button" onClick={closeRecommendation}>
                {text.recommendationClose}
              </button>
            </header>
            {recommendationDetailsLoading ? (
              <p>{text.recommendationSearching}</p>
            ) : recommendationDetailsError ? (
              <p className="error-message" role="alert">{text.recommendationDetailsError}</p>
            ) : recommendationDetails && (
              <div className="recommendation-modal-content">
                <span className={`recommendation-verdict ${recommendationDetails.recommended ? "is-recommended" : "is-not-recommended"}`}>
                  {recommendationDetails.recommended ? text.recommendationLabel : text.notRecommendedLabel}
                </span>
                <h3>{text.recommendationReason}</h3>
                <p>{recommendationDetails.recommendation_reason}</p>
                <dl>
                  <div>
                    <dt>{text.recommendationScore.replace("{score}", "")}</dt>
                    <dd>{recommendationDetails.recommendation_score}/100</dd>
                  </div>
                  <div>
                    <dt>{text.recommendationFit.replace("{score}", "")}</dt>
                    <dd>{recommendationDetails.match_score}%</dd>
                  </div>
                  <div>
                    <dt>{text.recommendationConfidence.replace("{score}", "")}</dt>
                    <dd>{recommendationDetails.confidence}%</dd>
                  </div>
                </dl>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default App;