/**
 * app.js - Lógica da Aplicação Mobile-First & Banco de Dados Real
 * Totalmente reativo, sem dados mockados e com suporte completo a IndexedDB e PWA.
 */

// Ícones por categoria
const CATEGORY_ICONS = {
  'Mercearia': '🌾',
  'Hortifrúti': '🍎',
  'Carnes & Aves': '🥩',
  'Laticínios & Frios': '🧀',
  'Bebidas': '🧃',
  'Limpeza': '🧹',
  'Higiene Pessoal': '🧴',
  'Padaria': '🍞',
  'Congelados': '🧊',
  'Outros': '📦',
  'Supermercado': '🛒',
  'Feira & Hortifrúti': '🥬',
  'Açougue & Carnes': '🥩',
  'Farmácia': '💊',
  'Padaria & Confeitaria': '🥖',
  'Casa & Construção': '🏠',
  'Pet Shop': '🐾',
  'Churrasco & Eventos': '🔥'
};

// Estado da Aplicação
let state = {
  lists: [],
  activeListId: null,
  filterCategory: 'TODAS'
};

let deferredInstallPrompt = null;

// ==========================================================
// Funções Utilitárias & Formatação
// ==========================================================

function formatCurrency(val) {
  const num = Number(val) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getIcon(cat) {
  return CATEGORY_ICONS[cat] || '🏷️';
}

function generateId() {
  return 'item_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

function vibrateDevice(ms = 15) {
  if ('vibrate' in navigator) {
    try { navigator.vibrate(ms); } catch (_) {}
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================================
// Cálculos Financeiros da Lista
// ==========================================================

function calculateListTotals(list) {
  const items = list.items || [];
  
  // Total Gasto = Soma de (Qtd * Valor Unitário)
  const totalGasto = items.reduce((sum, item) => {
    const qtd = Number(item.quantity) || 0;
    const preco = Number(item.unitPrice) || 0;
    return sum + (qtd * preco);
  }, 0);

  const orcamento = Number(list.budget) || 0;
  const saldoDisponivel = orcamento - totalGasto;
  const percentualConsumido = orcamento > 0 ? (totalGasto / orcamento) * 100 : 0;

  return {
    orcamento,
    totalGasto,
    saldoDisponivel,
    percentualConsumido: Math.max(0, percentualConsumido)
  };
}

// ==========================================================
// Inicialização de Dados do Banco (IndexedDB)
// ==========================================================

async function loadDataFromDb() {
  try {
    state.lists = await db.getLists();
    renderDashboard();
  } catch (err) {
    console.error('Erro ao carregar dados do banco:', err);
    state.lists = [];
    renderDashboard();
  }
}

// ==========================================================
// Renderização: Dashboard (Minhas Listas)
// ==========================================================

function renderDashboard() {
  const container = document.getElementById('listas-container');
  const emptyState = document.getElementById('empty-state-listas');
  const badgeTotal = document.getElementById('total-listas-badge');

  badgeTotal.textContent = `${state.lists.length} ${state.lists.length === 1 ? 'lista' : 'listas'}`;

  if (state.lists.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  container.innerHTML = state.lists.map(list => {
    const { orcamento, totalGasto, saldoDisponivel, percentualConsumido } = calculateListTotals(list);
    
    let saldoColor = 'var(--success-text)';
    let progClass = 'prog-green';
    let saldoStatus = 'Disponível';

    if (saldoDisponivel < 0) {
      saldoColor = 'var(--danger-text)';
      progClass = 'prog-red';
      saldoStatus = 'Excedido';
    } else if (percentualConsumido >= 75) {
      saldoColor = 'var(--warning-text)';
      progClass = 'prog-yellow';
      saldoStatus = 'Atenção';
    }

    const progressWidth = Math.min(100, Math.round(percentualConsumido));
    const icon = getIcon(list.category);
    const qtdItens = (list.items || []).length;

    return `
      <div class="card-lista-item" onclick="openList('${list.id}')">
        <div class="card-lista-header">
          <div>
            <h3 class="card-lista-title">${escapeHtml(list.name)}</h3>
            <span class="budget-tag" style="margin-top: 0.25rem;">${icon} ${escapeHtml(list.category)}</span>
          </div>
          <button class="btn-trash" title="Excluir Lista" onclick="handleDeleteList('${list.id}', event)">
            🗑️
          </button>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-top: 0.5rem;">
          <span>Orçamento: <strong>${formatCurrency(orcamento)}</strong></span>
          <span>Gasto: <strong style="color: var(--primary);">${formatCurrency(totalGasto)}</strong></span>
        </div>

        <div class="progress-container" style="margin: 0.5rem 0;">
          <div class="progress-fill ${progClass}" style="width: ${progressWidth}%;"></div>
        </div>

        <div class="card-lista-footer">
          <span>${qtdItens} ${qtdItens === 1 ? 'item' : 'itens'} (${Math.round(percentualConsumido)}%)</span>
          <span style="font-weight: 700; color: ${saldoColor}">
            Saldo: ${formatCurrency(saldoDisponivel)} (${saldoStatus})
          </span>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================================
// Renderização: Detalhe da Lista (Itens & Orçamento)
// ==========================================================

async function renderListDetail(listId) {
  const list = state.lists.find(l => l.id === listId);
  if (!list) {
    showDashboard();
    return;
  }

  state.activeListId = listId;

  // Atualizar cabeçalho da lista
  document.getElementById('detalhe-nome-lista').textContent = list.name;
  document.getElementById('detalhe-categoria-tag').textContent = `${getIcon(list.category)} ${list.category}`;

  // Calcular métricas
  const { orcamento, totalGasto, saldoDisponivel, percentualConsumido } = calculateListTotals(list);

  document.getElementById('metric-orcamento').textContent = formatCurrency(orcamento);
  document.getElementById('metric-gasto').textContent = formatCurrency(totalGasto);
  document.getElementById('metric-saldo').textContent = formatCurrency(saldoDisponivel);
  document.getElementById('progress-percent-text').textContent = `${Math.round(percentualConsumido)}%`;

  const boxSaldo = document.getElementById('box-saldo-disponivel');
  const statusSaldo = document.getElementById('metric-saldo-status');
  const progressFill = document.getElementById('budget-progress-fill');
  const progressMsg = document.getElementById('progress-status-msg');

  boxSaldo.classList.remove('saldo-positivo', 'saldo-alerta', 'saldo-negativo');
  progressFill.classList.remove('prog-green', 'prog-yellow', 'prog-red');

  progressFill.style.width = `${Math.min(100, Math.max(0, percentualConsumido))}%`;

  if (saldoDisponivel < 0) {
    boxSaldo.classList.add('saldo-negativo');
    progressFill.classList.add('prog-red');
    statusSaldo.textContent = `Excedido em ${formatCurrency(Math.abs(saldoDisponivel))}`;
    progressMsg.textContent = 'Orçamento Estourado!';
    progressMsg.style.color = 'var(--danger)';
  } else if (percentualConsumido >= 75) {
    boxSaldo.classList.add('saldo-alerta');
    progressFill.classList.add('prog-yellow');
    statusSaldo.textContent = `Restam apenas ${formatCurrency(saldoDisponivel)}`;
    progressMsg.textContent = 'Atenção ao Limite';
    progressMsg.style.color = 'var(--warning-text)';
  } else {
    boxSaldo.classList.add('saldo-positivo');
    progressFill.classList.add('prog-green');
    statusSaldo.textContent = `Restante livre: ${formatCurrency(saldoDisponivel)}`;
    progressMsg.textContent = 'Seguro';
    progressMsg.style.color = 'var(--success)';
  }

  // Renderizar produtos
  renderProductCards(list);

  // Trocar telas
  document.getElementById('view-dashboard').classList.add('hidden');
  document.getElementById('view-lista-detalhe').classList.remove('hidden');
}

function renderProductCards(list) {
  const container = document.getElementById('produtos-mobile-container');
  const emptyState = document.getElementById('empty-state-produtos');
  const badgeContador = document.getElementById('itens-contador');

  let items = list.items || [];

  // Filtrar por categoria se houver filtro selecionado
  if (state.filterCategory && state.filterCategory !== 'TODAS') {
    items = items.filter(it => it.category === state.filterCategory);
  }

  badgeContador.textContent = `${items.length} ${items.length === 1 ? 'item' : 'itens'}`;

  if (items.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  container.innerHTML = items.map(item => {
    const qtd = Number(item.quantity) || 0;
    const preco = Number(item.unitPrice) || 0;
    const subtotal = qtd * preco;
    const catIcon = getIcon(item.category);

    return `
      <div class="mobile-product-card ${item.checked ? 'item-comprado' : ''}">
        <div class="product-left-col">
          <input 
            type="checkbox" 
            class="mobile-checkbox" 
            ${item.checked ? 'checked' : ''} 
            onchange="handleToggleItem('${list.id}', '${item.id}', this.checked)"
            title="Marcar como comprado"
          >
          <div class="product-info-group">
            <span class="product-name">${escapeHtml(item.name)}</span>
            <div class="product-meta-sub">
              <span>${catIcon} ${escapeHtml(item.category)}</span>
              <span>•</span>
              <span>${qtd} × ${formatCurrency(preco)}</span>
            </div>
          </div>
        </div>

        <div class="product-right-col">
          <span class="product-subtotal-val">${formatCurrency(subtotal)}</span>
          <button class="btn-trash" title="Excluir item" onclick="handleDeleteItem('${list.id}', '${item.id}')">
            ✕
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================================
// Ações de Navegação e Interação
// ==========================================================

function openList(listId) {
  state.filterCategory = 'TODAS';
  document.querySelectorAll('#chips-categorias .chip-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === 'TODAS');
  });
  renderListDetail(listId);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showDashboard() {
  state.activeListId = null;
  document.getElementById('view-lista-detalhe').classList.add('hidden');
  document.getElementById('view-dashboard').classList.remove('hidden');
  renderDashboard();
}

async function handleDeleteList(listId, event) {
  if (event) event.stopPropagation();
  const list = state.lists.find(l => l.id === listId);
  if (!list) return;

  if (confirm(`Deseja realmente excluir a lista "${list.name}"?`)) {
    vibrateDevice(35);
    await db.deleteList(listId);
    state.lists = state.lists.filter(l => l.id !== listId);
    renderDashboard();
  }
}

async function handleToggleItem(listId, itemId, checked) {
  vibrateDevice(15);
  const updatedList = await db.toggleItem(listId, itemId, checked);
  if (updatedList) {
    const idx = state.lists.findIndex(l => l.id === listId);
    if (idx !== -1) state.lists[idx] = updatedList;
    renderListDetail(listId);
  }
}

async function handleDeleteItem(listId, itemId) {
  vibrateDevice(25);
  const updatedList = await db.deleteItem(listId, itemId);
  if (updatedList) {
    const idx = state.lists.findIndex(l => l.id === listId);
    if (idx !== -1) state.lists[idx] = updatedList;
    renderListDetail(listId);
  }
}

// ==========================================================
// Bottom Sheets (Modais Deslizantes do Celular)
// ==========================================================

function openSheet(id) {
  const sheet = document.getElementById(id);
  if (sheet) {
    sheet.classList.remove('hidden');
  }
}

function closeSheet(id) {
  const sheet = document.getElementById(id);
  if (sheet) {
    sheet.classList.add('hidden');
  }
}

function closeAllSheets() {
  document.querySelectorAll('.bottom-sheet-backdrop').forEach(s => s.classList.add('hidden'));
}

// ==========================================================
// Formulários: Nova Lista & Novo Produto
// ==========================================================

async function handleCreateList(e) {
  e.preventDefault();
  const nome = document.getElementById('nova-lista-nome').value.trim();
  const categoria = document.getElementById('nova-lista-categoria').value;
  const orcamento = parseFloat(document.getElementById('nova-lista-orcamento').value) || 0;

  if (!nome) {
    alert('Informe o nome da lista.');
    return;
  }

  const newList = {
    id: generateId(),
    name: nome,
    category: categoria,
    budget: orcamento,
    createdAt: new Date().toISOString(),
    items: []
  };

  vibrateDevice(25);
  await db.saveList(newList);
  state.lists.unshift(newList);
  
  closeSheet('sheet-nova-lista');
  document.getElementById('form-nova-lista').reset();
  
  // Abre a lista criada
  openList(newList.id);
}

function updateSubtotalPreview() {
  const qtdInput = document.getElementById('produto-quantidade');
  const unitInput = document.getElementById('produto-valor-unitario');
  const preview = document.getElementById('preview-subtotal');

  const qtd = parseFloat(qtdInput.value) || 0;
  const unit = parseFloat(unitInput.value) || 0;
  const subtotal = qtd * unit;

  preview.textContent = formatCurrency(subtotal);
}

async function handleAddProduct(e) {
  e.preventDefault();
  if (!state.activeListId) return;

  const nomeInput = document.getElementById('produto-nome');
  const catInput = document.getElementById('produto-categoria');
  const qtdInput = document.getElementById('produto-quantidade');
  const precoInput = document.getElementById('produto-valor-unitario');

  const name = nomeInput.value.trim();
  const category = catInput.value;
  const quantity = parseFloat(qtdInput.value) || 1;
  const unitPrice = parseFloat(precoInput.value) || 0;

  if (!name) {
    alert('Informe o nome do produto.');
    nomeInput.focus();
    return;
  }

  const newItem = {
    id: generateId(),
    name,
    category,
    quantity,
    unitPrice,
    checked: false
  };

  vibrateDevice(20);
  const updatedList = await db.addItem(state.activeListId, newItem);
  if (updatedList) {
    const idx = state.lists.findIndex(l => l.id === state.activeListId);
    if (idx !== -1) state.lists[idx] = updatedList;
  }

  // Limpa formulário e fecha Bottom Sheet
  document.getElementById('form-novo-produto').reset();
  document.getElementById('produto-quantidade').value = '1';
  updateSubtotalPreview();
  closeSheet('sheet-novo-produto');

  // Recalcula e atualiza tela instantaneamente
  renderListDetail(state.activeListId);
}

async function handleUpdateBudget(e) {
  e.preventDefault();
  if (!state.activeListId) return;

  const input = document.getElementById('novo-orcamento-input');
  const novoOrcamento = parseFloat(input.value) || 0;

  vibrateDevice(20);
  const updatedList = await db.updateBudget(state.activeListId, novoOrcamento);
  if (updatedList) {
    const idx = state.lists.findIndex(l => l.id === state.activeListId);
    if (idx !== -1) state.lists[idx] = updatedList;
  }

  closeSheet('modal-editar-orcamento');
  renderListDetail(state.activeListId);
}

// ==========================================================
// Configurações Supabase Cloud (Opcional)
// ==========================================================

async function loadSupabaseConfig() {
  const url = await db.getConfig('supabase_url');
  const key = await db.getConfig('supabase_key');
  if (url) document.getElementById('supabase-url').value = url;
  if (key) document.getElementById('supabase-key').value = key;
}

async function handleSaveSupabaseConfig(e) {
  e.preventDefault();
  const url = document.getElementById('supabase-url').value.trim();
  const key = document.getElementById('supabase-key').value.trim();

  await db.setConfig('supabase_url', url);
  await db.setConfig('supabase_key', key);
  vibrateDevice(30);

  alert('Configurações salvas com sucesso!');
  closeSheet('modal-config-db');
}

// ==========================================================
// PWA Installation & Service Worker
// ==========================================================

function setupPwa() {
  const btnInstall = document.getElementById('btn-instalar-app');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (btnInstall) btnInstall.classList.remove('hidden');
  });

  if (btnInstall) {
    btnInstall.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      console.log('Resultado da instalação:', outcome);
      deferredInstallPrompt = null;
      btnInstall.classList.add('hidden');
    });
  }

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    if (btnInstall) btnInstall.classList.add('hidden');
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.warn('Falha no Service Worker:', err);
      });
    });
  }
}

