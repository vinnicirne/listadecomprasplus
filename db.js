/**
 * db.js - Camada de Banco de Dados SaaS: Supabase Auth, Cloud & IndexedDB Offline
 * Suporte multi-inquilino com Row Level Security (RLS), persistência de sessão e cache offline.
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
    this.accessToken = null;
    this.user = null;
    this.isCloudOnline = false;
    this.isTableReady = false;
  }

  /**
   * Inicializa o IndexedDB local e restaura sessão do usuário
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
          listStore.createIndex('userId', 'userId', { unique: false });
        }
        if (!db.objectStoreNames.contains('config')) {
          db.createObjectStore('config', { keyPath: 'key' });
        }
      };

      request.onsuccess = async (event) => {
        this.db = event.target.result;
        await this.loadSession();
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
  // Métodos de Autenticação (Supabase Auth - SaaS Multi-usuário)
  // ==========================================================

  async signUp(email, password, name, phone, marketingConsent = true) {
    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error('Supabase não configurado');
    }

    const endpoint = `${this.supabaseUrl}/auth/v1/signup`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'apikey': this.supabaseKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email.trim(),
        password: password,
        data: {
          name: name ? name.trim() : email.split('@')[0],
          phone: phone ? phone.trim() : '',
          marketing_consent: Boolean(marketingConsent)
        }
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error_description || data.msg || data.message || 'Erro ao criar conta no sistema');
    }

    if (data.session) {
      await this.setSession(data.session, true);
    } else if (data.access_token) {
      await this.setSession(data, true);
    } else if (data.user) {
      this.user = data.user;
    }

    return data;
  }

  async signIn(email, password, rememberMe = true) {
    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error('Supabase não configurado');
    }

    const endpoint = `${this.supabaseUrl}/auth/v1/token?grant_type=password`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'apikey': this.supabaseKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email.trim(),
        password: password
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error_description || data.msg || data.message || 'E-mail ou senha incorretos');
    }

    await this.setSession(data, rememberMe);
    return data;
  }

  async signOut() {
    if (this.accessToken && this.supabaseUrl) {
      try {
        await fetch(`${this.supabaseUrl}/auth/v1/logout`, {
          method: 'POST',
          headers: this.getHeaders()
        });
      } catch (_) {}
    }

    this.accessToken = null;
    this.user = null;
    localStorage.removeItem('compras_auth_session');
    sessionStorage.removeItem('compras_auth_session');
    try {
      await this.setConfig('auth_session', null);
    } catch (_) {}
    return true;
  }

  async resetPassword(email) {
    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error('Supabase não configurado');
    }

    const endpoint = `${this.supabaseUrl}/auth/v1/recover`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'apikey': this.supabaseKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: email.trim() })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error_description || data.msg || data.message || 'Erro ao enviar recuperação de senha');
    }
    return data;
  }

  async setSession(sessionData, rememberMe = true) {
    this.accessToken = sessionData.access_token;
    this.user = sessionData.user || this.user;

    const toStore = {
      access_token: this.accessToken,
      refresh_token: sessionData.refresh_token,
      user: this.user,
      expires_at: sessionData.expires_at || (Date.now() / 1000 + (sessionData.expires_in || 3600)),
      remember_me: rememberMe
    };

    if (rememberMe) {
      localStorage.setItem('compras_auth_session', JSON.stringify(toStore));
      sessionStorage.removeItem('compras_auth_session');
      try {
        await this.setConfig('auth_session', toStore);
      } catch (_) {}
    } else {
      sessionStorage.setItem('compras_auth_session', JSON.stringify(toStore));
      localStorage.removeItem('compras_auth_session');
      try {
        await this.setConfig('auth_session', null);
      } catch (_) {}
    }
  }

  async loadSession() {
    try {
      // 1. Tenta carregar do localStorage
      let cached = localStorage.getItem('compras_auth_session');
      if (!cached) {
        // 2. Tenta carregar do sessionStorage
        cached = sessionStorage.getItem('compras_auth_session');
      }

      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.access_token) {
          this.accessToken = parsed.access_token;
          this.user = parsed.user;
          return parsed;
        }
      }

      // 3. Fallback para IndexedDB
      const dbSession = await this.getConfig('auth_session');
      if (dbSession && dbSession.access_token) {
        this.accessToken = dbSession.access_token;
        this.user = dbSession.user;
        localStorage.setItem('compras_auth_session', JSON.stringify(dbSession));
        return dbSession;
      }
    } catch (_) {}
    return null;
  }

  getUser() {
    return this.user;
  }

  isAuthenticated() {
    return Boolean(this.user && this.accessToken);
  }

  // ==========================================================
  // Métodos REST para Supabase Cloud
  // ==========================================================

  getHeaders() {
    const authHeader = this.accessToken ? `Bearer ${this.accessToken}` : `Bearer ${this.supabaseKey}`;
    return {
      'apikey': this.supabaseKey,
      'Authorization': authHeader,
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
        return { 
          connected: true, 
          tableReady: true, 
          message: this.isAuthenticated() 
            ? `Conectado como ${this.user?.email || 'Usuário'} (SaaS Ativo)` 
            : 'Conectado ao Supabase Cloud!' 
        };
      }

      if (res.status === 404) {
        this.isCloudOnline = true;
        this.isTableReady = false;
        return { 
          connected: true, 
          tableReady: false, 
          message: 'Supabase conectado, mas a tabela "listas" precisa ser atualizada via schema.sql.' 
        };
      }

      return { connected: false, tableReady: false, message: `Erro HTTP ${res.status}` };
    } catch (err) {
      this.isCloudOnline = false;
      return { connected: false, tableReady: false, message: 'Sem conexão com a nuvem (operando offline no IndexedDB)' };
    }
  }

  // ==========================================================
  // Operações de Listas (Híbrido: Cloud + Local + RLS)
  // ==========================================================

  /**
   * Retorna todas as listas (tenta Supabase com RLS e sincroniza no IndexedDB; fallback para IndexedDB)
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
            userId: row.user_id || (this.user ? this.user.id : null),
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
        let lists = request.result || [];
        if (this.user && this.user.id) {
          // No modo autenticado, mostra listas do usuário ou criadas localmente sem userId
          lists = lists.filter(l => !l.userId || l.userId === this.user.id);
        }
        lists.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        resolve(lists);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getListById(id) {
    await this.init();
    try {
      const store = await this.getStore('listas', 'readonly');
      const local = await new Promise((resolve) => {
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
      if (local) return local;

      // Se id for string numérica ou número, tenta o formato alternativo
      const altId = typeof id === 'number' ? String(id) : (!isNaN(Number(id)) ? Number(id) : null);
      if (altId !== null) {
        const altLocal = await new Promise((resolve) => {
          const req = store.get(altId);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        });
        if (altLocal) return altLocal;
      }
    } catch (err) {
      console.warn('Erro ao consultar IndexedDB:', err);
    }

    // Fallback: Busca diretamente na nuvem (Supabase com token do usuário)
    if (this.supabaseUrl && this.supabaseKey) {
      try {
        const endpoint = `${this.supabaseUrl}/rest/v1/listas?id=eq.${encodeURIComponent(id)}&limit=1`;
        const res = await fetch(endpoint, {
          method: 'GET',
          headers: this.getHeaders()
        });

        if (res.ok) {
          const rows = await res.json();
          if (rows && rows.length > 0) {
            const row = rows[0];
            const cloudList = {
              id: row.id,
              userId: row.user_id || (this.user ? this.user.id : null),
              name: row.name,
              category: row.category,
              budget: Number(row.budget) || 0,
              items: Array.isArray(row.items) ? row.items : [],
              createdAt: row.created_at || new Date().toISOString()
            };
            await this.saveLocalList(cloudList);
            return cloudList;
          }
        }
      } catch (err) {
        console.warn('Erro ao buscar lista na nuvem:', err);
      }
    }

    return null;
  }

  /**
   * Salva uma lista no IndexedDB e sincroniza no Supabase (com user_id)
   */
  async saveList(list) {
    if (this.user && !list.userId) {
      list.userId = this.user.id;
    }

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

        // Adiciona user_id apenas se o usuário estiver logado
        if (this.user && this.user.id) {
          payload.user_id = this.user.id;
        }

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
   * Sincroniza listas locais criadas em modo convidado para a conta recém logada
   */
  async migrateLocalListsToCloud() {
    if (!this.isAuthenticated()) return;
    try {
      const store = await this.getStore('listas', 'readonly');
      const allLocal = await new Promise((res) => {
        const req = store.getAll();
        req.onsuccess = () => res(req.result || []);
        req.onerror = () => res([]);
      });

      const orphanLists = allLocal.filter(l => !l.userId);
      for (const list of orphanLists) {
        list.userId = this.user.id;
        await this.saveList(list);
      }
    } catch (e) {
      console.warn('Erro ao migrar listas locais para nuvem:', e);
    }
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
