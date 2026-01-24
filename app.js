/**
 * BUS BELL - Основная логика приложения
 */

// Состояние приложения
const AppState = {
    currentCity: null,
    currentPosition: null,
    allRoutes: [],
    filteredRoutes: [],
    selectedRoute: null,
    selectedStop: null,
    reminders: []
};

// Инициализация приложения
async function initApp() {
    console.log('🚀 Инициализация BUS BELL...');
    
    // Показываем статус загрузки
    updateLocationStatus('Определяем местоположение...');
    
    try {
        // Получаем геопозицию пользователя
        const position = await getCurrentPosition();
        AppState.currentPosition = position.coords;
        
        console.log('📍 Позиция получена:', position.coords.latitude, position.coords.longitude);
        
        // Определяем город
        const city = window.transportAPI.detectCity(
            position.coords.latitude,
            position.coords.longitude
        );
        
        AppState.currentCity = city;
        updateLocationStatus(city);
        updateCityName(`${city} • Загрузка маршрутов...`);
        
        console.log('🏙️ Город определен:', city);
        
        // Загружаем маршруты
        await loadRoutes(city);
        
        console.log('✅ Инициализация завершена');
        
    } catch (error) {
        console.error('❌ Ошибка инициализации:', error);
        
        // Fallback - предлагаем выбрать город вручную
        showCitySelector();
    }
    
    // Инициализируем обработчики событий
    initEventListeners();
    
    // Загружаем сохраненные напоминания
    loadReminders();
}

/**
 * Получить текущую геопозицию
 */
function getCurrentPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Геолокация не поддерживается'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            resolve,
            reject,
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    });
}

/**
 * Загрузить маршруты города
 */
async function loadRoutes(city) {
    const routesList = document.getElementById('routesList');
    
    try {
        // Показываем загрузку
        routesList.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>Загружаем маршруты ${city}...</p>
            </div>
        `;
        
        // Получаем маршруты из API
        const routes = await window.transportAPI.getRoutes(city);
        
        console.log(`📊 Получено маршрутов: ${routes.length}`);
        
        AppState.allRoutes = routes;
        AppState.filteredRoutes = routes;
        
        // Обновляем UI
        updateCityName(`${city} • ${routes.length} маршрутов`);
        document.getElementById('busCount').textContent = routes.length;
        
        // Отображаем маршруты
        displayRoutes(routes);
        
    } catch (error) {
        console.error('Ошибка загрузки маршрутов:', error);
        routesList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">😔</div>
                <p>Не удалось загрузить маршруты</p>
                <p style="font-size: 12px; margin-top: 10px;">
                    Попробуйте выбрать другой город или повторите попытку позже
                </p>
            </div>
        `;
    }
}

/**
 * Отобразить маршруты
 */
