console.log("✅ content.js запущен")

// RoadMap
// total refactoring ⚠️
// Баг при отмене создания фильтра ⚠️
// Уведомление на кнопке закрыть зц ⚠️
// Исправить дублирование апи запросов ⚠️
// Добавлено открытие фильтра в новом окне по клику средней кнопки мыши ⚠️
// Версия базы данных: добавить в regdata ⚠️
// добавить СпидКамОнлайн ⚠️
// Приоритетность показа ЗЦ от открытых до закрытых или по резолюции, возможно кнопка выбора фильтров ⚠️
// Настроить версию базы данных + добавит версию базы данных онлайн ⚠️
// Сделать систему скачивания обновлнения через html страницу

// В списке показывать только зц кроме открытой
// новости уведомления пуши
// массовое изменение атрибутов зацепки
// поиск по -без тега (для поиска аудитных зц которым случайно не проставили тег)????
// Статистика по пользователю
// Добавление кнопок ссылка на яндекс поиск
// ФИАС добавить поиск в ФИАС по адресу
// Перевод резолюций на русский язык


// Проверка обновления версии
chrome.runtime.sendMessage({type: "check_update"});

// =======================
// ✅ Переменные
// =======================
let state_url // инфо на какой странице находится пользователь
let hashTimer // таймер для того чтобы hashchange не срабатывал слишком часто
let hash // переменная для хеша
let date_observer // переменная для обсервера даты
let datetimer // пуременная для таймера наблюдателя даты
let first_mainlogic // флаг запуска первого mainlogic
let hasVorwands // флаг наличия ЗЦ
let tbody // контейнер для ЗЦ
let domVersion = 0; // версия изменений DOM
let hashListenerStarted = false; // флаг начала слежения за DOM
let vorwandData = null // данные о ЗЦ, которые приходят из background
const cache = {} // переменная для информации об отправленных запросах на контакты
let mapButtonObserver = null; // переменная для обсервера на кнопку карты
let observedMapButton = null; // для кнопки карты
let lastMapSelectedValue = null; // флаг для понимания можно ли отправлять в background что-то или нет

// =======================
// ✅ Функция инициализации расширения
// =======================

async function init() {
  console.log("🚀 init старт");

  chrome.runtime.onMessage.addListener(handleRuntimeMessage);  // следим за ответами от background

  const url = window.location.href;  // получаем хеш
  state_url = check_innerurl(url);  // проверяем где находится пользователь

  console.log("Страница:", state_url);

  if (state_url === "other") {
    console.log("init: Это не Youla");
    return;
  }

  if (state_url === "search") {
    console.log("init: Это страница поиска");

    hasVorwands = await waitForSearchReady(); // ждем прогрузку страницы поиска

    console.log("✅ init получил готовую страницу поиска");

    start_DOMchange(); // запуск слежки за изменением DOM
    start_hashchange(); // запуск слежки за изменением хеша
    observeMapButton(); // запуск слежки за изменением кнопки карты

    if (checkMapMode()) { // Если пользователь находится на карте — search-логику не запускаем.
      return;
    }

    mainlogic(); // запускаем один раз главную логику

    return;
  }

  if (state_url === "id") {
    console.log("init: Это страница ЗЦ");

    document.addEventListener("click", handleCloseExpiredVorwand, true); // отслеживаем клик пользователя на кнопку закрытия зц
    
    mainlogic(); // запускаем один раз главную логику
    start_date_DOMchange() // запуск слежки за изменением хеша
    
  }
}

// проверяет на какой странице находится пользователь
function check_innerurl(url) {
  if (url.includes("vorwands#/search")) return "search"; // Страница поиска
  if (url.includes("vorwand#/id=") || url.includes("/mytasks/id=")) return "id"; // Страница зацепки
  return "other"; // Другая страница
}

// функция для получения сообщений от background
function handleRuntimeMessage(msg, sender, sendResponse) {
  if (msg.type === "vorwandData") { // пришла информация по списку зц
    console.log("📦 Получены данные:", msg);

    vorwandData = msg;

    if (hasVorwands) {
      updateVisibleRows();
    }
  }
  
  if (msg.type === "getJWT") { // если для поиска нужен JWT
  const rawToken = localStorage.getItem("youlaJwt");

  const token = rawToken
    ? (rawToken.startsWith("Bearer ")
      ? rawToken
      : `Bearer ${rawToken}`)
    : null;

  sendResponse({ token });

  return true;
}
}

// =======================
// ✅ Главная функция
// =======================

function mainlogic() {

  if (!first_mainlogic) {
    console.log("🚀 это первый mainlogic");
    first_mainlogic = true; // устанавливаем флаг, чтобы не срабатывал первый запуск при запуске при смене хеша
  }

  console.log("🚀 mainlogic старт:", state_url);

  if (state_url === "search") {
    
    console.log("mainlogic: это страница поиска");
    draw_filters(); // отрисовываем фильтры

    if (!hasVorwands) {
      console.log("ℹ️ В текущем поиске ЗЦ нет, подсветка не нужна");
      return;
    }

    updateVisibleRows(); // обновляем подсветку

    return;
  }

  if (state_url === "id") {
    console.log("📄 Логика страницы ЗЦ");

    updatedate(); // проверка даты
    waitForMail([ // обработка контактов
      'a[href^="fiji://editBySysCode/"]',
      'a[href^="mailto:"]',
      'a[href*="vk.com"]',
      'a[href*="plus.google.com"]'
    ], () => {
      console.log("✅ Контакты страницы готовы запускаю обработку");

      processContacts(); // получение и отправка контактов
      
    });
    
    checkPage(); // обработка ссылок
  }
    

}

// получаем JWT Token
function getYoulaJwt() {
  const rawToken = localStorage.getItem("youlaJwt");

  if (!rawToken) {
    console.log("⚠️ youlaJwt not found");
    return null;
  }

  return rawToken.startsWith("Bearer ")
    ? rawToken
    : `Bearer ${rawToken}`;
}

// =======================
// ✅ Блок поиска
// =======================

// ожидает прогрузку страницы поиска
function waitForSearchReady() {
  return new Promise((resolve) => { // создаем промайс чтобы расширение ожидало прогрузку поиска
    function check() {
      const totalElement = document.querySelector( // получаем надпись о кол-ве зц
        'span[data-bind*="vorwandsTotal"]' 
      );

      tbody = document.querySelector(
        'tbody[data-bind*="foreach"]' // получаем блок где находятся зц
      );

      const vorwandLinks = document.querySelectorAll( // получаем список зц на странице
        "a.vorwand-id"
      );

      if (!totalElement) { // Счётчика ещё нет
        console.log("⏳ Нет счётчика ЗЦ");
        setTimeout(check, 300);
        return;
      }

      const totalText = totalElement.textContent.trim(); // поулачем кол-во зц из надписи

      if (totalText === "") { // Элемент уже появился, но значение ещё не записано
        console.log("⏳ Счётчик появился, но число ещё не загрузилось");
        setTimeout(check, 300);
        return;
      }

      const total = Number(totalText); // переводим текст в число

      if (Number.isNaN(total)) { // Текст есть, но это не число
        console.log("⏳ Некорректное значение счётчика:", totalText);
        setTimeout(check, 300);
        return;
      }

      if (total === 0) { // ✅ 0 ЗЦ — это нормальная завершённая загрузка, а tbody и a.vorwand-id могут не появиться.
        console.log("✅ Поиск готов: ЗЦ не найдены");
        resolve(false);
        return;
      }

      if (!tbody || vorwandLinks.length === 0) { // Если ЗЦ есть — должны появиться таблица и ссылки.
        console.log("⏳ ЗЦ есть, но список ещё не прогрузился:", {
          total,
          tbody: Boolean(tbody),
          links: vorwandLinks.length
        });

        setTimeout(check, 300);
        return;
      }

      const expectedLinks = Math.min(total, 50); // получаем значение 50 или кол-во зц

      if (vorwandLinks.length < expectedLinks) { // проверяем прогрузились ли все ЗЦ
        console.log("⏳ Поиск готов, но не все зацепки прогрузились", {
        total,
        links: vorwandLinks.length
      });

      setTimeout(check, 300);
      return;
      }

      console.log("✅ Поиск полностью готов:", {
        total,
        links: vorwandLinks.length
      });

      resolve(true);
    }

    check();
  });
}

