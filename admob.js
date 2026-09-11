/**
 * admob.js - Gerenciador Oficial de Monetização Google AdMob & Google Ads
 * Suporta PWA Web, Android TWA/Capacitor/Cordova e WebViews Nativas.
 */

const ADMOB_CONFIG = {
  // ID do Aplicativo AdMob
  appId: 'ca-app-pub-2871403878275209~7634642461',
  
  // Blocos de Anúncios Criados
  units: {
    banner: 'ca-app-pub-2871403878275209/5915095639',
    interstitial: 'ca-app-pub-2871403878275209/7228177302',
    appOpen: 'ca-app-pub-2871403878275209/7976940747',
    native: 'ca-app-pub-2871403878275209/7356169815'
  },

  // IDs de Amostra/Teste do Google para Desenvolvimento (evita auto-clique e penalizações)
  testUnits: {
    banner: 'ca-app-pub-3940256099942544/6300978111',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
    appOpen: 'ca-app-pub-3940256099942544/9257399558',
    native: 'ca-app-pub-3940256099942544/2247696110'
  },

  isTestMode: false // Alterne para true se desejar testar antes de 1h
};

class AdMobManager {
  constructor() {
    this.config = ADMOB_CONFIG;
    this.isNativePluginAvailable = false;
    this.hasShownAppOpen = false;
    this.lastInterstitialTime = 0;
  }

  /**
   * Inicializa o serviço de anúncios e detecta o ambiente de execução
   */
  async init() {
    console.log('[AdMob] Inicializando Google Mobile Ads SDK...');

    // 1. Detecta se está rodando em app empacotado nativo (Capacitor / Cordova / React Native)
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob) {
      try {
        const { AdMob } = window.Capacitor.Plugins;
        await AdMob.initialize({
          requestTrackingAuthorization: true,
          testingDevices: ['EMULATOR'],
          initializeForTesting: this.config.isTestMode
        });
        this.isNativePluginAvailable = true;
        console.log('[AdMob] SDK Nativo Capacitor inicializado com sucesso.');
        this.showNativeBanner();
        return;
      } catch (err) {
        console.warn('[AdMob] Falha ao inicializar SDK Capacitor:', err);
      }
    }

    // 2. Modo Web / PWA: Carrega script do Google AdSense / AdMob Web tag
    this.loadWebAdsSdk();

