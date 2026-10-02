const UPDATE_URL =
    "https://freon3103-sys.github.io/IYoula/update.json";

document.addEventListener("DOMContentLoaded", loadUpdatePage);

async function loadUpdatePage() {
    const versionElement = document.querySelector("#version");
    const summaryElement = document.querySelector("#summary");
    const changesElement = document.querySelector("#changes");
    const changeCountElement = document.querySelector("#changeCount");

    const downloadButton = document.querySelector("#downloadButton");
    const fallbackDownloadButton = document.querySelector(
        "#fallbackDownloadButton"
    );
    const instructionsButton = document.querySelector(
        "#instructionsButton"
    );

    try {
        const response = await fetch(
            `${UPDATE_URL}?t=${Date.now()}`,
            {
                cache: "no-store"
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const updateData = await response.json();

        const version = updateData.version || "неизвестно";
        const summary =
            updateData.summary ||
            "Доступно обновление расширения IYoula.";

        const changes = Array.isArray(updateData.changes)
            ? updateData.changes
            : [];

        const firstdownloadUrl = updateData.firstDownloadUrl || "#";

        const fallbackDownloadUrl =
            updateData.fallbackDownloadUrl ||
            updateData.firstDownloadUrl ||
            "#";

        const instructionsUrl = updateData.instructionsUrl;

        document.title = `IYoula ${version} — обновление` || null;

        versionElement.textContent = version;
        summaryElement.textContent = summary;

        changeCountElement.textContent =
            `${changes.length} ${getChangesWord(changes.length)}`;

        renderChanges(changesElement, changes);

        // Основная кнопка: браузер пытается скачать архив.
        downloadButton.href = firstdownloadUrl;
        downloadButton.setAttribute("download", "");

        // Запасная ссылка: открывается в новой вкладке.
        fallbackDownloadButton.href = fallbackDownloadUrl;

        // Инструкция.
        instructionsButton.href = instructionsUrl;

    } catch (error) {
        console.error("Ошибка загрузки update.json:", error);

        versionElement.textContent = "не удалось загрузить";
        summaryElement.textContent =
            "Не удалось получить информацию об обновлении. Проверьте подключение к сети.";

        changeCountElement.textContent = "0 изменений";

        renderChanges(changesElement, [
            "Страница обновления временно недоступна."
        ]);

        downloadButton.style.display = "none";
        fallbackDownloadButton.style.display = "none";
        instructionsButton.style.display = "none";
    }
}

function renderChanges(container, changes) {
    container.replaceChildren();

    if (!changes.length) {
        addChangeItem(
            container,
            "Список изменений для этой версии не указан."
        );
        return;
    }

    changes.forEach((change) => {
        addChangeItem(container, change);
    });
}

function addChangeItem(container, text) {
    const item = document.createElement("div");
    item.className = "change-item";

    const marker = document.createElement("span");
    marker.className = "change-marker";
    marker.textContent = "✓";

    const content = document.createElement("span");
    content.textContent = String(text);

    item.append(marker, content);
    container.appendChild(item);
}

function getChangesWord(count) {
    if (count % 10 === 1 && count % 100 !== 11) {
        return "изменение";
    }

    if (
        count % 10 >= 2 &&
        count % 10 <= 4 &&
        (count % 100 < 10 || count % 100 >= 20)
    ) {
        return "изменения";
    }

    return "изменений";
}