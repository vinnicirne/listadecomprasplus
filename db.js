/**
 * db.js - Camada de Banco de Dados Oficial (IndexedDB Nativo & Cloud Ready)
 * Armazenamento persistente real no dispositivo, 100% offline-first e sem mocks.
 */

const DB_NAME = 'ListaComprasDB';
const DB_VERSION = 1;

class Database {
  constructor() {
    this.db = null;
    this.initPromise = null;
  }

  /**
   * Inicializa o banco de dados IndexedDB
   */
  async init() {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Store para listas de compras
        if (!db.objectStoreNames.contains('listas')) {
          const listStore = db.createObjectStore('listas', { keyPath: 'id' });
          listStore.createIndex('createdAt', 'createdAt', { unique: false });
          listStore.createIndex('category', 'category', { unique: false });
        }

        // Store para configurações do app (ex: chaves Supabase opcionais)
        if (!db.objectStoreNames.contains('config')) {
          db.createObjectStore('config', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('Erro ao abrir IndexedDB:', event.target.error);
        reject(event.target.error);
      };
    });

    return this.initPromise;
  }

  /**
   * Helper para executar transações no IndexedDB
   */
  async getStore(storeName, mode = 'readonly') {
    const db = await this.init();
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  /**
   * Retorna todas as listas cadastradas (sem nenhum dado mock)
   */
  async getLists() {
    const store = await this.getStore('listas', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const lists = request.result || [];
        // Ordena por data decrescente (mais recente primeiro)
        lists.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        resolve(lists);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retorna uma lista específica pelo ID
   */
  async getListById(id) {
    const store = await this.getStore('listas', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Cria ou atualiza uma lista no banco de dados
   */
  async saveList(list) {
    const store = await this.getStore('listas', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(list);
      request.onsuccess = () => resolve(list);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Exclui uma lista do banco de dados
   */
  async deleteList(id) {
    const store = await this.getStore('listas', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Atualiza o orçamento estipulado de uma lista
   */
  async updateBudget(listId, newBudget) {
    const list = await this.getListById(listId);
    if (!list) throw new Error('Lista não encontrada');
    list.budget = Number(newBudget) || 0;
    return await this.saveList(list);
  }

  /**
   * Adiciona um produto à lista
   */
  async addItem(listId, item) {
    const list = await this.getListById(listId);
    if (!list) throw new Error('Lista não encontrada');
    if (!list.items) list.items = [];
    
    list.items.push(item);
    await this.saveList(list);
    return list;
  }

  /**
   * Alterna o status de comprado de um item
   */
  async toggleItem(listId, itemId, checked) {
    const list = await this.getListById(listId);
    if (!list || !list.items) return null;

    const item = list.items.find(i => i.id === itemId);
    if (item) {
      item.checked = checked;
      await this.saveList(list);
    }
    return list;
  }

  /**
   * Exclui um produto da lista
   */
  async deleteItem(listId, itemId) {
    const list = await this.getListById(listId);
    if (!list || !list.items) return null;

    list.items = list.items.filter(i => i.id !== itemId);
    await this.saveList(list);
    return list;
  }

  /**
   * Métodos de Configuração (para Supabase Cloud opcional)
   */
  async getConfig(key) {
    try {
      const store = await this.getStore('config', 'readonly');
      return new Promise((resolve) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : null);
        req.onerror = () => resolve(null);
      });
    } catch (_) {
      return null;
    }
  }

  async setConfig(key, value) {
    const store = await this.getStore('config', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put({ key, value });
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }
}

// Instância singleton do Banco de Dados
const db = new Database();
