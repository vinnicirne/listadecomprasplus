/**
 * db.js - Camada de Banco de Dados SaaS: Supabase Auth, Cloud & IndexedDB Offline
 * Suporte multi-inquilino com Row Level Security (RLS), persistência de sessão e cache offline.
 */

const DB_NAME = 'ListaComprasDB';
const DB_VERSION = 4;

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
        if (!db.objectStoreNames.contains('historico')) {
          const histStore = db.createObjectStore('historico', { keyPath: 'id' });
          histStore.createIndex('purchasedAt', 'purchasedAt', { unique: false });
          histStore.createIndex('userId', 'userId', { unique: false });
        }
        if (!db.objectStoreNames.contains('carteira')) {
          const carteiraStore = db.createObjectStore('carteira', { keyPath: 'id' });
          carteiraStore.createIndex('userId', 'userId', { unique: false });
          carteiraStore.createIndex('entryDate', 'entryDate', { unique: false });
          carteiraStore.createIndex('yearMonth', 'yearMonth', { unique: false });
        }
        if (!db.objectStoreNames.contains('compartilhamentos')) {
          const compStore = db.createObjectStore('compartilhamentos', { keyPath: 'id' });
          compStore.createIndex('listaId', 'listaId', { unique: false });
          compStore.createIndex('inviteCode', 'inviteCode', { unique: false });
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
    if (!db.objectStoreNames.contains(storeName)) {
      throw new Error(`ObjectStore '${storeName}' ainda não inicializado`);
    }
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

  isAdmin() {
    if (!this.user) return false;
    const email = (this.user.email || '').toLowerCase().trim();
    if (email === 'viniciuscirne@gmail.com') return true;
    if (this.user.user_metadata?.role === 'admin') return true;
    if (this.user.app_metadata?.role === 'admin') return true;
    if (this.user.role === 'admin') return true;
    return false;
  }

  async getAdminProfiles() {
    if (!this.isAdmin()) {
      throw new Error('Acesso restrito ao administrador do sistema.');
    }
    const endpoint = `${this.supabaseUrl}/rest/v1/user_profiles?select=*&order=created_at.desc`;
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Erro ao consultar perfis e leads de usuários');
    }
    return await res.json();
  }

  async getAdminStats() {
    if (!this.isAdmin()) {
      return { totalUsers: 0, totalLists: 0, usersWithPhone: 0, profiles: [] };
    }

    try {
      const profiles = await this.getAdminProfiles();
      const totalUsers = profiles.length;
      const usersWithPhone = profiles.filter(p => p.phone && p.phone.trim().length >= 10).length;

      let totalLists = 0;
      let totalBudget = 0;
      let totalItems = 0;

      try {
        const resLists = await fetch(`${this.supabaseUrl}/rest/v1/listas?select=id,budget,items`, {
          method: 'GET',
          headers: this.getHeaders()
        });
        if (resLists.ok) {
          const listsData = await resLists.json();
          totalLists = listsData.length;
          totalBudget = listsData.reduce((s, l) => s + (Number(l.budget) || 0), 0);
          totalItems = listsData.reduce((s, l) => s + ((l.items || []).length), 0);
        }
      } catch (_) {}

      return {
        totalUsers,
        usersWithPhone,
        totalLists,
        totalBudget,
        totalItems,
        profiles
      };
    } catch (err) {
      console.warn('Erro ao obter dados administrativos:', err);
      return { totalUsers: 0, totalLists: 0, usersWithPhone: 0, profiles: [] };
    }
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
   * Bloqueia completamente o acesso se o usuário não estiver autenticado.
   */
  async getLists() {
    await this.init();

    // Se o usuário não estiver autenticado, retorna lista vazia imediatamente
    if (!this.isAuthenticated()) {
      return [];
    }

    // 1. Tenta buscar da nuvem (Supabase com token JWT do usuário)
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

          // Busca permissões de compartilhamento atribuídas ao usuário
          let sharesMap = {};
          try {
            const sharesRes = await fetch(`${this.supabaseUrl}/rest/v1/lista_compartilhamentos?select=*`, {
              headers: this.getHeaders()
            });
            if (sharesRes.ok) {
              const shares = await sharesRes.json();
              shares.forEach(s => {
                sharesMap[s.lista_id] = s.permission;
              });
            }
          } catch (_) {}

          // Mapeia do schema do Supabase para o formato do app
          const mappedLists = cloudData.map(row => {
            const isOwner = row.user_id === this.user.id;
            const permission = isOwner ? 'owner' : (sharesMap[row.id] || 'fechado');
            return {
              id: row.id,
              userId: row.user_id,
              name: row.name,
              category: row.category,
              budget: Number(row.budget) || 0,
              items: Array.isArray(row.items) ? row.items : [],
              createdAt: row.created_at || new Date().toISOString(),
              isShared: !isOwner,
              permission: permission
            };
          });

          // Inclui listas compartilhadas salvas localmente caso a query da nuvem ainda não as liste
          try {
            const localLists = await this.getLocalLists();
            const localShared = localLists.filter(l => l.isShared);
            for (const s of localShared) {
              if (!mappedLists.some(m => m.id === s.id)) {
                mappedLists.push(s);
              }
            }
          } catch (_) {}

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

    // 2. Fallback: Lê do IndexedDB local isolado por usuário ou compartilhadas
    return await this.getLocalLists();
  }

  async getLocalLists() {
    if (!this.isAuthenticated()) {
      return [];
    }
    const store = await this.getStore('listas', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        let lists = request.result || [];
        // Filtra pelo ID do usuário autenticado ou listas compartilhadas com ele
        lists = lists.filter(l => (l.userId && l.userId === this.user.id) || l.isShared);
        lists.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        resolve(lists);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getListById(id) {
    await this.init();
    if (!this.isAuthenticated()) {
      return null;
    }
    try {
      const store = await this.getStore('listas', 'readonly');
      const local = await new Promise((resolve) => {
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
      if (local && (!local.userId || (this.user && local.userId === this.user.id))) return local;

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
   * Salva uma lista no IndexedDB e sincroniza no Supabase (com user_id obrigatório)
   */
  async saveList(list) {
    if (!this.isAuthenticated()) {
      throw new Error('Você precisa estar autenticado para criar ou salvar listas.');
    }

    if (!list.userId) {
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
          user_id: this.user.id,
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
    if (!this.isAuthenticated()) {
      throw new Error('Você precisa estar autenticado para excluir listas.');
    }
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

  // ==========================================================
  // Histórico de Compras (Gravação, Balanço por Dia, Mês e Ano)
  // ==========================================================

  /**
   * Grava uma compra no histórico (Data, Dia, Mês, Ano e Itens)
   */
  async savePurchaseHistory(record) {
    await this.init();
    if (!this.isAuthenticated()) {
      throw new Error('Você precisa estar autenticado para registrar compras no histórico.');
    }

    const now = record.purchasedAt ? new Date(record.purchasedAt) : new Date();
    const historyItem = {
      id: record.id || ('compra_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now()),
      userId: this.user.id,
      listId: record.listId || null,
      listName: record.listName || 'Compras Diversas',
      category: record.category || 'Supermercado',
      budget: Number(record.budget) || 0,
      totalSpent: Number(record.totalSpent) || 0,
      savings: Number(record.savings !== undefined ? record.savings : (Number(record.budget) - Number(record.totalSpent))) || 0,
      items: Array.isArray(record.items) ? record.items : [],
      day: now.getDate(),
      month: now.getMonth() + 1, // 1 - 12
      year: now.getFullYear(),
      purchasedAt: now.toISOString()
    };

    // 1. Salva no IndexedDB local
    try {
      const store = await this.getStore('historico', 'readwrite');
      await new Promise((resolve, reject) => {
        const req = store.put(historyItem);
        req.onsuccess = () => resolve(historyItem);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('Erro ao salvar no cache local de histórico:', e);
    }

    // 2. Salva na nuvem (Supabase) com RLS
    if (this.supabaseUrl && this.supabaseKey) {
      try {
        const endpoint = `${this.supabaseUrl}/rest/v1/historico_compras`;
        const payload = {
          id: historyItem.id,
          user_id: this.user.id,
          list_id: historyItem.listId,
          list_name: historyItem.listName,
          category: historyItem.category,
          budget: historyItem.budget,
          total_spent: historyItem.totalSpent,
          savings: historyItem.savings,
          items: historyItem.items,
          day: historyItem.day,
          month: historyItem.month,
          year: historyItem.year,
          purchased_at: historyItem.purchasedAt
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
        console.warn('Erro ao sincronizar compra no Supabase:', err);
      }
    }

    return historyItem;
  }

  /**
   * Obtém todo o histórico de compras do usuário autenticado
   */
  async getPurchaseHistory() {
    await this.init();
    if (!this.isAuthenticated()) {
      return [];
    }

    // 1. Tenta buscar da nuvem (Supabase)
    if (this.supabaseUrl && this.supabaseKey) {
      try {
        const endpoint = `${this.supabaseUrl}/rest/v1/historico_compras?select=*&order=purchased_at.desc`;
        const res = await fetch(endpoint, {
          method: 'GET',
          headers: this.getHeaders()
        });

        if (res.ok) {
          const cloudData = await res.json();
          const mapped = cloudData.map(row => ({
            id: row.id,
            userId: row.user_id,
            listId: row.list_id,
            listName: row.list_name,
            category: row.category,
            budget: Number(row.budget) || 0,
            totalSpent: Number(row.total_spent) || 0,
            savings: Number(row.savings) || 0,
            items: Array.isArray(row.items) ? row.items : [],
            day: Number(row.day) || new Date(row.purchased_at).getDate(),
            month: Number(row.month) || (new Date(row.purchased_at).getMonth() + 1),
            year: Number(row.year) || new Date(row.purchased_at).getFullYear(),
            purchasedAt: row.purchased_at
          }));

          // Atualiza o IndexedDB silenciosamente
          try {
            const store = await this.getStore('historico', 'readwrite');
            for (const item of mapped) {
              store.put(item);
            }
          } catch (_) {}

          return mapped;
        }
      } catch (err) {
        console.warn('Falha ao buscar histórico do Supabase, usando IndexedDB:', err);
      }
    }

    // 2. Fallback: Lê do IndexedDB
    try {
      const store = await this.getStore('historico', 'readonly');
      return new Promise((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => {
          let list = req.result || [];
          list = list.filter(h => h.userId === this.user.id);
          list.sort((a, b) => new Date(b.purchasedAt) - new Date(a.purchasedAt));
          resolve(list);
        };
        req.onerror = () => resolve([]);
      });
    } catch (_) {
      return [];
    }
  }

  /**
   * Exclui um registro do histórico
   */
  async deletePurchaseHistory(id) {
    await this.init();
    if (!this.isAuthenticated()) {
      throw new Error('Acesso negado');
    }

    try {
      const store = await this.getStore('historico', 'readwrite');
      await new Promise((res, rej) => {
        const req = store.delete(id);
        req.onsuccess = () => res(true);
        req.onerror = () => rej(req.error);
      });
    } catch (_) {}

    if (this.supabaseUrl && this.supabaseKey) {
      try {
        const endpoint = `${this.supabaseUrl}/rest/v1/historico_compras?id=eq.${encodeURIComponent(id)}`;
        await fetch(endpoint, {
          method: 'DELETE',
          headers: this.getHeaders()
        });
      } catch (_) {}
    }

    return true;
  }

  /**
   * Calcula o balanço financeiro detalhado por Ano, Mês e Dia
   */
  calculateSpendingBalance(historyList, { year, month, day } = {}) {
    const list = historyList || [];
    const currentYear = year ? Number(year) : (list.length > 0 ? list[0].year : new Date().getFullYear());
    
    // Filtra pelo Ano
    let filtered = list.filter(item => item.year === currentYear);

    // Filtra pelo Mês (se informado)
    if (month && month !== 'all') {
      filtered = filtered.filter(item => item.month === Number(month));
    }

    // Filtra pelo Dia (se informado)
    if (day && day !== 'all') {
      filtered = filtered.filter(item => item.day === Number(day));
    }

    const totalSpent = filtered.reduce((sum, i) => sum + (Number(i.totalSpent) || 0), 0);
    const totalBudget = filtered.reduce((sum, i) => sum + (Number(i.budget) || 0), 0);
    const totalSavings = totalBudget - totalSpent;
    const count = filtered.length;
    const averagePerPurchase = count > 0 ? (totalSpent / count) : 0;

    // Balanço por Mês (Janeiro a Dezembro do Ano Selecionado)
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const byMonth = monthNames.map((name, idx) => {
      const mNum = idx + 1;
      const monthItems = list.filter(i => i.year === currentYear && i.month === mNum);
      const spent = monthItems.reduce((s, i) => s + (Number(i.totalSpent) || 0), 0);
      const budget = monthItems.reduce((s, i) => s + (Number(i.budget) || 0), 0);
      return {
        month: mNum,
        name,
        spent,
        budget,
        savings: budget - spent,
        count: monthItems.length
      };
    });

    // Balanço por Dia (Agrupamento por data de compra)
    const dayMap = {};
    filtered.forEach(item => {
      const key = `${String(item.day).padStart(2, '0')}/${String(item.month).padStart(2, '0')}/${item.year}`;
      if (!dayMap[key]) {
        dayMap[key] = {
          dateKey: key,
          day: item.day,
          month: item.month,
          year: item.year,
          spent: 0,
          budget: 0,
          count: 0,
          purchases: []
        };
      }
      dayMap[key].spent += Number(item.totalSpent) || 0;
      dayMap[key].budget += Number(item.budget) || 0;
      dayMap[key].count += 1;
      dayMap[key].purchases.push(item);
    });

    const byDay = Object.values(dayMap).sort((a, b) => {
      return new Date(b.year, b.month - 1, b.day) - new Date(a.year, a.month - 1, a.day);
    });

    // Balanço por Categoria
    const catMap = {};
    filtered.forEach(item => {
      const cat = item.category || 'Outros';
      if (!catMap[cat]) {
        catMap[cat] = { category: cat, spent: 0, count: 0 };
      }
      catMap[cat].spent += Number(item.totalSpent) || 0;
      catMap[cat].count += 1;
    });
    const byCategory = Object.values(catMap).sort((a, b) => b.spent - a.spent);

    return {
      year: currentYear,
      month: month || 'all',
      day: day || 'all',
      totalSpent,
      totalBudget,
      totalSavings,
      count,
      averagePerPurchase,
      byMonth,
      byDay,
      byCategory,
      filteredPurchases: filtered
    };
  }

  // ==========================================================
  // ATUALIZAÇÃO DO PERFIL DO USUÁRIO
  // ==========================================================

  /**
   * Atualiza dados de Nome e WhatsApp do usuário no Auth e na tabela user_profiles
   */
  async updateUserProfile({ name, phone }) {
    if (!this.isAuthenticated()) {
      throw new Error('Você precisa estar logado para atualizar seu perfil.');
    }

    if (!this.user.user_metadata) {
      this.user.user_metadata = {};
    }
    if (name !== undefined) this.user.user_metadata.name = name;
    if (phone !== undefined) this.user.user_metadata.phone = phone;

    await this.setSession(this.accessToken, this.user, localStorage.getItem('compras_plus_remember') === 'true');

    if (this.supabaseUrl && this.supabaseKey && this.accessToken) {
      try {
        // Atualiza no Supabase Auth
        await fetch(`${this.supabaseUrl}/auth/v1/user`, {
          method: 'PUT',
          headers: this.getHeaders(),
          body: JSON.stringify({
            data: { name, phone }
          })
        });

        // Atualiza na tabela user_profiles
        await fetch(`${this.supabaseUrl}/rest/v1/user_profiles?id=eq.${this.user.id}`, {
          method: 'PATCH',
          headers: this.getHeaders(),
          body: JSON.stringify({ name, phone })
        });
      } catch (err) {
        console.warn('Erro ao atualizar perfil na nuvem:', err);
      }
    }

    return this.user;
  }

  // ==========================================================
  // MÓDULO CARTEIRA FINANCEIRA (ENTRADAS, SALÁRIO E RENDAS)
  // ==========================================================

  /**
   * Grava ou atualiza uma entrada na carteira
   */
  async saveWalletEntry(entry) {
    if (!this.isAuthenticated()) {
      throw new Error('Você precisa estar autenticado para registrar entradas na carteira.');
    }

    await this.init();

    const id = entry.id || 'wall_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    const entryDate = entry.entryDate || new Date().toISOString().split('T')[0];
    const parts = entryDate.split('-');
    const year = Number(parts[0]) || new Date().getFullYear();
    const month = Number(parts[1]) || (new Date().getMonth() + 1);
    const day = Number(parts[2]) || new Date().getDate();

    const record = {
      id,
      userId: this.user ? this.user.id : null,
      description: entry.description || 'Renda',
      amount: Number(entry.amount) || 0,
      category: entry.category || 'Salário',
      status: entry.status || 'recebido', // 'recebido' ou 'a_receber'
      entryDate,
      day,
      month,
      year,
      yearMonth: `${year}-${String(month).padStart(2, '0')}`,
      createdAt: entry.createdAt || new Date().toISOString()
    };

    // 1. Salva no IndexedDB (com fallback de segurança em localStorage)
    try {
      const store = await this.getStore('carteira', 'readwrite');
      await new Promise((resolve, reject) => {
        const req = store.put(record);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    } catch (localErr) {
      console.warn('Aviso: gravando entrada no cache local de segurança:', localErr);
    }

    try {
      const local = JSON.parse(localStorage.getItem('compras_local_carteira') || '[]');
      const filtered = local.filter(e => e.id !== record.id);
      filtered.push(record);
      localStorage.setItem('compras_local_carteira', JSON.stringify(filtered));
    } catch (_) {}

    // 2. Sincroniza com o Supabase
    if (this.supabaseUrl && this.supabaseKey && this.accessToken) {
      try {
        const payload = {
          id: record.id,
          user_id: record.userId,
          description: record.description,
          amount: record.amount,
          category: record.category,
          status: record.status,
          entry_date: record.entryDate,
          day: record.day,
          month: record.month,
          year: record.year,
          created_at: record.createdAt
        };

        const res = await fetch(`${this.supabaseUrl}/rest/v1/carteira_entradas?on_conflict=id`, {
          method: 'POST',
          headers: {
            ...this.getHeaders(),
            'Prefer': 'resolution=merge-duplicates,return=representation'
          },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          this.isCloudOnline = true;
        }
      } catch (err) {
        console.warn('Erro ao sincronizar entrada na carteira:', err);
      }
    }

    return record;
  }

  /**
   * Obtém as entradas da carteira com filtros opcionais de ano e mês
   */
  async getWalletEntries(filter = {}) {
    if (!this.isAuthenticated()) {
      return [];
    }

    await this.init();

    // Tenta sincronizar com a nuvem
    if (this.supabaseUrl && this.supabaseKey && this.accessToken) {
      try {
        const res = await fetch(`${this.supabaseUrl}/rest/v1/carteira_entradas?select=*&order=created_at.desc`, {
          method: 'GET',
          headers: this.getHeaders()
        });

        if (res.ok) {
          const cloudData = await res.json();
          this.isCloudOnline = true;
          const store = await this.getStore('carteira', 'readwrite');
          for (const row of cloudData) {
            // Fallback: se entry_date vier nulo (tabela antiga sem a coluna), reconstrói a partir de day/month/year
            const entryDateStr = row.entry_date || null;
            const parts = entryDateStr ? entryDateStr.split('-') : [];
            const y = Number(row.year) || Number(parts[0]) || new Date().getFullYear();
            const m = Number(row.month) || Number(parts[1]) || 1;
            const d = Number(row.day) || Number(parts[2]) || 1;
            const entryDate = entryDateStr || `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

            await new Promise((resolve) => {
              const req = store.put({
                id: row.id,
                userId: row.user_id,
                description: row.description,
                amount: Number(row.amount) || 0,
                category: row.category,
                status: row.status,
                entryDate: entryDate,
                day: d,
                month: m,
                year: y,
                yearMonth: `${y}-${String(m).padStart(2, '0')}`,
                createdAt: row.created_at
              });
              req.onsuccess = () => resolve(true);
              req.onerror = () => resolve(false);
            });
          }
        }
      } catch (err) {
        console.warn('Falha ao sincronizar entradas da carteira da nuvem:', err);
      }
    }

    // Lê do IndexedDB local com fallback em localStorage
    let entries = [];
    try {
      const store = await this.getStore('carteira', 'readonly');
      entries = await new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch (_) {
      try {
        entries = JSON.parse(localStorage.getItem('compras_local_carteira') || '[]');
      } catch (_) {
        entries = [];
      }
    }

    entries = entries.filter(e => e.userId === this.user.id);

    if (filter.year && filter.year !== 'all') {
      entries = entries.filter(e => Number(e.year) === Number(filter.year));
    }
    if (filter.month && filter.month !== 'all') {
      entries = entries.filter(e => Number(e.month) === Number(filter.month));
    }

    entries.sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate));
    return entries;
  }

  /**
   * Exclui uma entrada da carteira
   */
  async deleteWalletEntry(id) {
    if (!this.isAuthenticated()) {
      throw new Error('Você precisa estar autenticado para excluir.');
    }

    const store = await this.getStore('carteira', 'readwrite');
    await new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });

    if (this.supabaseUrl && this.supabaseKey && this.accessToken) {
      try {
        await fetch(`${this.supabaseUrl}/rest/v1/carteira_entradas?id=eq.${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: this.getHeaders()
        });
      } catch (err) {
        console.warn('Falha ao excluir entrada da carteira na nuvem:', err);
      }
    }

    return true;
  }

  /**
   * Calcula o balanço da carteira unindo entradas financeiras e saídas (compras)
   */
  calculateWalletBalance(walletEntries = [], purchaseHistory = [], filter = {}) {
    const targetYear = filter.year && filter.year !== 'all' ? Number(filter.year) : null;
    const targetMonth = filter.month && filter.month !== 'all' ? Number(filter.month) : null;

    // Filtra entradas
    let filteredEntries = [...walletEntries];
    if (targetYear) filteredEntries = filteredEntries.filter(e => Number(e.year) === targetYear);
    if (targetMonth) filteredEntries = filteredEntries.filter(e => Number(e.month) === targetMonth);

    // Filtra compras (saídas)
    let filteredPurchases = [...purchaseHistory];
    if (targetYear) filteredPurchases = filteredPurchases.filter(p => Number(p.year) === targetYear);
    if (targetMonth) filteredPurchases = filteredPurchases.filter(p => Number(p.month) === targetMonth);

    const totalEntradas = filteredEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalRecebido = filteredEntries
      .filter(e => e.status === 'recebido')
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalAReceber = filteredEntries
      .filter(e => e.status === 'a_receber')
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);

    const totalSaidas = filteredPurchases.reduce((s, p) => s + (Number(p.totalSpent) || 0), 0);
    const saldoDisponivel = totalRecebido - totalSaidas;
    const saldoProjetado = (totalRecebido + totalAReceber) - totalSaidas;

    // Agrupamento por categoria de renda
    const catMap = {};
    filteredEntries.forEach(e => {
      const cat = e.category || 'Outros';
      if (!catMap[cat]) catMap[cat] = 0;
      catMap[cat] += Number(e.amount) || 0;
    });

    return {
      totalEntradas,
      totalRecebido,
      totalAReceber,
      totalSaidas,
      saldoDisponivel,
      saldoProjetado,
      entriesCount: filteredEntries.length,
      purchasesCount: filteredPurchases.length,
      byCategory: catMap,
      filteredEntries,
      filteredPurchases
    };
  }

  // ==========================================================
  // LISTAS COMPARTILHADAS (MODO ABERTO VS FECHADO)
  // ==========================================================

  /**
   * Gera um código de convite amigável de 6 caracteres (ex: LST-8492)
   */
  generateInviteCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'LST-';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Compartilha uma lista com um e-mail de usuário
   */
  async shareListWithEmail(listId, email, permission = 'fechado') {
    if (!this.isAuthenticated()) {
      throw new Error('Você precisa estar autenticado para compartilhar listas.');
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('E-mail inválido.');
    }

    const inviteCode = this.generateInviteCode();
    const shareRecord = {
      id: 'share_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now(),
      lista_id: listId,
      owner_id: this.user.id,
      shared_with_email: cleanEmail,
      permission: permission === 'aberto' ? 'aberto' : 'fechado',
      invite_code: inviteCode,
      created_at: new Date().toISOString()
    };

    if (this.supabaseUrl && this.supabaseKey && this.accessToken) {
      const res = await fetch(`${this.supabaseUrl}/rest/v1/lista_compartilhamentos`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(shareRecord)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Falha ao salvar compartilhamento na nuvem.');
      }
    }

    return shareRecord;
  }

  /**
   * Salva registro de compartilhamento no cache local (IndexedDB/localStorage)
   */
  saveLocalShare(shareRecord) {
    try {
      const shares = JSON.parse(localStorage.getItem('compras_local_shares') || '[]');
      const filtered = shares.filter(s => s.id !== shareRecord.id && s.invite_code !== shareRecord.invite_code);
      filtered.push(shareRecord);
      localStorage.setItem('compras_local_shares', JSON.stringify(filtered));
    } catch (_) {}
  }

  /**
   * Busca registro de compartilhamento pelo código no cache local
   */
  async getLocalShareByCode(code) {
    try {
      const clean = (code || '').trim().toUpperCase();
      const shares = JSON.parse(localStorage.getItem('compras_local_shares') || '[]');
      const found = shares.find(s => (s.invite_code || '').toUpperCase() === clean);
      if (found) return found;

      // Também verifica se alguma lista armazenada no IndexedDB possui esse inviteCode
      const store = await this.getStore('listas', 'readonly');
      const allLists = await new Promise((res) => {
        const req = store.getAll();
        req.onsuccess = () => res(req.result || []);
        req.onerror = () => res([]);
      });
      const list = allLists.find(l => (l.inviteCode || '').toUpperCase() === clean);
      if (list) {
        return {
          id: 'share_local_' + list.id,
          lista_id: list.id,
          owner_id: list.userId || 'owner',
          shared_with_email: 'convite_link@comprasplus.app',
          permission: list.sharePermission || 'aberto',
          invite_code: clean,
          created_at: new Date().toISOString()
        };
      }
    } catch (_) {}
    return null;
  }

  /**
   * Cria um link/código de compartilhamento aberto para envio via WhatsApp
   */
  async createShareInviteCode(listId, permission = 'fechado') {
    if (!this.isAuthenticated()) {
      throw new Error('Você precisa estar autenticado.');
    }

    const list = await this.getListById(listId);
    let inviteCode = list?.inviteCode || this.generateInviteCode();

    const shareRecord = {
      id: 'share_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now(),
      lista_id: listId,
      owner_id: this.user.id,
      shared_with_email: 'convite_link@comprasplus.app',
      permission: permission === 'aberto' ? 'aberto' : 'fechado',
      invite_code: inviteCode,
      created_at: new Date().toISOString()
    };

    if (this.supabaseUrl && this.supabaseKey && this.accessToken) {
      try {
        // Verifica se já existe registro de convite desta lista para o dono
        const checkRes = await fetch(`${this.supabaseUrl}/rest/v1/lista_compartilhamentos?lista_id=eq.${encodeURIComponent(listId)}&owner_id=eq.${encodeURIComponent(this.user.id)}&invite_code=not.is.null&select=*`, {
          headers: this.getHeaders()
        });
        if (checkRes.ok) {
          const existing = await checkRes.json();
          if (existing && existing.length > 0) {
            inviteCode = existing[0].invite_code || inviteCode;
            shareRecord.id = existing[0].id;
            shareRecord.invite_code = inviteCode;
            await fetch(`${this.supabaseUrl}/rest/v1/lista_compartilhamentos?id=eq.${encodeURIComponent(existing[0].id)}`, {
              method: 'PATCH',
              headers: this.getHeaders(),
              body: JSON.stringify({ permission: permission === 'aberto' ? 'aberto' : 'fechado' })
            });
          } else {
            await fetch(`${this.supabaseUrl}/rest/v1/lista_compartilhamentos`, {
              method: 'POST',
              headers: {
                ...this.getHeaders(),
                'Prefer': 'resolution=merge-duplicates,return=representation'
              },
              body: JSON.stringify(shareRecord)
            });
          }
        }
      } catch (err) {
        console.warn('Erro ao salvar convite no Supabase Cloud:', err);
      }
    }

    // Salva localmente para disponibilidade imediata
    this.saveLocalShare(shareRecord);
    if (list) {
      list.inviteCode = inviteCode;
      list.sharePermission = permission;
      await this.saveLocalList(list);
    }

    return {
      inviteCode,
      permission,
      shareLink: `${window.location.origin}${window.location.pathname}?convite=${encodeURIComponent(inviteCode)}`
    };
  }

  /**
   * Conecta o usuário atual a uma lista compartilhada pelo código de convite
   */
  async joinSharedListByCode(inviteCode) {
    if (!this.isAuthenticated()) {
      throw new Error('Você precisa fazer login para acessar uma lista compartilhada.');
    }

    let cleanCode = (inviteCode || '').trim();
    // Se o usuário colou o link completo do WhatsApp, extrai apenas o código
    if (cleanCode.includes('convite=')) {
      const match = cleanCode.match(/convite=([A-Za-z0-9\-]+)/i);
      if (match) cleanCode = match[1];
    }
    cleanCode = cleanCode.toUpperCase().replace(/\s+/g, '');
    // Se o usuário digitou sem o prefixo LST- (ex: 8931A), normaliza automaticamente
    if (!cleanCode.startsWith('LST-') && cleanCode.length <= 6 && cleanCode.length > 0) {
      cleanCode = 'LST-' + cleanCode;
    }
    if (!cleanCode) throw new Error('Código de convite inválido.');

    let share = null;

    // 1. Tenta buscar no Supabase
    if (this.supabaseUrl && this.supabaseKey) {
      try {
        // Tenta com token de usuário autenticado (busca case-insensitive via ilike)
        let res = await fetch(`${this.supabaseUrl}/rest/v1/lista_compartilhamentos?invite_code=ilike.${encodeURIComponent(cleanCode)}&select=*`, {
          method: 'GET',
          headers: this.getHeaders()
        });

        let shares = [];
        if (res.ok) {
          shares = await res.json();
        } else {
          const errBody = await res.text().catch(() => '');
          console.warn(`[Convite] Erro autenticado (${res.status}):`, errBody);
        }

        // Se RLS restringir o token de usuário, tenta com chave anônima (bypassa restrição de convite)
        if (!shares || shares.length === 0) {
          const anonHeaders = {
            'apikey': this.supabaseKey,
            'Authorization': `Bearer ${this.supabaseKey}`,
            'Content-Type': 'application/json'
          };
          const anonRes = await fetch(`${this.supabaseUrl}/rest/v1/lista_compartilhamentos?invite_code=ilike.${encodeURIComponent(cleanCode)}&select=*`, {
            method: 'GET',
            headers: anonHeaders
          });
          if (anonRes.ok) {
            shares = await anonRes.json();
          } else {
            const errBody2 = await anonRes.text().catch(() => '');
            console.warn(`[Convite] Erro anon (${anonRes.status}):`, errBody2);
          }
        }

        if (shares && shares.length > 0) {
          share = shares[0];
        }
      } catch (err) {
        console.warn('Erro ao consultar Supabase para código de convite:', err);
      }
    }

    // 2. Se não encontrou no Supabase, tenta o cache local
    if (!share) {
      share = await this.getLocalShareByCode(cleanCode);
    }

    if (!share) {
      throw new Error('Código de convite não encontrado ou expirado. Verifique o código e tente novamente.');
    }

    // Se o usuário atual for o próprio dono da lista
    if (share.owner_id === this.user.id) {
      const ownerList = await this.getListById(share.lista_id);
      if (ownerList) {
        return { list: ownerList, permission: 'owner', isOwner: true };
      }
    }

    // 3. Vincula o usuário atual ao compartilhamento no Supabase
    if (this.supabaseUrl && this.supabaseKey && this.accessToken) {
      try {
        if (!share.shared_with_user_id || share.shared_with_user_id === this.user.id) {
          await fetch(`${this.supabaseUrl}/rest/v1/lista_compartilhamentos?id=eq.${encodeURIComponent(share.id)}`, {
            method: 'PATCH',
            headers: this.getHeaders(),
            body: JSON.stringify({
              shared_with_user_id: this.user.id,
              shared_with_email: this.user.email
            })
          });
        } else {
          await fetch(`${this.supabaseUrl}/rest/v1/lista_compartilhamentos`, {
            method: 'POST',
            headers: {
              ...this.getHeaders(),
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
              id: 'share_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now(),
              lista_id: share.lista_id,
              owner_id: share.owner_id,
              shared_with_user_id: this.user.id,
              shared_with_email: this.user.email,
              permission: share.permission,
              invite_code: null,
              created_at: new Date().toISOString()
            })
          });
        }
      } catch (err) {
        console.warn('[Convite] Aviso ao vincular no Supabase:', err);
      }
    }

    // 4. Busca os dados da lista
    let row = null;
    if (this.supabaseUrl && this.supabaseKey) {
      try {
        let listRes = await fetch(`${this.supabaseUrl}/rest/v1/listas?id=eq.${encodeURIComponent(share.lista_id)}&select=*`, {
          method: 'GET',
          headers: this.getHeaders()
        });

        if (listRes.ok) {
          const listRows = await listRes.json();
          if (listRows && listRows.length > 0) {
            row = listRows[0];
          }
        }

        // Se veio vazio (por RLS transitória ou delay), tenta com chave anônima
        if (!row) {
          const anonHeaders = {
            'apikey': this.supabaseKey,
            'Authorization': `Bearer ${this.supabaseKey}`,
            'Content-Type': 'application/json'
          };
          const anonListRes = await fetch(`${this.supabaseUrl}/rest/v1/listas?id=eq.${encodeURIComponent(share.lista_id)}&select=*`, {
            method: 'GET',
            headers: anonHeaders
          });
          if (anonListRes.ok) {
            const anonRows = await anonListRes.json();
            if (anonRows && anonRows.length > 0) {
              row = anonRows[0];
            }
          }
        }
      } catch (err) {
        console.warn('[Convite] Erro ao buscar lista no Supabase:', err);
      }
    }

    // Fallback local se a nuvem não responder
    if (!row) {
      const local = await this.getListById(share.lista_id);
      if (local) {
        row = {
          id: local.id,
          user_id: local.userId || share.owner_id,
          name: local.name,
          category: local.category,
          budget: local.budget,
          items: local.items,
          created_at: local.createdAt
        };
      }
    }

    if (!row) {
      throw new Error('Não foi possível carregar a lista associada a este convite.');
    }

    const joinedList = {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      category: row.category,
      budget: Number(row.budget) || 0,
      items: Array.isArray(row.items) ? row.items : [],
      createdAt: row.created_at || new Date().toISOString(),
      isShared: true,
      permission: share.permission || 'fechado'
    };

    // Salva no cache local do IndexedDB e de compartilhamentos
    await this.saveLocalList(joinedList);
    this.saveLocalShare(share);

    return {
      list: joinedList,
      permission: share.permission || 'fechado',
      isOwner: false
    };
  }

  /**
   * Obtém a lista de colaboradores de uma lista
   */
  async getListCollaborators(listId) {
    if (!this.isAuthenticated() || !this.supabaseUrl) return [];

    try {
      const res = await fetch(`${this.supabaseUrl}/rest/v1/lista_compartilhamentos?lista_id=eq.${listId}&select=*`, {
        method: 'GET',
        headers: this.getHeaders()
      });
      if (res.ok) return await res.json();
    } catch (_) {}
    return [];
  }

  /**
   * Remove um colaborador
   */
  async removeCollaborator(shareId) {
    if (!this.isAuthenticated() || !this.supabaseUrl) return false;

    try {
      const res = await fetch(`${this.supabaseUrl}/rest/v1/lista_compartilhamentos?id=eq.${shareId}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
      return res.ok;
    } catch (_) {
      return false;
    }
  }

  /**
   * Retorna a permissão do usuário atual para a lista ('owner', 'aberto', 'fechado')
   */
  getListPermission(list) {
    if (!list) return 'fechado';
    if (!this.user) return 'fechado';
    if (list.userId === this.user.id || list.user_id === this.user.id) return 'owner';
    if (this.isAdmin()) return 'owner';
    if (list.permission) return list.permission;
    return 'fechado';
  }
}

// Exporta instância do banco
const db = new Database();

