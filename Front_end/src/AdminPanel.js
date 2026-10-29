import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";
const emptyPhone = {
  model: "",
  price_usd: "",
  rating: "",
  processor: "",
  operating_system: "",
  specification: "",
  ram_gb: "",
  storage_gb: "",
  battery_mah: "",
  display_size_inches: "",
  refresh_rate_hz: "",
  camera: "",
  camera_mp: "",
  memory: "",
  has_fingerprint: "Not listed",
  has_face_unlock: "Not listed",
  market: "US",
  image_search_url: "",
  video_search_url: "",
  gif_search_url: "",
};

const fields = [
  ["model", "model", "text", true],
  ["price_usd", "price", "number", true],
  ["rating", "rating", "number", true],
  ["processor", "processor", "text", true],
  ["operating_system", "operatingSystem", "text", false],
  ["specification", "specification", "text", false],
  ["ram_gb", "ram", "number", true],
  ["storage_gb", "storage", "number", true],
  ["battery_mah", "battery", "number", true],
  ["display_size_inches", "displaySize", "number", true],
  ["refresh_rate_hz", "refreshRate", "number", true],
  ["camera", "cameraDetails", "text", false],
  ["camera_mp", "camera", "number", true],
  ["memory", "memory", "text", false],
  ["market", "market", "text", false],
  ["image_search_url", "imageUrl", "text", false],
  ["video_search_url", "videoUrl", "text", false],
  ["gif_search_url", "gifUrl", "text", false],
];

const datasetOptionsByField = {
  model: "models",
  price_usd: "prices",
  rating: "ratings",
  processor: "processors",
  operating_system: "operating_systems",
  specification: "specifications",
  ram_gb: "ram_gb",
  storage_gb: "storage_gb",
  battery_mah: "battery_mah",
  display_size_inches: "display_size_inches",
  refresh_rate_hz: "refresh_rate_hz",
  camera: "cameras",
  camera_mp: "camera_mp",
  memory: "memories",
  market: "markets",
};