// следим за изменением в DOM
function start_DOMchange() {
  
  let timer; // устанавливаем таймер
  const observer = new MutationObserver(() => { // устанавливаем слежку за изменениями в DOM
    clearTimeout(timer); // очищаем таймер
    timer = setTimeout(() => { // устанавливаем таймер и обновляем подсветку
      domVersion++; // изменяем версию DOM

      console.log("📦 DOM изменился. Версия:", domVersion);
      updateVisibleRows(); // запускаем обновление строк
    }, 200);
  });

  observer.observe(document.body, { childList: true, subtree: true }); // уточняем наблюдения за конкретным элементом
}

// следим за изменением хеша
function start_hashchange() {
  if (hashListenerStarted) {
    console.log("⚠️ Наблюдение за hashchange уже установлено");
    return;
  }

  hashListenerStarted = true;

  console.log("✅ Устанавливаем наблюдение за сменой хеша");

  window.addEventListener("hashchange", () => { // устанавливаем слежку за изменениями в хеше
    const versionBeforeHashChange = domVersion; // сохраняем предыдущую версию хеша

    clearTimeout(hashTimer); // очищаем таймер смены хеша

    hashTimer = setTimeout(async () => {
      console.log("🔄 Произошла смена хеша");

      hash = window.location.hash; // сохраняем хеш
      state_url = check_innerurl(window.location.href); // проверяем где находится пользователь

      console.log("Текущая страница после hashchange:", state_url);

      if (state_url === "search") {
        
        if (checkMapMode()) { // Если активна карта — не ждём и не запускаем обработку списка.
          return;
        }

        console.log(
          "⏳ Ждём изменения DOM после смены фильтра. Версия:",
          versionBeforeHashChange
        );

        await waitForDOMChange(versionBeforeHashChange); // проверяем поменялся ли DOM

        hasVorwands = await waitForSearchReady(); // ждем прогрузки страницы

        console.log("✅ Новый список поиска готов:", hasVorwands);

        observeMapButton(); // ставим observer и проверяем на карте ли мы
        mainlogic(); // запускаем основную логику

        return;
      }

      if (state_url === "id") {
        mainlogic(); // запускаем основную логику
      }
    }, 300);
  });
}

// функция которая запускает функцию по обновлению строк
function updateVisibleRows() {
  if (!vorwandData) return;

  console.log("🔄 Обновляем строки");
  highlightList(vorwandData.expired, "expired");
  highlightList(vorwandData.today, "today");
}

function highlightList(list, kind) { // Подсвечивает нужные сискоды
  if (!list || !list.length) return; // Прерывает функцию если список пуст

  const ids = new Set(list.map(x => String(x.id))); // создает множество с id из нужного массива

  document.querySelectorAll("a.vorwand-id").forEach(link => { // Находим все элементы с id на странице
    const match = link.href.match(/id=(\d+)/); // Вытаскиваю из найденных объектов конкретные id
    if (!match) return; // если id на странице нет, то прерываем

    const id = match[1]

    if (ids.has(id)) { // Проверяем есть ли id в списке от API и подсвечиваем нужным цветом
      if (kind === "expired") {
        link.style.backgroundColor = "rgba(255, 0, 0, 0.3)";
      } else if (kind === "today") {
        link.style.backgroundColor = "rgba(255, 255, 0, 0.3)";
      }
    }
  });
}

// функция проверки находимся ли мы на карте
function checkMapMode() {
  const mapActive = isMapMode(); // проверка активна ли кнопка карта

  if (mapActive) {
    console.log("🗺 Активна карта — обработка поиска отключена");
    sendMapSelected(true);
    return true;
  }

  console.log("📋 Активен список — обработка поиска разрешена");
  sendMapSelected(false);

  return false;
}

// проверка активна ли кнопка карта
function isMapMode() {
  const totalBlock = document.querySelector(".vorwands-total"); // получение надписи выбрано на карте
  const mapButton = document.querySelector("#vws-view-map"); // получение кнопки карта

  const isMapActive = mapButton?.classList.contains("active"); // проверка активна ли она

  const hasMapSelection = // получение boolean от надписи выбрано на карте
    totalBlock &&
    totalBlock.textContent.includes("Выбрано на карте");

  return Boolean(isMapActive || hasMapSelection); // если хоть что-то true, то перехват выключается
}

// функция отправки в bg о переключении слежения
function sendMapSelected(value) {

  if (lastMapSelectedValue === value) {
    return;
  }

  lastMapSelectedValue = value;

  console.log("🗺 отправляем mapSelected:", value);

  chrome.runtime.sendMessage({
    type: "mapSelected",
    value: value
  });
}

// время ожидаения пока появится весь DOM
function waitForDOMChange(previousVersion, timeout = 3000) {
  return new Promise((resolve) => {
    const start = Date.now();

    function check() {
      if (domVersion > previousVersion) { // если версия DOM поменялась
        console.log("✅ DOM изменился:", previousVersion, "→", domVersion);
        resolve(true);
        return;
      }

      if (Date.now() - start >= timeout) {
        console.log("⏳ DOM не изменился за время ожидания");
        resolve(false);
        return;
      }

      setTimeout(check, 100);
    }

    check();
  });
}

// ставим обсервер на кнопку карты
function observeMapButton() {
  const mapButton = document.querySelector("#vws-view-map");

  if (!mapButton) {
    console.log("⏳ Кнопка карты ещё не появилась");

    setTimeout(observeMapButton, 300);
    return;
  }

  if (mapButtonObserver && observedMapButton === mapButton) {
    return;
  }

  if (mapButtonObserver) { // Если SPA пересоздала кнопку — отключаем старый observer
    mapButtonObserver.disconnect();
    mapButtonObserver = null;
  }

  observedMapButton = mapButton;

  console.log("✅ Кнопка карты найдена, ставим observer");

  mapButtonObserver = new MutationObserver(() => {
    const isMapActive = mapButton.classList.contains("active");

    console.log("🗺 Изменился класс кнопки карты. active:", isMapActive);

    sendMapSelected(isMapActive);
  });

  mapButtonObserver.observe(mapButton, {
    attributes: true,
    attributeFilter: ["class"]
  });

  checkMapMode(); // Сразу отправляем текущее состояние
}

