/**
 * Transport API Client для BUS BELL
 * Работает без backend сервера, используя прямые запросы к OpenStreetMap
 */

class TransportAPI {
    constructor() {
        this.cache = new Map();
        this.cacheDuration = 3600000; // 1 час
        
        // Координаты городов России
        this.cityBounds = {
            'Москва': [55.5, 37.3, 55.9, 37.9],
            'Санкт-Петербург': [59.8, 30.1, 60.1, 30.6],
            'Краснодар': [44.8, 38.8, 45.2, 39.2],
            'Новосибирск': [54.8, 82.7, 55.2, 83.2],
            'Екатеринбург': [56.6, 60.4, 57.0, 60.9],
            'Нижний Новгород': [56.2, 43.7, 56.4, 44.2],
            'Казань': [55.7, 49.0, 55.9, 49.3],
            'Челябинск': [55.0, 61.2, 55.3, 61.6],
            'Самара': [53.1, 50.0, 53.3, 50.3],
            'Ростов-на-Дону': [47.1, 39.5, 47.4, 39.9],
            'Уфа': [54.6, 55.8, 54.9, 56.2],
            'Волгоград': [48.5, 44.3, 48.8, 44.7],
            'Омск': [54.8, 73.2, 55.1, 73.6],
            'Красноярск': [55.9, 92.7, 56.1, 93.1],
            'Воронеж': [51.6, 39.1, 51.8, 39.3],
            'Пермь': [57.9, 56.1, 58.1, 56.4]
        };
    }

    /**
     * Получить список доступных городов
     */
    getCities() {
        return Object.keys(this.cityBounds);
    }

    /**
     * Определить город по координатам
     */
    detectCity(lat, lon) {
        let nearestCity = null;
        let minDistance = Infinity;

        for (const [city, bounds] of Object.entries(this.cityBounds)) {
            // Центр города
            const centerLat = (bounds[0] + bounds[2]) / 2;
            const centerLon = (bounds[1] + bounds[3]) / 2;
            
            const distance = this.calculateDistance(lat, lon, centerLat, centerLon);
            
            if (distance < minDistance) {
                minDistance = distance;
                nearestCity = city;
            }
        }

        return nearestCity || 'Москва';
    }

    /**
     * Вычислить расстояние между двумя точками
     */
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Радиус Земли в км
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Получить маршруты города из OpenStreetMap
     */
    async getRoutes(city, routeNumber = null) {
        const cacheKey = `routes_${city}_${routeNumber || 'all'}`;
        
        // Проверяем кэш
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheDuration) {
                return cached.data;
            }
        }

        const bounds = this.cityBounds[city];
        if (!bounds) {
            throw new Error(`Город ${city} не поддерживается`);
        }

        const bbox = `${bounds[0]},${bounds[1]},${bounds[2]},${bounds[3]}`;

        // Formируем Overpass запрос
        let query;
        if (routeNumber) {
            query = `
                [out:json][timeout:30];
                (
                  relation["type"="route"]["route"="bus"]["ref"="${routeNumber}"](${bbox});
                  relation["type"="route"]["route"="trolleybus"]["ref"="${routeNumber}"](${bbox});
                  relation["type"="route"]["route"="tram"]["ref"="${routeNumber}"](${bbox});
                );
                out body;
                >;
                out skel qt;
            `;
        } else {
            query = `
                [out:json][timeout:60];
                (
                  relation["type"="route"]["route"="bus"](${bbox});
                  relation["type"="route"]["route"="trolleybus"](${bbox});
                  relation["type"="route"]["route"="tram"](${bbox});
                );
                out body;
                >;
                out skel qt;
            `;
        }

        try {
            // Используем CORS прокси для обхода ограничений
            const proxyUrl = 'https://corsproxy.io/?';
            const apiUrl = 'https://overpass-api.de/api/interpreter';
            
            const response = await fetch(proxyUrl + encodeURIComponent(apiUrl), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'data=' + encodeURIComponent(query)
            });

            if (!response.ok) {
                throw new Error('Ошибка получения данных: ' + response.status);
            }

            const data = await response.json();
            const routes = this.parseOSMData(data);

            console.log('✅ Получено маршрутов:', routes.length);

            // Кэшируем результат
            this.cache.set(cacheKey, {
                timestamp: Date.now(),
                data: routes
            });

            return routes;

        } catch (error) {
            console.error('❌ Ошибка получения маршрутов:', error);
            throw error;
        }
    }

    /**
     * Парсинг данных OSM
     */
    parseOSMData(data) {
        const routes = [];
        const nodes = {};

        // Собираем все узлы
        for (const element of data.elements) {
            if (element.type === 'node') {
                nodes[element.id] = element;
            }
        }

        // Обрабатываем маршруты
        for (const element of data.elements) {
            if (element.type === 'relation' && 
                element.tags && 
                element.tags.type === 'route') {
                
                const tags = element.tags;
                
                // Извлекаем остановки
                const stops = [];
                for (const member of element.members || []) {
                    if (member.role === 'platform' || member.role === 'stop') {
                        const node = nodes[member.ref];
                        if (node && node.tags) {
                            stops.push({
                                name: node.tags.name || 'Без названия',
                                lat: node.lat,
                                lon: node.lon
                            });
                        }
                    }
                }

                if (stops.length > 0) {
                    routes.push({
                        routeNumber: tags.ref || '',
                        routeName: tags.name || tags.ref || '',
                        routeType: tags.route || 'bus',
                        operator: tags.operator || '',
                        stops: stops,
                        source: 'OpenStreetMap'
                    });
                }
            }
        }

        return routes;
    }

    /**
     * Найти ближайшую остановку
     */
    findNearestStop(userLat, userLon, stops) {
        let nearest = null;
        let minDistance = Infinity;

        for (const stop of stops) {
            const distance = this.calculateDistance(
                userLat, userLon,
                stop.lat, stop.lon
            );

            if (distance < minDistance) {
                minDistance = distance;
                nearest = {
                    ...stop,
                    distance: Math.round(distance * 1000) // в метрах
                };
            }
        }

        return nearest;
    }

    /**
     * Очистить кэш
     */
    clearCache() {
        this.cache.clear();
    }
}

// Глобальный экземпляр API
window.transportAPI = new TransportAPI();