const adminTranslations = {
  en: {
    language: "Language",
    finder: "Phone finder",
    signOut: "Sign out admin",
    checking: "Checking admin account...",
    eyebrow: "ADMIN ACCESS",
    catalogEyebrow: "ADMIN CATALOG",
    createAccount: "Create the admin account",
    signInTitle: "Sign in to manage the catalog",
    signupHint: "Create the admin account. Use a password with at least 8 characters.",
    signinHint: "Sign in with the admin email and password.",
    fullName: "Full name",
    email: "Email",
    password: "Password",
    confirmPassword: "Confirm password",
    passwordMismatch: "Passwords do not match.",
    signup: "Sign up",
    signin: "Sign in",
    wait: "Please wait...",
    alreadyAccount: "Already created the admin account?",
    needAccount: "Need to create the admin account?",
    manage: "Manage smartphones",
    changes: "Changes are saved to the CSV dataset. Prices are stored directly in USD.",
    addPhone: "Add phone",
    findPhone: "Find a phone",
    searchModel: "Search by model",
    selectPhone: "Select a phone to edit...",
    catalogEntries: "catalog entries",
    editPhone: "Edit phone",
    newPhone: "Add a new phone",
    model: "Model",
    price: "Price (USD)",
    rating: "Rating (0-100)",
    processor: "Processor",
    operatingSystem: "Operating system",
    ram: "RAM (GB)",
    storage: "Storage (GB)",
    battery: "Battery (mAh)",
    displaySize: "Display size (inches)",
    refreshRate: "Refresh rate (Hz)",
    camera: "Main camera (MP)",
    specification: "Network and features",
    cameraDetails: "Camera description",
    memory: "Memory / card support",
    hasFingerprint: "Fingerprint sensor",
    hasFaceUnlock: "Face unlock",
    notListed: "Not listed",
    market: "Market",
    imageUrl: "Image search URL",
    videoUrl: "Video search URL",
    gifUrl: "GIF search URL",
    yes: "Yes",
    no: "No",
    saving: "Saving...",
    save: "Save changes",
    addToDataset: "Add to dataset",
    delete: "Delete phone",
    confirmDelete: "Delete this phone from the dataset?",
    added: "Phone added to the CSV dataset.",
    updated: "Phone updated in the CSV dataset.",
    deleted: "Phone deleted from the CSV dataset.",
    accountCreated: "Admin account created. Sign in to manage the catalog.",
    requestFailed: "The admin request failed. Check the backend and try again.",
    catalogRefreshFailed: "The catalog was changed, but the finder price range could not be refreshed.",
    invalidCredentials: "Invalid email or password.",
    accountExists: "An admin account has already been created.",
    invalidForm: "Check the information and try again.",
    serviceUnavailable: "The admin service is unavailable. Check the backend.",
  },
  am: {
    language: "ቋንቋ",
    finder: "ወደ ስልክ ፈላጊ",
    signOut: "ከአስተዳዳሪ ውጣ",
    checking: "የአስተዳዳሪ መለያን በማረጋገጥ ላይ...",
    eyebrow: "የአስተዳዳሪ መግቢያ",
    catalogEyebrow: "የአስተዳዳሪ ዳታ",
    createAccount: "የአስተዳዳሪ መለያ ይፍጠሩ",
    signInTitle: "ዳታውን ለማስተዳደር ይግቡ",
    signupHint: "የአስተዳዳሪ መለያ ይፍጠሩ። ቢያንስ 8 ፊደላት ያሉት የይለፍ ቃል ይጠቀሙ።",
    signinHint: "በአስተዳዳሪ ኢሜይልና የይለፍ ቃል ይግቡ።",
    fullName: "ሙሉ ስም",
    email: "ኢሜይል",
    password: "የይለፍ ቃል",
    confirmPassword: "የይለፍ ቃሉን ያረጋግጡ",
    passwordMismatch: "የይለፍ ቃሎቹ አይዛመዱም።",
    signup: "መለያ ይፍጠሩ",
    signin: "ይግቡ",
    wait: "በመጠበቅ ላይ...",
    alreadyAccount: "የአስተዳዳሪ መለያ አለዎት?",
    needAccount: "የአስተዳዳሪ መለያ ይፈጥሩ?",
    manage: "ስልኮችን ያስተዳድሩ",
    changes: "ለውጦች በCSV ዳታው ውስጥ ይቀመጣሉ። ዋጋዎች በUSD ይቀመጣሉ።",
    addPhone: "ስልክ ጨምር",
    findPhone: "ስልክ ፈልግ",
    searchModel: "በሞዴል ፈልግ",
    selectPhone: "ለማስተካከል ስልክ ይምረጡ...",
    catalogEntries: "ስልኮች",
    editPhone: "ስልክ አስተካክል",
    newPhone: "አዲስ ስልክ ጨምር",
    model: "ሞዴል",
    price: "ዋጋ (USD)",
    rating: "ደረጃ (0-100)",
    processor: "ፕሮሰሰር",
    operatingSystem: "ኦፕሬቲንግ ሲስተም",
    ram: "RAM (GB)",
    storage: "ማከማቻ (GB)",
    battery: "ባትሪ (mAh)",
    displaySize: "የስክሪን መጠን (ኢንች)",
    refreshRate: "የስክሪን ፍጥነት (Hz)",
    camera: "ዋና ካሜራ (MP)",
    specification: "ኔትወርክና ተጨማሪ መረጃ",
    cameraDetails: "የካሜራ መግለጫ",
    memory: "ማህደር / የማስታወሻ ካርድ",
    hasFingerprint: "የጣት አሻራ ማንበቢያ",
    hasFaceUnlock: "በፊት መክፈቻ",
    notListed: "በዳታው ውስጥ የለም",
    market: "ገበያ",
    imageUrl: "የምስል ፍለጋ URL",
    videoUrl: "የቪዲዮ ፍለጋ URL",
    gifUrl: "የGIF ፍለጋ URL",
    yes: "አዎ",
    no: "አይ",
    saving: "በማስቀመጥ ላይ...",
    save: "ለውጦችን አስቀምጥ",
    addToDataset: "ወደ ዳታው ጨምር",
    delete: "ስልኩን ሰርዝ",
    confirmDelete: "ይህን ስልክ ከዳታው ላይ ይሰርዙ?",
    added: "ስልኩ ወደ CSV ዳታው ተጨምሯል።",
    updated: "የስልኩ መረጃ ተስተካክሏል።",
    deleted: "ስልኩ ከCSV ዳታው ተሰርዟል።",
    accountCreated: "የአስተዳዳሪ መለያ ተፈጥሯል። ለመቀጠል ይግቡ።",
    requestFailed: "ጥያቄው አልተሳካም። ባክኤንዱን ያረጋግጡና እንደገና ይሞክሩ።",
    catalogRefreshFailed: "ዳታው ተቀይሯል፣ ግን የፈላጊውን የዋጋ ክልል ማደስ አልተቻለም።",
    invalidCredentials: "ኢሜይሉ ወይም የይለፍ ቃሉ ትክክል አይደሉም።",
    accountExists: "የአስተዳዳሪ መለያ አስቀድሞ ተፈጥሯል።",
    invalidForm: "መረጃውን ያረጋግጡና እንደገና ይሞክሩ።",
    serviceUnavailable: "የአስተዳዳሪ አገልግሎቱ አይገኝም። ባክኤንዱን ያረጋግጡ።",
  },
};