function displayRoutes(routes) {
    const routesList = document.getElementById('routesList');
    
    if (routes.length === 0) {
        routesList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔍</div>
                <p>Маршруты не найдены</p>
            </div>
        `;
        return;
    }
    
    routesList.innerHTML = '';
    
    routes.forEach(route => {
        const routeCard = document.createElement('div');
        routeCard.className = 'route-card';
        routeCard.onclick = () => showRouteStops(route);
        
        const routeTypeIcon = getRouteTypeIcon(route.routeType);
        const routeTypeLabel = getRouteTypeLabel(route.routeType);
        
        routeCard.innerHTML = `
            <div class="route-info">
                <div>
                    <span class="route-number">${route.routeNumber}</span>
                    <span class="route-type">${routeTypeIcon} ${routeTypeLabel}</span>
                </div>
                <div class="route-name">${route.routeName}</div>
                <div class="route-stops">Остановок: ${route.stops.length}</div>
            </div>
            <div class="route-arrow">›</div>
        `;
        
        routesList.appendChild(routeCard);
    });
}

/**
 * Показать остановки маршрута
 */
function showRouteStops(route) {
    console.log('📋 Открываем маршрут:', route.routeNumber);
    
    AppState.selectedRoute = route;
    
    const modal = document.getElementById('stopsModal');
    const title = document.getElementById('modalRouteTitle');
    const body = document.getElementById('modalStopsBody');
    
    title.textContent = `Маршрут ${route.routeNumber}`;
    
    // Создаем список остановок
    let html = '';
    
    route.stops.forEach((stop, index) => {
        // Вычисляем расстояние до остановки
        let distanceHtml = '';
        if (AppState.currentPosition) {
            const distance = window.transportAPI.calculateDistance(
                AppState.currentPosition.latitude,
                AppState.currentPosition.longitude,
                stop.lat,
                stop.lon
            );
            const distanceMeters = Math.round(distance * 1000);
            distanceHtml = `<div class="stop-distance">📍 ${distanceMeters} м от вас</div>`;
        }
        
        html += `
            <div class="stop-item" onclick="selectStop(${index})">
                <div>
                    <span class="stop-number">${index + 1}</span>
                    <span class="stop-name">${stop.name}</span>
                </div>
                <div class="stop-coords">${stop.lat.toFixed(6)}, ${stop.lon.toFixed(6)}</div>
                ${distanceHtml}
            </div>
        `;
    });
    
    body.innerHTML = html;
    
    modal.classList.add('active');
}

/**
 * Выбрать остановку для напоминания
 */
function selectStop(stopIndex) {
    const stop = AppState.selectedRoute.stops[stopIndex];
    AppState.selectedStop = {
        ...stop,
        routeNumber: AppState.selectedRoute.routeNumber,
        routeName: AppState.selectedRoute.routeName,
        stopIndex: stopIndex
    };
    
    console.log('🎯 Выбрана остановка:', stop.name);
    
    // Закрываем модал остановок
    closeStopsModal();
    
    // Открываем модал создания напоминания
    showReminderModal();
}

/**
 * Показать модал создания напоминания
 */
function showReminderModal() {
    const modal = document.getElementById('reminderModal');
    const stopInfo = document.getElementById('reminderStopInfo');
    const reminderText = document.getElementById('reminderText');
    
    stopInfo.innerHTML = `
        <strong>Маршрут ${AppState.selectedStop.routeNumber}</strong><br>
        ${AppState.selectedStop.name}
    `;
    
    reminderText.value = `Выйти на остановке "${AppState.selectedStop.name}"`;
    
    modal.classList.add('active');
}

/**
 * Создать напоминание
 */
function createReminder() {
    const reminderText = document.getElementById('reminderText').value;
    const reminderDistance = parseInt(document.getElementById('reminderDistance').value);
    const reminderSound = document.querySelector('input[name="sound"]:checked').value;
    
    if (!reminderText.trim()) {
        showNotification('Введите текст напоминания', 'error');
        return;
    }
    
    const reminder = {
        id: Date.now(),
        routeNumber: AppState.selectedStop.routeNumber,
        routeName: AppState.selectedStop.routeName,
        stopName: AppState.selectedStop.name,
        stopLat: AppState.selectedStop.lat,
        stopLon: AppState.selectedStop.lon,
        text: reminderText,
        distance: reminderDistance,
        sound: reminderSound,
        active: true,
        created: new Date().toISOString()
    };
    
    AppState.reminders.push(reminder);
    saveReminders();
    
    console.log('✅ Напоминание создано:', reminder);
    
    // Запускаем отслеживание
    startTracking(reminder);
    
    closeReminderModal();
    showNotification('✅ Напоминание создано!', 'success');
}

/**
 * Запустить отслеживание позиции
 */
function startTracking(reminder) {
    if (!navigator.geolocation) {
        console.error('Геолокация не поддерживается');
        return;
    }
    
    console.log('🎯 Начинаем отслеживание для:', reminder.stopName);
    
    const watchId = navigator.geolocation.watchPosition(
        (position) => {
            checkDistance(position, reminder, watchId);
        },
        (error) => {
            console.error('Ошибка отслеживания:', error);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 5000,
            timeout: 10000
        }
    );
    
    reminder.watchId = watchId;
}

/**
 * Проверить расстояние до остановки
 */
function checkDistance(position, reminder, watchId) {
    if (!reminder.active) {
        navigator.geolocation.clearWatch(watchId);
        return;
    }
    
    const distance = window.transportAPI.calculateDistance(
        position.coords.latitude,
        position.coords.longitude,
        reminder.stopLat,
        reminder.stopLon
    );
    
    const distanceMeters = distance * 1000;
    
    console.log(`📏 Расстояние до "${reminder.stopName}": ${Math.round(distanceMeters)}м`);
    
    // Если достигли нужного расстояния
    if (distanceMeters <= reminder.distance) {
        triggerReminder(reminder);
        navigator.geolocation.clearWatch(watchId);
    }
}

/**
 * Сработать напоминание
 */
function triggerReminder(reminder) {
    console.log('🔔 НАПОМИНАНИЕ!', reminder.text);
    
    // Показываем уведомление
    showNotification(`🔔 ${reminder.text}`, 'reminder');
    
    // Воспроизводим звук
    playSound(reminder.sound);
    
    // Показываем системное уведомление
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('BUS BELL', {
            body: reminder.text,
            icon: '🔔',
            vibrate: [200, 100, 200]
        });
    }
    
    // Деактивируем напоминание
    reminder.active = false;
    saveReminders();
}

/**
 * Воспроизвести звук
 */
function playSound(soundType) {
    // Здесь можно добавить реальные аудио файлы
    console.log('🔊 Воспроизводим звук:', soundType);
    
    // Вибрация на мобильных устройствах
    if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200, 100, 200]);
    }
}

/**
 * Сохранить напоминания
 */
function saveReminders() {
    localStorage.setItem('busbell_reminders', JSON.stringify(AppState.reminders));
}

/**
 * Загрузить напоминания
 */
function loadReminders() {
    const saved = localStorage.getItem('busbell_reminders');
    if (saved) {
        AppState.reminders = JSON.parse(saved);
        
        // Запускаем активные напоминания
        AppState.reminders.forEach(reminder => {
            if (reminder.active) {
                startTracking(reminder);
            }
        });
    }
}

/**
 * Инициализация обработчиков событий
 */
function initEventListeners() {
    // Поиск маршрутов
    const searchInput = document.getElementById('routeSearch');
    const clearSearch = document.getElementById('clearSearch');
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        
        clearSearch.style.display = query ? 'block' : 'none';
        
        if (!query) {
            AppState.filteredRoutes = AppState.allRoutes;
        } else {
            AppState.filteredRoutes = AppState.allRoutes.filter(route => 
                route.routeNumber.toLowerCase().includes(query) ||
                route.routeName.toLowerCase().includes(query)
            );
        }
        
        displayRoutes(AppState.filteredRoutes);
    });
    
    clearSearch.addEventListener('click', () => {
        searchInput.value = '';
        clearSearch.style.display = 'none';
        AppState.filteredRoutes = AppState.allRoutes;
        displayRoutes(AppState.filteredRoutes);
    });
    
    // Запрос разрешения на уведомления
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

/**
 * Показать селектор города
 */
function showCitySelector() {
    const cities = window.transportAPI.getCities();
    
    const routesList = document.getElementById('routesList');
    
    let html = `
        <div class="empty-state">
            <div class="empty-state-icon">🌍</div>
            <p>Выберите ваш город</p>
            <select id="citySelector" style="margin-top: 20px; padding: 12px; border-radius: 10px; font-size: 16px;">
                <option value="">Выберите город</option>
    `;
    
    cities.forEach(city => {
        html += `<option value="${city}">${city}</option>`;
    });
    
    html += `
            </select>
            <button onclick="selectCityManually()" style="margin-top: 15px; padding: 12px 30px; background: var(--primary-color); color: white; border: none; border-radius: 10px; cursor: pointer; font-size: 16px;">
                Загрузить маршруты
            </button>
        </div>
    `;
    
    routesList.innerHTML = html;
    updateLocationStatus('Выберите город вручную');
}

/**
 * Выбрать город вручную
 */
window.selectCityManually = async function() {
    const selector = document.getElementById('citySelector');
    const city = selector.value;
    
    if (!city) {
        showNotification('Выберите город', 'error');
        return;
    }
    
    AppState.currentCity = city;
    updateLocationStatus(city);
    updateCityName(`${city} • Загрузка...`);
    
    await loadRoutes(city);
};

/**
 * Закрыть модальные окна
 */
window.closeStopsModal = function() {
    document.getElementById('stopsModal').classList.remove('active');
};

window.closeReminderModal = function() {
    document.getElementById('reminderModal').classList.remove('active');
};

/**
 * Обновить статус местоположения
 */
function updateLocationStatus(text) {
    document.getElementById('locationText').textContent = text;
}

/**
 * Обновить название города
 */
function updateCityName(text) {
    document.getElementById('cityName').textContent = text;
}

/**
 * Показать уведомление
 */
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

/**
 * Получить иконку типа маршрута
 */
function getRouteTypeIcon(type) {
    const icons = {
        'bus': '🚌',
        'trolleybus': '🚎',
        'tram': '🚊'
    };
    return icons[type] || '🚌';
}

/**
 * Получить название типа маршрута
 */
function getRouteTypeLabel(type) {
    const labels = {
        'bus': 'Автобус',
        'trolleybus': 'Троллейбус',
        'tram': 'Трамвай'
    };
    return labels[type] || 'Автобус';
}

// Запуск приложения при загрузке страницы
window.addEventListener('DOMContentLoaded', initApp);
