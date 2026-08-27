console.log("✅ background.js 2.0 запущен");

let isProcessing = false
let lastAdvancedSearchUrl

const remoteUpdateUrl = 'https://freon3103-sys.github.io/IYoula/update.json';
// Получаем текущую версию из локального manifest.json
const localUpdateUrl = chrome.runtime.getURL("update.json");

// Проверка обновления через удалённый manifest.json
async function checkForUpdate() {
    console.log("запускается проверка обновления")
    const localResponse = await fetch(localUpdateUrl)
    const updateData = await localResponse.json();
    const currentVersion = updateData.version;

    console.log("Локальный update.json:", updateData);
    console.log("Текущая версия:", currentVersion);

    try {
        const response = await fetch(remoteUpdateUrl);

        if (!response.ok) {
            throw new Error(`Ошибка сети: ${response.status}`);
        }
        
        let remoteUpdate;
        try {
            remoteUpdate = await response.json();
        } catch (e) {
            throw new Error('Не удалось распарсить JSON');
        }

        if (!remoteUpdate || !remoteUpdate.version) {
            throw new Error('Неверный формат данных: нет поля "version" в manifest.json');
        }

        const remoteVersion = remoteUpdate.version;
        if (isNewerVersion(remoteVersion, currentVersion)) {
            console.log(`Доступна новая версия: ${remoteVersion}`);
            chrome.notifications.create('update-available', {
                type: 'basic',
                iconUrl: 'icons/128.png',
                title: 'Доступно обновление!',
                message: `Вышла новая версия: ${remoteVersion}\nКликни на меня для скачивания новой версии!`,
                priority: 2
            });
            const updateUrl = updateData.downloadUrl
            chrome.notifications.onClicked.addListener((id) => {
                if (id === 'update-available') {
                    chrome.tabs.create({ url: updateUrl });
                }
            });
        } else {
            console.log('Обновлений нет.');
        }

    } catch (error) {
        console.error('Ошибка при проверке обновления:', error);
    }
}

// Функция сравнения версий
function isNewerVersion(a, b) {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        if (partsA[i] > partsB[i]) return true;
        if (partsA[i] < partsB[i]) return false;
    }

    return false;
}

function parseIds(data) {
  if (!data.paging || !data.paging.resultItems) return [];
  return data.paging.resultItems.map(item => ({
    id: item.id,
    date: item.planDateUtc,
    branch: item.branch,
    title: item.title
  }));
}
// 🔹 сам обработчик запросов
async function handleRequest(details) {
  if (details.tabId < 0) {
  console.log("⏭ Запрос не из вкладки, пропускаем:", details.url);
  return;
  }
  if (details.url.includes("AdvancedSearchVorwandRequest")) {
    lastAdvancedSearchUrl = details.url;
  }
  if (isProcessing) {
    console.log("⛔ Уже обрабатываем — пропуск");
    return;
  }
  if (details.url.includes("planDateRanges=0") || details.url.includes("planDateRanges=1")) return;
  if (!details.url.includes("AdvancedSearchVorwandRequest")) return;

  isProcessing = true;

  try {
    console.log("Перехвачено:", details.url);

    const baseExpired = details.url.replace("planDateRanges=", "planDateRanges=0");
    const baseToday   = details.url.replace("planDateRanges=", "planDateRanges=1");

    let allExpired = [], allToday = [];
    let from = 0, page = 0;

    const MAX_PAGES = 5, MAX_ITEMS = 250;

    while (true) {
      if (page >= MAX_PAGES) break;
      if (allExpired.length >= MAX_ITEMS || allToday.length >= MAX_ITEMS) break;

      const urlExpired = baseExpired.replace(/from=\d+/, "from=" + from);
      const urlToday   = baseToday.replace(/from=\d+/, "from=" + from);

      console.log("📡 Запрос from =", from);

      const [rExpired, rToday] = await Promise.all([
        fetch(urlExpired),
        fetch(urlToday)
      ]);

      const dataExpired = parseIds(await rExpired.json());
      const dataToday   = parseIds(await rToday.json());

      console.log("Ответ:", dataExpired.length, dataToday.length);

      if (dataExpired.length === 0 && dataToday.length === 0) break;

      allExpired.push(...dataExpired);
      allToday.push(...dataToday);

      from += 50;
      page++;
    }

    chrome.tabs.sendMessage(details.tabId, {
      type: "vorwandData",
      expired: allExpired,
      today: allToday
    });

    console.log("✅ ДАННЫЕ ОТПРАВЛЕНЫ");

  } catch (e) {
    console.error("❌ Ошибка:", e);
  } finally {
    isProcessing = false;
  }
}
// 🔹 контроль слушателя
const filter = { urls: ["https://youla.2gis.local/*"] };
function enableIntercept() {
  if (chrome.webRequest.onBeforeRequest.hasListener(handleRequest)) return;
  chrome.webRequest.onBeforeRequest.addListener(handleRequest, filter);
  console.log("🟢 Перехват включён");
}
function disableIntercept() {
  if (!chrome.webRequest.onBeforeRequest.hasListener(handleRequest)) return;
  chrome.webRequest.onBeforeRequest.removeListener(handleRequest);
  console.log("🛑 Перехват выключен");
}
// Включаем по умолчанию
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  console.log("получено состояние:", msg.type)
  if (msg.type === "check_update") {
    console.log("получена команда на проверку обновления")
    checkForUpdate();
    }
  if (msg.type === "getLastAdvancedSearchUrl") {
    sendResponse({ url: lastAdvancedSearchUrl });
    return;
  }
  if (msg.type === "mapSelected") {
    console.log("📨 Получено состояние:", msg.value);

    if (msg.value === true) {
      console.log("🛑 Выбрано на карте → отключаем перехват");
      disableIntercept();
    } else {
      console.log("🟢 Не выбрано → включаем перехват");
      enableIntercept();
    }

    sendResponse({ ok: true });
  }
  if (msg.type === "contact") {
    const value = msg.value;

    console.log("📨 contact:", value);

    const url = `https://youla.2gis.local/api/json/reply/AdvancedSearchVorwandRequest?searchString=${encodeURIComponent(value)}&pageSize=50&from=0`;

    fetch(url, {
      method: "GET",
      credentials: "include"
    })
      .then(res => res.json())
      .then(data => {
        console.log("📦 API ответ:", data);

        const items = data?.paging?.resultItems || [];
        const count = data?.paging?.total || 0;

        const links = items.map(item => {
          return {
            url: `https://youla.2gis.local/vorwand#/id=${item.id}`,
            title: item.title,
            resolution: item.resolution
          };
        });

        sendResponse({
          count: count,
          links: links,
          value: value
        });
      })
      .catch(err => {
        console.error("❌ API error:", err);

        sendResponse({
          count: 0,
          links: []
        });
      });

    return true;
  }
  if (msg.type === "filter") {
    const url = msg.url; // готовый URL

    console.log("📨 filter URL:", url);

    fetch(url, {
      method: "GET",
      credentials: "include"
    })
      .then(res => res.json())
      .then(data => {
        console.log("📦 API ответ фильтра:", data);

        const count = data?.paging?.total || 0;

        sendResponse({
          count: count
        });
      })
      .catch(err => {
        console.error("❌ API error:", err);

        sendResponse({
          count: 0
        });
      });

    return true;
  }
});

