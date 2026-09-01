// В будущем можно добавить файловое хранилище
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

function loadDB() {
    try {
        if (fs.existsSync(DB_PATH)) {
            return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        }
    } catch (error) {
        console.error('Ошибка загрузки БД:', error);
    }
    return { users: {}, tests: {}, results: {}, testIdCounter: 1 };
}

function saveDB(db) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    } catch (error) {
        console.error('Ошибка сохранения БД:', error);
    }
}

module.exports = { loadDB, saveDB };