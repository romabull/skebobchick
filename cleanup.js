// cleanup.js
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let serviceAccount;
try {
    serviceAccount = require('./serviceAccountKey.json');
} catch (e) {
    console.error('❌ Нужен файл serviceAccountKey.json');
    process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function cleanup() {
    console.log('🧹 Очистка callRooms и callSignals...\n');
    
    // Удаляем все комнаты
    const rooms = await db.collection('callRooms').get();
    let roomCount = 0;
    for (const doc of rooms.docs) {
        await doc.ref.delete();
        console.log(`  ❌ Удалена комната: ${doc.id}`);
        roomCount++;
    }
    
    // Удаляем все сигналы
    const signals = await db.collection('callSignals').get();
    let signalCount = 0;
    for (const doc of signals.docs) {
        await doc.ref.delete();
        signalCount++;
    }
    
    console.log(`\n✅ Готово!`);
    console.log(`   Удалено комнат: ${roomCount}`);
    console.log(`   Удалено сигналов: ${signalCount}`);
    process.exit(0);
}

cleanup().catch(err => {
    console.error('Ошибка:', err);
    process.exit(1);
});