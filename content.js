console.log("✅ content.js 2.0 запущен")

// подсветка выбранного фильтра ✅
// добавить кадстр и СпидКамОнлайн
// кнопка обновления ✅
// новости уведомления пуши
// массовое изменение атрибутов зацепки
// поиск по -без тега (для поиска аудитных зц которым случайно не проставили тег)????
// Приоритетность показа ЗЦ от открытых до закрытых или по резолюции, возможно кнопка выбора фильтров
// Статистика по пользователю
// Добавление кнопок ссылка на яндекс поиск
// Перевод резолюций на русский язык
// Настроить версию базы данных + добавит версию базы данных онлайн
// в некоторых зц не работает переход https://youla.2gis.local/vorwand#/id=138389021
// В списке показывать только зц кроме открытой
// ФИАС добавить поиск в ФИАС по адресу
// Неверно отмечается местоположение пользователя из нового типа зц✅


// Проверка обновления версии
chrome.runtime.sendMessage({type: "check_update"});

let hash
let hashTimer
let vorwandData = null
let state_url = null
let resultCompaireDate = 'Свежая версия базы данных!'
let resultColor = "#87CEEB";
const cache = {}
let contactsObserver = null;
let mapButtonObserver = null;
let observedMapButton = null;
let lastMapSelectedValue = null;

function mainlogic() {

  console.log("🚀 mainlogic старт");

  const url = window.location.href; // Получаем ссылку
  state_url = check_innerurl(url); // Получаем информацию, находимся мы на странице поиска или зацепки
  console.log("Страница:", state_url); // Отрисовываем информацию о странице

  if (state_url === "other") {
    return
  } // Если не та страница, то не запускаем скрипт

  if (state_url === "search") { // Проверка на странце поиска чтобы скрипт не запускался раньше чем прогрузится страница
    if (check_block()) {
    return
    }
    
    draw_filters();
    observeTableBody('tbody[data-bind*="foreach"]'); // запускает проверку на наличие прогруженной страницы
    console.log("Это страница поиска");
  }
  else if (state_url === "id") {
    console.log("Это страница ЗЦ");
    updatedate();
    console.log("обработка даты закончилась")
    console.log("XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX")
    checkPage()
    waitForMail([
        'a[href^="fiji://editBySysCode/"]',
        'a[href^="mailto:"]',
        'a[href*="vk.com"]',
        'a[href*="plus.google.com"]'
    ], () => {
        
        console.log("waitformail работает")
        processContacts();   // сразу
        watchContacts();     // и следим дальше
    
    });
  }
}

// проверяет на какой странице находится пользователь
function check_innerurl(url) {
  if (url.includes("vorwands#/search")) return "search"; // Страница поиска
  if (url.includes("vorwand#/id=")) return "id"; // Страница зацепки
  return "other"; // Другая страница
}

// проверка прогрузилась ли страница
function observeTableBody(selector) {
  const tbody = document.querySelector(selector); // поиск нужного селектора

  if (!tbody) { // если не прогрузилось ничего
    console.log("⏳ селектора пока нет, повторяем…");
    setTimeout(() => observeTableBody(selector), 500); // ждем, потом еще раз запускаем, пока не появится
    return;
  }

  console.log("✅ селектор найден:", selector);
  updateVisibleRows(); // подсвечиваем строки


  // Следим за появлением новых строк
  let timer; // устанавливаем таймер
  const observer = new MutationObserver(() => { // устанавливаем слежку за изменениями в DOM
    clearTimeout(timer); // очищаем таймер
    timer = setTimeout(() => { // устанавливаем таймер и обновляем подсветку
      console.log("📦 Изменение страницы — обновляем подсветку…");
      updateVisibleRows(); // запускаем обновление строк
    }, 200);
  });

  observer.observe(tbody, { childList: true, subtree: true }); // уточняем наблюдения за конкретным элементом
}

function updateVisibleRows() { // функция которая запускает две остальных функции по обновлению строк
  if (!vorwandData) return;

  console.log("🔄 Обновляем строки");
  highlightList(vorwandData.expired, "expired");
  highlightList(vorwandData.today, "today");
}

