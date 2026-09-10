/**
 * db.js - Camada de Banco de Dados Híbrida: Supabase Cloud & IndexedDB Offline
 * Conectado ao Supabase com fallback inteligente e cache offline 100% funcional.
 */

const DB_NAME = 'ListaComprasDB';
const DB_VERSION = 1;

// Configuração Padrão do Supabase fornecida pelo usuário
const DEFAULT_SUPABASE_URL = 'https://xlxuwqcszhxxzofebkjb.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhseHV3cWNzemh4eHpvZmVia2piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNjUxNzYsImV4cCI6MjEwNDY0MTE3Nn0.ME_Zo11tBK-U5CuYnLtAGvwuok-YZFcPfuLbaZxiVjE';

class Database {
  constructor() {
    this.db = null;
    this.initPromise = null;
    this.supabaseUrl = DEFAULT_SUPABASE_URL;
    this.supabaseKey = DEFAULT_SUPABASE_KEY;
    this.isCloudOnline = false;
    this.isTableReady = false;
  }

  /**
   * Inicializa o IndexedDB local
   */
  async init() {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('listas')) {
          const listStore = db.createObjectStore('listas', { keyPath: 'id' });
          listStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
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

  async getStore(storeName, mode = 'readonly') {
    const db = await this.init();
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  // ==========================================================
  // Métodos REST para Supabase Cloud
  // ==========================================================

  getHeaders() {
    return {
      'apikey': this.supabaseKey,
      'Authorization': `Bearer ${this.supabaseKey}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Testa a conexão e verifica se a tabela 'listas' existe no Supabase
   */
  async checkCloudStatus() {
    if (!this.supabaseUrl || !this.supabaseKey) {
      return { connected: false, tableReady: false, message: 'Credenciais não configuradas' };
    }

    try {
      const endpoint = `${this.supabaseUrl}/rest/v1/listas?select=id&limit=1`;
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (res.ok) {
        this.isCloudOnline = true;
        this.isTableReady = true;
        return { connected: true, tableReady: true, message: 'Conectado e sincronizado com o Supabase Cloud!' };
      }

      if (res.status === 404) {
        this.isCloudOnline = true;
        this.isTableReady = false;
        return { 
          connected: true, 
          tableReady: false, 
          message: 'Supabase conectado, mas a tabela "listas" precisa ser criada via schema.sql.' 
        };
      }

      return { connected: false, tableReady: false, message: `Erro HTTP ${res.status}` };
    } catch (err) {
      this.isCloudOnline = false;
      return { connected: false, tableReady: false, message: 'Sem conexão com a nuvem (operando offline no IndexedDB)' };
    }
  }

  // ==========================================================
  // Operações de Listas (Híbrido: Cloud + Local)
  // ==========================================================

  /**
   * Retorna todas as listas (tenta Supabase e sincroniza no IndexedDB; fallback para IndexedDB)
   */
  async getLists() {
    await this.init();

    // 1. Tenta buscar da nuvem (Supabase)
    if (this.supabaseUrl && this.supabaseKey) {
      try {
        const endpoint = `${this.supabaseUrl}/rest/v1/listas?select=*&order=created_at.desc`;
        const res = await fetch(endpoint, {
          method: 'GET',
          headers: this.getHeaders()
        });

        if (res.ok) {
          const cloudData = await res.json();
          this.isCloudOnline = true;
          this.isTableReady = true;

          // Mapeia do schema do Supabase para o formato do app
          const mappedLists = cloudData.map(row => ({
            id: row.id,
            name: row.name,
            category: row.category,
            budget: Number(row.budget) || 0,
            items: Array.isArray(row.items) ? row.items : [],
            createdAt: row.created_at || new Date().toISOString()
          }));

          // Atualiza o cache local no IndexedDB silenciosamente
          for (const list of mappedLists) {
            await this.saveLocalList(list);
          }

          return mappedLists;
        }
      } catch (err) {
        console.warn('Falha ao conectar no Supabase Cloud, usando IndexedDB local:', err);
      }
    }

    // 2. Fallback: Lê do IndexedDB local
    return await this.getLocalLists();
  }

  async getLocalLists() {
    const store = await this.getStore('listas', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const lists = request.result || [];
        lists.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        resolve(lists);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getListById(id) {
    const store = await this.getStore('listas', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Salva uma lista no IndexedDB e sincroniza no Supabase
   */
  async saveList(list) {
    // 1. Salva localmente primeiro (garantia de velocidade e persistência offline)
    await this.saveLocalList(list);

    // 2. Tenta enviar para o Supabase se disponível
    if (this.supabaseUrl && this.supabaseKey) {
      try {
        const endpoint = `${this.supabaseUrl}/rest/v1/listas`;
        const payload = {
          id: list.id,
          name: list.name,
          category: list.category,
          budget: list.budget,
          items: list.items || [],
          created_at: list.createdAt
        };

        await fetch(endpoint, {
          method: 'POST',
          headers: {
            ...this.getHeaders(),
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.warn('Lista salva localmente, mas sincronização em nuvem falhou:', err);
      }
    }

    return list;
  }

  async saveLocalList(list) {
    const store = await this.getStore('listas', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(list);
      request.onsuccess = () => resolve(list);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Exclui uma lista do IndexedDB e do Supabase
   */
  async deleteList(id) {
    // 1. Deleta localmente
    const store = await this.getStore('listas', 'readwrite');
    await new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });

    // 2. Deleta no Supabase
    if (this.supabaseUrl && this.supabaseKey) {
      try {
        const endpoint = `${this.supabaseUrl}/rest/v1/listas?id=eq.${id}`;
        await fetch(endpoint, {
          method: 'DELETE',
          headers: this.getHeaders()
        });
      } catch (err) {
        console.warn('Exclusão em nuvem falhou:', err);
      }
    }

    return true;
  }

  /**
   * Atualiza o orçamento estipulado
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
    return await this.saveList(list);
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
      return await this.saveList(list);
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
    return await this.saveList(list);
  }

  /**
   * Gestão de Chaves de Configuração
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

// Exporta instância do banco
const db = new Database();