// ==========================================================
// Inicialização de Listeners
// ==========================================================

function setupEventListeners() {
  // Navegação
  document.getElementById('btn-voltar-dashboard').addEventListener('click', showDashboard);

  // Floating Action Button (FAB): ação sensível ao contexto
  document.getElementById('fab-action-btn').addEventListener('click', () => {
    vibrateDevice(20);
    if (state.activeListId) {
      // Dentro de uma lista -> Adicionar Mercadoria
      document.getElementById('produto-nome').value = '';
      document.getElementById('produto-valor-unitario').value = '';
      document.getElementById('produto-quantidade').value = '1';
      updateSubtotalPreview();
      openSheet('sheet-novo-produto');
      setTimeout(() => document.getElementById('produto-nome').focus(), 150);
    } else {
      // No dashboard -> Nova Lista
      document.getElementById('form-nova-lista').reset();
      openSheet('sheet-nova-lista');
      setTimeout(() => document.getElementById('nova-lista-nome').focus(), 150);
    }
  });

  // Botões de Estado Vazio
  document.getElementById('btn-criar-primeira-lista').addEventListener('click', () => {
    openSheet('sheet-nova-lista');
  });

  // Fechar Bottom Sheets
  document.getElementById('btn-fechar-sheet-produto').addEventListener('click', () => closeSheet('sheet-novo-produto'));
  document.getElementById('btn-fechar-sheet-lista').addEventListener('click', () => closeSheet('sheet-nova-lista'));
  document.getElementById('btn-fechar-modal-orcamento').addEventListener('click', () => closeSheet('modal-editar-orcamento'));
  document.getElementById('btn-fechar-modal-db').addEventListener('click', () => closeSheet('modal-config-db'));

  // Fechar ao clicar no backdrop escuro
  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('bottom-sheet-backdrop')) {
      closeAllSheets();
    }
  });

  // Submissão dos Formulários
  document.getElementById('form-nova-lista').addEventListener('submit', handleCreateList);
  document.getElementById('form-novo-produto').addEventListener('submit', handleAddProduct);
  document.getElementById('form-editar-orcamento').addEventListener('submit', handleUpdateBudget);
  document.getElementById('form-config-supabase').addEventListener('submit', handleSaveSupabaseConfig);

  // Botão Orçamento
  document.getElementById('btn-editar-orcamento').addEventListener('click', () => {
    const list = state.lists.find(l => l.id === state.activeListId);
    if (list) {
      document.getElementById('novo-orcamento-input').value = list.budget;
      openSheet('modal-editar-orcamento');
    }
  });

  // Botão Configurações Banco de Dados
  document.getElementById('btn-abrir-config').addEventListener('click', () => {
    loadSupabaseConfig();
    openSheet('modal-config-db');
  });

  // Stepper de Quantidade
  const qtdInput = document.getElementById('produto-quantidade');
  const precoInput = document.getElementById('produto-valor-unitario');
  
  qtdInput.addEventListener('input', updateSubtotalPreview);
  precoInput.addEventListener('input', updateSubtotalPreview);

  document.getElementById('btn-qty-minus').addEventListener('click', () => {
    let cur = parseFloat(qtdInput.value) || 1;
    if (cur > 1) {
      qtdInput.value = cur - 1;
      updateSubtotalPreview();
    }
  });

  document.getElementById('btn-qty-plus').addEventListener('click', () => {
    let cur = parseFloat(qtdInput.value) || 0;
    qtdInput.value = cur + 1;
    updateSubtotalPreview();
  });

  // Carrossel de Chips de Categorias
  document.querySelectorAll('#chips-categorias .chip-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('#chips-categorias .chip-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      state.filterCategory = e.currentTarget.dataset.cat;
      vibrateDevice(10);
      if (state.activeListId) {
        const list = state.lists.find(l => l.id === state.activeListId);
        if (list) renderProductCards(list);
      }
    });
  });

  // PWA
  setupPwa();
}

// Inicializar aplicação
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadDataFromDb();
});