function highlightList(list, kind) { // Подсвечивает нужные сискоды
  if (!list || !list.length) return; // Прерывает функцию если список пуст

  const ids = new Set(list.map(x => x.id)); // создает множество с id из нужного массива

  document.querySelectorAll("a.vorwand-id").forEach(link => { // Находим все элементы с id на странице
    const match = link.href.match(/id=(\d+)/); // Вытаскиваю из найденных объектов конкретные id
    if (!match) return; // если id на странице нет, то прерываем

    const id = Number(match[1]); // превращение id в число

    if (ids.has(id)) { // Проверяем есть ли id в списке от API и подсвечиваем нужным цветом
      if (kind === "expired") {
        link.style.backgroundColor = "rgba(255, 0, 0, 0.3)";
      } else if (kind === "today") {
        link.style.backgroundColor = "rgba(255, 255, 0, 0.3)";
      }
    }
  });
}

function updatedate() { // смена цвета даты

  const statusEl = document.querySelector("div.control-panel_item.control-panel_item__left span")
  
  if (!statusEl) {
    setTimeout(updatedate, 400);
    return
  }

  const status_zc = statusEl.textContent.trim();

  if (status_zc === "Обработана") {
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
  window.date_status = check_date(ex_date); //проверяет дату на истечение срока
  highlight_date(window.date_status);
}

function check_date(date) { //проверяет дату на истечение срока
  const [day, month, year] = date.split('.').map(Number);
  const target = new Date(2000 + year, month - 1, day);
  const today = new Date();
  today.setHours(0,0,0,0);

  const diff = target - today;

  if (diff < 0) return "expired";
  if (diff === 0) return "today";
  return "ok";
}

function highlight_date(kind) {
  const dodate = document.querySelector("a.vorwand-datepicker.territories-allocation_datepicker");

  if (!dodate) return;

  if (kind === "expired") {
    dodate.style.backgroundColor = "rgba(255, 0, 0, 0.44)";
  } else if (kind === "today") {
    dodate.style.backgroundColor = "rgba(255, 255, 0, 0.55)";
  }
}

function check_block() {
  const totalBlock = document.querySelector('.vorwands-total');
  const mapButton = document.querySelector('#vws-view-map');
  const isMapActive = mapButton?.classList.contains('active');

  console.log("mapButton:", mapButton, "isMapActive:", isMapActive);

  // внутренняя отправка, чтобы не спамить одинаковыми сообщениями
  const sendMapSelected = (value) => {
    if (lastMapSelectedValue === value) return;

    lastMapSelectedValue = value;

    console.log("🗺 отправляем mapSelected:", value);

    chrome.runtime.sendMessage({
      type: "mapSelected",
      value: value
    });
  };

  // ✅ ставим observer на кнопку карты прямо внутри check_block
  if (mapButton && observedMapButton !== mapButton) {
    if (mapButtonObserver) {
      mapButtonObserver.disconnect();
      mapButtonObserver = null;
    }

    observedMapButton = mapButton;

    console.log("✅ кнопка карты найдена, ставим observer");

    mapButtonObserver = new MutationObserver(() => {
      const activeNow = mapButton.classList.contains('active');

      console.log("🗺 изменился class у кнопки карты, active:", activeNow);

      if (activeNow) {
        console.log("🗺 Активна карта — отключаем background");
        sendMapSelected(true);
      } else {
        console.log("📋 Активен список — включаем background");
        sendMapSelected(false);
      }
    });

    mapButtonObserver.observe(mapButton, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  // ✅ старая проверка: выбрано на карте
  if (totalBlock && totalBlock.textContent.includes("Выбрано на карте")) {
    console.log("✅ Найдена надпись 'Выбрано на карте', отправляем сообщение в background");
    sendMapSelected(true);
    return true;
  }

  // ✅ новая проверка: активная кнопка карты
  if (isMapActive) {
    console.log("🗺 Кнопка карты active — прерываем обработку страницы");
    sendMapSelected(true);
    return true;
  }

  console.log("🛑 Карта не активна, background можно включить");
  sendMapSelected(false);
  return false;
}



window.addEventListener("hashchange", () => {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    mainlogic();
    hash = window.location.hash
  }, 300);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "vorwandData") {
    console.log("📦 Получены данные:", msg);
    vorwandData = msg;
    updateVisibleRows();
  }
});

