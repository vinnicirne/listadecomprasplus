/**
 * Lista de Compras & Orçamento Inteligente
 * Lógica da Aplicação com persistência em LocalStorage
 */

const STORAGE_KEY = 'lista_compras_dados_v1';

// Categorias e seus respectivos ícones
const CATEGORY_ICONS = {
  // Categorias de Mercadorias
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
  
  // Categorias de Listas
  'Supermercado': '🛒',
  'Feira & Hortifrúti': '🥬',
  'Açougue & Carnes': '🥩',
  'Farmácia': '💊',
  'Padaria & Confeitaria': '🥖',
  'Casa & Construção': '🏠',
  'Pet Shop': '🐾',
  'Churrasco & Eventos': '🔥'
};

// Dados padrão iniciais (demonstração prática na primeira utilização)
const INITIAL_DEMO_DATA = [
  {
    id: 'demo-lista-1',
    name: 'Supermercado da Semana',
    category: 'Supermercado',
    budget: 350.00,
    createdAt: new Date().toISOString(),
    items: [
      {
        id: 'item-1',
        name: 'Arroz Tipo 1 (5kg)',
        category: 'Mercearia',
        quantity: 2,
        unitPrice: 28.90,
        checked: true
      },
      {
        id: 'item-2',
        name: 'Feijão Carioca (1kg)',
        category: 'Mercearia',
        quantity: 3,
        unitPrice: 7.50,
        checked: true
      },
      {
        id: 'item-3',
        name: 'Peito de Frango Resfriado (kg)',
        category: 'Carnes & Aves',
        quantity: 2.5,
        unitPrice: 21.90,
        checked: false
      },
      {
        id: 'item-4',
        name: 'Maçã Gala (kg)',
        category: 'Hortifrúti',
        quantity: 1.5,
        unitPrice: 9.80,
        checked: false
      },
      {
        id: 'item-5',
        name: 'Detergente Líquido (500ml)',
        category: 'Limpeza',
        quantity: 4,
        unitPrice: 2.79,
        checked: false
      }
    ]
  },
  {
    id: 'demo-lista-2',
    name: 'Churrasco com Amigos',
    category: 'Churrasco & Eventos',
    budget: 200.00,
    createdAt: new Date().toISOString(),
    items: [
      {
        id: 'item-c1',
        name: 'Picanha Bovina (kg)',
        category: 'Carnes & Aves',
        quantity: 1.5,
        unitPrice: 69.90,
        checked: false
      },
      {
        id: 'item-c2',
        name: 'Carvão Vegetal (5kg)',
        category: 'Outros',
        quantity: 1,
        unitPrice: 24.50,
        checked: true
      }
    ]
  }
];

// Estado da Aplicação
let state = {
  lists: [],
  activeListId: null,
  filterCategory: 'TODAS'
};

// ==========================================================
// Funções Utilitárias & Formatação
// ==========================================================

function formatCurrency(value) {
  const num = Number(value) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getIcon(category) {
  return CATEGORY_ICONS[category] || '🏷️';
}

function generateId() {
  return 'id_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

// ==========================================================
// Persistência em LocalStorage
// ==========================================================

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        state.lists = parsed;
        return;
      }
    }
  } catch (err) {
    console.warn('Erro ao ler localStorage, utilizando dados padrão:', err);
  }
  // Se não existir, carrega listas de demonstração
  state.lists = JSON.parse(JSON.stringify(INITIAL_DEMO_DATA));
  saveState();
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.lists));
  } catch (err) {
    console.error('Falha ao salvar no localStorage:', err);
  }
}

// ==========================================================
// Cálculos Financeiros da Lista
// ==========================================================

