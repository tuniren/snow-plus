import { test, expect, chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const title = 'Issues · workspace / discussions';
let context, extensionId;

test.beforeEach(async () => {
  context = await chromium.launchPersistentContext('', {
    ...(process.env.SNOW_PLUS_BROWSER_PATH
      ? { executablePath: process.env.SNOW_PLUS_BROWSER_PATH }
      : { channel: 'chromium' }),
    headless: true,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
    viewport: { width: 1440, height: 1000 },
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  extensionId = new URL(worker.url()).host;
  // Use the real extension on the matching origin, with deterministic page
  // fixtures instead of depending on authentication or live market requests.
  await context.route('https://xueqiu.com/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/' || pathname === '/hq') {
      let html = await readFile(path.join(root, 'preview.html'), 'utf8');
      html = html.replace(/<script[^>]+(?:src\/|demo\/preview)[^>]*><\/script>/g, '')
        .replace('<link rel="stylesheet" href="src/content.css">', '');
      await route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    } else if (/^\/(demo|icons)\/[\w.-]+$/.test(pathname)) {
      const body = await readFile(path.join(root, pathname.slice(1)));
      const types = { '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
      await route.fulfill({ contentType: types[path.extname(pathname)], body });
    } else await route.fulfill({ status: 404, body: '' });
  });
});
test.afterEach(async () => { await context?.close(); });

async function openSite() {
  const page = await context.newPage();
  await page.goto('https://xueqiu.com/');
  await expect(page.locator('html')).toHaveAttribute('data-snow-plus', '');
  await expect(page.locator('#snow-plus-workspace')).toBeVisible();
  return page;
}
async function openPopup() {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/src/popup.html`);
  await expect(popup.locator('[data-setting="enabled"]')).toBeEnabled();
  return popup;
}

test('real extension syncs preferences across pages and restores the original DOM, title and favicon', async () => {
  const page = await openSite();
  const secondPage = await openSite();
  const popup = await openPopup();
  const originalIcon = 'icons/icon-32.png';
  await expect(page).toHaveTitle(title);
  await expect(page.locator('.Header_nav_1XC')).toBeHidden();
  await expect(page.locator('.style_status__images_3Y2')).toBeHidden();
  await expect(page.locator('.StockSlider_home__stock_container_2cd')).toBeHidden();
  // Original-site event listeners and node identity survive both toggles.
  await page.evaluate(() => {
    window.originalRow = document.querySelector('.style_timeline__item_3WW');
    document.querySelector('[data-like]').addEventListener('click', event => { event.target.textContent = 'site handler still works'; });
  });
  await page.locator('[data-like]').first().click();
  await expect(page.locator('[data-like]').first()).toHaveText('site handler still works');
  await popup.locator('[data-setting="hideMedia"]').uncheck();
  for (const tab of [page, secondPage]) await expect(tab.locator('.style_status__images_3Y2')).toBeVisible();
  await popup.locator('[data-setting="enabled"]').uncheck();
  for (const tab of [page, secondPage]) {
    await expect(tab.locator('#snow-plus-workspace')).toBeHidden();
    await expect(tab.locator('.Header_nav_1XC')).toBeVisible();
    await expect(tab).toHaveTitle('雪球 · Snow Plus 本地预览');
    await expect(tab.locator('link[rel="icon"]')).toHaveAttribute('href', originalIcon);
  }
  expect(await page.evaluate(() => window.originalRow === document.querySelector('.style_timeline__item_3WW'))).toBe(true);
  await popup.locator('[data-setting="enabled"]').check();
  await expect(page).toHaveTitle(title);
  await expect(page.locator('.style_status__images_3Y2')).toBeVisible();
  await page.reload();
  await expect(page.locator('.style_status__images_3Y2')).toBeVisible();
});

test('hides preview thumbnails, reposts and dynamic galleries by default, and restores them with the media setting', async () => {
  const page = await openSite();
  const popup = await openPopup();
  await expect(popup.locator('[data-setting="hideMedia"]')).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-snow-hide-media', '');
  await expect(page.locator('.pic__thumb')).toBeHidden();
  await page.evaluate(() => {
    document.querySelector('#demo-feed').insertAdjacentHTML('beforeend', `
      <article class="timeline__item" id="media-regression-row">
        <h3>预览和转发图片</h3><p>图片隐藏后，讨论正文和链接仍然保留。</p>
        <a data-media="thumbnail" class="content__addition pic__thumb" href="/discussion" style="display:block;width:160px;height:100px;background-image:url(/demo/chart.svg)"><img src="/demo/chart.svg" width="160" height="100"></a>
        <div class="timeline__item__forward"><span>转发文字</span><picture data-media="repost"><img src="/demo/chart.svg" width="160" height="100"></picture></div>
        <div class="content content--detail"><img data-media="detail" src="/demo/chart.svg" width="160" height="100"></div>
        <div class="cursor__zoom-in" data-media="gallery" style="width:160px;height:100px;background-image:url(/demo/chart.svg)"><div class="multi-image-loading" style="width:160px;height:100px;background-image:url(/demo/chart.svg)"></div><img src="/demo/chart.svg" width="160" height="100"></div>
      </article>`);
    document.body.insertAdjacentHTML('beforeend', '<div id="verification-dialog"><img src="/demo/avatar.svg" width="40" height="40" alt="验证图片"></div>');
    window.originalPreview = document.querySelector('[data-media="thumbnail"]');
  });
  const media = page.locator('[data-media]');
  for (const item of await media.all()) await expect(item).toBeHidden();
  await expect(page.locator('#media-regression-row h3')).toBeVisible();
  await expect(page.locator('#media-regression-row p')).toBeVisible();
  await expect(page.locator('#verification-dialog img')).toBeVisible();
  await expect(page.locator('.sp-mark svg')).toBeVisible();
  await popup.locator('[data-setting="hideMedia"]').uncheck();
  for (const item of await media.all()) await expect(item).toBeVisible();
  await expect(page.locator('.pic__thumb').first()).toBeVisible();
  expect(await page.evaluate(() => window.originalPreview === document.querySelector('[data-media="thumbnail"]'))).toBe(true);
  await popup.locator('[data-setting="hideMedia"]').check();
  for (const item of await media.all()) await expect(item).toBeHidden();
  await page.evaluate(() => {
    const row = document.querySelector('#media-regression-row').cloneNode(true);
    row.id = 'new-media-row';
    document.querySelector('#demo-feed').append(row);
  });
  for (const item of await page.locator('#new-media-row [data-media]').all()) await expect(item).toBeHidden();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-snow-hide-media', '');
  await expect(page.locator('.pic__thumb')).toBeHidden();
});

test('switches companies by name or code and keeps company discussions readable without quotes or media', async () => {
  const page = await openSite();
  await page.route('https://xueqiu.com/query/v1/suggest_stock.json?**', route => {
    const query = new URL(route.request().url()).searchParams.get('q');
    if (query === '600519') return route.fulfill({ status: 503, body: '' });
    return route.fulfill({ json: { data: [
      { code: 'SZ002594', query: '比亚迪' }, { code: '01211', query: '比亚迪股份' },
      { code: 'javascript:alert(1)', query: 'Invalid result' },
    ] } });
  });
  await page.route('https://xueqiu.com/S/**', route => {
    const code = new URL(route.request().url()).pathname.split('/').pop();
    const name = code === '01211' ? '比亚迪股份' : code === 'SH600519' ? '贵州茅台' : '比亚迪';
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><title>${name}</title><style>
      .container-lg { width: 960px; margin: auto; } .stock__main { width: 640px; float: left; } .stock__side { width: 280px; float: right; } .timeline__item { min-height: 180px; }
    </style></head><body><div id="app"><div class="container-lg clearfix"><div class="stock-links">公司财务导航</div><div class="container-sm float-left stock__main">
      <h1 class="stock-name">${name}(${code})</h1><div class="stock-issues">市盈率</div><div class="stock-operate">交易操作</div><div class="quote-container">股价 100</div><div class="chart-container-box">价格走势图</div><div class="editor-container">发帖</div>
      <div class="stock-timeline"><div class="stock-timeline-tabs"><a href="#" class="active">全部</a><a href="#">讨论</a><a href="#">交易</a><a href="#">资讯</a><a href="#">公告</a></div><div class="status-list">${Array.from({ length: 12 }, (_, i) => `<article class="timeline__item"><div class="timeline__item__main"><h3>${name} discussion ${i}</h3><p>讨论正文</p><a class="pic__thumb"><img src="/demo/chart.svg" width="160" height="100"></a></div></article>`).join('')}</div></div>
    </div><aside class="stock__side">股票排行榜</aside></div></div><script>
      document.querySelectorAll('.stock-timeline-tabs a').forEach(tab => tab.addEventListener('click', event => { event.preventDefault(); document.querySelectorAll('.stock-timeline-tabs a').forEach(a => a.classList.toggle('active', a === tab)); }));
    </script></body></html>` });
  });
  await page.locator('[data-action="company"]').click();
  const input = page.getByRole('searchbox', { name: '公司名称或代码' });
  await expect(input).toBeFocused();
  await input.fill('比亚迪');
  await expect(page.locator('.sp-company-results a')).toHaveCount(2);
  await page.locator('.sp-company-results a').first().click();
  await expect(page).toHaveURL('https://xueqiu.com/S/SZ002594');
  await expect(page.locator('[data-workspace-title]')).toHaveText('比亚迪');
  await expect(page.locator('[data-sp-panel]')).toHaveCount(2);
  for (const selector of ['.quote-container', '.chart-container-box', '.stock__side', '.stock-links', '.pic__thumb >> nth=0']) await expect(page.locator(selector)).toBeHidden();
  await page.locator('#snow-plus-workspace [data-feed-target="discussions"]').click();
  await expect(page.locator('.stock-timeline-tabs a.active')).toHaveText('讨论');
  await page.locator('#snow-plus-workspace [data-feed-target="news"]').click();
  await expect(page.locator('.stock-timeline-tabs a.active')).toHaveText('资讯');
  await page.locator('#snow-plus-workspace [data-feed-target="announcements"]').click();
  await expect(page.locator('.stock-timeline-tabs a.active')).toHaveText('公告');
  await page.evaluate(() => scrollTo(0, 800));
  expect(await page.evaluate(() => {
    const rows = [...document.querySelectorAll('article')].filter(e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
    return rows.length > 0 && rows.every(e => { const r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x + 100, r.y + 40)); });
  })).toBe(true);
  await page.reload();
  await expect(page.locator('[data-workspace-title]')).toHaveText('比亚迪');
  await page.locator('[data-action="company"]').click();
  await page.locator('.sp-company-shortcuts a[href$="/01211"]').click();
  await expect(page).toHaveURL('https://xueqiu.com/S/01211');
  await expect(page.locator('[data-workspace-title]')).toHaveText('比亚迪股份');
  await page.locator('[data-action="company"]').click();
  await input.fill('600519');
  await expect(page.locator('.sp-company-results a')).toHaveAttribute('href', 'https://xueqiu.com/S/SH600519');
  await page.locator('.sp-company-results a').click();
  await expect(page.locator('[data-workspace-title]')).toHaveText('贵州茅台');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-action="company"]').click();
  const pickerBox = await page.locator('.sp-company-picker').boundingBox();
  expect(pickerBox.x).toBeGreaterThanOrEqual(0);
  expect(pickerBox.x + pickerBox.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await expect(page.locator('.sp-company-picker')).toBeHidden();
  await expect(page.locator('[data-action="company"]')).toBeFocused();
  const popup = await openPopup();
  await popup.locator('[data-setting="enabled"]').uncheck();
  await expect(page.locator('.quote-container')).toBeVisible();
  await expect(page.locator('.stock__side')).toBeVisible();
  await expect(page.locator('[data-sp-panel]')).toHaveCount(0);
});

