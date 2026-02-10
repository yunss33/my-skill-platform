import RPASkill from '../src/index';

async function jdIphonePriceExample() {
  const rpa = new RPASkill();

  try {
    console.log('Launching browser...');
    await rpa.initBrowser({
      headless: false,
      viewport: { width: 1920, height: 1080 },
    });

    const screenshotPath = `iphone_price_result_${Date.now()}.png`;

    const results = await rpa.searchOnSite({
      url: 'https://www.jd.com',
      query: '苹果手机',
      searchInput: '#key',
      searchButton: '.button',
      resultsWaitFor: '.gl-item',
      waitForLoadState: 'networkidle',
      list: {
        itemSelector: '.gl-item',
        fields: {
          title: { selector: '.p-name em', attr: 'text' },
          price: { selector: '.p-price i', attr: 'text' },
          link: { selector: '.p-name a', attr: 'href' },
        },
      },
      limit: 10,
      screenshotPath,
    });

    console.log('\nJD iPhone prices (top 10):');
    console.log('====================================');

    if (results.length === 0) {
      console.log('No results found. The page structure may have changed.');
    } else {
      for (const item of results) {
        const title = String(item.title ?? '').trim() || '(no title)';
        const price = String(item.price ?? '').trim() || '(no price)';
        const link = String(item.link ?? '').trim();

        console.log(title);
        console.log(`  price: ${price}`);
        if (link) console.log(`  link: ${link}`);
        console.log('------------------------------------');
      }
    }

    console.log(`\nSaved screenshot: ${screenshotPath}`);
  } finally {
    await rpa.closeBrowser();
  }
}

jdIphonePriceExample().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

