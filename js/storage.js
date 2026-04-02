/**
 * Storage Layer for ExamPrep Pro
 * Handles local persistence of tests, banks, and analytics.
 */

const DB_NAME = 'ExamPrepProDB';
const DB_VERSION = 1;

export class StorageService {
    static async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // Store for extracted question banks
                if (!db.objectStoreNames.contains('questionBanks')) {
                    db.createObjectStore('questionBanks', { keyPath: 'id', autoIncrement: true });
                }
                // Store for test history/results
                if (!db.objectStoreNames.contains('history')) {
                    db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    static async saveBank(bank) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['questionBanks'], 'readwrite');
            const store = transaction.objectStore('questionBanks');
            const request = store.add({
                name: bank.name,
                questions: bank.questions,
                createdAt: new Date().toISOString()
            });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    static async getBanks() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['questionBanks'], 'readonly');
            const store = transaction.objectStore('questionBanks');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    static async saveResult(result) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['history'], 'readwrite');
            const store = transaction.objectStore('history');
            const request = store.add({
                ...result,
                timestamp: new Date().toISOString()
            });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    static async getHistory() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['history'], 'readonly');
            const store = transaction.objectStore('history');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    static async getHistoryItem(id) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['history'], 'readonly');
            const store = transaction.objectStore('history');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}
