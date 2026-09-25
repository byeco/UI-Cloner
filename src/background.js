// 1. Chrome'un yerel olarak simge tıklamasında yan paneli açmasını sağla
async function configureSidePanel() {
  try {
    if (chrome.sidePanel?.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }
  } catch (err) {
    console.warn('Could not set side panel behavior:', err);
  }
}

// Servis çalışanı başlarken yapılandır
configureSidePanel();

chrome.runtime.onInstalled.addListener(async () => {
  await configureSidePanel();

  // Sağ tık menüsü oluştur (Alternatif erişim)
  try {
    chrome.contextMenus.create({
      id: 'open-omnitab-sidepanel',
      title: 'UI Cloner: Yan Paneli Aç',
      contexts: ['all']
    });
  } catch {}
});

chrome.runtime.onStartup.addListener(configureSidePanel);

// 2. Tıklama dinleyicisi (Yedek & Garanti mekanizması)
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab) return;

  const url = tab.url || '';
  const isRestricted =
    !url ||
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('extensions://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('view-source:');

  // Chrome güvenlik politikası gereği chrome:// ve dahili sayfalarda yan panel açılamaz
  if (isRestricted) {
    try {
      const newTab = await chrome.tabs.create({ url: 'https://google.com' });
      if (newTab?.id) {
        setTimeout(async () => {
          try {
            await chrome.sidePanel.open({ tabId: newTab.id });
          } catch {
            if (newTab?.windowId) {
              await chrome.sidePanel.open({ windowId: newTab.windowId });
            }
          }
        }, 150);
      }
    } catch (err) {
      console.warn('Could not open tab for sidepanel:', err);
    }
    return;
  }

  // Normal web sayfasında doğrudan aç
  try {
    if (tab.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
    } else if (tab.windowId) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
  } catch (err) {
    if (tab.windowId) {
      try {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      } catch (winErr) {
        console.warn('Side panel open error:', winErr);
      }
    }
  }
});

// 3. Sağ tık menüsünden yan paneli açma
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'open-omnitab-sidepanel' && tab) {
    try {
      if (tab.id) {
        await chrome.sidePanel.open({ tabId: tab.id });
      } else if (tab.windowId) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      }
    } catch {
      if (tab.windowId) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      }
    }
  }
});