function calculateListTotals(list) {
  const items = list.items || [];
  
  // Total Gasto = Soma de (Qtd * Valor Unitário) de todos os itens
  const totalGasto = items.reduce((sum, item) => {
    const qtd = Number(item.quantity) || 0;
    const preco = Number(item.unitPrice) || 0;
    return sum + (qtd * preco);
  }, 0);

  const orcamento = Number(list.budget) || 0;
  
  // Saldo Disponível = Orçamento - Total Gasto
  const saldoDisponivel = orcamento - totalGasto;
  
  // Percentual consumido do orçamento
  const percentualConsumido = orcamento > 0 ? (totalGasto / orcamento) * 100 : 0;
  
  return {
    orcamento,
    totalGasto,
    saldoDisponivel,
    percentualConsumido: Math.max(0, percentualConsumido)
  };
}

// ==========================================================
// Renderização: Visão Geral (Dashboard de Listas)
// ==========================================================

function renderDashboard() {
  const container = document.getElementById('listas-grid');
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
    
    // Cor e status do progresso
    let progressClass = 'progress-green';
    let saldoColor = 'var(--success-text)';
    let saldoStatus = 'Disponível';

    if (saldoDisponivel < 0) {
      progressClass = 'progress-red';
      saldoColor = 'var(--danger-text)';
      saldoStatus = 'Limite Excedido';
    } else if (percentualConsumido >= 75) {
      progressClass = 'progress-yellow';
      saldoColor = 'var(--warning-text)';
      saldoStatus = 'Atenção ao Limite';
    }

    const progressWidth = Math.min(100, Math.round(percentualConsumido));
    const icon = getIcon(list.category);

    return `
      <div class="lista-card" data-id="${list.id}">
        <div class="lista-card-header">
          <div>
            <h3 class="lista-card-title">${escapeHtml(list.name)}</h3>
            <span class="badge-tag">${icon} ${escapeHtml(list.category)}</span>
          </div>
          <button class="btn-delete" title="Excluir Lista" onclick="handleDeleteList('${list.id}', event)">
            🗑️
          </button>
        </div>

        <div class="lista-card-metrics">
          <div class="card-metric-col">
            <span class="card-metric-label">Orçamento</span>
            <span class="card-metric-val">${formatCurrency(orcamento)}</span>
          </div>
          <div class="card-metric-col">
            <span class="card-metric-label">Gasto</span>
            <span class="card-metric-val text-gasto">${formatCurrency(totalGasto)}</span>
          </div>
          <div class="card-metric-col card-saldo-destaque">
            <span class="card-metric-label">Saldo Disponível (${saldoStatus})</span>
            <span class="card-metric-val" style="color: ${saldoColor}">${formatCurrency(saldoDisponivel)}</span>
          </div>
        </div>

        <div class="lista-card-progress">
          <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted);">
            <span>Consumo: <strong>${Math.round(percentualConsumido)}%</strong></span>
            <span>${list.items.length} ${list.items.length === 1 ? 'item' : 'itens'}</span>
          </div>
          <div class="card-progress-bar">
            <div class="card-progress-fill ${progressClass}" style="width: ${progressWidth}%;"></div>
          </div>
        </div>

        <div class="lista-card-actions">
          <button class="btn btn-primary btn-sm" onclick="openList('${list.id}')" style="width: 100%;">
            Abrir Lista & Itens →
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================================
// Renderização: Detalhe da Lista Selecionada
// ==========================================================

function renderListDetail(listId) {
  const list = state.lists.find(l => l.id === listId);
  if (!list) {
    showDashboard();
    return;
  }

  state.activeListId = listId;

  // Atualizar cabeçalho da lista
  document.getElementById('detalhe-nome-lista').textContent = list.name;
  document.getElementById('detalhe-categoria-lista').textContent = `${getIcon(list.category)} ${list.category}`;

  // Calcular totais e atualizar métricas financeiras
  const { orcamento, totalGasto, saldoDisponivel, percentualConsumido } = calculateListTotals(list);

  document.getElementById('metric-orcamento').textContent = formatCurrency(orcamento);
  document.getElementById('metric-gasto').textContent = formatCurrency(totalGasto);
  
  const metricSaldo = document.getElementById('metric-saldo');
  const cardSaldo = document.getElementById('card-saldo-disponivel');
  const statusSaldo = document.getElementById('metric-saldo-status');
  const progressFill = document.getElementById('budget-progress-fill');
  const progressText = document.getElementById('progress-percent-text');
  const progressMsg = document.getElementById('progress-status-msg');

  metricSaldo.textContent = formatCurrency(saldoDisponivel);
  progressText.textContent = `${Math.round(percentualConsumido)}%`;

  // Remover classes anteriores
  cardSaldo.classList.remove('saldo-positivo', 'saldo-alerta', 'saldo-negativo');
  progressFill.classList.remove('progress-green', 'progress-yellow', 'progress-red');

  // Ajustar barra de progresso visual (máximo 100% de preenchimento na barra)
  progressFill.style.width = `${Math.min(100, Math.max(0, percentualConsumido))}%`;

  if (saldoDisponivel < 0) {
    // Orçamento estourado
    cardSaldo.classList.add('saldo-negativo');
    progressFill.classList.add('progress-red');
    statusSaldo.textContent = `Orçamento ultrapassado em ${formatCurrency(Math.abs(saldoDisponivel))}`;
    progressMsg.textContent = 'Limite Excedido!';
    progressMsg.style.color = 'var(--danger)';
  } else if (percentualConsumido >= 75) {
    // Perto do limite
    cardSaldo.classList.add('saldo-alerta');
    progressFill.classList.add('progress-yellow');
    statusSaldo.textContent = `Restam apenas ${formatCurrency(saldoDisponivel)}`;
    progressMsg.textContent = 'Atenção ao Limite';
    progressMsg.style.color = 'var(--warning-text)';
  } else {
    // Confortável
    cardSaldo.classList.add('saldo-positivo');
    progressFill.classList.add('progress-green');
    statusSaldo.textContent = `Saldo livre: ${formatCurrency(saldoDisponivel)}`;
    progressMsg.textContent = 'Dentro do planejado';
    progressMsg.style.color = 'var(--success)';
  }

  // Renderizar tabela de itens
  renderItemsTable(list);

  // Alternar telas
  document.getElementById('view-dashboard').classList.add('hidden');
  document.getElementById('view-lista-detalhe').classList.remove('hidden');

  // Resetar formulário de produto
  resetProductForm();
}

function renderItemsTable(list) {
  const tbody = document.getElementById('produtos-table-body');
  const emptyState = document.getElementById('empty-state-produtos');
  const badgeContador = document.getElementById('itens-contador');
  
  let items = list.items || [];

  // Filtrar por categoria se aplicável
  if (state.filterCategory && state.filterCategory !== 'TODAS') {
    items = items.filter(it => it.category === state.filterCategory);
  }

  badgeContador.textContent = `${items.length} ${items.length === 1 ? 'item' : 'itens'}`;

  if (items.length === 0) {
    tbody.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  tbody.innerHTML = items.map(item => {
    const qtd = Number(item.quantity) || 0;
    const preco = Number(item.unitPrice) || 0;
    const subtotal = qtd * preco;
    const catIcon = getIcon(item.category);

    return `
      <tr class="${item.checked ? 'item-comprado' : ''}" data-item-id="${item.id}">
        <td>
          <input 
            type="checkbox" 
            class="item-checkbox" 
            ${item.checked ? 'checked' : ''} 
            onchange="handleToggleItem('${list.id}', '${item.id}', this.checked)"
            title="Marcar como comprado"
          >
        </td>
        <td>
          <span class="item-nome">${escapeHtml(item.name)}</span>
        </td>
        <td>
          <span class="badge-tag">${catIcon} ${escapeHtml(item.category)}</span>
        </td>
        <td>
          <strong>${qtd}</strong>
        </td>
        <td>
          ${formatCurrency(preco)}
        </td>
        <td>
          <span class="item-subtotal">${formatCurrency(subtotal)}</span>
        </td>
        <td>
          <button 
            class="btn-delete" 
            title="Remover produto" 
            onclick="handleDeleteItem('${list.id}', '${item.id}')"
          >
            🗑️
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// ==========================================================
// Manipulação de Eventos & Ações
// ==========================================================

function openList(listId) {
  state.filterCategory = 'TODAS';
  document.getElementById('filtro-categoria-item').value = 'TODAS';
  renderListDetail(listId);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showDashboard() {
  state.activeListId = null;
  document.getElementById('view-lista-detalhe').classList.add('hidden');
  document.getElementById('view-dashboard').classList.remove('hidden');
  renderDashboard();
}

function handleDeleteList(listId, event) {
  if (event) event.stopPropagation();
  const list = state.lists.find(l => l.id === listId);
  if (!list) return;

  if (confirm(`Deseja realmente excluir a lista "${list.name}"?`)) {
    state.lists = state.lists.filter(l => l.id !== listId);
    saveState();
    renderDashboard();
  }
}

function handleToggleItem(listId, itemId, isChecked) {
  const list = state.lists.find(l => l.id === listId);
  if (!list) return;

  const item = list.items.find(i => i.id === itemId);
  if (item) {
    item.checked = isChecked;
    saveState();
    renderListDetail(listId);
  }
}

function handleDeleteItem(listId, itemId) {
  const list = state.lists.find(l => l.id === listId);
  if (!list) return;

  list.items = list.items.filter(i => i.id !== itemId);
  saveState();
  renderListDetail(listId);
}

// ==========================================================
// Formulário: Adicionar Novo Produto
// ==========================================================

function updateSubtotalPreview() {
  const qtdInput = document.getElementById('produto-quantidade');
  const unitInput = document.getElementById('produto-valor-unitario');
  const preview = document.getElementById('preview-subtotal');

  const qtd = parseFloat(qtdInput.value) || 0;
  const unit = parseFloat(unitInput.value) || 0;
  const subtotal = qtd * unit;

  preview.textContent = formatCurrency(subtotal);
}

function resetProductForm() {
  const form = document.getElementById('form-novo-produto');
  form.reset();
  document.getElementById('produto-quantidade').value = '1';
  updateSubtotalPreview();
  document.getElementById('produto-nome').focus();
}

function handleAddProduct(e) {
  e.preventDefault();
  if (!state.activeListId) return;

  const list = state.lists.find(l => l.id === state.activeListId);
  if (!list) return;

  const nomeInput = document.getElementById('produto-nome');
  const catInput = document.getElementById('produto-categoria');
  const qtdInput = document.getElementById('produto-quantidade');
  const precoInput = document.getElementById('produto-valor-unitario');

  const name = nomeInput.value.trim();
  const category = catInput.value;
  const quantity = parseFloat(qtdInput.value) || 1;
  const unitPrice = parseFloat(precoInput.value) || 0;

  if (!name) {
    alert('Por favor, informe o nome da mercadoria.');
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

  list.items.push(newItem);
  saveState();
  
  // Re-renderizar tela detalhada com recálculo instantâneo do saldo
  renderListDetail(state.activeListId);
}

// ==========================================================
// Modais: Criar Lista & Alterar Orçamento
// ==========================================================

function openModalNovaLista() {
  const modal = document.getElementById('modal-nova-lista');
  document.getElementById('form-nova-lista').reset();
  modal.classList.remove('hidden');
  document.getElementById('nova-lista-nome').focus();
}

function closeModalNovaLista() {
  document.getElementById('modal-nova-lista').classList.add('hidden');
}

function handleCreateList(e) {
  e.preventDefault();
  const nome = document.getElementById('nova-lista-nome').value.trim();
  const categoria = document.getElementById('nova-lista-categoria').value;
  const orcamento = parseFloat(document.getElementById('nova-lista-orcamento').value) || 0;

  if (!nome) {
    alert('Por favor, dê um nome para sua lista.');
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

  state.lists.unshift(newList);
  saveState();
  closeModalNovaLista();
  
  // Abre diretamente a nova lista criada para o usuário já começar a cadastrar os itens
  openList(newList.id);
}

function openModalEditarOrcamento() {
  if (!state.activeListId) return;
  const list = state.lists.find(l => l.id === state.activeListId);
  if (!list) return;

  const modal = document.getElementById('modal-editar-orcamento');
  document.getElementById('novo-orcamento-input').value = list.budget;
  modal.classList.remove('hidden');
  document.getElementById('novo-orcamento-input').focus();
}

function closeModalEditarOrcamento() {
  document.getElementById('modal-editar-orcamento').classList.add('hidden');
}

function handleUpdateBudget(e) {
  e.preventDefault();
  if (!state.activeListId) return;

  const list = state.lists.find(l => l.id === state.activeListId);
  if (!list) return;

  const novoOrcamento = parseFloat(document.getElementById('novo-orcamento-input').value) || 0;
  list.budget = novoOrcamento;
  saveState();
  closeModalEditarOrcamento();
  renderListDetail(state.activeListId);
}

// ==========================================================
// Sanitização Simples de Texto
// ==========================================================

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
// Inicialização dos Event Listeners
// ==========================================================

function setupEventListeners() {
  // Navegação
  document.getElementById('btn-voltar-dashboard').addEventListener('click', showDashboard);
  
  // Botões de Nova Lista
  document.getElementById('btn-nova-lista').addEventListener('click', openModalNovaLista);
  document.getElementById('btn-empty-criar-lista').addEventListener('click', openModalNovaLista);
  document.getElementById('btn-fechar-modal').addEventListener('click', closeModalNovaLista);
  document.getElementById('btn-cancelar-modal').addEventListener('click', closeModalNovaLista);
  document.getElementById('form-nova-lista').addEventListener('submit', handleCreateList);

  // Alterar Orçamento
  document.getElementById('btn-editar-orcamento').addEventListener('click', openModalEditarOrcamento);
  document.getElementById('btn-fechar-modal-orcamento').addEventListener('click', closeModalEditarOrcamento);
  document.getElementById('btn-cancelar-modal-orcamento').addEventListener('click', closeModalEditarOrcamento);
  document.getElementById('form-editar-orcamento').addEventListener('submit', handleUpdateBudget);

  // Formulário de Adicionar Produto
  document.getElementById('form-novo-produto').addEventListener('submit', handleAddProduct);

  // Preview de Subtotal ao digitar
  const qtdInput = document.getElementById('produto-quantidade');
  const precoInput = document.getElementById('produto-valor-unitario');
  
  qtdInput.addEventListener('input', updateSubtotalPreview);
  precoInput.addEventListener('input', updateSubtotalPreview);

  // Stepper de Quantidade (+ / -)
  document.getElementById('btn-qty-minus').addEventListener('click', () => {
    let current = parseFloat(qtdInput.value) || 1;
    if (current > 1) {
      qtdInput.value = current - 1;
      updateSubtotalPreview();
    }
  });

  document.getElementById('btn-qty-plus').addEventListener('click', () => {
    let current = parseFloat(qtdInput.value) || 0;
    qtdInput.value = current + 1;
    updateSubtotalPreview();
  });

  // Filtro de Categorias de Produtos
  document.getElementById('filtro-categoria-item').addEventListener('change', (e) => {
    state.filterCategory = e.target.value;
    if (state.activeListId) {
      const list = state.lists.find(l => l.id === state.activeListId);
      if (list) renderItemsTable(list);
    }
  });

  // Fechar modais ao clicar no backdrop escuro
  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
      closeModalNovaLista();
      closeModalEditarOrcamento();
    }
  });
}

// Inicializar aplicação
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  setupEventListeners();
  renderDashboard();
});
