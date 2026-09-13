// cleanup.js
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let serviceAccount;
try {
    serviceAccount = require('./serviceAccountKey.json');
} catch (e) {
    console.error('❌ Не найден serviceAccountKey.json в корне проекта');
    process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ✅ Список всех коллекций проекта
const ALL_COLLECTIONS = [
    'users',        // Пользователи
    'tests',        // Тесты
    'results',      // Результаты
    'lessons',      // Обучение
    'callRooms',    // Комнаты звонков
    'callSignals'   // Сигналы звонков
];

// ============ ФУНКЦИЯ УДАЛЕНИЯ КОЛЛЕКЦИИ ============
async function deleteCollection(collectionName) {
    console.log(`\n🧹 Удаляем: ${collectionName}`);
    
    const collectionRef = db.collection(collectionName);
    let deletedCount = 0;
    
    while (true) {
        const snapshot = await collectionRef.limit(500).get();
        if (snapshot.size === 0) break;
        
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        
        deletedCount += snapshot.size;
        process.stdout.write(`\r   Удалено: ${deletedCount}        `);
    }
    
    if (deletedCount === 0) {
        console.log(`\r   📭 Пусто                          `);
    } else {
        console.log(`\r   ✅ Удалено документов: ${deletedCount}   `);
    }
    
    return deletedCount;
}

// ============ ОЧИСТКА ВСЕГО ============
async function cleanupAll() {
    console.log('🚀 ОЧИСТКА ВСЕЙ БАЗЫ ДАННЫХ');
    console.log('=================================');
    
    let total = 0;
    for (const collection of ALL_COLLECTIONS) {
        total += await deleteCollection(collection);
    }
    
    console.log('\n=================================');
    console.log(`✅ ГОТОВО! Всего удалено: ${total} документов`);
    console.log('=================================\n');
}

// ============ ОЧИСТКА ВЫБРАННЫХ ============
async function cleanupSelected(collections) {
    console.log('🚀 ОЧИСТКА КОЛЛЕКЦИЙ:', collections.join(', '));
    console.log('=================================');
    
    let total = 0;
    for (const collection of collections) {
        total += await deleteCollection(collection);
    }
    
    console.log('\n=================================');
    console.log(`✅ ГОТОВО! Всего удалено: ${total} документов`);
    console.log('=================================\n');
}

// ============ ОСНОВНАЯ ЛОГИКА ============
const args = process.argv.slice(2);

async function main() {
    // Без аргументов → показать справку
    if (args.length === 0) {
        console.log(`
🧹 Утилита очистки Firestore
=====================================

Использование:
  node cleanup.js all                    — удалить ВСЁ
  node cleanup.js calls                  — удалить только звонки
  node cleanup.js signals                — удалить только сигналы
  node cleanup.js rooms                  — удалить только комнаты
  node cleanup.js users                  — удалить всех пользователей
  node cleanup.js tests                  — удалить все тесты
  node cleanup.js results                — удалить все результаты
  node cleanup.js lessons                — удалить все статьи
  node cleanup.js users tests            — удалить несколько коллекций

Доступные коллекции:
  ${ALL_COLLECTIONS.map(c => '• ' + c).join('\n  ')}

ВНИМАНИЕ: удаление необратимо!
        `);
        process.exit(0);
    }
    
    // Готовые пресеты
    const presets = {
        calls: ['callRooms', 'callSignals'],
        signals: ['callSignals'],
        rooms: ['callRooms'],
        users: ['users'],
        tests: ['tests'],
        results: ['results'],
        lessons: ['lessons']
    };
    
    // "all" → всё
    if (args[0] === 'all') {
        await cleanupAll();
        process.exit(0);
    }
    
    // Собираем коллекции
    let collectionsToDelete = [];
    
    for (const arg of args) {
        if (presets[arg]) {
            collectionsToDelete.push(...presets[arg]);
        } else if (ALL_COLLECTIONS.includes(arg)) {
            collectionsToDelete.push(arg);
        } else {
            console.error(`❌ Неизвестная коллекция: ${arg}`);
            console.log(`\nДоступные: ${ALL_COLLECTIONS.join(', ')}`);
            process.exit(1);
        }
    }
    
    // Убираем дубликаты
    collectionsToDelete = [...new Set(collectionsToDelete)];
    
    // Подтверждение
    console.log(`\n⚠️  ВНИМАНИЕ!`);
    console.log(`   Будут удалены коллекции: ${collectionsToDelete.join(', ')}`);
    console.log(`   Это действие НЕОБРАТИМО!\n`);
    
    // Для опасных операций — ждём 3 секунды
    const isDangerous = collectionsToDelete.includes('users') || 
                       collectionsToDelete.includes('tests') ||
                       args[0] === 'all';
    
    if (isDangerous) {
        console.log('⏳ Ожидание 3 сек... (Ctrl+C чтобы отменить)');
        await new Promise(r => setTimeout(r, 3000));
    }
    
    await cleanupSelected(collectionsToDelete);
    process.exit(0);
}

main().catch(err => {
    console.error('\n❌ Ошибка:', err.message);
    process.exit(1);
});