(() => {
  "use strict";
  if (globalThis.__snowPlusLoaded) return;
  globalThis.__snowPlusLoaded = true;

  const root = document.documentElement;
  const tabTitle = "Issues · workspace / discussions";
  const favicon = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#1f2328"/><path d="m12 10-6 6 6 6m8-12 6 6-6 6" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  );
  const icons = {
    code: '<path d="m6 5-4 3 4 3m4-6 4 3-4 3"/>',
    repo: '<path d="M3 2h9a1 1 0 0 1 1 1v11H4a2 2 0 0 1-2-2V3a1 1 0 0 1 1-1Z"/><path d="M2 11h11M5 4v4"/>',
    issue: '<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/>',
    star: '<path d="m8 1.5 2 4.1 4.5.7-3.2 3.2.7 4.5L8 11.9 4 14l.7-4.5L1.5 6.3l4.5-.7Z"/>',
    search: '<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/>',
    gear: '<path d="m6 2 .5-1h3L10 2l1.5 1 1.2.1 1.5 2.6-.7 1.1v2.4l.7 1.1-1.5 2.6-1.2.1-1.5 1-.5 1h-3L6 14l-1.5-1-1.2-.1-1.5-2.6.7-1.1V6.8l-.7-1.1 1.5-2.6L4.5 3Z"/><circle cx="8" cy="8" r="2.5"/>',
    arrow: '<path d="M3 8h10M9 4l4 4-4 4"/>',
    book: '<path d="M8 3v11M8 3C6 1 3 1 1 2v10c2-1 5-1 7 1 2-2 5-2 7-1V2c-2-1-5-1-7 1Z"/>',
  };
  const svg = name => `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
  let settings = { ...SnowPlus.defaults };
  let originalTitle = document.title;
  const originalIcons = new Map();
  let ownedIcon;
  let workspace;
  let scheduled = false;
  let layout;
  let companyRequest;
  let companyTimer;
  const companySymbol = () => location.pathname.match(/^\/S\/([A-Z0-9.]+)\/?$/i)?.[1].toUpperCase();
  const feedNames = { discussions: ["讨论", "热门", "热门讨论", "全部"], news: ["资讯"], following: ["关注", "我的关注"], announcements: ["公告"] };

  function companyName() {
    if (!companySymbol()) return undefined;
    const name = document.querySelector('.stock__main > .stock-name')?.textContent.trim();
    return name?.replace(/\s*[（(].*$/, "") || companySymbol();
  }

  function directSymbol(query) {
    const code = query.trim().toUpperCase();
    if (/^\d{6}$/.test(code)) return (/^[69]/.test(code) ? "SH" : /^[48]/.test(code) ? "BJ" : "SZ") + code;
    if (/^\d{5}$/.test(code)) return code;
    if (/^(SH|SZ|BJ)\d{6}$/.test(code) || /^[A-Z][A-Z0-9.]{0,14}$/.test(code)) return code;
    return undefined;
  }

  async function searchCompanies(query) {
    companyRequest?.abort();
    const results = workspace.querySelector('.sp-company-results');
    const status = workspace.querySelector('.sp-company-status');
    const fallback = workspace.querySelector('.sp-company-search-all');
    results.replaceChildren();
    fallback.hidden = !query;
    fallback.href = `https://xueqiu.com/k?q=${encodeURIComponent(query)}`;
    if (!query) { status.textContent = "输入公司名称或代码，例如：比亚迪、002594"; return; }
    status.textContent = "正在搜索公司…";
    const request = new AbortController();
    companyRequest = request;
    try {
      const response = await fetch(`/query/v1/suggest_stock.json?q=${encodeURIComponent(query)}`, { signal: request.signal });
      if (!response.ok) throw new Error('Company search failed');
      const data = await response.json();
      if (!Array.isArray(data.data)) throw new Error('Unexpected company results');
      if (request.signal.aborted) return;
      const companies = data.data.filter(item => typeof item.query === "string" && /^[A-Z0-9][A-Z0-9.]{0,19}$/i.test(item.code)).slice(0, 8);
      for (const item of companies) {
        const link = document.createElement('a');
        link.href = `https://xueqiu.com/S/${encodeURIComponent(item.code)}`;
        const name = document.createElement('strong');
        name.textContent = item.query;
        const code = document.createElement('span');
        code.textContent = item.code;
        link.append(name, code);
        results.append(link);
      }
      status.textContent = companies.length ? "选择公司，查看讨论与资讯" : "未找到公司，可尝试股票代码或搜索相关讨论。";
    } catch (error) {
      if (error.name === 'AbortError') return;
      status.textContent = "公司搜索暂不可用，可按代码打开或搜索相关讨论。";
      const symbol = directSymbol(query);
      if (symbol) {
        const link = document.createElement('a');
        link.href = `https://xueqiu.com/S/${encodeURIComponent(symbol)}`;
        link.textContent = `打开 ${symbol}`;
        results.append(link);
      }
    }
  }

  function nativeFeedTabs() {
    return [...document.querySelectorAll('.stock-timeline-tabs > a, .home-timeline-tabs a, .home__timeline__tabs > a, [class*="style_home__timeline__tabs_"] > a')];
  }

  function selectFeed(event) {
    const link = event.target.closest("[data-feed-target]");
    if (!link) return false;
    const tabs = nativeFeedTabs();
    const tab = feedNames[link.dataset.feedTarget]?.map(name => tabs.find(tab => tab.textContent.trim() === name)).find(Boolean);
    if (!tab) return false;
    event.preventDefault();
    tab.click();
    schedule();
    layout?.center.scrollIntoView({ block: "start" });
    return true;
  }

  function createSidebar(side) {
    const panel = document.createElement("aside");
    panel.dataset.spPanel = side;
    panel.id = `snow-plus-sidebar-${side}`;
    panel.setAttribute("aria-label", side === "left" ? "工作区导航" : "工作区说明");
    panel.innerHTML = side === "left" ? `
      <div class="sp-sidebar-heading">Top repositories <span class="sp-sidebar-dot"></span></div>
      <nav class="sp-repositories" aria-label="阅读栏目">
        <a href="https://xueqiu.com/" data-feed-target="discussions">${svg("repo")}<span>workspace / <strong>discussions</strong></span></a>
        <a href="https://xueqiu.com/" data-feed-target="news">${svg("repo")}<span>workspace / <strong>news</strong></span></a>
        <a href="https://xueqiu.com/" data-feed-target="following">${svg("repo")}<span>workspace / <strong>following</strong></span></a>
      </nav>
      <div class="sp-sidebar-section"><h2>Companies</h2>
        <a class="sp-saved-search" href="https://xueqiu.com/S/SZ002594">${svg("repo")}比亚迪 <small>SZ002594</small></a>
        <a class="sp-saved-search" href="https://xueqiu.com/S/01211">${svg("repo")}比亚迪股份 <small>01211</small></a>
        <button type="button" data-panel-company>${svg("search")}切换其他公司</button>
      </div>
      <div class="sp-sidebar-section"><h2>Saved searches</h2>
        <a class="sp-saved-search" href="https://xueqiu.com/k?q=行业观察">${svg("search")}行业观察</a>
        <a class="sp-saved-search" href="https://xueqiu.com/k?q=公司研究">${svg("search")}公司研究</a>
        <a class="sp-saved-search" href="https://xueqiu.com/k?q=每周复盘">${svg("search")}每周复盘</a>
      </div>
      <div class="sp-sidebar-section"><h2>Workspace</h2><button type="button" data-panel-settings>${svg("gear")}阅读设置</button><p class="sp-sidebar-footnote">A little less noise.<br>A little more room to think.</p></div>` : `
      <section class="sp-readme"><div class="sp-readme-heading">${svg("book")}<strong>README.md</strong></div><div class="sp-readme-body"><h2>A space to read.</h2><p>Ideas, questions, and conversations worth your attention.</p><p class="sp-readme-note">留一点时间给资讯、讨论和独立思考。</p><div class="sp-topic-pills"><a href="https://xueqiu.com/k?q=研究">research</a><a href="https://xueqiu.com/k?q=阅读">reading</a><a href="https://xueqiu.com/k?q=讨论">discussion</a></div></div></section>
      <section class="sp-sidebar-section"><h2>About</h2><dl class="sp-about"><div><dt>Visibility</dt><dd>Personal</dd></div><div><dt>Focus</dt><dd>News & discussions</dd></div></dl></section>
      <section class="sp-sidebar-section"><h2>Keyboard shortcuts</h2><dl class="sp-shortcuts"><div><dt>Search</dt><dd><kbd>/</kbd></dd></div><div><dt>Close settings</dt><dd><kbd>Esc</kbd></dd></div><div><dt>Focus mode</dt><dd><kbd>Alt Shift X</kbd></dd></div></dl></section>
      <p class="sp-sidebar-footer">${svg("code")} Snow Plus <span>Reading workspace</span></p>`;
    panel.addEventListener("click", event => {
      if (selectFeed(event)) return;
      if (event.target.closest("[data-panel-company]")) workspace.querySelector('[data-action="company"]').click();
      if (event.target.closest("[data-panel-settings]")) {
        const settingsPanel = workspace.querySelector(".sp-settings");
        settingsPanel.hidden = false;
        const button = workspace.querySelector('[data-action="settings"]');
        button.setAttribute("aria-expanded", "true");
        button.scrollIntoView({ block: "center" });
        button.focus();
      }
    });
    return panel;
  }

  function clearLayout() {
    if (!layout) return;
    for (const [element, attributes] of layout.marked) {
      for (const attribute of attributes) element.removeAttribute(attribute);
    }
    layout.left.remove();
    layout.right.remove();
    layout = undefined;
  }

  function markLayout(element, attribute) {
    if (!layout.marked.has(element)) layout.marked.set(element, new Set());
    layout.marked.get(element).add(attribute);
    if (!element.hasAttribute(attribute)) element.setAttribute(attribute, "");
  }

  function updateLayout() {
    if (!settings.enabled || (location.pathname !== "/" && !companySymbol())) { clearLayout(); return; }
    const companyCenter = companySymbol() && document.querySelector('.stock__main');
    const signedInCenter = document.querySelector(".home__main .user__col--middle");
    const container = companyCenter?.parentElement || signedInCenter?.closest(".user__container")
      || document.querySelector('[class*="AnonymousHome_container_"], .home__container');
    const center = companyCenter || signedInCenter || container?.querySelector('[class*="home__col--lf_"], .home__col--lf');
    if (!container || !center) { clearLayout(); return; }
    if (layout?.container !== container || layout?.center !== center) {
      clearLayout();
      layout = { container, center, marked: new Map(), left: createSidebar("left"), right: createSidebar("right") };
    }
    markLayout(container, "data-sp-layout");
    markLayout(center, "data-sp-feed-main");
    // Keep framework-owned nodes in place. Only flatten their layout wrappers.
    for (let shell = center.parentElement; shell && shell !== container; shell = shell.parentElement) {
      markLayout(shell, "data-sp-feed-shell");
    }
    container.querySelectorAll('.stock__side, .stock-links, .user__col--lf, .home__col--rt, [class*="home__col--rt_"], #im_container').forEach(element => markLayout(element, "data-sp-native-aside"));
    if (layout.left.parentElement !== container) container.append(layout.left);
    if (layout.right.parentElement !== container) container.append(layout.right);
  }

  function updateFeedNavigation() {
    const tabs = nativeFeedTabs();
    const active = tabs.find(tab => tab.matches('.active, [class*="_active_"], [aria-selected="true"]'));
    const feed = Object.keys(feedNames).find(key => feedNames[key].includes(active?.textContent.trim())) || "discussions";
    document.querySelectorAll('#snow-plus-workspace [data-feed-target], [data-sp-panel] [data-feed-target]').forEach(link => {
      if (link.dataset.feedTarget === feed && (location.pathname === "/" || companySymbol())) {
        if (link.getAttribute("aria-current") !== "page") link.setAttribute("aria-current", "page");
      } else link.removeAttribute("aria-current");
    });
    workspace.querySelector('[data-feed-target="announcements"]').hidden = !companySymbol();
    const label = workspace.querySelector('.sp-company-current');
    const title = workspace.querySelector('[data-workspace-title]');
    const currentName = companyName();
    const labelText = currentName || "切换公司";
    if (label.textContent !== labelText) label.textContent = labelText;
    const titleText = currentName || "discussions";
    if (title.textContent !== titleText) title.textContent = titleText;
    const titleHref = companySymbol() ? `https://xueqiu.com/S/${companySymbol()}` : 'https://xueqiu.com/';
    if (title.parentElement.href !== titleHref) title.parentElement.href = titleHref;
    tabs.forEach(tab => {
      const extra = ["自选", "交易", "视频", "基金", "达人", "私募", "ETF"].includes(tab.textContent.trim());
      tab.toggleAttribute("data-sp-extra-feed", extra);
    });
  }

  function restoreTab() {
    if (document.title === tabTitle) document.title = originalTitle;
    for (const [icon, href] of originalIcons) {
      if (icon.isConnected && icon.getAttribute("href") === favicon) {
        if (href === null) icon.removeAttribute("href");
        else icon.setAttribute("href", href);
      }
    }
    originalIcons.clear();
    ownedIcon?.remove();
    ownedIcon = undefined;
  }

  function updateTab() {
    if (!settings.enabled || !settings.disguiseTab) { restoreTab(); return; }
    if (!document.head) return;
    if (document.title !== tabTitle) {
      originalTitle = document.title;
      document.title = tabTitle;
    }
    const siteIcons = [...document.querySelectorAll('link[rel~="icon"]')].filter(icon => icon !== ownedIcon);
    for (const icon of siteIcons) {
      if (icon.getAttribute("href") !== favicon) {
        originalIcons.set(icon, icon.getAttribute("href"));
        icon.setAttribute("href", favicon);
      }
    }
    if (!siteIcons.length && !ownedIcon?.isConnected) {
      ownedIcon = document.createElement("link");
      ownedIcon.rel = "icon";
      ownedIcon.href = favicon;
      document.head.append(ownedIcon);
    }
  }

  function createWorkspace() {
    const element = document.createElement("header");
    element.id = "snow-plus-workspace";
    element.setAttribute("aria-label", "专注模式导航");
    element.innerHTML = `
      <div class="sp-global">
        <a class="sp-mark" href="https://xueqiu.com/" aria-label="工作区首页">${svg("code")}</a>
        <span class="sp-global-title">Workspace</span>
        <form class="sp-search" role="search" action="https://xueqiu.com/k" method="get">
          ${svg("search")}<input name="q" aria-label="搜索讨论" placeholder="Search discussions…" autocomplete="off"><kbd>/</kbd>
        </form>
        <button class="sp-icon-button" type="button" data-action="settings" aria-label="专注模式设置" aria-expanded="false">${svg("gear")}</button>
        <span class="sp-user" aria-hidden="true">W</span>
      </div>
      <div class="sp-repo">
        <div class="sp-repo-name">${svg("repo")}<a href="https://xueqiu.com/">workspace</a><span class="sp-slash">/</span><a href="https://xueqiu.com/"><strong data-workspace-title>discussions</strong></a><span class="sp-label">Personal</span></div>
        <div class="sp-repo-actions"><button class="sp-button" type="button" data-action="company" aria-expanded="false" aria-controls="sp-company-picker">${svg("repo")}<span class="sp-company-current">切换公司</span><span aria-hidden="true">⌄</span></button><button class="sp-button sp-native-toggle" type="button" data-action="native" aria-pressed="false">${svg("arrow")}<span>原站导航</span></button></div>
      </div>
      <nav class="sp-tabs" aria-label="页面导航">
        <a class="sp-tab" data-feed-target="discussions" href="https://xueqiu.com/">${svg("issue")}Discussions</a>
        <a class="sp-tab" data-feed-target="news" href="https://xueqiu.com/">${svg("book")}News</a>
        <a class="sp-tab" data-feed-target="following" href="https://xueqiu.com/">${svg("star")}Following</a>
        <a class="sp-tab" data-feed-target="announcements" href="https://xueqiu.com/" hidden>${svg("book")}Announcements</a>
        <span class="sp-focus-state"><i></i>Focus mode</span>
      </nav>
      <section class="sp-company-picker" id="sp-company-picker" hidden aria-label="切换公司">
        <div class="sp-panel-heading"><strong>Switch company</strong><button class="sp-close" type="button" data-action="company-close" aria-label="关闭公司选择">×</button></div>
        <form class="sp-company-form"><input type="search" aria-label="公司名称或代码" placeholder="公司名称或代码，如：比亚迪 / 002594" autocomplete="off" required><button class="sp-button" type="submit">搜索</button></form>
        <p class="sp-company-status" role="status">输入公司名称或代码，例如：比亚迪、002594</p>
        <div class="sp-company-results"></div>
        <div class="sp-company-shortcuts"><a href="https://xueqiu.com/S/SZ002594">比亚迪 <span>SZ002594 · A 股</span></a><a href="https://xueqiu.com/S/01211">比亚迪股份 <span>01211 · 港股</span></a><a href="https://xueqiu.com/">全部公司动态 <span>返回阅读工作区</span></a></div>
        <a class="sp-company-search-all" href="https://xueqiu.com/k" hidden>搜索相关讨论 ↗</a>
      </section>
      <section class="sp-settings" hidden aria-label="专注模式设置">
        <div class="sp-panel-heading"><strong>阅读偏好</strong><button class="sp-close" type="button" data-action="close" aria-label="关闭设置">×</button></div>
        <label><span>隐藏图片和视频<small>让讨论更接近文字列表</small></span><input type="checkbox" data-setting="hideMedia"></label>
        <label><span>隐藏行情与自选<small>收起股价、指数和自选列表</small></span><input type="checkbox" data-setting="hideMarket"></label>
        <label><span>紧凑布局<small>减少列表间距</small></span><input type="checkbox" data-setting="compact"></label>
        <label><span>更换标签页标题与图标</span><input type="checkbox" data-setting="disguiseTab"></label>
        <button class="sp-button sp-restore" type="button" data-action="disable">恢复原站界面</button>
        <p class="sp-panel-note">Alt + Shift + X 可切换 · 设置自动保存</p>
        <p class="sp-save-error" role="status"></p>
      </section>`;
    element.addEventListener("click", async event => {
      if (selectFeed(event)) return;
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const action = button.dataset.action;
      const panel = element.querySelector(".sp-settings");
      if (action === "company" || action === "company-close") {
        const picker = element.querySelector('.sp-company-picker');
        picker.hidden = action === 'company-close' || !picker.hidden;
        element.querySelector('[data-action="company"]').setAttribute('aria-expanded', String(!picker.hidden));
        if (!picker.hidden) { panel.hidden = true; element.querySelector('[data-action="settings"]').setAttribute('aria-expanded', 'false'); element.scrollIntoView({ block: 'start' }); picker.querySelector('input').focus(); }
      } else if (action === "settings" || action === "close") {
        element.querySelector('.sp-company-picker').hidden = true;
        element.querySelector('[data-action="company"]').setAttribute('aria-expanded', 'false');
        panel.hidden = action === "close" || !panel.hidden;
        element.querySelector('[data-action="settings"]').setAttribute("aria-expanded", String(!panel.hidden));
      } else if (action === "native") {
        const open = root.toggleAttribute("data-snow-native");
        button.setAttribute("aria-pressed", String(open));
      } else if (action === "disable") {
        await save({ enabled: false });
      }
    });
    element.addEventListener("change", event => {
      if (event.target.matches("[data-setting]")) {
        void save({ [event.target.dataset.setting]: event.target.checked });
      }
    });
    element.querySelector('.sp-company-form').addEventListener('submit', event => {
      event.preventDefault();
      clearTimeout(companyTimer);
      void searchCompanies(event.target.querySelector('input').value.trim());
    });
    element.querySelector('.sp-company-form input').addEventListener('input', event => {
      clearTimeout(companyTimer);
      companyRequest?.abort();
      const query = event.target.value.trim();
      companyTimer = setTimeout(() => { void searchCompanies(query); }, 250);
    });
    return element;
  }

  async function save(patch) {
    try {
      apply(await SnowPlus.update(patch));
      workspace.querySelector(".sp-save-error").textContent = "";
    } catch {
      workspace.querySelector(".sp-save-error").textContent = "保存失败，请重试。";
      apply(settings);
    }
  }

  function reconcile() {
    scheduled = false;
    if (!document.body) return;
    if (!workspace) workspace = createWorkspace();
    if (!workspace.isConnected) document.body.prepend(workspace);
    updateLayout();
    updateFeedNavigation();
    updateTab();
  }

  function schedule() {
    if (!scheduled) { scheduled = true; requestAnimationFrame(reconcile); }
  }

  function apply(value) {
    settings = SnowPlus.normalize(value);
    root.toggleAttribute("data-snow-plus", settings.enabled);
    for (const key of ["hideMedia", "hideMarket", "compact"]) {
      root.toggleAttribute(`data-snow-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`, settings[key]);
    }
    if (!settings.enabled) root.removeAttribute("data-snow-native");
    if (workspace) {
      workspace.querySelectorAll("[data-setting]").forEach(input => {
        input.checked = settings[input.dataset.setting];
      });
      workspace.querySelector('[data-action="native"]').setAttribute("aria-pressed", String(root.hasAttribute("data-snow-native")));
    }
    reconcile();
    if (workspace) workspace.querySelectorAll("[data-setting]").forEach(input => { input.checked = settings[input.dataset.setting]; });
  }

  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["href", "class"] });
  window.addEventListener("popstate", schedule);
  window.addEventListener("hashchange", schedule);
  document.addEventListener("keydown", event => {
    const typing = event.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]');
    if (event.key === "Escape" && workspace) {
      const picker = workspace.querySelector('.sp-company-picker');
      if (!picker.hidden) {
        picker.hidden = true;
        const button = workspace.querySelector('[data-action="company"]');
        button.setAttribute('aria-expanded', 'false');
        button.focus();
      }
      const panel = workspace.querySelector(".sp-settings");
      if (!panel.hidden) {
        panel.hidden = true;
        const button = workspace.querySelector('[data-action="settings"]');
        button.setAttribute("aria-expanded", "false");
        button.focus();
      }
    }
    if (settings.enabled && event.key === "/" && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      workspace?.querySelector(".sp-search input").focus();
    }
  });
  SnowPlus.subscribe(apply);
  SnowPlus.read().then(apply).catch(() => apply(SnowPlus.defaults));
})();
