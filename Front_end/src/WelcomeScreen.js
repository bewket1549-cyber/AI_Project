import React from "react";

function WelcomeScreen({ language, onContinue, onPredict, onLanguageChange, onAdmin }) {
  const isAmharic = language === "am";

  return (
    <main className="welcome-screen">
      <header className="welcome-header">
        <a className="wordmark" href="#welcome" aria-label="Mela home">
          <span className="wordmark-mark">M</span>
          <span>MELA</span>
        </a>
        <div className="welcome-header-actions">
          <button type="button" className="welcome-admin-link" onClick={onAdmin}>
            {isAmharic ? "አስተዳዳሪ" : "Admin"}
          </button>
          <div className="language-switch" aria-label={isAmharic ? "ቋንቋ" : "Language"}>
            <button type="button" className={!isAmharic ? "active" : ""} onClick={() => onLanguageChange("en")}>EN</button>
            <button type="button" className={isAmharic ? "active" : ""} onClick={() => onLanguageChange("am")}>አማ</button>
          </div>
        </div>
      </header>
      <section className={`welcome-hero ${isAmharic ? "amharic" : ""}`} id="welcome">
        <div className="welcome-copy">
          <p className="eyebrow">{isAmharic ? "የስልክ ምክር ስርዓት" : "SMARTPHONE RECOMMENDATION SYSTEM"}</p>
          <h1>{isAmharic ? "የሚቀጥለው ስልክዎ እዚህ ይጀምራል።" : "Find the phone that fits your life."}</h1>
          <div className="welcome-actions">
            <button type="button" className="welcome-primary" onClick={onContinue}>
              {isAmharic ? "ስልኬን ፈልግ" : "Find my phone"}
            </button>
            <button type="button" className="welcome-secondary" onClick={onPredict}>
              {isAmharic ? "አዲስ ስልክ ተንብይ" : "Predict a new phone"}
            </button>
          </div>
        </div>
        <div className="welcome-art" role="img" aria-label={isAmharic ? "የስልክ ምስል" : "Smartphone illustration"}>
          <img src="/phone-hero.svg" alt="" />
          <div className="welcome-art-caption">
            <span>SMARTER CHOICES</span>
            <strong>Made for you</strong>
          </div>
        </div>
      </section>
    </main>
  );
}

export default WelcomeScreen;