    // 3. Exibe anúncio de Abertura do App (App Open Ad) após breve carregamento
    setTimeout(() => {
      this.showAppOpenAd();
    }, 1200);
  }

  /**
   * Carrega a biblioteca Google Ads para exibição na Web
   */
  loadWebAdsSdk() {
    if (document.getElementById('google-ads-sdk')) return;

    try {
      const script = document.createElement('script');
      script.id = 'google-ads-sdk';
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2871403878275209`;
      script.onload = () => {
        console.log('[AdMob Web] Tag Google Ads carregada com sucesso.');
        this.renderWebBanner();
      };
      script.onerror = () => {
        console.log('[AdMob Web] Bloqueador de anúncios ativo ou em espera da aprovação do bloco.');
      };
      document.head.appendChild(script);
    } catch (_) {}
  }

  /**
   * Renderiza o bloco de Banner no local reservado
   */
  renderWebBanner() {
    const slot = document.getElementById('admob-banner-slot');
    if (!slot) return;

    const unitId = this.config.isTestMode ? this.config.testUnits.banner : this.config.units.banner;

    // Injeta bloco real do Google Ads no container
    try {
      slot.innerHTML = `
        <div class="admob-badge">Anúncio • AdMob</div>
        <ins class="adsbygoogle"
             style="display:block; width:100%; min-height:60px;"
             data-ad-client="ca-pub-2871403878275209"
             data-ad-slot="${unitId.split('/')[1] || '5915095639'}"
             data-ad-format="auto"
             data-full-width-responsive="true"></ins>
      `;
      if (window.adsbygoogle && window.adsbygoogle.push) {
        window.adsbygoogle.push({});
      }
    } catch (e) {
      console.log('[AdMob Web] Banner pendente de veiculação pelo Google.');
    }
  }

  /**
   * Renderiza anúncio Nativo Avançado inline
   */
  renderNativeAd(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const unitId = this.config.isTestMode ? this.config.testUnits.native : this.config.units.native;

    container.innerHTML = `
      <div class="admob-native-container">
        <div class="admob-badge">Nativo • AdMob</div>
        <ins class="adsbygoogle"
             style="display:block"
             data-ad-format="fluid"
             data-ad-layout-key="-fb+5w+4e-db+86"
             data-ad-client="ca-pub-2871403878275209"
             data-ad-slot="${unitId.split('/')[1] || '7356169815'}"></ins>
      </div>
    `;
    try {
      if (window.adsbygoogle && window.adsbygoogle.push) {
        window.adsbygoogle.push({});
      }
    } catch (_) {}
  }

  /**
   * Exibe anúncio de Abertura do App (App Open Ad)
   */
  async showAppOpenAd() {
    if (this.hasShownAppOpen) return;
    this.hasShownAppOpen = true;

    // Se estiver em ambiente nativo Capacitor
    if (this.isNativePluginAvailable && window.Capacitor.Plugins.AdMob) {
      try {
        const { AdMob } = window.Capacitor.Plugins;
        const unitId = this.config.isTestMode ? this.config.testUnits.appOpen : this.config.units.appOpen;
        await AdMob.prepareAppOpen({ adId: unitId });
        await AdMob.showAppOpen();
        return;
      } catch (err) {
        console.warn('[AdMob Native] Falha ao exibir App Open nativo:', err);
      }
    }

    // Modo Web: Exibe modal de abertura elegante com temporizador de 5s
    this.displayWebOverlayAd({
      type: 'Abertura do App',
      unitId: this.config.units.appOpen,
      duration: 5,
      headline: 'Bem-vindo ao Compras Plus',
      subtext: 'Planeje suas compras e economize no mercado!'
    });
  }

  /**
   * Exibe anúncio Intersticial de Tela Cheia (ex: ao Finalizar Compra)
   */
  async showInterstitial(onAdClosedCallback) {
    const now = Date.now();
    // Limite de frequência: no máximo 1 anúncio a cada 30 segundos para manter boa experiência do usuário
    if (now - this.lastInterstitialTime < 30000) {
      if (typeof onAdClosedCallback === 'function') onAdClosedCallback();
      return;
    }
    this.lastInterstitialTime = now;

    // Ambiente Nativo Capacitor
    if (this.isNativePluginAvailable && window.Capacitor.Plugins.AdMob) {
      try {
        const { AdMob } = window.Capacitor.Plugins;
        const unitId = this.config.isTestMode ? this.config.testUnits.interstitial : this.config.units.interstitial;
        await AdMob.prepareInterstitial({ adId: unitId });
        await AdMob.showInterstitial();
        if (typeof onAdClosedCallback === 'function') onAdClosedCallback();
        return;
      } catch (err) {
        console.warn('[AdMob Native] Falha ao exibir intersticial nativo:', err);
      }
    }

    // Modo Web: Exibe overlay intersticial com botão de fechar
    this.displayWebOverlayAd({
      type: 'Anúncio Intersticial',
      unitId: this.config.units.interstitial,
      duration: 5,
      headline: 'Compra Registrada com Sucesso!',
      subtext: 'Apoiado por patrocinadores do Compras Plus.',
      onClose: onAdClosedCallback
    });
  }

  /**
   * Constrói overlay de anúncio na Web para simular App Open ou Intersticial
   */
  displayWebOverlayAd({ type, unitId, duration = 5, headline, subtext, onClose }) {
    // Remove qualquer overlay anterior caso exista
    const old = document.getElementById('admob-overlay-screen');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'admob-overlay-screen';
    overlay.className = 'admob-fullscreen-overlay';

    let countdown = duration;

    overlay.innerHTML = `
      <div class="admob-overlay-card">
        <div class="admob-overlay-header">
          <span class="admob-badge">Patrocinado • AdMob</span>
          <button id="btn-close-overlay-ad" class="btn-ad-close" disabled>
            Aguarde ${countdown}s...
          </button>
        </div>
        
        <div class="admob-overlay-body">
          <div class="admob-ad-preview-box">
            <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">🛍️</div>
            <h3 style="font-size: 1.15rem; font-weight: 800; color: #0f172a; margin-bottom: 0.35rem;">
              ${headline || 'Compras Plus'}
            </h3>
            <p style="font-size: 0.8rem; color: #64748b; margin-bottom: 1.25rem;">
              ${subtext || 'Economize nas compras do mês com orçamentos em tempo real.'}
            </p>
            <div style="font-size: 0.68rem; color: #94a3b8; background: #f8fafc; padding: 0.4rem 0.6rem; border-radius: 6px; border: 1px dashed #cbd5e1; word-break: break-all;">
              Bloco AdMob: ${unitId}
            </div>
          </div>
        </div>

        <div class="admob-overlay-footer">
          <small style="font-size: 0.7rem; color: #94a3b8;">
            Este anúncio ajuda a manter o aplicativo 100% gratuito.
          </small>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const btnClose = overlay.querySelector('#btn-close-overlay-ad');

    const timer = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        if (btnClose) btnClose.textContent = `Aguarde ${countdown}s...`;
      } else {
        clearInterval(timer);
        if (btnClose) {
          btnClose.disabled = false;
          btnClose.className = 'btn-ad-close active';
          btnClose.textContent = '✕ Pular Anúncio';
        }
      }
    }, 1000);

    const closeAd = () => {
      clearInterval(timer);
      overlay.classList.add('fade-out');
      setTimeout(() => overlay.remove(), 250);
      if (typeof onClose === 'function') onClose();
    };

    if (btnClose) {
      btnClose.addEventListener('click', () => {
        if (!btnClose.disabled) closeAd();
      });
    }
  }
}

// Instância global do AdMob
const admobManager = new AdMobManager();

// Inicializa quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => admobManager.init());
} else {
  admobManager.init();
}
