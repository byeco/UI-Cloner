import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { translations } from '../i18n';
import '../styles.css';

function Popup() {
  const [lang, setLang] = useState('tr');
  const t = translations[lang] || translations.tr;

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['appLanguage'], (result) => {
        if (result.appLanguage) setLang(result.appLanguage);
      });
    }
  }, []);

  const openPanel = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab?.windowId) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
        window.close();
      }
    } catch (error) {
      console.error('Could not open side panel:', error);
    }
  };

  return (
    <main className="popup-shell">
      <div className="brand-lockup">
        <span className="brand-mark">U</span>
        <span>UI CLONER</span>
      </div>
      <div className="popup-title-row">
        <div>
          <p className="eyebrow">{t.popupEyebrow}</p>
          <h1>{t.popupTitle}</h1>
        </div>
        <span className="live-dot" />
      </div>
      <p className="popup-copy">{t.popupDesc}</p>
      <button className="primary-button" onClick={openPanel}>
        <span>{t.popupOpen}</span>
        <span aria-hidden="true">-&gt;</span>
      </button>
      <div className="popup-meta">
        <span>{t.popupMeta}</span>
        <span>v1.0</span>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Popup />);
