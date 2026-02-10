import RPASkill from '../src/index';

async function googleSearchExample() {
  const rpa = new RPASkill();

  try {
    console.log('Launching browser...');
    await rpa.initBrowser({
      headless: false,
      viewport: { width: 1920, height: 1080 },
    });

    console.log('Opening Google...');
    await rpa.navigate('https://google.com');
    await rpa.waitForLoadState('networkidle');

    await rpa.waitForElementVisible('input[name="q"]');

    const query = 'RPA automation';
    console.log(`Searching: ${query}`);
    await rpa.input('input[name="q"]', query);
    await rpa.press('Enter');
    await rpa.waitForLoadState('networkidle');

    await rpa.waitForElementVisible('h3');

    const titles = await rpa.extractAllText('h3');
    console.log('\nResult titles:');
    titles.slice(0, 10).forEach((t, i) => console.log(`${i + 1}. ${t}`));

    const screenshotPath = `search_result_${Date.now()}.png`;
    await rpa.captureScreenshot(screenshotPath);
    console.log(`\nSaved screenshot: ${screenshotPath}`);
  } finally {
    await rpa.closeBrowser();
  }
}

googleSearchExample().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

