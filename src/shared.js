/* Shared by the isolated content script, popup, preview and service worker. */
(() => {
  "use strict";
  const defaults = Object.freeze({
    enabled: true,
    hideMedia: true,
    hideMarket: true,
    compact: false,
    disguiseTab: true,
  });
  const storageKey = "snowPlusSettings";

  function normalize(value) {
    return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [
      key, typeof value?.[key] === "boolean" ? value[key] : fallback,
    ]));
  }

  function readPreview() {
    try { return normalize(JSON.parse(localStorage.getItem(storageKey))); }
    catch { return { ...defaults }; }
  }

  // Persist each preference independently so simultaneous tabs do not overwrite
  // unrelated choices. Legacy object values remain readable for version upgrades.
  async function getSettings() {
    if (!globalThis.chrome?.storage?.sync) return readPreview();
    const result = await chrome.storage.sync.get([storageKey, ...Object.keys(defaults)]);
    return normalize({ ...result[storageKey], ...result });
  }

  async function update(patch) {
    const safePatch = Object.fromEntries(Object.entries(patch)
      .filter(([key, value]) => key in defaults && typeof value === "boolean"));
    if (globalThis.chrome?.storage?.sync) {
      await chrome.storage.sync.set(safePatch);
    } else {
      localStorage.setItem(storageKey, JSON.stringify({ ...readPreview(), ...safePatch }));
      globalThis.dispatchEvent(new Event("snow-plus-settings"));
    }
    return getSettings();
  }

  function subscribe(listener) {
    if (globalThis.chrome?.storage?.onChanged) {
      const onChange = (changes, area) => {
        if (area === "sync" && Object.keys(changes).some(key => key in defaults || key === storageKey)) {
          getSettings().then(listener).catch(console.error);
        }
      };
      chrome.storage.onChanged.addListener(onChange);
      return () => chrome.storage.onChanged.removeListener(onChange);
    }
    const onChange = () => listener(readPreview());
    globalThis.addEventListener("storage", onChange);
    globalThis.addEventListener("snow-plus-settings", onChange);
    return () => {
      globalThis.removeEventListener("storage", onChange);
      globalThis.removeEventListener("snow-plus-settings", onChange);
    };
  }

  globalThis.SnowPlus = Object.freeze({ defaults, normalize, read: getSettings, update, subscribe });
})();