const getErrorMessage = (error, language) =>
  ({
    401: adminTranslations[language].invalidCredentials,
    409: adminTranslations[language].accountExists,
    422: adminTranslations[language].invalidForm,
    503: adminTranslations[language].serviceUnavailable,
  }[error.response?.status] || error.response?.data?.detail || adminTranslations[language].requestFailed);

function AdminPanel({
  adminToken,
  onAuthenticated,
  onBack,
  language,
  onLanguageChange,
  onCatalogChange,
  options = {},
}) {
  const text = adminTranslations[language];
  const sensorChoices = [
    ["has_fingerprint", text.hasFingerprint, options.has_fingerprint || []],
    ["has_face_unlock", text.hasFaceUnlock, options.has_face_unlock || []],
  ];
  const [accountConfigured, setAccountConfigured] = useState(null);
  const [authMode, setAuthMode] = useState("loading");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phones, setPhones] = useState([]);
  const [selectedPhoneId, setSelectedPhoneId] = useState("");
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState(emptyPhone);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    axios.get(`${API_URL}/admin/status`)
      .then((response) => {
        if (!active) return;
        const configured = response.data.configured;
        setAccountConfigured(configured);
        setAuthMode(configured ? "signin" : "signup");
      })
      .catch((requestError) => {
        if (!active) return;
        setAccountConfigured(true);
        setAuthMode("signin");
        setError(getErrorMessage(requestError, language));
      });
    return () => {
      active = false;
    };
  }, [language]);

  useEffect(() => {
    if (!adminToken) return undefined;
    let active = true;
    axios.get(`${API_URL}/admin/phones`, {
      headers: { "X-Admin-Token": adminToken },
    })
      .then((response) => {
        if (active) setPhones(response.data.items);
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError, language));
      });
    return () => {
      active = false;
    };
  }, [adminToken, language]);

  const sortedPhones = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const queryTokens = query.split(/[^a-z0-9]+/).filter(Boolean);
    const filteredPhones = query
      ? phones.filter((phone) => {
        const modelTokens = phone.model.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        return queryTokens.every((queryToken) => modelTokens.some((modelToken) => {
          if (modelToken.includes(queryToken) || queryToken.includes(modelToken)) return true;
          if (queryToken.length < 3) return false;
          const previous = Array.from({ length: modelToken.length + 1 }, (_, index) => index);
          for (let row = 1; row <= queryToken.length; row += 1) {
            const current = [row];
            for (let column = 1; column <= modelToken.length; column += 1) {
              current[column] = Math.min(
                current[column - 1] + 1,
                previous[column] + 1,
                previous[column - 1] + (queryToken[row - 1] === modelToken[column - 1] ? 0 : 1)
              );
            }
            previous.splice(0, previous.length, ...current);
          }
          return 1 - previous[modelToken.length] / Math.max(queryToken.length, modelToken.length) >= 0.72;
        }));
      })
      : phones;
    return [...filteredPhones].sort((first, second) =>
      first.model.localeCompare(second.model, undefined, { sensitivity: "base" })
    );
  }, [filter, phones]);

  const beginNewPhone = () => {
    setSelectedPhoneId("");
    setFilter("");
    setForm({ ...emptyPhone });
    setError("");
    setNotice("");
  };

  const selectPhone = async (event) => {
    const phoneId = event.target.value;
    setSelectedPhoneId(phoneId);
    setNotice("");
    setError("");
    if (!phoneId) {
      setForm({ ...emptyPhone });
      return;
    }

    setBusy(true);
    try {
      const response = await axios.get(`${API_URL}/admin/phones/${phoneId}`, {
        headers: { "X-Admin-Token": adminToken },
      });
      setForm(Object.fromEntries(
        Object.entries(response.data).filter(([key]) => key !== "phone_id")
          .map(([key, value]) => [key, String(value)])
      ));
    } catch (requestError) {
      setError(getErrorMessage(requestError, language));
    } finally {
      setBusy(false);
    }
  };

  const signUp = async (event) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError(text.passwordMismatch);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await axios.post(`${API_URL}/admin/signup`, {
        full_name: fullName,
        email,
        password,
      });
      setAccountConfigured(true);
      setAuthMode("signin");
      setPassword("");
      setConfirmPassword("");
      setNotice(text.accountCreated);
    } catch (requestError) {
      setError(getErrorMessage(requestError, language));
    } finally {
      setBusy(false);
    }
  };

  const signIn = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await axios.post(`${API_URL}/admin/login`, { email, password });
      onAuthenticated(response.data.access_token);
      setPassword("");
    } catch (requestError) {
      setError(getErrorMessage(requestError, language));
    } finally {
      setBusy(false);
    }
  };

  const savePhone = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const payload = {
      ...form,
      price_usd: Number(form.price_usd),
      rating: Number(form.rating),
      ram_gb: Number(form.ram_gb),
      storage_gb: Number(form.storage_gb),
      battery_mah: Number(form.battery_mah),
      display_size_inches: Number(form.display_size_inches),
      refresh_rate_hz: Number(form.refresh_rate_hz),
      camera_mp: Number(form.camera_mp),
    };
    try {
      const response = selectedPhoneId
        ? await axios.put(`${API_URL}/admin/phones/${selectedPhoneId}`, payload, {
            headers: { "X-Admin-Token": adminToken },
          })
        : await axios.post(`${API_URL}/admin/phones`, payload, {
            headers: { "X-Admin-Token": adminToken },
          });
      setSelectedPhoneId(String(response.data.phone_id));
      setNotice(selectedPhoneId ? text.updated : text.added);
      const listResponse = await axios.get(`${API_URL}/admin/phones`, {
        headers: { "X-Admin-Token": adminToken },
      });
      setPhones(listResponse.data.items);
      try {
        await onCatalogChange();
      } catch (requestError) {
        setError(`${text.catalogRefreshFailed} ${getErrorMessage(requestError, language)}`);
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, language));
    } finally {
      setBusy(false);
    }
  };

  const deletePhone = async () => {
    if (!selectedPhoneId || !window.confirm(text.confirmDelete)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await axios.delete(`${API_URL}/admin/phones/${selectedPhoneId}`, {
        headers: { "X-Admin-Token": adminToken },
      });
      setPhones((currentPhones) => currentPhones.filter((phone) => String(phone.phone_id) !== selectedPhoneId));
      beginNewPhone();
      setNotice(text.deleted);
      try {
        await onCatalogChange();
      } catch (requestError) {
        setError(`${text.catalogRefreshFailed} ${getErrorMessage(requestError, language)}`);
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, language));
    } finally {
      setBusy(false);
    }
  };

  const updateForm = (event) => {
    setForm((currentForm) => ({ ...currentForm, [event.target.name]: event.target.value }));
  };

  return (
    <div className="admin-screen">
      <header className="topbar">
        <a className="wordmark" href="#admin" onClick={(event) => event.preventDefault()}>
          <span className="wordmark-mark">M</span><span>MELA</span>
        </a>
        <div className="admin-nav">
          <div className="language-switch" aria-label={text.language}>
            <button type="button" className={language === "en" ? "active" : ""} onClick={() => onLanguageChange("en")}>EN</button>
            <button type="button" className={language === "am" ? "active" : ""} onClick={() => onLanguageChange("am")}>አማ</button>
          </div>
          <button type="button" className="clear-button" onClick={onBack}>{text.finder}</button>
          {adminToken && (
            <button
              type="button"
              className="clear-button"
              onClick={async () => {
                try {
                  await axios.post(`${API_URL}/admin/logout`, null, {
                    headers: { "X-Admin-Token": adminToken },
                  });
                } catch (requestError) {
                  setError(getErrorMessage(requestError, language));
                } finally {
                  onAuthenticated("");
                }
              }}
            >
              {text.signOut}
            </button>
          )}
        </div>
      </header>
      <main className={`admin-content ${adminToken ? "admin-content-authenticated" : ""}`}>
        {!adminToken ? (
          authMode === "loading" ? (
            <section className={`admin-login ${language === "am" ? "amharic" : ""}`}><p>{text.checking}</p></section>
          ) : (
            <section className={`admin-login ${language === "am" ? "amharic" : ""}`}>
              <p className="eyebrow">{text.eyebrow}</p>
              <h1>{authMode === "signup" ? text.createAccount : text.signInTitle}</h1>
              <p>
                {authMode === "signup"
                  ? text.signupHint
                  : text.signinHint}
              </p>
              <form onSubmit={authMode === "signup" ? signUp : signIn}>
                {authMode === "signup" && (
                  <>
                    <label htmlFor="admin-full-name">{text.fullName}</label>
                    <input
                      autoComplete="name"
                      id="admin-full-name"
                      type="text"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      minLength="2"
                      maxLength="120"
                      required
                    />
                  </>
                )}
                <label htmlFor="admin-email">{text.email}</label>
                <input
                  autoComplete="username"
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  maxLength="254"
                  required
                />
                <label htmlFor="admin-password">{text.password}</label>
                <input
                  autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={authMode === "signup" ? "8" : undefined}
                  required
                />
                {authMode === "signup" && (
                  <>
                    <label htmlFor="admin-confirm-password">{text.confirmPassword}</label>
                    <input
                      autoComplete="new-password"
                      id="admin-confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      minLength="8"
                      required
                    />
                  </>
                )}
                {error && <p className="error-message" role="alert">{error}</p>}
                {notice && <p className="admin-notice" role="status">{notice}</p>}
                <button className="search-button" type="submit" disabled={busy}>
                  {busy ? text.wait : authMode === "signup" ? text.signup : text.signin}
                </button>
              </form>
              {accountConfigured === false && (
                <p className="admin-auth-switch">
                  {authMode === "signup" ? text.alreadyAccount : text.needAccount}
                  <button type="button" onClick={() => {
                    setAuthMode(authMode === "signup" ? "signin" : "signup");
                    setPassword("");
                    setConfirmPassword("");
                    setError("");
                    setNotice("");
                  }}>
                    {authMode === "signup" ? text.signin : text.signup}
                  </button>
                </p>
              )}
            </section>
          )
        ) : (
          <>
            <div className={`admin-heading ${language === "am" ? "amharic" : ""}`}>
              <div>
                <p className="eyebrow">{text.catalogEyebrow}</p>
                <h1>{text.manage}</h1>
                <p>{phones.length.toLocaleString()} {text.catalogEntries}</p>
              </div>
              <button className="welcome-primary" type="button" onClick={beginNewPhone}>{text.addPhone}</button>
            </div>
            <div className="admin-editor">
              <aside className="admin-selector">
                <h2>{text.findPhone}</h2>
                <label htmlFor="phone-filter">{text.searchModel}</label>
                <input
                  id="phone-filter"
                  type="search"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder={text.searchModel}
                />
                <select id="phone-select" size="14" value={selectedPhoneId} onChange={selectPhone}>
                  <option value="">{text.newPhone}</option>
                  {sortedPhones.map((phone) => (
                    <option key={phone.phone_id} value={phone.phone_id}>
                      {phone.model}
                    </option>
                  ))}
                </select>
              </aside>
              <form className={`admin-form ${language === "am" ? "amharic" : ""}`} onSubmit={savePhone}>
                <h2>{selectedPhoneId ? `${text.editPhone} #${selectedPhoneId}` : text.newPhone}</h2>
                <div className="admin-form-grid">
                  {fields.map(([name, label, type, required]) => (
                    <div className="filter-field" key={name}>
                      <label htmlFor={`admin-${name}`}>{text[label]}</label>
                      <input
                        id={`admin-${name}`}
                        name={name}
                        type={type}
                        min={name === "rating" ? "0" : undefined}
                        max={name === "rating" ? "100" : undefined}
                        step={name === "display_size_inches" || name === "price_usd" || name === "rating" ? "0.01" : "1"}
                        list={
                          (options[datasetOptionsByField[name]] || []).length
                            ? `admin-${name}-options`
                            : undefined
                        }
                        value={form[name]}
                        onChange={updateForm}
                        required={required}
                      />
                    </div>
                  ))}
                  {Object.entries(datasetOptionsByField).map(([name, optionKey]) => (
                    (options[optionKey] || []).length > 0 && (
                      <datalist id={`admin-${name}-options`} key={name}>
                        {options[optionKey].map((value) => (
                          <option key={value} value={value} />
                        ))}
                      </datalist>
                    )
                  ))}
                  {sensorChoices.map(([name, label, choices]) => (
                    <div className="filter-field" key={name}>
                      <label htmlFor={`admin-${name}`}>{label}</label>
                      <select id={`admin-${name}`} name={name} value={form[name]} onChange={updateForm}>
                        {choices.map((value) => (
                          <option key={value} value={value}>
                            {value === "Yes" ? text.yes : value === "No" ? text.no : text.notListed}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                {error && <p className="error-message" role="alert">{error}</p>}
                {notice && <p className="admin-notice" role="status">{notice}</p>}
                <div className="admin-form-actions">
                  <button className="search-button" type="submit" disabled={busy}>
                    {busy ? text.saving : selectedPhoneId ? text.save : text.addToDataset}
                  </button>
                  {selectedPhoneId && (
                    <button className="admin-delete" type="button" onClick={deletePhone} disabled={busy}>{text.delete}</button>
                  )}
                </div>
              </form>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default AdminPanel;
