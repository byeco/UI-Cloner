import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';

const REPO_URL = 'https://github.com/byeco/OmniTab';
const GROQ_DOCS_URL = 'https://console.groq.com/docs';
const STORE_URL = 'https://chromewebstore.google.com/detail/byeco-ui-cloner/cjoleiibiemifjpccfiiokmelmlmhcjb';
const REVIEWS_URL = `${STORE_URL}/reviews?hl=tr`;
const VERSION = 'v1.1.0';
const UPDATED = '25 Eylül 2026';

const TOC = [
  { id: 'gizlilik', tr: 'Gizlilik', en: 'Privacy' },
  { id: 'kosullar', tr: 'Koşullar', en: 'Terms' },
  { id: 'acik-kaynak', tr: 'Açık Kaynak', en: 'Open Source' },
  { id: 'guvenlik', tr: 'Güvenlik', en: 'Security' },
  { id: 'puanla', tr: 'Puanla', en: 'Rate' },
  { id: 'detaylar', tr: 'Detaylar', en: 'Details' }
];

function PrivacyPage() {
  const [theme, setTheme] = useState('dark');
  const [progress, setProgress] = useState(0);
  const [stars, setStars] = useState(0);
  const [hoverStars, setHoverStars] = useState(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('byecoPrivacyTheme');
      if (saved === 'light' || saved === 'dark') setTheme(saved);
      const savedStars = Number(localStorage.getItem('byecoPrivacyStars') || 0);
      if (savedStars >= 1 && savedStars <= 5) setStars(savedStars);
    } catch { /* private mode — varsayılanlar */ }
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? Math.min(1, el.scrollTop / max) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const pickStars = (n) => {
    setStars(n);
    try { localStorage.setItem('byecoPrivacyStars', String(n)); } catch { /* yoksay */ }
  };
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem('byecoPrivacyTheme', next); } catch { /* yoksay */ }
  };

  return (
    <main className="privacy-page" data-theme={theme}>
      <div className="privacy-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
      <div className="privacy-shell">
        <header className="privacy-header">
          <a className="privacy-github-link" href={REPO_URL} target="_blank" rel="noreferrer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .7a11.3 11.3 0 0 0-3.58 22.02c.57.1.78-.25.78-.55v-2.15c-3.17.69-3.84-1.34-3.84-1.34-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.33.96.1-.74.4-1.25.73-1.54-2.53-.29-5.19-1.27-5.19-5.65 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.45.11-3.03 0 0 .96-.31 3.12 1.17a10.8 10.8 0 0 1 5.68 0c2.16-1.48 3.12-1.17 3.12-1.17.62 1.58.23 2.74.11 3.03.73.8 1.18 1.82 1.18 3.07 0 4.39-2.67 5.35-5.21 5.63.41.35.78 1.04.78 2.1v3.12c0 .3.2.66.79.55A11.3 11.3 0 0 0 12 .7Z" />
            </svg>
            <span>GitHub / byeco</span>
          </a>
          <div className="privacy-header-right">
            <span className="privacy-version-pill">{VERSION}</span>
            <button type="button" className="privacy-theme-btn" onClick={toggleTheme} title="Tema değiştir">
              {theme === 'dark' ? '☀️ Açık tema' : '🌙 Koyu tema'}
            </button>
          </div>
        </header>

        <nav className="privacy-toc" aria-label="Sayfa içi başlıklar">
          {TOC.map((item) => (
            <a key={item.id} href={`#${item.id}`}>{item.tr}</a>
          ))}
        </nav>

        <section className="privacy-hero">
          <p className="privacy-eyebrow"><span className="privacy-pulse" /> UI CLONER • GÜVEN BELGESİ</p>
          <h1>Gizlilik politikası <span className="privacy-gradient">ve sözleşmeler</span></h1>
          <p>
            Verilerinizin nasıl işlendiğini, hangi seçeneklere sahip olduğunuzu
            ve sorumlulukların kimde olduğunu tek sayfada, açık dille anlatıyoruz.
          </p>
          <div className="privacy-hero-meta">
            <span>Son güncelleme: {UPDATED}</span>
            <span className="meta-dot">•</span>
            <span>MIT lisanslı açık kaynak</span>
          </div>
          <div className="privacy-hero-actions">
            <a className="privacy-btn-primary" href={REPO_URL} target="_blank" rel="noreferrer">Kodu incele ↗</a>
            <a className="privacy-btn-ghost" href="#gizlilik">Detaylara in ↓</a>
          </div>
          <div className="privacy-status-row">
            <span><i /> Veri satışı yok</span>
            <span><i /> Hesap/izleme yok</span>
            <span><i /> Tek tıkla silme</span>
          </div>
        </section>

        <h2 className="privacy-section-title" id="gizlilik">Gizlilik ilkeleri</h2>
        <div className="privacy-grid">
          <article className="privacy-card">
            <div className="privacy-card-top">
              <span className="privacy-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 5 6v5c0 4.6 2.9 8.5 7 10 4.1-1.5 7-5.4 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>
              </span>
              <span className="privacy-number">01</span>
            </div>
            <h2>Ne topluyoruz?</h2>
            <p>
              Yalnızca sizin açıkça seçtiğiniz web öğesinin DOM, metin, boyut,
              görsel stil ve (görsel modellerde) ekran görüntüsü bilgileri kod
              üretme amacıyla işlenir. Gezinti geçmişi, reklam profili veya
              analitik davranış kaydı oluşturulmaz. Hesabınız, e-postanız veya
              kimliğiniz tutulmaz.
            </p>
          </article>

          <article className="privacy-card">
            <div className="privacy-card-top">
              <span className="privacy-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 4.5 13.5H11l-1 8.5L18.5 10.5H12l1-8.5Z" /></svg>
              </span>
              <span className="privacy-number">02</span>
            </div>
            <h2>Yapay zeka bağlantısı</h2>
            <p>
              Varsayılan <strong>UI Cloner AI</strong> modunda istekler paylaşılan
              Groq kotasından, sizden anahtar istenmeden çalışır. Kendi
              anahtarını kullanmak isteyenler <strong>Direct</strong> moda
              geçebilir; o anahtar yalnızca bu tarayıcıda saklanır. Model
              sağlayıcı olarak{' '}
              <a href={GROQ_DOCS_URL} target="_blank" rel="noreferrer">Groq</a>{' '}
              öğe verisini işler — saklama politikaları için Groq belgelerine bakın.
            </p>
          </article>

          <article className="privacy-card">
            <div className="privacy-card-top">
              <span className="privacy-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>
              </span>
              <span className="privacy-number">03</span>
            </div>
            <h2>Yerel depolama</h2>
            <p>
              Dil, bağlantı tercihi, model seçimi, kişisel API anahtarı, kullanım
              sayaçları ve geçmiş <em>chrome.storage.local</em> içinde tutulur;
              harici sunucuya senkronize edilmez. Ayarlardaki “Yerel verileri
              temizle” düğmesiyle tamamını tek tıkla silebilirsiniz.
            </p>
          </article>

          <article className="privacy-card">
            <div className="privacy-card-top">
              <span className="privacy-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></svg>
              </span>
              <span className="privacy-number">04</span>
            </div>
            <h2>Kullanıcı sorumluluğu</h2>
            <p>
              İncelediğiniz içeriği ve kullandığınız API anahtarını paylaşmaya
              yetkili olduğunuzu kabul edersiniz. Üretilen kodu ve üçüncü taraf
              hizmetlerin kullanım şartlarını üretime almadan önce gözden
              geçirmek sizin sorumluluğunuzdadır.
            </p>
          </article>
        </div>

        <section className="privacy-terms" id="kosullar">
          <h2>Kullanım koşulları</h2>
          <ul>
            <li>UI Cloner bir geliştirme ve prototipleme aracıdır.</li>
            <li>Uzantı, seçilen içeriğin telif ve erişim izinlerini doğrulamaz.</li>
            <li>Yapay zeka çıktıları insan tarafından gözden geçirilmelidir.</li>
            <li>Paylaşılan kota adil kullanım esasına göre sınırlanabilir (günlük / dakikalık limitler).</li>
            <li>Hizmet kötüye kullanım, otomatik tarama veya yetkisiz veri toplama için kullanılamaz.</li>
          </ul>
        </section>

        <section className="privacy-terms" id="acik-kaynak">
          <h2>Açık kaynak</h2>
          <p style={{ margin: '0 0 12px', color: '#8fa6bf', fontSize: 14, lineHeight: 1.65 }}>
            Bu proje <strong>MIT lisansı</strong> ile açık kaynaktır. Kodu
            inceleyebilir, hata bildirebilir ve katkı sunabilirsiniz:
          </p>
          <ul>
            <li><a href={REPO_URL} target="_blank" rel="noreferrer">GitHub deposu ↗</a></li>
            <li>Lisans: MIT — ticari kullanıma açık, garanti verilmez.</li>
            <li>Derlenen uzantı paketi her zaman bu depodaki koddan üretilir.</li>
          </ul>
        </section>

        <section className="privacy-terms" id="guvenlik">
          <h2>Güvenlik ve izinler</h2>
          <p style={{ margin: '0 0 12px', color: '#8fa6bf', fontSize: 14, lineHeight: 1.65 }}>
            Uzantının istediği her iznin tek bir görevi vardır; fazlası istenmez.
            Tüm kod paketin içinde gömülüdür — dışarıdan betik yüklenmez, reklam
            ve izleyici çalışmaz:
          </p>
          <ul className="privacy-perm-list">
            <li><strong>Sekme erişimi:</strong> yalnızca tıkladığınız sekmeyi okur; öğe seçmek için zorunludur.</li>
            <li><strong>Betik çalıştırma:</strong> seçim çerçevesini sayfaya yerleştirir; sayfanın kodunu değiştirmez.</li>
            <li><strong>Yan panel:</strong> arayüz penceresini açar.</li>
            <li><strong>Depolama:</strong> ayarlarınızı yalnızca bu tarayıcıda saklar.</li>
            <li><strong>Sağ tık menüsü:</strong> panele alternatif erişim sağlar.</li>
            <li><strong>Tüm siteler:</strong> herhangi bir siteden öğe seçebilmeniz içindir; ziyaret verisi toplanmaz, gönderilmez.</li>
            <li><strong>Ağ:</strong> yalnızca “üret”e bastığınızda seçili öğe Groq API’ye gönderilir.</li>
          </ul>
          <p style={{ margin: '12px 0 0', color: '#8fa6bf', fontSize: 14, lineHeight: 1.65 }}>
            Mağaza paketi her zaman herkese açık depodaki koddan üretilir.
            İsterseniz paketi VirusTotal gibi bağımsız bir tarayıcıda kendiniz
            de denetleyebilirsiniz.
          </p>
        </section>

        <div id="detaylar">
          <details className="privacy-details">
            <summary>Teknik detay: veriler nereye gider?</summary>
            <div>
              <ul>
                <li><strong>Seçim anı:</strong> tıkladığınız öğenin HTML, stil ve boyut bilgisi içerik betiği tarafından okunur.</li>
              <li><strong>UI Cloner AI modu:</strong> özet veri Groq API’ye gönderilir, dönen React/Tailwind kodu panelde gösterilir.</li>
              <li><strong>Direct mod:</strong> aynı istek sizin anahtarınızla doğrudan Groq’a gider; bize uğramaz.</li>
                <li><strong>Saklama:</strong> seçim ve üretilen kod kalıcı olarak kaydedilmez; geçmiş yalnızca sizin tarayıcınızda tutulur.</li>
              </ul>
            </div>
          </details>

          <details className="privacy-details">
            <summary>Sürüm geçmişi</summary>
            <div>
              <p><strong>v1.1.0</strong> — 25 Eylül 2026</p>
              <ul>
                <li><strong>Kurulum kalktı:</strong> ek ayar, anahtar girişi veya arka plan işlemi gerekmez; uzantı kutudan çıktığı gibi çalışır.</li>
                <li><strong>Koyu siyah tema:</strong> tüm paneller yenilendi; gizlilik sayfasında ayrıca açık/koyu tema düğmesi eklendi.</li>
                <li><strong>Derli toplu araçlar:</strong> Önizleme, Palet, İyileştirme ve Dışa Aktar tek kartta toplandı; alt köşedeki ‹ › butonlarıyla kayarak geçiliyor.</li>
                <li><strong>Geçmiş sayfası:</strong> geçmiş artık satır arasında değil, kendi sayfasında; tek tıkla geri yükleniyor.</li>
                <li><strong>Bildirimler:</strong> “React kodu hazır” ve kayıt bildirimleri sağ üstte süreli baloncuk olarak görünüyor.</li>
                <li><strong>Sadeleşen sekmeler:</strong> üst şerit AI / Kod olarak kısaldı, kayma sorunu bitti.</li>
                <li><strong>Daha doğru önizleme:</strong> kırık görünen resimler, yarım kalan tasarımlar ve stylesiz kalan bileşenler düzeltildi.</li>
                <li><strong>Güncel modeller:</strong> artık çalışmayan eski modeller listeden çıkarıldı, yerine güncel ve hızlı modeller eklendi.</li>
                <li><strong>Puanlama:</strong> gizlilik sayfasına yıldızlı değerlendirme eklendi; birkaç kullanımdan sonra nazikçe yorum hatırlatıcısı çıkar.</li>
              </ul>
              <p><strong>v1.0.0</strong> — 18 Eylül 2026</p>
              <ul>
                <li>İlk herkese açık sürüm: sayfadan öğe seçme, anlık JSX + Tailwind iskeleti, yapay zekayla üretim kodu.</li>
                <li>Canlı önizleme, renk paleti, karanlık/responsive varyantlar ve dosya dışa aktarma.</li>
                <li>Türkçe/İngilizce arayüz ve günlük kullanım sayaçları.</li>
              </ul>
            </div>
          </details>
        </div>

        <section className="privacy-terms privacy-rate" id="puanla">
          <div className="privacy-rate-head">
            <h2>Uzantıyı değerlendirin</h2>
            <span className="privacy-version-pill">{VERSION}</span>
          </div>
          <p style={{ margin: '0 0 14px', color: '#8fa6bf', fontSize: 14, lineHeight: 1.65 }}>
            UI Cloner işinize yaradıysa puanınız bizi çok sevindirir. Yıldızlara
            dokunun, ardından Mağaza’da yorumunuzu bırakın:
          </p>
          <div className="privacy-stars" role="radiogroup" aria-label="Puanınız">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars === n}
                aria-label={`${n} yıldız`}
                className={`privacy-star ${(hoverStars || stars) >= n ? 'lit' : ''}`}
                onClick={() => pickStars(n)}
                onMouseEnter={() => setHoverStars(n)}
                onMouseLeave={() => setHoverStars(0)}
              >
                ★
              </button>
            ))}
          </div>
          <p className="privacy-rate-hint">
            {stars > 0
              ? `${stars}/5 — teşekkürler! Yorumunuzu Mağaza’da bekliyoruz.`
              : 'Henüz puan vermediniz.'}
          </p>
          <div className="privacy-hero-actions" style={{ marginTop: 16 }}>
            <a className="privacy-btn-primary" href={REVIEWS_URL} target="_blank" rel="noreferrer">Mağaza’da yorum yaz ↗</a>
            <a className="privacy-btn-ghost" href={STORE_URL} target="_blank" rel="noreferrer">Uzantı sayfası</a>
          </div>
        </section>

        <footer className="privacy-footer">
          <strong>UI CLONER</strong>
          <span>UI Cloner • {VERSION} • {UPDATED}</span>
          <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub’da görüntüle ↗</a>
        </footer>
      </div>
    </main>
  );
}

createRoot(document.getElementById('privacy-root')).render(<PrivacyPage />);
