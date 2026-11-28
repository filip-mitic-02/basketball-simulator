/* Ads: one small interface the game uses, with two implementations.
   - In the Android app (Capacitor + AdMob plugin) real ads are shown.
   - In a browser there is no ad network: a short "sponsor break" countdown stands in, so players on every platform wait the same.
   Ad unit ids below are Google's public TEST ids. Replace them with the real ones from AdMob before publishing (see docs/ANDROID.md). */
(function () {
  'use strict';
  const IDS = { rewarded: 'ca-app-pub-3940256099942544/5224354917', interstitial: 'ca-app-pub-3940256099942544/1033173712' };
  const cap = typeof window !== 'undefined' && window.Capacitor;
  // The page is served from the website, so the native plugin is looked up by name instead of being bundled.
  const AM = cap && cap.registerPlugin && cap.isNativePlatform && cap.isNativePlatform() ? cap.registerPlugin('AdMob') : null;
  const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform() && AM);
  let ready = null;
  // Initialise once, after asking for consent where the law requires it (EEA and UK).
  const init = () => ready || (ready = (async () => {
    try {
      await AM.initialize({ initializeForTesting: false });
      const info = await AM.requestConsentInfo();
      if (info && info.isConsentFormAvailable && info.status === 'REQUIRED') await AM.showConsentForm();
    } catch (e) { }
  })());

  function sponsorBreak(label, secs) {
    return new Promise(resolve => {
      const m = document.createElement('div'); m.className = 'modal';
      m.innerHTML = '<div class="box" role="dialog" aria-modal="true"><h2>Sponsor break</h2><p class="note">' + label + '</p><div class="lvbar big"><i id="adBar" style="width:0"></i></div><div class="rwl" id="adTxt"></div><div class="ctrl" style="margin-top:14px"><button class="btn" id="adX">Cancel</button></div></div>';
      document.body.appendChild(m);
      let left = secs, done = false; const t0 = Date.now();
      const end = ok => { if (done) return; done = true; clearInterval(iv); m.remove(); resolve(ok); };
      const tick = () => { left = Math.max(0, secs - (Date.now() - t0) / 1000); document.getElementById('adBar').style.width = Math.round(100 * (1 - left / secs)) + '%'; document.getElementById('adTxt').textContent = left > 0 ? Math.ceil(left) + ' s' : 'Done'; if (left <= 0) end(true); };
      const iv = setInterval(tick, 200); tick();
      document.getElementById('adX').onclick = () => end(false);
    });
  }

  window.Ads = {
    native,
    // Resolves true only when the player earned the reward (watched the ad to the end).
    async rewarded(label) {
      if (!native) return sponsorBreak(label || 'Your bonus unlocks when this ends.', 5);
      try {
        await init();
        let earned = false;
        const h = await AM.addListener('onRewardedVideoAdReward', () => { earned = true; });
        await AM.prepareRewardVideoAd({ adId: IDS.rewarded });
        await AM.showRewardVideoAd();
        if (h && h.remove) h.remove();
        return earned;
      } catch (e) { return false; }
    },
    // Shown at most once per finished season, never during play. Failure to show is silent.
    async interstitial() {
      if (!native) return;
      try { await init(); await AM.prepareInterstitial({ adId: IDS.interstitial }); await AM.showInterstitial(); } catch (e) { }
    }
  };
})();