// =======================
// ✅ Блок фильтров
// =======================
async function draw_filters(attempt = 0) {
  const filters = await new Promise(resolve => {
    chrome.storage.local.get(["savedFilters"], (res) => { // получаем сохраненные фильтры из хранилища расширения
      resolve(res.savedFilters || []);
    });
  });

  console.log("📦 фильтры:", filters);

  const anchor = [...document.querySelectorAll("a")]
    .find(a => a.textContent.includes("Перейти обратно к карте")); // находим кнопку после которой будем вставлять фильтры

  if (!anchor) {
    if (attempt > 10) {
      console.log("❌ якорь так и не появился");
      return;
    }

    setTimeout(() => draw_filters(attempt + 1), 300);
    return;
  }

  const old = document.querySelector("#my-filters"); // если уже есть фильтр, то удаляем
  if (old) old.remove();

  const container = document.createElement("div");
  container.id = "my-filters";
  container.style.cssText = `
    border:2px solid #FAF0E6;
    border-radius:15px;
    padding:10px;
    display:flex;
    gap:8px;
    flex-wrap:wrap;
    margin-top:10px;
  `;

  const saveBtn = document.createElement("button"); // кнопка сохранения
  saveBtn.textContent = "💾";
  saveBtn.title = "Сохранить текущий фильтр";
  saveBtn.onclick = async () => {
    const filter = await getCurrentFilter();
    if (filter) saveFilter(filter);
  };

  container.appendChild(saveBtn);

  const reloadBtn = document.createElement("button");   // кнопка обновления
    reloadBtn.textContent = "⟳";
    reloadBtn.title = "Обновить";
    reloadBtn.onclick = () => {
    console.log("обновляем информацию по ЗЦ")
    reload_filter(window.location.hash);
  };

  if (filters.length === 0) { // если фльтров в памяти нет
    const empty = document.createElement("div");
    empty.textContent = "Нет сохранённых фильтров";
    container.appendChild(empty);
  }

  filters.forEach((filter, index) => {   // рисуем фильтры
    const wrapper = document.createElement("div"); // создание оболочки
    wrapper.style.display = "flex";
    wrapper.style.gap = "4px";

    const btn = document.createElement("button"); // рисуем кнопку
    btn.textContent = filter.name;
    btn.style.cursor = "pointer";
    btn.onclick = () => applyFilter(filter);
    
    btn.addEventListener("mousedown", (evt) => { // Отключаем автопрокрутку при нажатии колёсика
      if (evt.button === 1) {
        evt.preventDefault();
      }
    });
    btn.addEventListener("auxclick", (evt) => { // следим за нажатием кнопки
      if (evt.button !== 1) return;

      evt.preventDefault();

      const url = new URL(window.location.href);
      url.hash = filter.query;

      window.open(url.toString(), "_blank");

    })
    if (normalizeHash(window.location.hash) === normalizeHash(filter.query)) { // переводим в нормальный формат
      btn.style.border = "2px solid #2091dd";
    }

    const countSpan = document.createElement("span");
    countSpan.textContent = " (⋮)"; // счетчик

    const menuBtn = document.createElement("button"); // кнопка меню
    menuBtn.textContent = "⋮";
    menuBtn.style.cursor = "pointer";
    menuBtn.style.position = "relative";
    menuBtn.style.cursor = "pointer";

    const menu = document.createElement("div"); // создаем всплывающим список меню
    menu.style.position = "absolute";
    menu.style.top = "20px";
    menu.style.right = "0";
    menu.style.background = "#fff";
    menu.style.border = "1px solid #ccc";
    menu.style.padding = "5px";
    menu.style.display = "none";
    menu.style.zIndex = "9999";
    menu.style.minWidth = "120px";

    const saveItem = document.createElement("div"); // создаем кнопку сохранения
    saveItem.textContent = "💾 Сохранить";
    saveItem.style.cursor = "pointer";
    saveItem.style.padding = "4px";

    saveItem.onclick = async () => {
      const apiUrl = await getLastAdvancedSearchUrl(); // получаем последний api запрос для сохранения
      
      if (!apiUrl) { // если нет апи выдаем сообщение
      alert("Не удалось получить запрос api, попробуйте обновить страницу");
      return;
    }

      const updated = {
        name: filter.name,
        query: window.location.hash,
        apiUrl
      };

      saveFilter(updated); // сохраняем фильтр
    };

    const delItem = document.createElement("div"); // создаем кнопку сохранения
    delItem.textContent = "🗑️ Удалить";
    delItem.style.cursor = "pointer";
    delItem.style.padding = "4px";

    delItem.onclick = () => {
      deleteFilter(index);
    };

    const editItem = document.createElement("div"); // создаем кнопку сохранения
    editItem.textContent = "✏️ Изменить";
    editItem.style.cursor = "pointer";
    editItem.style.padding = "4px";

    editItem.onclick = () => {
      const newName = prompt("Новое имя", filter.name);
      if (!newName) return;

      updateFilterName(index, newName);
    };

    menu.appendChild(saveItem);
    menu.appendChild(editItem);
    menu.appendChild(delItem);
    menuBtn.appendChild(menu);

    menuBtn.onclick = (e) => {
      e.stopPropagation();
      menu.style.display = menu.style.display === "none" ? "block" : "none"; // если нажимается меню, то появляется и исчезает
    };

    document.addEventListener("click", () => { // если нажимается на любом месте, то меню точно исчезает
      menu.style.display = "none";
    });

    wrapper.appendChild(btn);
    wrapper.appendChild(menuBtn);
    wrapper.appendChild(countSpan);

    container.appendChild(wrapper);

    try { // ✅ запрос count
      const url = buildApiUrl(filter);
      const token = getYoulaJwt();

      chrome.runtime.sendMessage(
        { type: "filter", url, token },
        (res) => {
          countSpan.textContent = ` (${res?.count || 0})`;
        }
      );
    } catch (e) {
      console.log("❌ Ошибка построения apiUrl:", e, filter);
      countSpan.textContent = " (!)";
    }
    
  });
  container.appendChild(reloadBtn); // добавляем кнопку обновления
  anchor.after(container); // добавляем весь блок фильтров на экран
}

// получение текущего фильтра
async function getCurrentFilter() {
  const currenthash = window.location.hash;

  if (!currenthash.includes("/search")) return null;

  const user_text = prompt("Название фильтра");

  if (user_text === null) { // если пользователь отменил создание фильтра
    console.log("Сохранение фильтра отменено");
    return null;
  }

  const name = user_text.trim() || "Без названия";

  const apiUrl = await getLastAdvancedSearchUrl();

  console.log("💾 сохраняем фильтр:", {
    name,
    query: currenthash,
    apiUrl
  });

  return {
    name,
    query: currenthash,
    apiUrl
  };
}

// получение api запроса для записи в фильтр
function getLastAdvancedSearchUrl() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(
      { type: "getLastAdvancedSearchUrl" },
      (res) => {
        resolve(res?.url || null);
      }
    );
  });
}

// сохранение
function saveFilter(filter) {
  chrome.storage.local.get(["savedFilters"], (res) => {
    const filters = res.savedFilters || [];

    const index = filters.findIndex(f => f.name === filter.name); // ищем по имени

    if (index !== -1) { // 🔄 обновляем существующий если поиск выдал не -1
      
      filters[index] = filter;
      console.log("🔄 фильтр обновлён");
    } else { // ➕ добавляем новый
      
      filters.push(filter);
      console.log("✅ фильтр добавлен");
    }

    chrome.storage.local.set({ savedFilters: filters }, () => {
      draw_filters();
    });
  });
}

// применение фильтра
function applyFilter(filter) {

  if (window.location.hash === filter.query) { // если фильтр применен обновляем страницу
    console.log("Фильтр уже применен, обновляем страницу")
    
    reload_filter(filter.query)

    return
  }

  window.location.hash = filter.query;
  console.log("Фильтр успешно применен")
}

// обновление списка и инфо по ЗЦ
function reload_filter(targetHash) {
  window.location.hash = "#/search";
  window.location.hash = targetHash;
}

// переводим в нормальный формат
function normalizeHash(value) {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return value || "";
  }
}

// удаление
function deleteFilter(index) {
  chrome.storage.local.get(["savedFilters"], (res) => {
    const filters = res.savedFilters || [];

    filters.splice(index, 1);

    chrome.storage.local.set({ savedFilters: filters }, () => {
      console.log("🗑 удалено");
      draw_filters();
    });
  });
}

// изменение названия фильтра
function updateFilterName(index, newName) {
  chrome.storage.local.get(["savedFilters"], (res) => {
    const filters = res.savedFilters || [];

    filters[index].name = newName;

    chrome.storage.local.set({ savedFilters: filters }, () => {
      console.log("✏️ обновлено");
      draw_filters();
    });
  });
}

// проверка правильно ли составлен запрос
function buildApiUrl(filter) {
  if (filter.apiUrl) {

    const url = new URL(filter.apiUrl);

    url.searchParams.delete("_"); // убираем cache-buster, если был
    url.searchParams.set("from", "0");

    return url.toString();
  }
}

// =======================
// ✅ Блок блокирования закрытия просроченныз ЗЦ
// =======================

// слежка за изменением DOM для страницы ЗЦ
function start_date_DOMchange() {

  console.log("запускаем обсервер на дату")
  
  date_observer = new MutationObserver(() => { // устанавливаем слежку за изменениями в DOM
    clearTimeout(datetimer); // очищаем таймер
    datetimer = setTimeout(() => { // устанавливаем таймер и обновляем подсветку
      domVersion++; // изменяем версию DOM

      console.log("📦 DOM даты изменился. Версия:", domVersion);
      updatedate(); // запускаем обновление цвета даты
    }, 200);
  });

  date_observer.observe(document.body, { childList: true, subtree: true }); // уточняем наблюдения за конкретным элементом
}


