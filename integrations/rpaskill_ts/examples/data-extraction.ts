import RPASkill from '../src/index';

async function dataExtractionExample() {
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
    
    // 打开示例网页
    await rpa.navigate('https://example.com');
    await rpa.waitForLoadState('networkidle');
    console.log('已打开示例网页');
    
    // 提取页面标题
    const title = await rpa.extractTitle();
    console.log(`页面标题: ${title}`);
    
    // 提取页面URL
    const url = await rpa.extractUrl();
    console.log(`页面URL: ${url}`);
    
    // 提取页面文本内容
    const pageText = await rpa.extractText('body');
    console.log('页面文本内容:');
    console.log(pageText.substring(0, 200) + '...'); // 只显示前200个字符
    
    // 提取链接
    const links = await rpa.extractAllAttributes('a', 'href');
    console.log('页面链接:');
    links.forEach((link, index) => {
      console.log(`${index + 1}. ${link}`);
    });
    
    // 打开包含表格的网页
    console.log('\n打开包含表格的网页...');
    await rpa.navigate('https://www.w3schools.com/html/html_tables.asp');
    await rpa.waitForLoadState('networkidle');
    console.log('已打开包含表格的网页');
    
    // 提取表格数据
    console.log('提取表格数据...');
    const tableData = await rpa.extractTable('#customers');
    console.log('表格数据:');
    console.table(tableData);
    
    // 提取图片
    const images = await rpa.extractAllImages('img');
    console.log('\n页面图片:');
    images.forEach((image, index) => {
      console.log(`${index + 1}. ${image}`);
    });
    
    // 提取Cookies
    console.log('\n提取Cookies...');
    const cookies = await rpa.extractCookies();
    console.log(`Cookies数量: ${cookies.length}`);
    cookies.forEach((cookie, index) => {
      console.log(`${index + 1}. ${cookie.name}: ${cookie.value}`);
    });
    
    // 提取LocalStorage
    console.log('\n提取LocalStorage...');
    try {
      const localStorage = await rpa.extractLocalStorage();
      console.log('LocalStorage内容:');
      console.log(localStorage);
    } catch (error) {
      console.log('无法提取LocalStorage:', error.message);
    }
    
    // 提取SessionStorage
    console.log('\n提取SessionStorage...');
    try {
      const sessionStorage = await rpa.extractSessionStorage();
      console.log('SessionStorage内容:');
      console.log(sessionStorage);
    } catch (error) {
      console.log('无法提取SessionStorage:', error.message);
    }
    
  } catch (error) {
    console.error('错误:', error);
  } finally {
    // 关闭浏览器
    await rpa.closeBrowser();
    console.log('浏览器已关闭');
  }
}

dataExtractionExample();
