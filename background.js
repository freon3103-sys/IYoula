console.log("✅ background.js запущен");

let isProcessing = false;
let lastAdvancedSearchUrl = null;

let updateUrl = "https://freon3103-sys.github.io/IYoula/update-page.html"; // ссылка которая открывается при нажатии на уведомление об обновлении
const update_id = "тест 1"

const remoteUpdateUrl = "https://freon3103-sys.github.io/IYoula/update.json"; // ссылка с документом с актуальной версией расширения
const localUpdateUrl = chrome.runtime.getURL("manifest.json"); // ссылка с документом с локальной версией расширения

let first_enableIntercept = false // флаг первого перехвата

// =======================
// ✅ Блок проверки обновления
// =======================

// функция проверки обновления
async function checkForUpdate() {
  
  console.log("запускается проверка обновления");

  try {
    const localResponse = await fetch(localUpdateUrl, { // получаем файл с локальной версией расширения
      cache: "no-store"
    });

    if (!localResponse.ok) {
      throw new Error(`Ошибка локального manifest.json: ${localResponse.status}`);
    }

    const updateData = await localResponse.json(); // получаем json
    const currentVersion = updateData.version; // получаем версию

    console.log("Локальный manifest.json:", updateData);

    const response = await fetch(remoteUpdateUrl + "?t=" + Date.now(), { // получаем файл с актуальной версией расширения
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Ошибка сети: ${response.status}`);
    }

    let remoteUpdate;

    try {
      remoteUpdate = await response.json(); // получаем json
    } catch (e) {
      throw new Error("Не удалось распарсить JSON");
    }

    if (!remoteUpdate || !remoteUpdate.version) {
      throw new Error('Неверный формат данных: нет поля "version" в update.json');
    }

    if (remoteUpdate.enabled === false) {
    console.log("ℹ️ Уведомления об обновлении отключены в update.json");
    return;
    }

    const remoteVersion = remoteUpdate.version; // получаем версию

    console.log("remoteVersion:", remoteVersion, typeof remoteVersion);
    console.log("currentVersion:", currentVersion, typeof currentVersion);

    if (isNewerVersion(remoteVersion, currentVersion)) { // производим сравнение
      console.log(`Доступна новая версия: ${remoteVersion}`);

      chrome.notifications.create(update_id, {
        type: "basic",
        iconUrl: "icons/128.png",
        title: "Доступно обновление!",
        message: `Вышла новая версия: ${remoteVersion}\nКликни на меня для скачивания новой версии!`,
        priority: 2
      }, (notificationId) => {
        if (chrome.runtime.lastError) {
          console.error(
            "❌ Ошибка создания уведомления:",
            chrome.runtime.lastError.message
          );
          return;
        }

        console.log("✅ Уведомление создано:", notificationId);
      });
      
    } else {
      console.log("Обновлений нет.");
    }

  } catch (error) {
    console.error("Ошибка при проверке обновления:", error);
  }
}

// функция сравнения версии
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

// переход по клику для уведомления
chrome.notifications.onClicked.addListener((id) => {
  if (id === update_id) {
    chrome.tabs.create({ url: updateUrl });
  }
});

// =======================
// ✅ Блок получения токена от content
// =======================

// функция получение JWT
async function getApiHeadersForTab(tabId) {
  const token = await getJwtFromTab(tabId);

  if (!token) {
    throw new Error("Требуется авторизация");
  }

  return buildApiHeaders(token);
}

// отправка запроса в content
function getJwtFromTab(tabId) {
  return new Promise((resolve) => {
    if (tabId === undefined || tabId < 0) {
      console.log("⚠️ Это не вкладка");
      resolve(null);
      return;
    }

    chrome.tabs.sendMessage(
      tabId,
      { type: "getJWT" },
      (response) => {
        if (chrome.runtime.lastError) {
          console.log(
            "⚠️ Не получилось получить токен из content",
            chrome.runtime.lastError.message
          );

          resolve(null);
          return;
        }

        resolve(response?.token || null);
      }
    );
  });
}

// создание json токена
function buildApiHeaders(token) {
  if (!token) {
    throw new Error("Требуется авторизация");
  }

  return {
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Authorization": token
  };
}

// =======================
// ✅ Блок обработки АПИ запросов
// =======================

// чтение ответа от АПИ
async function readJsonResponse(res, label = "api") {
  const text = await res.text();

  console.log(`${label} response status:`, res.status);

  if (res.status === 401) {
    console.log(`⛔ ${label}: Authorization невалидный или истёк`);
  
    throw new Error("HTTP 401: Authorization невалидный или истёк");
  }

  if (!res.ok) {
    console.log(`${label} error text:`, text.slice(0, 300));
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
  const from = data?.paging?.from;
  const pageSize = data?.paging?.pageSize;

  console.log(`📊 ${label}: total=${total}, from=${from}, pageSize=${pageSize}, items=${items.length}`);

  return data;
}

// обработка ответа от АПИ
function parseIds(data) {
  if (!data.paging || !data.paging.resultItems) return [];

  return data.paging.resultItems.map(item => ({
    id: String(item.id),
    date: item.planDateUtc,
    branch: item.branch,
    title: item.title
  }));
}

// =======================
// ✅ Блок перехвата и отправки запросов
// =======================

// перехват и отправка запросов по поиску
async function handleRequest(details) {
  
  if (details.tabId < 0) { // не обрабатываем запросы от расширений
    console.log("⏭ Запрос не из вкладки, пропускаем:", details.url);
    return;
  }

  if (details.url.includes("/api/internal/vorwands/advanced-search")) { // сохраняем последней запрос к АПИ
    lastAdvancedSearchUrl = details.url;
  }

  if (isProcessing) { // не запускаем повторную обработку
    console.log("⛔ Уже обрабатываем — пропуск");
    return;
  }

  if ( // Не обрабатываем запросы, которые расширение само делает для подсветки
    details.url.includes("planDateRanges=0") ||
    details.url.includes("planDateRanges=1")
  ) {
    return;
  }

  if (!details.url.includes("/api/internal/vorwands/advanced-search")) return; // если не из поиска

  isProcessing = true; // включаем флаг чтобы не запускать несколько одинаковых запросов

  try {
    console.log("Перехвачено:", details.url);

    const headers = await getApiHeadersForTab(details.tabId); // получаем токен

    const baseExpired = new URL(details.url);
    baseExpired.searchParams.set("planDateRanges", "0"); // создаем апи запросы для истекших или истекаемых

    const baseToday = new URL(details.url);
    baseToday.searchParams.set("planDateRanges", "1");

    let allExpired = [];
    let allToday = [];

    let from = 0;
    let page = 0;

    const MAX_PAGES = 5;
    const MAX_ITEMS = 250;
    const PAGE_SIZE = 50;

    while (true) {
      if (page >= MAX_PAGES) break;
      if (allExpired.length >= MAX_ITEMS || allToday.length >= MAX_ITEMS) break;

      baseExpired.searchParams.set("from", String(from));
      baseExpired.searchParams.set("pageSize", String(PAGE_SIZE));

      baseToday.searchParams.set("from", String(from));
      baseToday.searchParams.set("pageSize", String(PAGE_SIZE));

      const urlExpired = baseExpired.toString();
      const urlToday = baseToday.toString();

      console.log("📡 Запрос from =", from);

      const [rExpired, rToday] = await Promise.all([
        fetch(urlExpired, {
          credentials: "include",
          headers
        }),
        fetch(urlToday, {
          credentials: "include",
          headers
        })
      ]);

      const dataExpired = parseIds(await readJsonResponse(rExpired, `expired from=${from}`));
      const dataToday = parseIds(await readJsonResponse(rToday, `today from=${from}`));

      console.log("Ответ:", dataExpired.length, dataToday.length);
      console.log("Ответ:", dataExpired, dataToday);

      if (dataExpired.length === 0 && dataToday.length === 0) break;

      allExpired.push(...dataExpired);
      allToday.push(...dataToday);

      if (dataExpired.length < PAGE_SIZE && dataToday.length < PAGE_SIZE) { // Если обе выборки вернули меньше PAGE_SIZE — дальше страниц нет
        console.log("✅ Больше страниц нет — останавливаем цикл");
        break;
      }

      from += PAGE_SIZE;
      page++;
    }

    console.log("🟥 expired итог:", allExpired.length);
    console.log("🟨 today итог:", allToday.length);

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

// =======================
// ✅ Блок перехвата
// =======================

const filter = {
  urls: ["https://youla-api.2gis.ru/*"]
};

// включаем перехват
function enableIntercept() {

  if (!first_enableIntercept) {
    console.log("это первое включение ON");
    first_enableIntercept = true
  }
  if (chrome.webRequest.onBeforeRequest.hasListener(handleRequest)) return;

  chrome.webRequest.onBeforeRequest.addListener(handleRequest, filter);

  console.log("🟢 Перехват включён");
}

// выключаем перехват
function disableIntercept() {
  if (!chrome.webRequest.onBeforeRequest.hasListener(handleRequest)) return;

  chrome.webRequest.onBeforeRequest.removeListener(handleRequest);

  console.log("🛑 Перехват выключен");
}

enableIntercept() // запускаем перехват базово

// =======================
// ✅ Блок обработки сообщенией от content
// =======================

// включаем ожидание сообщений от content
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("получено состояние:", msg.type);
  
  if (msg.type === "check_update") { // обновление
    console.log("получена команда на проверку обновления");

    checkForUpdate();

    sendResponse({ ok: true });
    return;
  }

  if (msg.type === "getLastAdvancedSearchUrl") { // последний запрос апи
    sendResponse({ url: lastAdvancedSearchUrl });
    return;
  }

  if (msg.type === "mapSelected") { // переключения состояния перехвата вкл/выкл
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

  if (msg.type === "contact") { // контакты
    const value = msg.value;
    const token = msg.token;

    console.log("📨 contact:", value);

    const url = `https://youla-api.2gis.ru/api/internal/vorwands/advanced-search?searchString=${encodeURIComponent(value)}&pageSize=50&sortField=CreationDateUtc&sortOrder=Descending&from=0`;

    (async () => {
      try {
        const headers = buildApiHeaders(token);

        const PAGE_SIZE = 50;
        const MAX_CONTACT_PAGES = 5; // максимум 250 ЗЦ в tooltip

        const baseUrl = new URL(url);

        let from = 0;
        let page = 0;
        let total = 0;
        let allItems = [];

        while (page < MAX_CONTACT_PAGES) {
          baseUrl.searchParams.set("from", String(from));
          baseUrl.searchParams.set("pageSize", String(PAGE_SIZE));

          const pageResponse = await fetch(baseUrl.toString(), {
            method: "GET",
            credentials: "include",
            headers
          });

          const pageData = await readJsonResponse(
            pageResponse,
            `contact from=${from}`
          );

          const pageItems = pageData?.paging?.resultItems || [];

          total = Number(pageData?.paging?.total || total);

          allItems.push(...pageItems);

          // Если элементов меньше страницы,
          // значит следующей страницы уже нет.
          if (pageItems.length < PAGE_SIZE) {
            break;
          }

          from += PAGE_SIZE;
          page++;
        }

        console.log("📦 API ответ contact получен");
        console.log(`📊 Найдено всего: ${total}, загружено для tooltip: ${allItems.length}`);

        const links = allItems.map(item => {
          return {
            url: `https://youla.2gis.local/vorwand#/id=${item.id}`,
            title: item.title,
            resolution: item.resolution
          };
        });

        sendResponse({
          count: total,
          links: links,
          value: value
        });

      } catch (err) {
        console.error("❌ API error contact:", err);

        sendResponse({
          count: 0,
          links: []
        });
      }
    })();

    return true;
  }

  if (msg.type === "filter") { // фильтры
    const url = msg.url;
    const token = msg.token;

    if (!token) {
      sendResponse({
        count: 0,
        authMissing: true
      });

      return;
    }

    fetch(url, {
      method: "GET",
      credentials: "include",
      headers: buildApiHeaders(token)
    })
      .then(res => readJsonResponse(res, "filter"))
      .then(data => {
        sendResponse({
          count: data?.paging?.total || 0
        });
      })
      .catch(error => {
        console.error("❌ Filter API error:", error);

        sendResponse({
          count: 0
        });
      });

    return true;
}
});