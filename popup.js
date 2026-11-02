// =======================
// ✅ Настройки по умолчанию
// =======================

const DEFAULT_SETTINGS = {
  highlightEnabled: true,
  filtersEnabled: true,
  contactsEnabled: true,
  mapLinksEnabled: true,
  closeWarningEnabled: true
};

// =======================
// ✅ Старт popup
// =======================

document.addEventListener("DOMContentLoaded", () => {
  loadPopupSettings();
  bindPopupSettings();
});

// =======================
// ✅ Загрузка настроек
// =======================

function loadPopupSettings() {
  const saveStatus = document.querySelector("#saveStatus");

  chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
    document.querySelectorAll("[data-setting]").forEach((input) => {
      const settingName = input.dataset.setting;

      input.checked = Boolean(settings[settingName]);
    });

    saveStatus.textContent = "Настройки автоматически";
  });
}

// =======================
// ✅ Сохранение настроек
// =======================

function bindPopupSettings() {
  const saveStatus = document.querySelector("#saveStatus");

  document.querySelectorAll("[data-setting]").forEach((input) => {
    input.addEventListener("change", () => {
      const settingName = input.dataset.setting;
      const value = input.checked;

      chrome.storage.local.set({
        [settingName]: value
      }, () => {
        saveStatus.textContent = "✅ Настройка сохранена";

        setTimeout(() => {
          saveStatus.textContent = "Настройки автоматически";
        }, 1500);
      });
    });
  });
}