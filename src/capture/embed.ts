/** Instagram reel URL -> shortcode, embed URL, and the JS injected into the embed WebView. */

export function parseReel(input: string): { code: string; kind: 'reel' | 'p' } | null {
  const s = input.trim();
  const m = s.match(/instagram\.com\/(?:[^/]+\/)?(reel|reels|p)\/([A-Za-z0-9_-]+)/);
  if (m) return { code: m[2], kind: m[1] === 'p' ? 'p' : 'reel' };
  if (/^[A-Za-z0-9_-]{5,}$/.test(s)) return { code: s, kind: 'reel' };
  return null;
}

export function embedUrl(code: string, kind: 'reel' | 'p' = 'reel') {
  // The documented embed endpoint. /captioned adds the caption below the media.
  return `https://www.instagram.com/${kind}/${code}/embed/captioned/`;
}

export function reelPageUrl(code: string, kind: 'reel' | 'p' = 'reel') {
  return `https://www.instagram.com/${kind}/${code}/`;
}

/** Message posted from the page every 500 ms and on video events. */
export type EmbedMessage = {
  type: 'embed';
  href: string;
  username: string | null;
  caption: string | null;
  video: { x: number; y: number; width: number; height: number; paused: boolean; ended: boolean; currentTime: number; duration: number; readyState: number } | null;
  bodyText: string;
  viewport: { w: number; h: number; dpr: number; scrollY: number };
  event?: 'play' | 'ended' | 'pause' | 'loadeddata' | 'looped';
};

/** Instagram serves phone browsers an "open the app" interstitial; desktop browsers get the inline player. */
export const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15';

export const EMBED_INJECTED_JS = `
(function () {
  if (window.__movelab) return;
  window.__movelab = true;
  var lastEvent = null;
  function text(sel) { var el = document.querySelector(sel); return el ? (el.innerText || el.textContent || '').trim() : null; }
  function snapshot(ev) {
    var v = document.querySelector('video');
    var r = v ? v.getBoundingClientRect() : null;
    var username = text('.UsernameText') || text('a.Username') || text('[class*="Username"]');
    if (!username) {
      var a = document.querySelector('a[href*="instagram.com/"]');
      if (a) { var m = (a.getAttribute('href') || '').match(/instagram\\.com\\/([^/?#]+)/); if (m && m[1] !== 'p' && m[1] !== 'reel') username = m[1]; }
    }
    var caption = text('.Caption') || text('[class*="Caption"]');
    var msg = {
      type: 'embed', href: location.href, username: username, caption: caption,
      video: v ? { x: r.left, y: r.top, width: r.width, height: r.height, paused: v.paused, ended: v.ended,
                   currentTime: v.currentTime, duration: v.duration || 0, readyState: v.readyState } : null,
      bodyText: (document.body && document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 240),
      viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio, scrollY: window.scrollY },
      event: ev || undefined
    };
    window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }
  var hooked = new WeakSet();
  var lastT = 0, maxT = 0;
  function hook() {
    var v = document.querySelector('video');
    if (v && !hooked.has(v)) {
      hooked.add(v);
      v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
      ['play', 'ended', 'pause', 'loadeddata'].forEach(function (e) { v.addEventListener(e, function () { snapshot(e); }); });
      v.addEventListener('timeupdate', function () {
        // reels loop; detect the wrap-around (currentTime jumps back) = one full pass done
        var t = v.currentTime;
        if (maxT > 1 && t + 1 < lastT) { snapshot('looped'); maxT = 0; }
        lastT = t; if (t > maxT) maxT = t;
      });
    }
  }
  setInterval(function () { hook(); snapshot(null); }, 500);
  hook(); snapshot(null);
})();
true;
`;
