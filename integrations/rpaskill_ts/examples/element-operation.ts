import RPASkill from '../src/index';

async function elementOperationExample() {
  const rpa = new RPASkill();
  
  try {
    // 初始化浏览器
    await rpa.initBrowser({
      headless: false,
      viewport: {
        width: 1920,
        height: 1080,
      },
    });
    
    console.log('浏览器初始化完成');
    
    // 打开Google搜索页面
    await rpa.navigate('https://google.com');
    await rpa.waitForLoadState('networkidle');
    console.log('已打开 Google');
    
    // 等待搜索输入框出现
    await rpa.waitForElementVisible('input[name="q"]');
    console.log('搜索输入框已出现');
    
    // 在搜索框中输入文本
    console.log('在搜索框中输入文本...');
    await rpa.input('input[name="q"]', 'RPA automation');
    console.log('已输入搜索关键词');
    
    // 按Enter键提交搜索
    console.log('提交搜索...');
    await rpa.press('Enter');
    await rpa.waitForLoadState('networkidle');
    console.log('搜索结果已加载');
    
    // 等待搜索结果出现
    await rpa.waitForElementVisible('h3');
    console.log('搜索结果已出现');
    
    // 点击第一个搜索结果
    console.log('点击第一个搜索结果...');
    await rpa.click('h3');
    await rpa.waitForLoadState('networkidle');
    console.log('已打开第一个搜索结果');
    
    // 获取当前页面标题
    const title = await rpa.getTitle();
    console.log(`当前页面标题: ${title}`);
    
    // 截图保存
    const screenshotPath = `screenshot_${Date.now()}.png`;
    console.log(`保存截图到 ${screenshotPath}...`);
    await rpa.captureScreenshot(screenshotPath);
    console.log('截图保存完成');
    
  } catch (error) {
    console.error('错误:', error);
  } finally {
    // 关闭浏览器
    await rpa.closeBrowser();
    console.log('浏览器已关闭');
  }
}

elementOperationExample();