test('handles dynamic rows, SPA navigation, title replacement, and native account navigation', async () => {
  const page = await openSite();
  await page.evaluate(() => {
    const row = document.querySelector('.style_timeline__item_3WW').cloneNode(true);
    row.id = 'dynamic-row';
    document.querySelector('#demo-feed').append(row);
    document.title = '新文章 · 雪球';
    document.querySelector('link[rel="icon"]').href = '/changed-icon.png';
    history.pushState({}, '', '/hq');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page).toHaveTitle(title);
  await expect(page.locator('[data-sp-panel]')).toHaveCount(0);
  await expect(page.locator('[data-sp-layout]')).toHaveCount(0);
  await expect(page.locator('#dynamic-row')).toHaveCSS('padding-left', '48px');
  await expect(page.locator('#dynamic-row .style_avatar_c-G')).toBeHidden();
  await page.locator('[data-action="native"]').click();
  await expect(page.locator('.Header_nav_1XC')).toBeVisible();
  await page.locator('[data-action="settings"]').click();
  await page.locator('[data-setting="disguiseTab"]').uncheck();
  await expect(page).toHaveTitle('新文章 · 雪球');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/changed-icon.png');
  await page.locator('[data-action="disable"]').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-snow-native', '');
});

test('hides current and legacy native headers, including dynamically replaced branding', async () => {
  const page = await openSite();
  const popup = await openPopup();
  const workspace = page.locator('#snow-plus-workspace');
  await expect(workspace).not.toContainText('雪球');
  await expect(workspace.locator('[aria-label*="雪球"]')).toHaveCount(0);

  for (const markup of [
    '<nav class="nav stickyFixed" style="position:fixed;top:0;z-index:100"><div class="container"><div id="logo" class="logo"><a href="/" class="nav__logo" aria-label="雪球">雪球</a></div><form class="nav__search"><input placeholder="搜索"></form><ul class="account"><li><a href="/about">关于雪球</a></li></ul></div></nav>',
    '<header class="header"><div class="header-inner"><a class="logo" href="https://xueqiu.com"><img alt="雪球" width="90" height="30"></a><ul class="nav-right"><li><a href="/about">关于雪球</a></li></ul></div></header>',
    '<div id="header"><a href="/">雪球</a><button>登录</button></div>',
    '<nav class="nav--global"><a href="/">雪球</a><button>登录</button></nav>',
    '<div class="Header_nav_newHash"><a href="/">雪球</a><button>登录</button></div>',
  ]) {
    await page.evaluate(html => {
      document.querySelector('[data-test-native-header]')?.remove();
      document.body.insertAdjacentHTML('beforeend', html);
      document.body.lastElementChild.setAttribute('data-test-native-header', '');
    }, markup);
    const header = page.locator('[data-test-native-header]');
    await expect(header).toBeHidden();
    await page.locator('[data-action="native"]').click();
    await expect(header).toBeVisible();
    await page.locator('[data-action="native"]').click();
    await expect(header).toBeHidden();
    await popup.locator('[data-setting="enabled"]').uncheck();
    await expect(header).toBeVisible();
    await popup.locator('[data-setting="enabled"]').check();
    await expect(header).toBeHidden();
  }
});

test('signed-in reading workspace preserves feeds, reload, scrolling, appended rows and restoration', async () => {
  const page = await context.newPage();
  await page.route('https://xueqiu.com/', route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html><head><title>首页</title><style>
      * { box-sizing: border-box; }
      body { margin: 0; }
      .nav { position: fixed; top: 0; width: 100%; height: 56px; background: blue; z-index: 1999; }
      .user__container { width: 1150px; margin: 24px auto; }
      .user__container::after { content: ''; display: table; clear: both; }
      .user__col--middle { float: left; width: 680px; margin-left: 180px; padding: 0 20px; }
      .user__col--lf { float: left; width: 180px; }
      .home__col--rt { float: right; width: 280px; margin-left: 10px; }
      .home__aside--sticky { position: sticky; top: 20px; }
      .board { min-height: 400px; background: white; }
      .timeline__item { min-height: 200px; }
    </style></head><body>
      <nav class="nav stickyFixed"><a class="nav__logo" href="/">雪球</a></nav>
      <div id="app"><div class="nav__placeholder" style="height:56px">导航占位</div><div class="home__main"><div class="user__container"><div class="user__col--lf">原站账户和导航</div><div>
        <div class="user__col--middle"><div class="optional">自选股价 100.00</div><div class="editor-container">发表观点</div><div class="home-timeline"><div class="home-timeline-tabs"><div class="sticky-content-fixed"><a href="#" data-fixture-feed="discussions" class="active">热门</a><a href="#" data-fixture-feed="news">资讯</a><a href="#" data-fixture-feed="following">关注</a><a href="#">自选</a></div></div><div class="status-list">
          ${Array.from({ length: 15 }, (_, i) => `<article class="timeline__item"><div class="timeline__item__main"><h3><a href="/discussion/${i}">Discussion ${i}</a></h3><p>Readable discussion content.</p>${i === 0 ? '<div class="timeline__item__comment"><div class="editor-container">回复讨论</div></div>' : ''}</div></article>`).join('')}
        </div></div></div>
        <div class="home__col--rt"><div class="home__aside--sticky"><div class="board board__topic sticky-content-fixed">热门话题</div></div></div>
      </div></div></div><div class="seekball-container">AI 投资助手</div></div>
      <script>
        document.querySelectorAll('[data-fixture-feed]').forEach(tab => tab.addEventListener('click', event => {
          event.preventDefault();
          document.querySelectorAll('[data-fixture-feed]').forEach(link => link.classList.toggle('active', link === tab));
          window.fixtureFeed = tab.dataset.fixtureFeed;
        }));
        addEventListener('scroll', () => {
          if (scrollY > 1000 && !document.querySelector('#appended-row')) {
            const row = document.querySelector('.timeline__item').cloneNode(true);
            row.id = 'appended-row';
            document.querySelector('.status-list').append(row);
          }
        });
      </script>
    </body></html>`,
  }));
  await page.goto('https://xueqiu.com/');
  const popup = await openPopup();
  await page.evaluate(() => { window.originalRow = document.querySelector('.timeline__item'); });
  for (let load = 0; load < 2; load++) {
    await expect(page.locator('#snow-plus-workspace')).toBeVisible();
    await expect(page.locator('.nav')).toBeHidden();
    await expect(page.locator('.home__col--rt')).toHaveCSS('width', '280px');
    await expect(page.locator('.home__col--rt')).toHaveCSS('float', 'right');
    await expect(page.locator('.home__col--rt')).toBeHidden();
    await expect(page.locator('.user__col--lf')).toBeHidden();
    await expect(page.locator('.optional')).toBeHidden();
    await expect(page.locator('.nav__placeholder')).toBeHidden();
    await expect(page.locator('.seekball-container')).toBeHidden();
    await expect(page.locator('.user__col--middle > .editor-container')).toBeHidden();
    await expect(page.locator('.timeline__item__comment .editor-container').first()).toBeVisible();
    await expect(page.locator('[data-sp-panel="left"]')).toBeVisible();
    await expect(page.locator('[data-sp-panel="right"]')).toBeVisible();
    await page.locator('[data-sp-panel="left"] [data-feed-target="news"]').click();
    await expect(page.locator('[data-fixture-feed="news"]')).toHaveClass('active');
    await expect(page.locator('#snow-plus-workspace [data-feed-target="news"]')).toHaveAttribute('aria-current', 'page');
    await page.locator('#snow-plus-workspace [data-feed-target="following"]').click();
    await expect(page.locator('[data-fixture-feed="following"]')).toHaveClass('active');
    await page.locator('#snow-plus-workspace [data-feed-target="discussions"]').click();
    for (const offset of [0, 900, 1800]) {
      await page.evaluate(y => scrollTo(0, y), offset);
      await expect.poll(() => page.evaluate(() => {
        const links = [...document.querySelectorAll('.timeline__item h3 a')].filter(link => {
          const rect = link.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= innerHeight;
        });
        return links.length > 0 && links.every(link => {
          const rect = link.getBoundingClientRect();
          return link.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
        });
      })).toBe(true);
    }
    await expect(page.locator('#appended-row')).toHaveCount(1);
    if (load === 0) await page.reload();
  }
  await page.evaluate(() => { window.originalRow = document.querySelector('.timeline__item'); });
  await popup.locator('[data-setting="enabled"]').uncheck();
  await expect(page.locator('[data-sp-panel]')).toHaveCount(0);
  await expect(page.locator('[data-sp-layout]')).toHaveCount(0);
  await expect(page.locator('.home__col--rt')).toBeVisible();
  await expect(page.locator('.user__col--lf')).toBeVisible();
  await expect(page.locator('.optional')).toBeVisible();
  await expect(page.locator('.nav__placeholder')).toBeVisible();
  await expect(page.locator('.seekball-container')).toBeVisible();
  await expect(page.locator('.user__col--middle > .editor-container')).toBeVisible();
  await expect(page.locator('.user__col--middle')).toHaveCSS('float', 'left');
  expect(await page.evaluate(() => window.originalRow === document.querySelector('.timeline__item'))).toBe(true);
  await popup.locator('[data-setting="enabled"]').check();
  await expect(page.locator('[data-sp-panel]')).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-sp-panel="left"]')).toBeHidden();
  await expect(page.locator('[data-sp-panel="right"]')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('search and settings are keyboard accessible; normal typing is not intercepted', async () => {
  const page = await openSite();
  await page.keyboard.press('/');
  await expect(page.locator('.sp-search input')).toBeFocused();
  await page.keyboard.type('price / book');
  await expect(page.locator('.sp-search input')).toHaveValue('price / book');
  await expect(page.locator('.sp-search')).toHaveAttribute('action', 'https://xueqiu.com/k');
  await page.locator('[data-action="settings"]').click();
  await expect(page.locator('.sp-settings')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sp-settings')).toBeHidden();
  await expect(page.locator('[data-action="settings"]')).toBeFocused();
  await page.locator('[data-action="settings"]').click();
  await page.locator('[data-setting="compact"]').check();
  await expect(page.locator('.style_timeline__item_3WW').first()).toHaveCSS('padding-top', '12px');
});

test('fits a narrow window and reinserts a removed workspace without duplicates', async () => {
  const page = await openSite();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('[data-action="settings"]').click();
  const panel = await page.locator('.sp-settings').boundingBox();
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(390);
  await page.evaluate(() => document.querySelector('#snow-plus-workspace').remove());
  await expect(page.locator('#snow-plus-workspace')).toHaveCount(1);
  await expect(page.locator('#snow-plus-workspace')).toBeVisible();
  await page.evaluate(() => document.querySelector('[data-sp-panel="left"]').remove());
  await expect(page.locator('[data-sp-panel="left"]')).toHaveCount(1);
  await expect(page.locator('[data-sp-panel="right"]')).toHaveCount(1);
});

test('does not run on unrelated sites', async () => {
  await context.route('https://example.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Example</title><p>Unrelated page</p>' }));
  const page = await context.newPage();
  await page.goto('https://example.com/');
  await expect(page).toHaveTitle('Example');
  await expect(page.locator('#snow-plus-workspace')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-snow-plus', '');
});
