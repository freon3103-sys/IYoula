console.log("✅ background.js 3.0 запущен");

let isProcessing = false;
let lastAdvancedSearchUrl;
let apiAuthorization = null;
let updateUrl = "https://github.com/freon3103-sys/IYoula";

const remoteUpdateUrl = "https://freon3103-sys.github.io/IYoula/update.json";
const localUpdateUrl = chrome.runtime.getURL("update.json");

// =======================
// ✅ UPDATE CHECK
// =======================

async function checkForUpdate() {
  console.log("запускается проверка обновления");

  try {
    const localResponse = await fetch(localUpdateUrl);
    const updateData = await localResponse.json();
    const currentVersion = updateData.version;

    console.log("Локальный update.json:", updateData);

    const response = await fetch(remoteUpdateUrl + "?t=" + Date.now(), {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Ошибка сети: ${response.status}`);
    }

    let remoteUpdate;

    try {
      remoteUpdate = await response.json();
    } catch (e) {
      throw new Error("Не удалось распарсить JSON");
    }

    if (!remoteUpdate || !remoteUpdate.version) {
      throw new Error('Неверный формат данных: нет поля "version" в update.json');
    }

    const remoteVersion = remoteUpdate.version;

    console.log("remoteVersion:", remoteVersion, typeof remoteVersion);
    console.log("currentVersion:", currentVersion, typeof currentVersion);

    if (isNewerVersion(remoteVersion, currentVersion)) {
      console.log(`Доступна новая версия: ${remoteVersion}`);

      updateUrl = remoteUpdate.downloadUrl || updateData.downloadUrl || updateUrl;

      chrome.notifications.create("update-available", {
        type: "basic",
        iconUrl: "icons/128.png",
        title: "Доступно обновление!",
        message: `Вышла новая версия: ${remoteVersion}\nКликни на меня для скачивания новой версии!`,
        priority: 2
      });
    } else {
      console.log("Обновлений нет.");
    }
  } catch (error) {
    console.error("Ошибка при проверке обновления:", error);
  }
}

chrome.notifications.onClicked.addListener((id) => {
  if (id === "update-available") {
    chrome.tabs.create({ url: updateUrl });
  }
});

function isNewerVersion(a, b) {
  const partsA = String(a).trim().split(".").map(Number);
  const partsB = String(b).trim().split(".").map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const partA = partsA[i] || 0;
    const partB = partsB[i] || 0;

    if (partA > partB) return true;
    if (partA < partB) return false;
  }

  return false;
}

// =======================
// ✅ AUTH TOKEN CAPTURE
// =======================

function captureApiAuthorization(details) {
  if (!details.url.includes("/api/internal/vorwands/advanced-search")) return;

  const authHeader = details.requestHeaders?.find(
    h => h.name.toLowerCase() === "authorization"
  );

  if (authHeader?.value) {
    apiAuthorization = authHeader.value;
    console.log("✅ Authorization сохранён");
  }
}

chrome.webRequest.onBeforeSendHeaders.addListener(
  captureApiAuthorization,
  { urls: ["https://youla-api.2gis.ru/*"] },
  ["requestHeaders", "extraHeaders"]
);

function getApiHeaders() {
  const headers = {
    "Accept": "application/json, text/javascript, */*; q=0.01"
  };

  if (apiAuthorization) {
    headers["Authorization"] = apiAuthorization;
  } else {
    console.log("⚠️ Authorization ещё не получен");
  }

  return headers;
}

function waitForAuthorization(timeout = 1500) {
  return new Promise(resolve => {
    if (apiAuthorization) {
      resolve(apiAuthorization);
      return;
    }

    const start = Date.now();

    function check() {
      if (apiAuthorization) {
        resolve(apiAuthorization);
        return;
      }

      if (Date.now() - start >= timeout) {
        console.log("⛔ Authorization не появился за время ожидания");
        resolve(null);
        return;
      }

      setTimeout(check, 100);
    }

    check();
  });
}

// =======================
// ✅ API HELPERS
// =======================

async function readJsonResponse(res, label = "api") {
  const text = await res.text();

  console.log(`${label} response status:`, res.status);

  if (!res.ok) {
    console.log(`${label} error text:`, text);
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  if (!text) {
    console.log(`⚠️ ${label}: API вернул пустой ответ`);

    return {
      paging: {
        resultItems: [],
        total: 0
      }
    };
  }

  const data = JSON.parse(text);

  const items = data?.paging?.resultItems || [];
  const total = data?.paging?.total || 0;

  console.log(`📦 ${label} полный JSON:`, data);
  console.log(`📊 ${label}: total = ${total}, items на странице = ${items.length}`);

  console.table(
    items.map(item => ({
      id: item.id,
      branch: item.branch,
      status: item.status,
      resolution: item.resolution,
      planDateUtc: item.planDateUtc,
      creationDateUtc: item.creationDateUtc,
      title: item.title
    }))
  );

  return data;
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

// =======================
// ✅ WEB REQUEST HANDLE
// =======================

async function handleRequest(details) {
  if (details.tabId < 0) {
    console.log("⏭ Запрос не из вкладки, пропускаем:", details.url);
    return;
  }

  if (details.url.includes("/api/internal/vorwands/advanced-search")) {
    lastAdvancedSearchUrl = details.url;
  }

  if (isProcessing) {
    console.log("⛔ Уже обрабатываем — пропуск");
    return;
  }

  if (details.url.includes("planDateRanges=0") || details.url.includes("planDateRanges=1")) return;

  if (!details.url.includes("/api/internal/vorwands/advanced-search")) return;

  isProcessing = true;

  try {
    console.log("Перехвачено:", details.url);

    await waitForAuthorization();

    const baseExpired = new URL(details.url);
    baseExpired.searchParams.set("planDateRanges", "0");

    const baseToday = new URL(details.url);
    baseToday.searchParams.set("planDateRanges", "1");

    let allExpired = [];
    let allToday = [];

    let from = 0;
    let page = 0;

    const MAX_PAGES = 5;
    const MAX_ITEMS = 250;

    while (true) {
      if (page >= MAX_PAGES) break;
      if (allExpired.length >= MAX_ITEMS || allToday.length >= MAX_ITEMS) break;

      baseExpired.searchParams.set("from", String(from));
      baseToday.searchParams.set("from", String(from));

      const urlExpired = baseExpired.toString();
      const urlToday = baseToday.toString();

      console.log("📡 Запрос from =", from);

      const [rExpired, rToday] = await Promise.all([
        fetch(urlExpired, {
          credentials: "include",
          headers: getApiHeaders()
        }),
        fetch(urlToday, {
          credentials: "include",
          headers: getApiHeaders()
        })
      ]);

      const dataExpired = parseIds(await readJsonResponse(rExpired, "expired"));
      const dataToday = parseIds(await readJsonResponse(rToday, "today"));

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
    }, () => {
      if (chrome.runtime.lastError) {
        console.log("⚠️ Не удалось отправить vorwandData:", chrome.runtime.lastError.message);
      }
    });

    console.log("✅ ДАННЫЕ ОТПРАВЛЕНЫ");
  } catch (e) {
    console.error("❌ Ошибка:", e);
  } finally {
    isProcessing = false;
  }
}

// =======================
// ✅ INTERCEPT CONTROL
// =======================

const filter = {
  urls: ["https://youla-api.2gis.ru/*"]
};

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

// =======================
// ✅ MESSAGES
// =======================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("получено состояние:", msg.type);

  if (msg.type === "check_update") {
    console.log("получена команда на проверку обновления");

    checkForUpdate();

    sendResponse({ ok: true });
    return;
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
    return;
  }

  if (msg.type === "contact") {
    const value = msg.value;

    console.log("📨 contact:", value);

    const url = `https://youla-api.2gis.ru/api/internal/vorwands/advanced-search?searchString=${encodeURIComponent(value)}&pageSize=50&from=0`;

    waitForAuthorization()
      .then(() => {
        return fetch(url, {
          method: "GET",
          credentials: "include",
          headers: getApiHeaders()
        });
      })
      .then(res => readJsonResponse(res, "contact"))
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
        console.error("❌ API error contact:", err);

        sendResponse({
          count: 0,
          links: []
        });
      });

    return true;
  }

  if (msg.type === "filter") {
    const url = msg.url;

    console.log("📨 filter URL:", url);

    waitForAuthorization()
      .then(() => {
        return fetch(url, {
          method: "GET",
          credentials: "include",
          headers: getApiHeaders()
        });
      })
      .then(res => readJsonResponse(res, "filter"))
      .then(data => {
        console.log("📦 API ответ фильтра:", data);

        const count = data?.paging?.total || 0;

        sendResponse({
          count: count
        });
      })
      .catch(err => {
        console.error("❌ API error filter:", err);

        sendResponse({
          count: 0
        });
      });

    return true;
  }
});