// Основная функция предотвращения закрытия зацепки
function handleCloseExpiredVorwand(evt) {
  const closeBtn = evt.target.closest(
    'a.btn.close-vorwand-force, a.btn.tags__toggle[href="#closeVorwandModal"]'
  );

  if (!closeBtn) return;

  if (window.date_status !== "expired") return;

  const proceed = confirm(
    "⚠️ Внимание!\nСрок ЗЦ истёк.\n\nПеред закрытием проверьте причину просрочки.\n\nВсё равно закрыть?"
  );

  if (!proceed) {
    evt.preventDefault();
    evt.stopImmediatePropagation();
    return false;
  }
}

// смена цвета даты
function updatedate() {

  console.log("Запуск updatedate")

  const statusEl = document.querySelector("div.control-panel_item.control-panel_item__left span") // находит состояние ЗЦ
  
  if (!statusEl) { // если состояние еще не появилось, то повторяем запрос
    setTimeout(updatedate, 400);
    return
  }

  const status_zc = statusEl.textContent.trim(); // получаем текст

  if (status_zc === "Обработана") { // если зц обработана, то прекращаем выполнение функции
    console.log("✅ ЗЦ обработана — дата не нужна");
    return
  }

  const dodate = document.querySelector("a.vorwand-datepicker.territories-allocation_datepicker"); // находит дату

  if (!dodate) {
    console.log("⏳ элемент даты не найден…");
    setTimeout(updatedate, 400);
    return;
  }
  const ex_date = dodate.textContent.trim();
  if (!ex_date) { // проверяет есть ли дата
    console.log("⏳ текст даты не готов…");
    setTimeout(updatedate, 400);
    return;
  }

  console.log("Дата найдена:", ex_date);
  window.date_status = check_date(ex_date); // проверяет дату на истечение срока
  highlight_date(window.date_status); // подсветка даты
}

// проверяет дату на истечение срока
function check_date(date) { 
  const [day, month, year] = date.split('.').map(Number);
  const target = new Date(2000 + year, month - 1, day);
  const today = new Date();
  today.setHours(0,0,0,0);

  const diff = target - today;

  if (diff < 0) return "expired";
  if (diff === 0) return "today";
  return "ok";
}

// подсветка даты
function highlight_date(kind) {
  const dodate = document.querySelector("a.vorwand-datepicker.territories-allocation_datepicker");

  if (!dodate) return;

  dodate.style.backgroundColor = ""; // очищаем вначале

  if (kind === "expired") {
    dodate.style.backgroundColor = "rgba(255, 0, 0, 0.44)";
  } else if (kind === "today") {
    dodate.style.backgroundColor = "rgba(255, 255, 0, 0.55)";
  }
}

// =======================
// ✅ Блок инфо по пользователю
// =======================