document.addEventListener("click", function (evt) {
  const btn = evt.target.closest("a.btn.close-vorwand-force");
  if (!btn) return;

  if (window.date_status === "expired") {
    const proceed = confirm(
      "⚠️ Внимание!\nСрок ЗЦ истёк.\n\nВсе равно закрыть?"
    );

    if (!proceed) {
      evt.preventDefault();
      evt.stopImmediatePropagation();
      return false;
    }
  }
}, true);

function waitForMail(selectors, callback) {

    console.log("waitformail запущен")
    console.log("selectors:", selectors)

    const timeout = 5000; // время которое ждет ответ
    const start = Date.now();

    const check = () => {
    for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        console.log("elements")

        for (const el of elements) {
            console.log(el);

            // ✅ фильтр для mail
            if (selector.includes('mailto')) {
                const href = el.getAttribute("href") || "";

                if (href.includes("support@2gis.ru")) {
                    console.log("почта саппорта")
                    continue; // пропускаем
                }
            }

            return el; // ✅ нашли подходящий
        }
    }

    const divs = document.querySelectorAll('div');

    for (const div of divs) {
        const label = div.querySelector("b, strong");

        if (label && label.textContent.includes("Отправитель")) {
            const text = div.innerText.replace("Отправитель", "").trim();

            if (text) {
                console.log("✅ найден отправитель");
                return div;
            }
        }
    }

    return null;
};

    // ✅ сразу проверяем
    console.log("первая проверка на селектор")
    const found = check();
    console.log("первая проверка на селектор закончилась")

    if (found) {
        console.log("✅ найдено сразу");
        callback();
        return;
    }

    console.log("Еще не появился начинаю наблюдение")

    const observer = new MutationObserver(() => {
        const el = check();
        if (el) {
            console.log("✅ найдено через observer");
            observer.disconnect();
            clearTimeout(timer);
            callback(); // ✅ один общий callback
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

function getContacts() { // получение контактов со страницы

    console.log("getcontact работает")

    const container = document.querySelector('div.vorwand-full-description'); // получение куска страницы с нужными данными

    console.log("container получен")

    if (!container) return [];

    console.log("container не пустой")

    const contacts = []; // создание списка под контакты

    //✅ syscode
    const map_sys = container.querySelectorAll('a[href^="fiji://editBySysCode/"]'); // поиск всех ссылок на fiji
    console.log("fiji:", map_sys)


    map_sys.forEach(el => {
        
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
        console.log(div)

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

async function watchContacts() {
    const container = document.querySelector('div.vorwand-full-description');
    if (!container) return;

    const observer = new MutationObserver((mutations) => {
        // ✅ игнорим свои изменения
        const hasOnlyOurChanges = mutations.every(m =>
            [...m.addedNodes].every(node =>
                node.classList?.contains("my-hook-badge")
            )
        );

        if (hasOnlyOurChanges) return;

        processContacts();
    });

    observer.observe(container, {
        childList: true,
        subtree: true
    });
}

function processContacts() {
    const contacts = getContacts();

    console.log("📦 контакты:", contacts);

    contacts.forEach(contact => {
        send_background(contact);
    });
}

function send_background(contact) {
    
    console.log("🚀 отправляю:", contact.value);

    if (cache[contact.value]) { // проверяем отправлялся ли запрос уже
        add_inf_to_element(contact.el, cache[contact.value]); // отрисовка
        return;
    }

    chrome.runtime.sendMessage( // отправка в back
        { type: "contact", value: contact.value },
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

function add_inf_to_element(el, msg) { // отрисовка
    if (!el) return;
    if (msg.count === 0) return;

    if (el.nextSibling && el.nextSibling.classList?.contains("my-hook-badge")) return;

    const badge = document.createElement("a");
    badge.className = "my-hook-badge";
    badge.textContent = ` (${msg.count})`;
    badge.style.marginLeft = "6px";
    badge.style.color = "#666";
    badge.style.cursor = "pointer";
    badge.style.position = "relative";
    badge.href = `https://youla.2gis.local/vorwands#/search/searchString=%22${encodeURIComponent(msg.value)}%22`;
    badge.target = "_blank"

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

    const resolutionColors = {
        Applied: "green",
        NotConfirmed: "red",
        FixedEarlier: "orange",
        PassedToDevelopers: "black",
        Duplicate: "orange",
        BelowStandarts: "red"
    };

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

    badge.appendChild(tooltip);

    badge.addEventListener("mouseenter", () => {
        tooltip.style.display = "block";
    });

    badge.addEventListener("mouseleave", () => {
        tooltip.style.display = "none";
    });

    el.appendChild(badge);
}

// ---
// This section contains modified code originally written by Ilya Akhmanov (MIT License).
// The code has been refactored and adapted for this project.
// ---
async function checkPage() {

    console.log("Начинаю CheckPage")

    let checking

    try {
        checking = await waitForText('[data-bind="text: source"]');
    } catch (e) {
        console.log(e);
        return;
    }

    console.log("Получено:", checking)

    // ✅ ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА TITLE
    const title = document.querySelector('#vorvand-title')?.textContent.trim();

    if (title && title.includes("Сообщение об ошибке в маршруте")) {
        console.log("✅ определено по title как Ошибки транспорта");
        checking = "Ошибки транспорта";
    }

    console.log(checking)

    if (checking == 'Ошибки транспорта') {
        console.log("Совпадение найдено. Ошибки транспорта")
        linkConvert();
    } else {
        console.log("Совпадение найдено");
        coordConvert();
    };
  };

function linkConvert() {

    //  ПОИСК ССЫЛОК НА СТРАНИЧКЕ

    const html = document.querySelector('div.vorwand-full-description')?.innerHTML || "";

    const regLink1 = /\bLink:\s*(https?:\/\/2gis\.ru\/[^\s<]+)/i;
    const regLink2 = /(?<=tap(P|p)oint: )https\:\/\/2gis\.ru\/geo\/[0-9\.,]*/g;
    const regLink3 = /(?<=user(L|l)ocation: )https\:\/\/2gis\.ru\/geo\/[0-9\.,]*/g;
    const regdataBase = /(?<=(По данным города:.*|Based on city data:.*|Отправлено:.*)\()([0-9\-\.]*|online)(?=\))/g;

    const link = html.match(regLink1)?.[1] || null; 
    const tapPoint = html.match(regLink2)?.[0] || null;
    const userLocation = html.match(regLink3)?.[0] || null;
    let dataBase = html.match(regdataBase)?.[0] || null;

    console.log(`link: ${link}`);
    console.log(`tapPoint: ${tapPoint}`);
    console.log(`userLocation: ${userLocation}`);
    console.log(`Data: ${dataBase}`);

    // координаты
    const coordTapPoint = extractCoords(tapPoint);
    const coordUserLocation = extractCoords(userLocation);

    // выбор приоритета
    const coord = coordTapPoint || coordUserLocation;
    const choiceLink = coordTapPoint ? "tapPoint" : "userLocation";

    console.log("coord:", coord);
    console.log("choice:", choiceLink);
    console.log("tapPoint:", tapPoint);
    set_block({coord, dataBase, link, tapPoint, coordTapPoint, userLocation, coordUserLocation, choiceLink})
 
};

async function coordConvert() {
    
    console.log("запущен coordConvert()")

    const html = document.querySelector('div.vorwand-full-description')?.innerHTML || "";

    const regCoord = /[0-9\-]{2,3}\.[0-9]*/g;
    const regdataBase = /(?<=(По данным города:.*|Based on city data:.*|Отправлено:.*)\()([0-9\-\.]*|online)(?=\))/g;

    let dataBase = html.match(regdataBase)?.[0] || null;
    
    let coord

    try {
        coord = await waitForText(`[data-bind="text: linkedPoint().latitude + ', ' + linkedPoint().longitude"]`);
    } catch (e) {
        console.log(e);
        return;
    }

    console.log("координаты: ", coord, typeof coord);
    if (!coord) return;

    coord = coord.match(regCoord);
    if (coord) {
    coord = [coord[1], coord[0]];
}
    console.log(`Извлечённые координаты: ${coord}`);
    console.log(`0: ${coord[0]}`);
    console.log(`1: ${coord[1]}`);

    set_block({coord, dataBase})
    
}

function waitForText(selector, timeout = 3000) {
    console.log("Начало ожидания")
    return new Promise((resolve, reject) => {
        const start = Date.now();

        function check() {
            const el = document.querySelector(selector);
            const text = el?.textContent.trim();

            if (text) {
                resolve(text);
                return;
            }

            if (Date.now() - start > timeout) {
                reject("⛔ координаты не появились");
                return;
            }

            setTimeout(check, 100);
        }

        check();
    });
}

function extractCoords(link) {
    return link?.match(/-?\d+\.\d+/g) || null;
}

// ДОБАВЛЕНИЕ БЛОКА С КНОПКАМИ
function set_block(data) {

    let {coord, dataBase, link, tapPoint, coordTapPoint, userLocation, coordUserLocation, choiceLink} = data
    console.log("tapPoint:", tapPoint);

    console.log("Данные получены, начинаем отрисовку")

    const objLink = document.getElementsByClassName("vorwand-full-map")[0];

    if (objLink.querySelector(".link-under-the-map")) {
        console.log("ℹ️ блок ссылок уже отрисован, повторно не рисуем");
        return;
    }

    const links = document.createElement('div');
    links.setAttribute("class", "link-under-the-map");
    links.setAttribute("style","border:2px solid #FAF0E6;border-radius:15px;padding: 1em;display: flex;justify-content: space-between;");
    objLink.append(links);

    if (!userLocation) {
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
        console.log("Началась отрисовка userlocation по координатам:", coordUserLocation)

        const userLocation_div = document.createElement('div');
        userLocation_div.setAttribute("style","width:48px;height:48px;border:2px solid #66CDAA;border-radius:15px;float:left;");
        userLocation_div.setAttribute("onmouseover","this.style.backgroundColor='#F0FFF0';");
        userLocation_div.setAttribute("onmouseout","this.style.backgroundColor='white';");
        userLocation_div.innerHTML = `<a href="https://2gis.ru/geo/${coordUserLocation[0]},${coordUserLocation[1]}?m=${coordUserLocation[0]}%2C${coordUserLocation[1]}%2F19" target="_blank" title="Местонахождение пользователя: ${userLocation}"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 32 32" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M16 4C21.9567 4 26 8.61818 26 13.6C26 15.6 25.5668 17.3455 24.556 19.5273C18.6354 19.5273 17.5523 23.4909 17.2996 26.1455L17.1191 28H14.8809L14.7004 26.1455C14.4477 23.4909 13.3646 19.5273 7.44404 19.5273C6.43321 17.3455 6 15.6 6 13.6C6 8.61818 10.0433 4 16 4Z" fill="#19AA1E"></path></svg></a>`;
        console.log(userLocation_div.innerHTML)
        links.append(userLocation_div);
    };


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

    if (coord) {
        console.log("Начинаю отрисовку росреестр", coord)
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
    

    //DATABASE

    let dataBaseDate = null
    console.log(dataBase)

    if (dataBase) {
        if (dataBase === 'online') {
            resultCompaireDate = 'Версия базы данных: online';
            resultColor = "#66CDAA";
        } else {
            const clean = dataBase.replace(/-/g, '');

            const year = clean.slice(0, 4);
            const month = clean.slice(4, 6);
            const day = clean.slice(6);

            dataBaseDate = new Date(year, month - 1, day);

            console.log("Версия базы данных:", dataBaseDate);
        }
    }

    console.log("TYPE:", typeof dataBaseDate, dataBaseDate);

    //CREATION DATE
    if (dataBase != 'online' && dataBase != 'Не определен') {

        let creationDate = document.querySelector('[data-bind="text: creationDateTime"]').innerHTML;
        const dayCreationDate = creationDate.slice(0,2);
        const monthCreationDate = creationDate.slice(3,5);
        const yearCreationDate = '20' + creationDate.slice(6,8);
        creationDate = new Date(yearCreationDate, monthCreationDate - 1, dayCreationDate);
        console.log(`Дата создания зацепки: ${creationDate}`);

        //COMPAIRE DATE
        
        if (dataBase && dataBaseDate.getFullYear() != creationDate.getFullYear()){
            
            resultCompaireDate = 'Прошлогодняя версия базы данных!';
            resultColor = "#FF6347";

        } else if (dataBase && dataBaseDate.getMonth() != creationDate.getMonth()){
            const assembly = new Date(creationDate.getFullYear(), creationDate.getMonth(), 1);
            assembly.setDate(assembly.getDate() - 2);
            if (assembly.getDay() == 0 || assembly.getDay() == 6){
                while ((assembly.getDay() == 0 || assembly.getDay() == 6)){
                    assembly.setDate(assembly.getDate() - 1);
                };
            };
            console.log(`Дата последней сборки: ${assembly}`);

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
        const regdataBaseUndefined = /(?<=(По данным города:.*|Based on city data:.*|Отправлено:.*))Не определен/g;

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

        //БЛОК ПОД КНОПКАМИ С РЕЗОЛЮЦИЕЙ ПО ВЕРСИИ БАЗЫ ДАННЫХ
        if (dataBase) {

            const dataBaseBlock = document.createElement('div');
                dataBaseBlock.setAttribute("style",`border:2px solid ${resultColor};border-radius:15px;padding: 0.1em;justify-content: space-between;text-align:center;background-color:${resultColor};color:white`);
            dataBaseBlock.innerHTML = `${resultCompaireDate}`
            links.after(dataBaseBlock);
    }; 


    };

}

// определяем страницу
// ✅ основная функция отрисовки
async function draw_filters(attempt = 0) {
  const filters = await new Promise(resolve => {
    chrome.storage.local.get(["savedFilters"], (res) => {
      resolve(res.savedFilters || []);
    });
  });

  console.log("📦 фильтры:", filters);

  const anchor = [...document.querySelectorAll("a")]
    .find(a => a.textContent.includes("Перейти обратно к карте"));

  if (!anchor) {
    if (attempt > 10) {
      console.log("❌ якорь так и не появился");
      return;
    }

    setTimeout(() => draw_filters(attempt + 1), 300);
    return;
  }

  const old = document.querySelector("#my-filters");
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

  // ✅ кнопка сохранения
  const saveBtn = document.createElement("button");
  saveBtn.textContent = "💾";
  saveBtn.title = "Сохранить текущий фильтр";
  saveBtn.onclick = async () => {
    const filter = await getCurrentFilter();
    if (filter) saveFilter(filter);
  };

  // ✅ кнопка обновления
  const reloadBtn = document.createElement("button");
    reloadBtn.textContent = "⟳";
    reloadBtn.title = "Обновить";
    reloadBtn.onclick = () => {
    draw_filters();
  };

  container.appendChild(saveBtn);

  if (filters.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = "Нет сохранённых фильтров";
    container.appendChild(empty);
  }

  // ✅ рисуем фильтры
  filters.forEach((filter, index) => {
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.gap = "4px";

    const btn = document.createElement("button");
    btn.textContent = filter.name;
    btn.style.cursor = "pointer";
    btn.onclick = () => applyFilter(filter);
    if (normalizeHash(window.location.hash) === normalizeHash(filter.query)) {
      btn.style.border = "2px solid #2091dd";
    }

    const countSpan = document.createElement("span");
    countSpan.textContent = " (⋮)";

    const menuBtn = document.createElement("button");
    menuBtn.textContent = "⋮";
    menuBtn.style.cursor = "pointer";
    menuBtn.style.position = "relative";
    menuBtn.style.cursor = "pointer";
    menuBtn.onclick = () => deleteFilter(index);

    const menu = document.createElement("div");
    menu.style.position = "absolute";
    menu.style.top = "20px";
    menu.style.right = "0";
    menu.style.background = "#fff";
    menu.style.border = "1px solid #ccc";
    menu.style.padding = "5px";
    menu.style.display = "none";
    menu.style.zIndex = "9999";
    menu.style.minWidth = "120px";

    const saveItem = document.createElement("div");
    saveItem.textContent = "💾 Сохранить";
    saveItem.style.cursor = "pointer";
    saveItem.style.padding = "4px";

    const delItem = document.createElement("div");
    delItem.textContent = "Удалить";
    delItem.style.cursor = "pointer";
    delItem.style.padding = "4px";

    const editItem = document.createElement("div");
    editItem.textContent = "Изменить";
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

    saveItem.onclick = async () => {
      const apiUrl = await getLastAdvancedSearchUrl();
      
      if (!apiUrl) {
      alert("Не удалось получить API-запрос текущего фильтра. Обнови поиск и попробуй снова.");
      return;
    }

      const updated = {
        name: filter.name,
        query: window.location.hash,
        apiUrl
      };

      saveFilter(updated);
    };

    menuBtn.onclick = (e) => {
      e.stopPropagation();
      menu.style.display = menu.style.display === "none" ? "block" : "none";
    };

    document.addEventListener("click", () => {
      menu.style.display = "none";
    });

    document.addEventListener("click", () => {
      menu.style.display = "none";
    });

    delItem.onclick = () => {
      deleteFilter(index);
    };

    wrapper.appendChild(btn);
    wrapper.appendChild(menuBtn);
    wrapper.appendChild(countSpan);

    container.appendChild(wrapper);

    // ✅ запрос count
    try {
      const url = buildApiUrl(filter);

      chrome.runtime.sendMessage(
        { type: "filter", url },
        (res) => {
          countSpan.textContent = ` (${res?.count || 0})`;
        }
      );
    } catch (e) {
      console.log("❌ Ошибка построения apiUrl:", e, filter);
      countSpan.textContent = " (!)";
    }
    
  });
  container.appendChild(reloadBtn);
  anchor.after(container);
}

// ✅ удаление
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

// ✅ применение
function applyFilter(filter) {
  window.location.hash = filter.query;

  setTimeout(() => {
    draw_filters();
  }, 300);
}

// ✅ получение текущего фильтра
async function getCurrentFilter() {
  const hash = window.location.hash;

  if (!hash.includes("/search")) return null;

  const name = prompt("Название фильтра") || "Без названия";
  const apiUrl = await getLastAdvancedSearchUrl();

  if (!apiUrl) {
    alert("Не удалось получить API-запрос текущего фильтра. Обнови поиск и попробуй снова.");
    return null;
  }

  console.log("💾 сохраняем фильтр:", {
    name,
    query: hash,
    apiUrl
  });

  return {
    name,
    query: hash,
    apiUrl
  };
}

// ✅ сохранение
function saveFilter(filter) {
  chrome.storage.local.get(["savedFilters"], (res) => {
    const filters = res.savedFilters || [];

    // ✅ ищем по имени
    const index = filters.findIndex(f => f.name === filter.name);

    if (index !== -1) {
      // 🔄 обновляем существующий
      filters[index] = filter;
      console.log("🔄 фильтр обновлён");
    } else {
      // ➕ добавляем новый
      filters.push(filter);
      console.log("✅ фильтр добавлен");
    }

    chrome.storage.local.set({ savedFilters: filters }, () => {
      draw_filters();
    });
  });
}

function buildApiUrl(filter) {
  if (filter.apiUrl) {

    const url = new URL(filter.apiUrl);

    // убираем cache-buster, если был
    url.searchParams.delete("_");

    // для подсчёта можно оставить 50 или поставить 1
    url.searchParams.set("pageSize", "50");
    url.searchParams.set("from", "0");

    return url.toString();
  }
}

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

function toNSPD(lat, lon) {
    const R = 6378137;

    const x = lon * Math.PI / 180 * R;

    const y = Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * R;

    return [x, y];
}

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

function normalizeHash(value) {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return value || "";
  }
}

mainlogic()

