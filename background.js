// 监听扩展安装事件
chrome.runtime.onInstalled.addListener(() => {
  console.log('QuickCopy 扩展已安装');
});

// 监听扩展图标点击事件
// 添加变量跟踪点击时间
let lastClickTime = 0;
const doubleClickDelay = 300; // 双击间隔时间（毫秒）

// 修改监听扩展图标点击事件
chrome.action.onClicked.addListener((tab) => {
  const currentTime = new Date().getTime();
  const timeDiff = currentTime - lastClickTime;
  
  if (timeDiff < doubleClickDelay) {
    // 双击 - 复制页面可读内容
    copyReadableContent(tab);
  } else {
    // 单击 - 复制标题和URL
    // 获取标题和URL
    const title = tab.title;
    const url = tab.url;
    
    // 注入脚本到当前页面执行复制操作
    chrome.scripting.executeScript({
      target: {tabId: tab.id},
      func: copyToClipboard,
      args: [`${title}\n${url}`]
    }).then(() => {
      showBadgeSuccess();
    }).catch(err => {
      console.error('复制失败:', err);
      showBadgeError();
    });
  }
  
  // 更新最后点击时间
  lastClickTime = currentTime;
});

// 添加新函数：复制页面可读内容
function copyReadableContent(tab) {
  if (!tab || !tab.id) {
    showBadgeError();
    return;
  }
  
  // 首先注入 Readability 库
  chrome.scripting.executeScript({
    target: {tabId: tab.id},
    files: ['Readability.js']
  }).then(() => {
    // 然后执行提取内容的脚本
    chrome.scripting.executeScript({
      target: {tabId: tab.id},
      function: extractPageContentAsMarkdown,
      args: [tab.url]
    }).then((results) => {
      if (!results || !results[0] || !results[0].result) {
        showBadgeError();
        return;
      }
      
      const markdownContent = results[0].result;
      
      // 注入脚本到当前页面执行复制操作
      chrome.scripting.executeScript({
        target: {tabId: tab.id},
        func: copyToClipboard,
        args: [markdownContent]
      }).then(() => {
        showBadgeSuccess();
      }).catch(err => {
        console.error('复制失败:', err);
        showBadgeError();
      });
    }).catch(err => {
      console.error('提取内容失败:', err);
      showBadgeError();
    });
  }).catch(err => {
    console.error('注入Readability库失败:', err);
    showBadgeError();
  });
}

// 在页面中执行的复制函数
function copyToClipboard(text) {
  return new Promise((resolve, reject) => {
    // 直接使用备用方法，避免 Clipboard API 的焦点问题
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      
      if (successful) {
        resolve(true);
      } else {
        // 如果 execCommand 失败，尝试 Clipboard API
        navigator.clipboard.writeText(text)
          .then(() => resolve(true))
          .catch(err => {
            console.error('所有复制方法都失败了', err);
            reject(err);
          });
      }
    } catch (e) {
      console.error('备用复制方法失败:', e);
      reject(e);
    }
  });
}

// 监听闹钟事件，用于清除徽章
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'clearBadge') {
    chrome.action.setBadgeText({text: ""});
  }
});

// 移除未使用的 copyTitleAndUrl 函数

// 显示成功徽章
function showBadgeSuccess() {
  chrome.action.setBadgeText({text: "✓"});
  chrome.action.setBadgeBackgroundColor({color: "#4CAF50"});
  
  try {
    chrome.action.setBadgeTextColor({color: "#FFFFFF"});
  } catch (e) {
    console.log("setBadgeTextColor 不受支持，使用默认文本颜色");
  }
  
  // 使用 chrome.alarms API 来确保定时器在后台运行
  chrome.alarms.create('clearBadge', { delayInMinutes: 0.02 }); // 1.2秒 = 0.02分钟
}

// 显示错误徽章
function showBadgeError() {
  chrome.action.setBadgeText({text: "!"});
  chrome.action.setBadgeBackgroundColor({color: "#F44336"});
  
  try {
    chrome.action.setBadgeTextColor({color: "#FFFFFF"});
  } catch (e) {
    console.log("setBadgeTextColor 不受支持，使用默认文本颜色");
  }
  
  // 使用 chrome.alarms API 来确保定时器在后台运行
  chrome.alarms.create('clearBadge', { delayInMinutes: 0.02 }); // 1.2秒 = 0.02分钟
}

// 在页面中执行的函数，提取页面内容并转换为Markdown
function extractPageContentAsMarkdown(sourceUrl) {
  try {
    // 创建一个文档副本，以便使用Readability处理
    const documentClone = document.cloneNode(true);
    
    // 使用Readability解析页面
    const reader = new Readability(documentClone);
    const article = reader.parse();
    
    if (article) {
      // 创建Markdown格式内容
      let markdown = `# ${article.title}\n\n`;
      
      // 添加来源链接
      markdown += `> 来源：[${article.siteName || document.domain}](${sourceUrl})\n\n`;
      
      // 添加正文内容
      let content = article.textContent
        .replace(/\s+/g, ' ')  // 合并多个空白字符
        .replace(/\n\s+/g, '\n')  // 清理行首空白
        .trim();
      
      // 尝试保留一些基本结构（段落）
      content = content.replace(/\.\s+/g, '.\n\n');  // 在句号后添加段落分隔
      
      markdown += content;
      
      return markdown;
    } else {
      // 如果Readability失败，回退到基本文本提取并格式化为Markdown
      let markdown = `# ${document.title}\n\n`;
      markdown += `> 来源：[${document.domain}](${sourceUrl})\n\n`;
      markdown += document.body.innerText;
      
      return markdown;
    }
  } catch (error) {
    console.error("提取内容时出错:", error);
    // 出错时返回基本Markdown
    let markdown = `# ${document.title}\n\n`;
    markdown += `> 来源：[${document.domain}](${sourceUrl})\n\n`;
    markdown += document.body.innerText;
    
    return markdown;
  }
}

// 可以移除原来的 extractPageContent 函数，因为已被新函数替代