// функция для ожидания появления контактов
function waitForMail(selectors, callback) {

    console.log("waitformail запущен")

    const timeout = 5000; // время которое ждет ответ
    const start = Date.now(); // время старта для отсчета

    console.log("первая проверка на селектор")
    const found = findFirstContactElement(selectors); // сразу проверяем

    if (found) {
        console.log("✅ найдено сразу");
        callback();
        return;
    }

    console.log("Еще не появился начинаю наблюдение")

    const observer = new MutationObserver(() => { // создание обсервера для проверки появления контактов
        const el = findFirstContactElement(selectors);
        if (el) {
            console.log("✅ найдено через observer");
            observer.disconnect();
            clearTimeout(timer);
            callback(); // один общий callback
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    const timer = setTimeout(() => {
        console.log("⛔ Таймаут");
        observer.disconnect();
    }, timeout);
}

// функция для проверки селекторов на странице
function findFirstContactElement(selectors) {
    for (const selector of selectors) { // выбирается селектор
        const elements = document.querySelectorAll(selector); // находятся все элементы по селектору

        for (const el of elements) {

            if (selector.includes('mailto')) { // фильтр для mail
                const href = el.getAttribute("href") || "";

                if (href.includes("support@2gis.ru")) { // если это саппорт
                    continue; // пропускаем
                }
            }
            
            console.log("Найдены элементы: ", elements)
            return el; // ✅ нашли подходящий
        }
    }

    const divs = document.querySelectorAll('div');

    for (const div of divs) {
        const label = div.querySelector("b, strong");

        if (label && label.textContent.includes("Отправитель")) { // находим отправителя
            const text = div.innerText.replace("Отправитель", "").trim();

            if (text) {
                console.log("✅ найден отправитель");
                return div;
            }
        }
    }

    return null;
};

// получение контактов и отправка их в backgrounds
function processContacts() {
    console.log("начинаем processContacts")

    const contacts = getContacts(); // получение контактов

    console.log("📦 контакты:", contacts);

    contacts.forEach(contact => {
        send_background(contact); // отправка
    });
}

// получение контактов со страницы
function getContacts() { 

    console.log("getcontact запустился")

    const container = document.querySelector('div.vorwand-full-description'); // получение куска страницы с нужными данными
    const fiji_box = document.querySelectorAll('div.vorwand-full-links')[2] // получение контейнера с fiji

    if (!container) return [];

    console.log("container не пустой")

    const contacts = []; // создание списка под контакты

    //✅ syscode
    const map_sys = fiji_box ? fiji_box.querySelectorAll('a[href^="fiji://editBySysCode/"]') : []; // поиск всех ссылок на fiji
    console.log("fiji:", map_sys)

    map_sys.forEach(el => { // перебираем все ссылки и добавляем в contacts
        
        const href = el.getAttribute("href");
        const id = href.split("/").pop();

        if (!id) return;

        const result = `[${id}`;

        contacts.push({
            value: result,
            el: el // DOM элемент для последующей вставки
        })
    })

    console.log("fiji обработаны")
        

    // ✅ email
    const mailEls = container.querySelectorAll('a[href^="mailto:"]');
    console.log("mail:", mailEls)
    mailEls.forEach(el => {
        const email = el.getAttribute("href").replace("mailto:", "").trim();
        if (!email) return;

        contacts.push({
            value: email,
            el: el
        });
    });

    console.log("mail обработаны")

    // ✅ VK
    const vkEls = container.querySelectorAll('a[href*="vk.com"]');
    console.log("vk", vkEls)
    vkEls.forEach(el => {
        contacts.push({
            value: el.href,
            el: el
        });
    });

    console.log("vk обработаны")

    // ✅ Google+
    const googleEls = container.querySelectorAll('a[href*="plus.google.com"]');
    console.log("google", googleEls)
    googleEls.forEach(el => {
        contacts.push({
            value: el.href,
            el: el
        });
    });

    console.log("google обработаны")

    // ✅ отправитель
    const divs = container.querySelectorAll("div");

    divs.forEach(div => {
        const label = div.querySelector("b, strong");

        if (label && label.innerText.includes("Отправитель")) {
            const text = div.childNodes[div.childNodes.length - 1]?.textContent.trim(); // получаем всю ветку и берем последний элемент

            console.log("отправитель", div)

            if (!text) return;

            contacts.push({
                value: text,
                el: div
            });
        }
    });
    
    console.log("Nickname обработаны")

    console.log(contacts)
    return contacts
}

// отправка в background
function send_background(contact) {
    
    const token = getYoulaJwt();

    console.log("🚀 отправляю:", contact.value);

    if (cache[contact.value]) { // проверяем отправлялся ли запрос уже
        add_inf_to_element(contact.el, cache[contact.value]); // отрисовка
        return;
    }

    chrome.runtime.sendMessage( // отправка в back
        { type: "contact", value: contact.value, token },
        (response) => { // слушаем ответ
            if (!response) {
                console.log("❌ нет ответа");
                return;
            }

            cache[contact.value] = response; // добавляем в кеш ответ
            add_inf_to_element(contact.el, response); // отрисовка
        }
    );
}

// отрисовка счетчика контакта пользователя
function add_inf_to_element(el, msg) { 
    if (!el) return;
    if (msg.count === 0) return;

    if (el.nextSibling && el.nextSibling.classList?.contains("my-hook-badge")) return;

    // отрисовка счетчика
    const badge = document.createElement("a");
    badge.className = "my-hook-badge";
    badge.textContent = ` (${msg.count})`;
    badge.style.marginLeft = "6px";
    badge.style.color = "#666";
    badge.style.cursor = "pointer";
    badge.style.position = "relative";
    badge.href = `https://youla.2gis.local/vorwands#/search/searchString=%22${encodeURIComponent(msg.value)}%22`;
    badge.target = "_blank"

    // отрисовка выпадающего списка
    const tooltip = document.createElement("div");
    tooltip.style.display = "none";
    tooltip.style.position = "absolute";
    tooltip.style.top = "18px";
    tooltip.style.left = "0";
    tooltip.style.background = "#fff";
    tooltip.style.border = "1px solid #ccc";
    tooltip.style.padding = "6px";
    tooltip.style.zIndex = "9999";
    tooltip.style.minWidth = "400px";

    // цвет для разных резолюций
    const resolutionColors = {
        Applied: "green",
        NotConfirmed: "red",
        FixedEarlier: "orange",
        PassedToDevelopers: "black",
        Duplicate: "orange",
        BelowStandarts: "red"
    };

    // отрисовка всех ссылок в список
    msg.links.forEach(link => {
        const a = document.createElement("a");

        a.href = link.url;
        a.textContent = `${link.title} (${link.resolution})`;

        const color = resolutionColors[link.resolution];
        if (color) a.style.color = color;

        a.target = "_blank";
        a.style.display = "block";

        tooltip.appendChild(a);
    });

    badge.appendChild(tooltip); // добавляем весь список

    badge.addEventListener("mouseenter", () => { // когда наводишь мышь
        tooltip.style.display = "block";
    });

    badge.addEventListener("mouseleave", () => { // когда убираешь мышь
        tooltip.style.display = "none";
    });

    el.appendChild(badge);
}

// =======================
// ✅ Блок ссылок
// =======================

// ---
// This section contains modified code originally written by Ilya Akhmanov (MIT License).
// The code has been refactored and adapted for this project.
// ---

// проверяет зацепку относится ли она к транспорту или нет и запускает соответствующую функцию
async function checkPage() {

    console.log("Начинаю CheckPage")

    let checking // создаем переменную под тип зц

    try {
        checking = await waitForText('[data-bind="text: source"]'); // получаем тип зц
    } catch (e) {
        console.log(e);
        return;
    }

    console.log("Получено:", checking)

    const title = document.querySelector("#vorvand-title, span.vorwand-title[data-bind='text: name']")?.textContent.trim(); // дополнительная проверка загаловка
    console.log("Получено:", title)

    if (title && title.includes("Сообщение об ошибке в маршруте")) {
        console.log("✅ определено по title как Ошибки транспорта");
        checking = "Ошибки транспорта";
    }

    console.log(checking)

    if (checking == 'Ошибки транспорта') {
        console.log("Совпадение найдено. Ошибки транспорта")
        linkConvert();
    } else {
        console.log("Совпадение найдено. Другое");
        coordConvert();
    };
  };

// функция ожидания появления элемента
function waitForText(selector, timeout = 3000) {
    console.log("Начало ожидания")
    return new Promise((resolve, reject) => { // создаем промайс
        const start = Date.now();

        // поиск селектора
        function check() {
            const el = document.querySelector(selector);
            const text = el?.textContent.trim();

            if (text) {
                resolve(text);
                return;
            }

            if (Date.now() - start > timeout) {
                reject(selector, "селектор не появился");
                return;
            }

            setTimeout(check, 100);
        }

        check();
    });
}

// поиск ссылок на странице
function linkConvert() {

    const html = document.querySelector('.vorwand-inner[data-bind*="description"]')?.innerHTML || ""; // получаем блок хтмл где находятся все ссылки

    // регулярные выражения
    const regLink1 = /\bLink:\s*(https?:\/\/2gis\.ru\/[^\s<]+)/i;
    const regLink2 = /(?<=tap(P|p)oint: )https\:\/\/2gis\.ru\/geo\/[0-9\.,]*/g;
    const regLink3 = /(?<=user(L|l)ocation: )https\:\/\/2gis\.ru\/geo\/[0-9\.,]*/g;
    const regdataBase = /(?:По данным города:|Based on city data:|Отправлено:|City data:)[^(]*\(\s*(online|\d{4}[-.]\d{2}[-.]\d{2}|\d{8})\s*\)|Версия базы данных:\s*(online|\d{4}[-.]\d{2}[-.]\d{2}|\d{8})/i;

    // получение ссылок
    const link = html.match(regLink1)?.[1] || null; 
    const tapPoint = html.match(regLink2)?.[0] || null;
    const userLocation = html.match(regLink3)?.[0] || null;
    let dataBase = html.match(regdataBase)?.[0] || null;

    console.log(`link: ${link}`);
    console.log(`tapPoint: ${tapPoint}`);
    console.log(`userLocation: ${userLocation}`);

    // дата
    console.log(`Data: ${dataBase}`);
    dataBase = extractDataBaseValue(dataBase); // получаем чистую дату
    console.log("clean data:", dataBase)

    // координаты
    const coordTapPoint = extractCoords(tapPoint);
    const coordUserLocation = extractCoords(userLocation);

    // выбор приоритета
    const coord = coordTapPoint || coordUserLocation;
    const choiceLink = coordTapPoint ? "tapPoint" : "userLocation";

    console.log("coord:", coord);
    console.log("choice:", choiceLink);
    console.log("tapPoint:", tapPoint);
    set_block({coord, dataBase, link, tapPoint, coordTapPoint, userLocation, coordUserLocation, choiceLink}) // отрисовка
 
};

// получение отдельных координат
function extractCoords(link) {
    return link?.match(/-?\d+\.\d+/g) || null;
}

// ищем координаты на странице
async function coordConvert() {
  console.log("запущен coordConvert");

  const html = document.querySelector(
    '.vorwand-inner[data-bind*="description"]'
  )?.innerHTML || "";

  const regCoord = /[0-9\-]{2,3}\.[0-9]*/g;

  const regdataBase =
    /(?:По данным города:|Based on city data:|Отправлено:|City data:)[^(]*\(\s*(online|\d{4}[-.]\d{2}[-.]\d{2}|\d{8})\s*\)|Версия базы данных:\s*(online|\d{4}[-.]\d{2}[-.]\d{2}|\d{8})/i;

  let dataBase = html.match(regdataBase)?.[0] || null;

  console.log("data:", dataBase);

  dataBase = extractDataBaseValue(dataBase);

  console.log("clean data:", dataBase);

  let coord = null;

  try {
    coord = await waitForText(
      `[data-bind="text: linkedPoint().latitude + ', ' + linkedPoint().longitude"]`
    );
  } catch (error) {
    console.log(
      "ℹ️ Координаты не найдены, продолжаем обработку версии базы:",
      error
    );
  }

  // Если координаты всё-таки найдены — преобразуем их.
  if (coord) {
    const parsedCoord = coord.match(regCoord);

    if (parsedCoord?.length >= 2) {
      // В Youla: latitude, longitude.
      // В расширении: longitude, latitude.
      coord = [parsedCoord[1], parsedCoord[0]];

      console.log("Извлечённые координаты:", coord);
    } else {
      console.log("⚠️ Не удалось извлечь две координаты:", coord);
      coord = null;
    }
  }

  // Важно: set_block вызывается всегда.
  // Даже если coord === null, база данных может быть показана.
  set_block({
    coord,
    dataBase
  });
}

// получение инфо по дате
function extractDataBaseValue(value) {
  if (!value) return null;

  const match = String(value).match(
    /online|\d{4}[-.]\d{2}[-.]\d{2}/i
  );

  return match?.[0]?.toLowerCase() || null;
}

// отрисовка блока с кнопками
function set_block(data) {

    let resultCompaireDate = 'Свежая версия базы данных!' // переменная об состоянии базы данных пользователя
    let resultColor = "#87CEEB"; // переменная о цвете для отображении информации о базе данных пользователя

    let {coord, dataBase, link, tapPoint, coordTapPoint, userLocation, coordUserLocation, choiceLink} = data

    console.log("tapPoint:", tapPoint);
    console.log("Данные получены, начинаем отрисовку в set_block")

    const objLink = document.querySelector("table.vorwands-full__table");

    if (!objLink) {
      console.log("⏳ контейнер не найден");
      return;
    }

    if (objLink.parentElement?.querySelector(".link-under-the-map")) {
    console.log("ℹ️ блок с ссылками уже существует");
    return;
    }

    console.log("✅ контейнер найден:", objLink);

    const links = document.createElement("div");
    links.className = "link-under-the-map";
    links.style.cssText = `
      border: 2px solid #FAF0E6;
      border-radius: 15px;
      padding: 1em;
      display: flex;
      justify-content: space-between;
    `;

    objLink.after(links);
    
    
    if (!userLocation) { // если нет местоположения пользователя то меняем координаты
          userLocation = coord
          coordUserLocation = coord
          console.log("Переопределенные координаты: ", coordUserLocation, userLocation)
          choiceLink = "tapPoint"
      }

    //LINK
    if (link) {
        console.log("Начинаю отрисовку LINK", link)
        const link_div = document.createElement('div');
        link_div.setAttribute("style","width:48px;height:48px;border:2px solid #00BFFF;border-radius:15px;float:left;");
        link_div.setAttribute("onmouseover","this.style.backgroundColor='#F0F8FF';");
        link_div.setAttribute("onmouseout","this.style.backgroundColor='white';");
        link_div.innerHTML = `<a href="${link}" target="_blank" title="Построить маршрут пользователя: ${link}"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 32 32" fill="currentColor"><path d="M13 13a4 4 0 1 0-4 4 4 4 0 0 0 4-4zm-6 0a2 2 0 1 1 2 2 2 2 0 0 1-2-2z"></path><path d="M24 15.14V10.5a4.5 4.5 0 0 0-9 0v11a2.5 2.5 0 0 1-5 0V19H8v2.5a4.5 4.5 0 0 0 9 0v-11a2.5 2.5 0 0 1 5 0v4.64a4 4 0 1 0 2 0zM23 21a2 2 0 1 1 2-2 2 2 0 0 1-2 2z"></path></svg></a>`;
        links.append(link_div);
    };


    //TAPPOINT
    if (tapPoint) {
        console.log("Начинаю отрисовку TAPPOINT", tapPoint)
        const tapPoint_div = document.createElement('div');
        tapPoint_div.setAttribute("style","width:40px;height:40px;border:2px solid #66CDAA;border-radius:15px;padding: 4px;float:left;");
        tapPoint_div.setAttribute("onmouseover","this.style.backgroundColor='#F0FFF0';");
        tapPoint_div.setAttribute("onmouseout","this.style.backgroundColor='white';");
        tapPoint_div.innerHTML = `<a href="https://2gis.ru/geo/${coordTapPoint[0]},${coordTapPoint[1]}?m=${coordTapPoint[0]}%2C${coordTapPoint[1]}%2F19" target="_blank" title="TapPoint пользователя: ${tapPoint}"><svg height="40px" width="40px" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 503.467 503.467" xml:space="preserve" fill="#000000"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round" stroke="#006400" stroke-width="10.06934"> <path style="fill:#006400;" d="M499.886,394.24l-177.493,102.4c-32.427-37.547-84.48-72.533-133.12-99.84 c-5.973-3.413-11.947-6.827-18.773-10.24c-31.573-17.067-45.227-61.44-13.653-80.213c0,0,22.187-7.68,40.107,6.827l-117.76-192 c-9.387-16.213-6.827-34.987,9.387-45.227c16.213-9.387,30.72-0.853,42.667,15.36l91.307,128.853 c-9.387-16.213-4.267-37.547,12.8-46.933c16.213-9.387,37.547-4.267,46.933,12.8l8.533,14.507 c-9.387-16.213-3.413-37.547,12.8-46.933c16.213-9.387,37.547-4.267,46.933,12.8l12.8,22.187c-6.827-11.947-2.56-28.16,9.387-34.987 c11.947-6.827,28.16-1.707,34.987,9.387l55.467,96.427C495.619,318.293,477.699,337.92,499.886,394.24"></path> <path style="fill:#51565F;" d="M322.392,503.467c-0.853,0-2.56-0.853-3.413-1.707c-27.307-31.573-71.68-64.853-132.267-98.987 c-5.973-3.413-11.947-6.827-18.773-10.24c-19.627-11.093-33.28-31.573-33.28-52.053c0-15.36,6.827-27.307,19.627-34.987 c1.707-0.853,4.267-0.853,5.973,1.707c0.853,1.707,0.853,4.267-1.707,5.973c-12.8,7.68-15.36,18.773-15.36,27.307 c0,17.067,11.947,35.84,29.013,45.227c5.973,3.413,11.947,6.827,18.773,10.24c58.88,34.133,104.107,66.56,132.267,98.133 l171.52-98.987c-8.533-23.04-11.093-40.107-12.8-56.32c-2.56-21.333-5.12-42.667-23.893-75.093l-55.467-96.427 c-5.12-9.387-19.627-13.653-29.013-7.68c-4.267,2.56-8.533,7.68-9.387,12.8c-1.707,5.973-0.853,11.093,1.707,16.213l0,0 c0.853,1.707,0.853,4.267-1.707,5.973c-1.707,0.853-4.267,0.853-5.973-1.707l0,0l-12.8-22.187 c-8.533-14.507-26.453-18.773-40.96-11.093c-14.507,8.533-18.773,26.453-11.093,40.96c0.853,1.707,0.853,4.267-1.707,5.973 c-1.707,0.853-4.267,0.853-5.973-1.707l-8.533-14.507c-4.267-6.827-10.24-11.947-17.92-13.653c-7.68-1.707-15.36-0.853-23.04,2.56 c-6.827,4.267-11.947,10.24-13.653,17.92s-0.853,15.36,3.413,23.04c0.853,1.707,0.853,4.267-1.707,5.973 c-1.707,0.853-4.267,0.853-5.973-0.853L126.979,96.427c-11.947-16.213-24.747-20.48-36.693-13.653 C83.459,87.04,79.193,92.16,78.339,99.84c-0.853,6.827,0,14.507,4.267,22.187l117.76,192c0.853,1.707,0.853,4.267-1.707,5.973 c-1.707,0.853-4.267,0.853-5.973-1.707l-117.76-192c-5.12-9.387-6.827-18.773-5.973-28.16c1.707-9.387,7.68-17.92,16.213-23.04 c16.213-9.387,33.28-3.413,47.787,16.213l79.36,110.933c0-2.56,0.853-5.12,0.853-7.68c2.56-10.24,9.387-17.92,17.92-23.04 c8.533-5.12,19.627-6.827,29.013-3.413c7.68,1.707,14.507,6.827,19.627,12.8c1.707-11.093,8.533-22.187,18.773-28.16 c18.773-10.24,41.813-4.267,52.053,13.653l2.56,4.267c0,0,0,0,0-0.853c1.707-7.68,6.827-14.507,13.653-17.92 c13.653-7.68,33.28-2.56,40.96,11.093l55.467,96.427c19.627,34.133,22.187,55.467,25.6,78.507 c1.707,16.213,4.267,34.133,13.653,57.173c0.853,1.707,0,4.267-1.707,5.12l-177.493,102.4 C324.099,503.467,323.246,503.467,322.392,503.467z M32.259,168.96c-0.853,0-2.56,0-3.413-0.853c-1.707-1.707-1.707-4.267,0-5.973 l23.893-23.893c1.707-1.707,4.267-1.707,5.973,0c1.707,1.707,1.707,4.267,0,5.973l-23.893,23.893 C34.819,168.107,33.966,168.96,32.259,168.96z M39.086,102.4H4.952c-2.56,0-4.267-1.707-4.267-4.267s1.707-4.267,4.267-4.267h34.133 c2.56,0,4.267,1.707,4.267,4.267S41.646,102.4,39.086,102.4z M141.486,59.733c-0.853,0-2.56,0-3.413-0.853 c-1.707-1.707-1.707-4.267,0-5.973l23.893-23.893c1.707-1.707,4.267-1.707,5.973,0c1.707,1.707,1.707,4.267,0,5.973L144.046,58.88 C143.193,59.733,142.339,59.733,141.486,59.733z M57.006,59.733c-0.853,0-2.56,0-3.413-0.853L29.699,34.987 c-1.707-1.707-1.707-4.267,0-5.973c1.707-1.707,4.267-1.707,5.973,0l23.893,23.893c1.707,1.707,1.707,4.267,0,5.973 C58.712,59.733,57.859,59.733,57.006,59.733z M98.819,42.667c-2.56,0-4.267-1.707-4.267-4.267V4.267c0-2.56,1.707-4.267,4.267-4.267 c2.56,0,4.267,1.707,4.267,4.267V38.4C103.086,40.96,101.379,42.667,98.819,42.667z"></path> </g><g id="SVGRepo_iconCarrier"> <path style="fill:#19AA1E;" d="M499.886,394.24l-177.493,102.4c-32.427-37.547-84.48-72.533-133.12-99.84 c-5.973-3.413-11.947-6.827-18.773-10.24c-31.573-17.067-45.227-61.44-13.653-80.213c0,0,22.187-7.68,40.107,6.827l-117.76-192 c-9.387-16.213-6.827-34.987,9.387-45.227c16.213-9.387,30.72-0.853,42.667,15.36l91.307,128.853 c-9.387-16.213-4.267-37.547,12.8-46.933c16.213-9.387,37.547-4.267,46.933,12.8l8.533,14.507 c-9.387-16.213-3.413-37.547,12.8-46.933c16.213-9.387,37.547-4.267,46.933,12.8l12.8,22.187c-6.827-11.947-2.56-28.16,9.387-34.987 c11.947-6.827,28.16-1.707,34.987,9.387l55.467,96.427C495.619,318.293,477.699,337.92,499.886,394.24"></path> <path style="fill:#51565F;" d="M322.392,503.467c-0.853,0-2.56-0.853-3.413-1.707c-27.307-31.573-71.68-64.853-132.267-98.987 c-5.973-3.413-11.947-6.827-18.773-10.24c-19.627-11.093-33.28-31.573-33.28-52.053c0-15.36,6.827-27.307,19.627-34.987 c1.707-0.853,4.267-0.853,5.973,1.707c0.853,1.707,0.853,4.267-1.707,5.973c-12.8,7.68-15.36,18.773-15.36,27.307 c0,17.067,11.947,35.84,29.013,45.227c5.973,3.413,11.947,6.827,18.773,10.24c58.88,34.133,104.107,66.56,132.267,98.133 l171.52-98.987c-8.533-23.04-11.093-40.107-12.8-56.32c-2.56-21.333-5.12-42.667-23.893-75.093l-55.467-96.427 c-5.12-9.387-19.627-13.653-29.013-7.68c-4.267,2.56-8.533,7.68-9.387,12.8c-1.707,5.973-0.853,11.093,1.707,16.213l0,0 c0.853,1.707,0.853,4.267-1.707,5.973c-1.707,0.853-4.267,0.853-5.973-1.707l0,0l-12.8-22.187 c-8.533-14.507-26.453-18.773-40.96-11.093c-14.507,8.533-18.773,26.453-11.093,40.96c0.853,1.707,0.853,4.267-1.707,5.973 c-1.707,0.853-4.267,0.853-5.973-1.707l-8.533-14.507c-4.267-6.827-10.24-11.947-17.92-13.653c-7.68-1.707-15.36-0.853-23.04,2.56 c-6.827,4.267-11.947,10.24-13.653,17.92s-0.853,15.36,3.413,23.04c0.853,1.707,0.853,4.267-1.707,5.973 c-1.707,0.853-4.267,0.853-5.973-0.853L126.979,96.427c-11.947-16.213-24.747-20.48-36.693-13.653 C83.459,87.04,79.193,92.16,78.339,99.84c-0.853,6.827,0,14.507,4.267,22.187l117.76,192c0.853,1.707,0.853,4.267-1.707,5.973 c-1.707,0.853-4.267,0.853-5.973-1.707l-117.76-192c-5.12-9.387-6.827-18.773-5.973-28.16c1.707-9.387,7.68-17.92,16.213-23.04 c16.213-9.387,33.28-3.413,47.787,16.213l79.36,110.933c0-2.56,0.853-5.12,0.853-7.68c2.56-10.24,9.387-17.92,17.92-23.04 c8.533-5.12,19.627-6.827,29.013-3.413c7.68,1.707,14.507,6.827,19.627,12.8c1.707-11.093,8.533-22.187,18.773-28.16 c18.773-10.24,41.813-4.267,52.053,13.653l2.56,4.267c0,0,0,0,0-0.853c1.707-7.68,6.827-14.507,13.653-17.92 c13.653-7.68,33.28-2.56,40.96,11.093l55.467,96.427c19.627,34.133,22.187,55.467,25.6,78.507 c1.707,16.213,4.267,34.133,13.653,57.173c0.853,1.707,0,4.267-1.707,5.12l-177.493,102.4 C324.099,503.467,323.246,503.467,322.392,503.467z M32.259,168.96c-0.853,0-2.56,0-3.413-0.853c-1.707-1.707-1.707-4.267,0-5.973 l23.893-23.893c1.707-1.707,4.267-1.707,5.973,0c1.707,1.707,1.707,4.267,0,5.973l-23.893,23.893 C34.819,168.107,33.966,168.96,32.259,168.96z M39.086,102.4H4.952c-2.56,0-4.267-1.707-4.267-4.267s1.707-4.267,4.267-4.267h34.133 c2.56,0,4.267,1.707,4.267,4.267S41.646,102.4,39.086,102.4z M141.486,59.733c-0.853,0-2.56,0-3.413-0.853 c-1.707-1.707-1.707-4.267,0-5.973l23.893-23.893c1.707-1.707,4.267-1.707,5.973,0c1.707,1.707,1.707,4.267,0,5.973L144.046,58.88 C143.193,59.733,142.339,59.733,141.486,59.733z M57.006,59.733c-0.853,0-2.56,0-3.413-0.853L29.699,34.987 c-1.707-1.707-1.707-4.267,0-5.973c1.707-1.707,4.267-1.707,5.973,0l23.893,23.893c1.707,1.707,1.707,4.267,0,5.973 C58.712,59.733,57.859,59.733,57.006,59.733z M98.819,42.667c-2.56,0-4.267-1.707-4.267-4.267V4.267c0-2.56,1.707-4.267,4.267-4.267 c2.56,0,4.267,1.707,4.267,4.267V38.4C103.086,40.96,101.379,42.667,98.819,42.667z"></path> </g></svg></a>`;
        links.append(tapPoint_div);
      };

      
    //USERLOCATION
    if (userLocation || coord) {
        
        console.log("Начинаю отрисовку USERLOCATION", userLocation, coord)

        const userLocation_div = document.createElement('div');
        userLocation_div.setAttribute("style","width:48px;height:48px;border:2px solid #66CDAA;border-radius:15px;float:left;");
        userLocation_div.setAttribute("onmouseover","this.style.backgroundColor='#F0FFF0';");
        userLocation_div.setAttribute("onmouseout","this.style.backgroundColor='white';");
        userLocation_div.innerHTML = `<a href="https://2gis.ru/geo/${coordUserLocation[0]},${coordUserLocation[1]}?m=${coordUserLocation[0]}%2C${coordUserLocation[1]}%2F19" target="_blank" title="Местонахождение пользователя: ${userLocation}"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 32 32" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M16 4C21.9567 4 26 8.61818 26 13.6C26 15.6 25.5668 17.3455 24.556 19.5273C18.6354 19.5273 17.5523 23.4909 17.2996 26.1455L17.1191 28H14.8809L14.7004 26.1455C14.4477 23.4909 13.3646 19.5273 7.44404 19.5273C6.43321 17.3455 6 15.6 6 13.6C6 8.61818 10.0433 4 16 4Z" fill="#19AA1E"></path></svg></a>`;
        links.append(userLocation_div);
        } 
      
      //FIJI
      if (coord) {
          console.log("Начинаю отрисовку fiji", coord)
          const fijiLink = document.createElement('div');
          fijiLink.setAttribute("class", "fiji-link");
          fijiLink.setAttribute("style","width:40px;height:40px;border:2px solid #00BFFF;border-radius:15px;padding:4px;float:left;");
          fijiLink.setAttribute("onmouseover","this.style.backgroundColor='#F0F8FF';");
          fijiLink.setAttribute("onmouseout","this.style.backgroundColor='white';");
          fijiLink.innerHTML = `<a href="fiji://view/lon=${coord[0]}&lat=${coord[1]}"><img class="file-type_icon" width="40" height="40" src="assets/img/fiji small.png" title="Перейти в Fiji по ${choiceLink} пользователя"></img></a>`;
          links.append(fijiLink);
      }

      //YANDEX
      if (coord) {
          console.log("Начинаю отрисовку yandex", coord)
          const yaLink = document.createElement('div');
          yaLink.setAttribute("style","width:40px;height:40px;border:2px solid #FA8072;border-radius:15px;padding:4px;float:left;");
          yaLink.setAttribute("onmouseover","this.style.backgroundColor='#FFE4E1';");
          yaLink.setAttribute("onmouseout","this.style.backgroundColor='white';");
          yaLink.innerHTML = `<a href="https://yandex.ru/maps/?l=sat%2Cmrc&ll=${coord[0]}%2C${coord[1]}&z=19" target="_blank" title="Перейти в ЯК по ${choiceLink} пользователя">    <svg width="40" height="40" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 1a9.002 9.002 0 0 0-6.366 15.362c1.63 1.63 5.466 3.988 5.693 6.465.034.37.303.673.673.673.37 0 .64-.303.673-.673.227-2.477 4.06-4.831 5.689-6.46A9.002 9.002 0 0 0 12 1z" fill="#F43"></path><path d="M12 13.079a3.079 3.079 0 1 1 0-6.158 3.079 3.079 0 0 1 0 6.158z" fill="#fff"></path></svg>      </a>`;
          links.append(yaLink);
      }

      //Росреестр
      if (coord) {
          console.log("Начинаю отрисовку росреестра", coord)
          const [ros_x, ros_y] = toNSPD(coord[1], coord[0])
          const roLink = document.createElement('div');
          roLink.setAttribute("style","width:40px;height:40px;border:2px solid #00BFFF;border-radius:15px;padding:4px;float:left;");
          roLink.setAttribute("onmouseover","this.style.backgroundColor='#F0F8FF';");
          roLink.setAttribute("onmouseout","this.style.backgroundColor='white';");
          roLink.innerHTML = `
      <a href="https://nspd.gov.ru/map?theme_id=1&is_copy_url=true&active_layers=36329%2C36328%2C36049%2C36048&coordinate_x=${ros_x}&coordinate_y=${ros_y}&zoom=19&baseLayerId=235" target="_blank" title="Перейти в НСПД">
        <img src="https://nspd.gov.ru/assets/favicons/favicon.ico" width="40" height="40">
            <path fill="#4CAF50" d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/>
        </svg>
      </a>
      `;
            links.append(roLink);
        }
        
        //Камеры
        if (coord) {
            console.log("Начинаю отрисовку speedcam", coord)
            const speedcamLink = document.createElement('div');
            speedcamLink.setAttribute("style","width:40px;height:40px;border:2px solid #00BFFF;border-radius:15px;padding:4px;float:left;");
            speedcamLink.setAttribute("onmouseover","this.style.backgroundColor='#F0F8FF';");
            speedcamLink.setAttribute("onmouseout","this.style.backgroundColor='white';");
            speedcamLink.innerHTML = `
      <a href="https://speedcamonline.ru/geo/${coord[1]}/${coord[0]}" target="_blank" title="Перейти в SpeedCamOnline">
        <img src="https://speedcamonline.ru/favicon.ico" width="40" height="40">
            <path fill="#4CAF50" d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/>
        </svg>
      </a>
      `;
            links.append(speedcamLink);
        }

      //дата
      let dataBaseDate // создаем переменную под дату из цифр

      if (dataBase) {

          if (dataBase === 'online') {
              console.log("версия online")
              resultCompaireDate = 'Версия базы данных: online';
              resultColor = "#66CDAA";
          } else { // если не онлайн, то меняем дату в читаемую для дальнейшей обработки
              const clean = dataBase.replace(/[-.]/g, "");

              const year = clean.slice(0, 4);
              const month = clean.slice(4, 6);
              const day = clean.slice(6);

              dataBaseDate = new Date(year, month - 1, day);

              console.log("Версия базы данных:", dataBaseDate);
          }
      }

      if (dataBaseDate) {

          let creationDate = document.querySelector('[data-bind="text: creationDateTime"]').innerHTML; // смотрим когда была создана зацепка
          const dayCreationDate = creationDate.slice(0,2);
          const monthCreationDate = creationDate.slice(3,5);
          const yearCreationDate = '20' + creationDate.slice(6,8);
          creationDate = new Date(yearCreationDate, monthCreationDate - 1, dayCreationDate);
          console.log(`Дата создания зацепки: ${creationDate}`);
          
          if (dataBase && dataBaseDate.getFullYear() != creationDate.getFullYear()){ // если года не сходятся, то версия прошлогодняя
              
              resultCompaireDate = 'Прошлогодняя версия базы данных!';
              resultColor = "#FF6347";

          } else if (dataBase && dataBaseDate.getMonth() != creationDate.getMonth()){ // если месяц не сходится, то считаем насколько месяцев просрочена
              const assembly = new Date(creationDate.getFullYear(), creationDate.getMonth(), 1);
              assembly.setDate(assembly.getDate() - 2);
              if (assembly.getDay() == 0 || assembly.getDay() == 6){
                  while ((assembly.getDay() == 0 || assembly.getDay() == 6)){
                      assembly.setDate(assembly.getDate() - 1);
                  };
              };

              let differenceMonth = creationDate.getMonth() - dataBaseDate.getMonth();
              let endingResultCompaireDate = 'сборок';
              if (differenceMonth == 1) {
                  endingResultCompaireDate = 'сборку';
              } else if (differenceMonth > 1 && differenceMonth < 5){
                  endingResultCompaireDate = 'сборки';
              }
              resultCompaireDate = `Версия базы данных просрочена на ${differenceMonth} ${endingResultCompaireDate}`;
              resultColor = "#FF6347";
          };

          console.log(`${resultCompaireDate}`);
          const regdataBaseUndefined = /(?:По данным города:|Based on city data:|Отправлено:|City data:|Версия базы данных:)\s*Не определен/i;

          if (dataBase == undefined) {
            console.log('Город не определён!');
            let dataBase = document.body.innerHTML.match(regdataBaseUndefined);
          if (!dataBase) return
          dataBase = dataBase[0];
          if (dataBase == 'Не определен') {
              resultCompaireDate = 'Не удалось определить проект';
              resultColor = "#A9A9A9";
          };
      };
      };

      //отрисовка даты
      if (dataBase) {

        const dataBaseBlock = document.createElement('div');
        dataBaseBlock.setAttribute("style",`border:2px solid ${resultColor};border-radius:15px;padding: 0.1em;justify-content: space-between;text-align:center;background-color:${resultColor};color:white`);
        dataBaseBlock.innerHTML = `${resultCompaireDate}`
        links.after(dataBaseBlock);
      }; 
}

//пересчет координат для росреестра
function toNSPD(lat, lon) {
    
  const R = 6378137;
  const x = lon * Math.PI / 180 * R;
  const y = Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * R;
  return [x, y];

}    

init()