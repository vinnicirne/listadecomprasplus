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

function calculateItemSubtotal(item) {
  const qtd = Number(item.quantity) || 0;
  const preco = Number(item.unitPrice) || 0;
  const unit = item.unit || 'un';

  if (unit === 'g') {
    // Gramas: Preço anunciado é por Quilo (ex: 300g com preço R$ 50/kg = R$ 15,00)
    return (qtd / 1000) * preco;
  }
  // Para 'un', 'kg', 'L' ou outros: Quantidade * Preço Unitário
  return qtd * preco;
}

function calculateListTotals(list) {
  const items = list.items || [];
  
  // Total Gasto = Soma de todos os produtos considerando suas unidades de medida
  const totalGasto = items.reduce((sum, item) => {
    return sum + calculateItemSubtotal(item);
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
    updateAuthUI();
  } catch (err) {
    console.error('Erro ao carregar dados do banco:', err);
    state.lists = [];
    renderDashboard();
    updateAuthUI();
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
      <div class="card-lista-item" onclick="openList('${list.id}', event)">
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

        <button class="btn btn-primary btn-sm" style="width: 100%; margin-top: 0.75rem; min-height: 42px; font-size: 0.9rem;" onclick="openList('${list.id}', event)">
          Abrir Lista & Itens →
        </button>
      </div>
    `;
  }).join('');
}

// ==========================================================
// Renderização: Detalhe da Lista (Itens & Orçamento)
// ==========================================================

async function renderListDetail(listId) {
  let list = state.lists.find(l => String(l.id) === String(listId));
  if (!list) {
    try {
      list = await db.getListById(listId);
      if (list) state.lists.unshift(list);
    } catch (e) {
      console.warn('Erro ao buscar lista do banco:', e);
    }
  }

  if (!list) {
    console.warn('Lista não encontrada para ID:', listId);
    showDashboard();
    return;
  }

  state.activeListId = String(list.id);

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
  const viewDash = document.getElementById('view-dashboard');
  const viewDetail = document.getElementById('view-lista-detalhe');
  if (viewDash) viewDash.classList.add('hidden');
  if (viewDetail) viewDetail.classList.remove('hidden');
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
    const unit = item.unit || 'un';
    const subtotal = calculateItemSubtotal(item);
    const catIcon = getIcon(item.category);

    let unitDisplay = '';
    if (unit === 'kg') {
      unitDisplay = `${qtd.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg × ${formatCurrency(preco)}/kg`;
    } else if (unit === 'g') {
      const kgEq = (qtd / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
      unitDisplay = `${qtd} g (${kgEq} kg) × ${formatCurrency(preco)}/kg`;
    } else if (unit === 'L') {
      unitDisplay = `${qtd.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L × ${formatCurrency(preco)}/L`;
    } else {
      unitDisplay = `${qtd} un × ${formatCurrency(preco)}`;
    }

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
              <span class="product-qty-badge">${unitDisplay}</span>
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

async function openList(listId, event) {
  if (event) {
    event.stopPropagation();
  }
  state.filterCategory = 'TODAS';
  document.querySelectorAll('#chips-categorias .chip-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === 'TODAS');
  });
  await renderListDetail(listId);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showDashboard() {
  state.activeListId = null;
  const viewDash = document.getElementById('view-dashboard');
  const viewDetail = document.getElementById('view-lista-detalhe');
  if (viewDetail) viewDetail.classList.add('hidden');
  if (viewDash) viewDash.classList.remove('hidden');
  renderDashboard();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Exposição explícita no window para garantir chamada em eventos inline
window.openList = openList;
window.showDashboard = showDashboard;
window.handleDeleteList = handleDeleteList;
window.handleToggleItem = handleToggleItem;
window.handleDeleteItem = handleDeleteItem;
window.shareListWhatsApp = shareListWhatsApp;

// ==========================================================
// Compartilhamento via WhatsApp
// ==========================================================

function shareListWhatsApp() {
  if (!state.activeListId) return;
  const list = state.lists.find(l => String(l.id) === String(state.activeListId));
  if (!list) return;

  const { orcamento, totalGasto, saldoDisponivel } = calculateListTotals(list);
  const items = list.items || [];

  let msg = `🛒 *${list.name}*\n`;
  msg += `🏷️ Categoria: ${list.category}\n`;
  msg += `💰 Orçamento: ${formatCurrency(orcamento)} | Gasto: ${formatCurrency(totalGasto)} | Saldo: ${formatCurrency(saldoDisponivel)}\n\n`;
  msg += `*Itens da Compra:*\n`;

  if (items.length === 0) {
    msg += `(Nenhum item cadastrado)\n`;
  } else {
    items.forEach(it => {
      const check = it.checked ? '✅' : '⬜';
      const unit = it.unit || 'un';
      const subtotal = calculateItemSubtotal(it);
      let unitText = '';
      if (unit === 'kg') {
        unitText = `${it.quantity} kg (${formatCurrency(it.unitPrice)}/kg)`;
      } else if (unit === 'g') {
        unitText = `${it.quantity} g (${formatCurrency(it.unitPrice)}/kg)`;
      } else if (unit === 'L') {
        unitText = `${it.quantity} L (${formatCurrency(it.unitPrice)}/L)`;
      } else {
        unitText = `${it.quantity} un (${formatCurrency(it.unitPrice)})`;
      }
      msg += `${check} ${it.name} - ${unitText} = ${formatCurrency(subtotal)}\n`;
    });
  }

  msg += `\n📱 _Enviado via Compras Plus App_`;

  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
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

function setProductUnit(unit) {
  const hiddenInput = document.getElementById('produto-unidade');
  if (hiddenInput) hiddenInput.value = unit;

  document.querySelectorAll('#produto-unidade-group .unit-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.unit === unit);
  });

  const labelQtd = document.getElementById('label-produto-quantidade');
  const labelPreco = document.getElementById('label-produto-preco');
  const qtdInput = document.getElementById('produto-quantidade');
  const tipEl = document.getElementById('unit-helper-tip');

  if (unit === 'kg') {
    if (labelQtd) labelQtd.textContent = 'Peso (kg) *';
    if (labelPreco) labelPreco.textContent = 'Preço do Kg (R$) *';
    if (qtdInput) {
      qtdInput.step = '0.05';
      qtdInput.min = '0.01';
      if (!qtdInput.value || qtdInput.value === '250') qtdInput.value = '1';
      qtdInput.placeholder = 'Ex: 1.5';
    }
    if (tipEl) tipEl.style.display = 'none';
  } else if (unit === 'g') {
    if (labelQtd) labelQtd.textContent = 'Peso (Gramas - g) *';
    if (labelPreco) labelPreco.textContent = 'Preço do Kg no Mercado (R$) *';
    if (qtdInput) {
      qtdInput.step = '10';
      qtdInput.min = '1';
      if (!qtdInput.value || qtdInput.value === '1') qtdInput.value = '250';
      qtdInput.placeholder = 'Ex: 300';
    }
    if (tipEl) tipEl.style.display = 'block';
  } else if (unit === 'L') {
    if (labelQtd) labelQtd.textContent = 'Volume (Litros - L) *';
    if (labelPreco) labelPreco.textContent = 'Preço do Litro (R$) *';
    if (qtdInput) {
      qtdInput.step = '0.1';
      qtdInput.min = '0.05';
      if (!qtdInput.value || qtdInput.value === '250') qtdInput.value = '1';
      qtdInput.placeholder = 'Ex: 1';
    }
    if (tipEl) tipEl.style.display = 'none';
  } else {
    // 'un'
    if (labelQtd) labelQtd.textContent = 'Quantidade (un) *';
    if (labelPreco) labelPreco.textContent = 'Valor Unit. (R$) *';
    if (qtdInput) {
      qtdInput.step = '1';
      qtdInput.min = '0.01';
      if (!qtdInput.value || qtdInput.value === '250') qtdInput.value = '1';
      qtdInput.placeholder = 'Ex: 1';
    }
    if (tipEl) tipEl.style.display = 'none';
  }

  updateSubtotalPreview();
}

function updateSubtotalPreview() {
  const qtdInput = document.getElementById('produto-quantidade');
  const unitInput = document.getElementById('produto-valor-unitario');
  const unitHidden = document.getElementById('produto-unidade');
  const preview = document.getElementById('preview-subtotal');

  const qtd = parseFloat(qtdInput.value) || 0;
  const unitPrice = parseFloat(unitInput.value) || 0;
  const unit = unitHidden ? unitHidden.value : 'un';

  let subtotal = 0;
  let calculationText = '';

  if (unit === 'g') {
    subtotal = (qtd / 1000) * unitPrice;
    const kgEquivalent = (qtd / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    calculationText = `${qtd} g (${kgEquivalent} kg) × ${formatCurrency(unitPrice)}/kg = `;
  } else if (unit === 'kg') {
    subtotal = qtd * unitPrice;
    calculationText = `${qtd} kg × ${formatCurrency(unitPrice)}/kg = `;
  } else if (unit === 'L') {
    subtotal = qtd * unitPrice;
    calculationText = `${qtd} L × ${formatCurrency(unitPrice)}/L = `;
  } else {
    subtotal = qtd * unitPrice;
    calculationText = `${qtd} un × ${formatCurrency(unitPrice)} = `;
  }

  preview.innerHTML = `<span style="font-weight: 500; font-size: 0.8rem; color: var(--text-muted);">${calculationText}</span><strong>${formatCurrency(subtotal)}</strong>`;
}

async function handleAddProduct(e) {
  e.preventDefault();
  if (!state.activeListId) return;

  const nomeInput = document.getElementById('produto-nome');
  const catInput = document.getElementById('produto-categoria');
  const qtdInput = document.getElementById('produto-quantidade');
  const precoInput = document.getElementById('produto-valor-unitario');
  const unitHidden = document.getElementById('produto-unidade');

  const name = nomeInput.value.trim();
  const category = catInput.value;
  const unit = unitHidden ? unitHidden.value : 'un';
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
    unit,
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
  setProductUnit('un');
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
  const url = (await db.getConfig('supabase_url')) || db.supabaseUrl;
  const key = (await db.getConfig('supabase_key')) || db.supabaseKey;
  if (url) document.getElementById('supabase-url').value = url;
  if (key) document.getElementById('supabase-key').value = key;

  const statusEl = document.getElementById('db-status-text');
  if (statusEl) {
    statusEl.textContent = 'Verificando conexão com o Supabase Cloud...';
    const status = await db.checkCloudStatus();
    if (status.connected && status.tableReady) {
      statusEl.innerHTML = '🟢 <strong>Conectado e Sincronizado:</strong> Tabela "listas" ativa no Supabase.';
      statusEl.style.color = 'var(--success-text)';
    } else if (status.connected && !status.tableReady) {
      statusEl.innerHTML = '🟡 <strong>Conexão Válida com o Supabase!</strong> Falta apenas executar o script <code>schema.sql</code> no SQL Editor do Supabase para criar a tabela.';
      statusEl.style.color = 'var(--warning-text)';
    } else {
      statusEl.innerHTML = `🔵 <strong>Modo Local Offline:</strong> Operando via IndexedDB no aparelho. (${status.message})`;
      statusEl.style.color = 'var(--text-muted)';
    }
  }
}

async function handleSaveSupabaseConfig(e) {
  e.preventDefault();
  const url = document.getElementById('supabase-url').value.trim();
  const key = document.getElementById('supabase-key').value.trim();

  db.supabaseUrl = url;
  db.supabaseKey = key;
  await db.setConfig('supabase_url', url);
  await db.setConfig('supabase_key', key);
  vibrateDevice(30);

  await loadSupabaseConfig();
  await loadDataFromDb();
  alert('Configurações salvas e conexão testada!');
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
      setProductUnit('un');
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
  document.getElementById('btn-fechar-sheet-auth').addEventListener('click', () => closeSheet('sheet-auth'));
  document.getElementById('btn-fechar-sheet-perfil').addEventListener('click', () => closeSheet('sheet-perfil'));
  
  const btnFecharAdmin = document.getElementById('btn-fechar-sheet-admin');
  if (btnFecharAdmin) {
    btnFecharAdmin.addEventListener('click', () => closeSheet('sheet-admin'));
  }

  // Fechar ao clicar no backdrop escuro
  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('bottom-sheet-backdrop')) {
      closeAllSheets();
    }
  });

  // Botão Conta / Autenticação no Header
  document.getElementById('btn-header-auth').addEventListener('click', () => {
    vibrateDevice(15);
    if (db.isAuthenticated()) {
      updateAuthUI();
      openSheet('sheet-perfil');
    } else {
      showAuthTab('login');
      openSheet('sheet-auth');
    }
  });

  // Botão Abrir Painel Admin (dentro de Meu Perfil)
  const btnAbrirAdmin = document.getElementById('btn-abrir-painel-admin');
  if (btnAbrirAdmin) {
    btnAbrirAdmin.addEventListener('click', () => {
      vibrateDevice(15);
      closeSheet('sheet-perfil');
      openAdminPanel();
    });
  }

  // Ações do Painel Admin
  const btnRecarregarAdmin = document.getElementById('btn-recarregar-admin');
  if (btnRecarregarAdmin) {
    btnRecarregarAdmin.addEventListener('click', loadAdminData);
  }

  const btnExportarCsv = document.getElementById('btn-exportar-csv');
  if (btnExportarCsv) {
    btnExportarCsv.addEventListener('click', exportLeadsToCsv);
  }

  const searchAdminInput = document.getElementById('admin-search-leads');
  if (searchAdminInput) {
    searchAdminInput.addEventListener('input', (e) => {
      filterAdminLeads(e.target.value);
    });
  }

  // Abas de Autenticação
  document.getElementById('tab-btn-login').addEventListener('click', () => showAuthTab('login'));
  document.getElementById('tab-btn-signup').addEventListener('click', () => showAuthTab('signup'));
  document.getElementById('btn-esqueci-senha').addEventListener('click', () => showAuthTab('recovery'));
  document.getElementById('btn-voltar-login').addEventListener('click', () => showAuthTab('login'));


  // Submissão dos Formulários de Autenticação
  document.getElementById('form-auth-login').addEventListener('submit', handleAuthLogin);
  document.getElementById('form-auth-signup').addEventListener('submit', handleAuthSignup);
  document.getElementById('form-auth-recovery').addEventListener('submit', handleAuthRecovery);

  // Ações de Perfil
  document.getElementById('btn-logout').addEventListener('click', handleLogout);
  document.getElementById('btn-sincronizar-nuvem').addEventListener('click', handleSyncNow);

  // Compartilhar no WhatsApp
  document.getElementById('btn-compartilhar-whatsapp').addEventListener('click', shareListWhatsApp);

  // Máscara de Telefone e Alternador de Visibilidade de Senha (Olhinho)
  const phoneInput = document.getElementById('signup-phone');
  if (phoneInput) {
    phoneInput.addEventListener('input', (e) => {
      e.target.value = formatPhoneInput(e.target.value);
    });
  }
  setupPasswordToggles();

  // Submissão dos Formulários do App
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

  // Stepper de Quantidade Inteligente (Adaptativo por Unidade)
  const qtdInput = document.getElementById('produto-quantidade');
  const precoInput = document.getElementById('produto-valor-unitario');
  
  qtdInput.addEventListener('input', updateSubtotalPreview);
  precoInput.addEventListener('input', updateSubtotalPreview);

  document.getElementById('btn-qty-minus').addEventListener('click', () => {
    let cur = parseFloat(qtdInput.value) || 0;
    const unit = document.getElementById('produto-unidade')?.value || 'un';
    const step = unit === 'g' ? 50 : (unit === 'kg' ? 0.25 : (unit === 'L' ? 0.5 : 1));
    const min = unit === 'g' ? 10 : (unit === 'kg' ? 0.05 : (unit === 'L' ? 0.1 : 1));
    
    if (cur - step >= min) {
      qtdInput.value = Math.round((cur - step) * 1000) / 1000;
    } else {
      qtdInput.value = min;
    }
    updateSubtotalPreview();
  });

  document.getElementById('btn-qty-plus').addEventListener('click', () => {
    let cur = parseFloat(qtdInput.value) || 0;
    const unit = document.getElementById('produto-unidade')?.value || 'un';
    const step = unit === 'g' ? 50 : (unit === 'kg' ? 0.25 : (unit === 'L' ? 0.5 : 1));
    qtdInput.value = Math.round((cur + step) * 1000) / 1000;
    updateSubtotalPreview();
  });

  // Botões Seletores de Unidade (Unidade, Kilo, Gramas, Litro)
  document.querySelectorAll('#produto-unidade-group .unit-toggle-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      vibrateDevice(10);
      const unit = e.currentTarget.dataset.unit;
      setProductUnit(unit);
    });
  });

  // Auto-sugestão de unidade ao escolher categoria
  document.getElementById('produto-categoria').addEventListener('change', (e) => {
    const cat = e.target.value;
    if (cat === 'Carnes & Aves' || cat === 'Hortifrúti') {
      setProductUnit('kg');
    } else if (cat === 'Laticínios & Frios') {
      setProductUnit('g');
    } else if (cat === 'Bebidas') {
      setProductUnit('un');
    }
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

// ==========================================================
// Funções de Gestão de Autenticação e Perfil SaaS
// ==========================================================

function updateAuthUI() {
  const btnHeader = document.getElementById('btn-header-auth');
  const iconHeader = document.getElementById('header-auth-icon');
  const labelHeader = document.getElementById('header-auth-label');

  const user = db.getUser();
  const isAuth = db.isAuthenticated();
  const isAdmin = db.isAdmin();

  // Controla exibição da seção exclusiva do Administrador no Perfil
  const adminSection = document.getElementById('admin-perfil-section');
  if (adminSection) {
    if (isAdmin) {
      adminSection.classList.remove('hidden');
    } else {
      adminSection.classList.add('hidden');
    }
  }

  if (isAuth && user) {
    const rawName = user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário';
    const initial = rawName.charAt(0).toUpperCase();

    if (btnHeader) {
      btnHeader.classList.add('logged-in');
      btnHeader.title = isAdmin ? `🛡️ Administrador Master (${rawName})` : `Conectado como ${rawName}`;
    }
    if (iconHeader) iconHeader.textContent = isAdmin ? '🛡️' : '👑';
    if (labelHeader) labelHeader.textContent = isAdmin ? 'Admin' : rawName.split(' ')[0];

    // Atualiza dados no modal de perfil
    const profileName = document.getElementById('profile-user-name');
    const profileEmail = document.getElementById('profile-user-email');
    const profileAvatar = document.getElementById('profile-avatar');
    const statListas = document.getElementById('stat-total-listas');
    const statItens = document.getElementById('stat-total-itens');

    if (profileName) {
      profileName.innerHTML = isAdmin 
        ? `${escapeHtml(rawName)} <span style="font-size:0.72rem; color:#d97706; font-weight:800; background:#fef3c7; border:1px solid #fde68a; padding:0.12rem 0.45rem; border-radius:12px; margin-left:5px;">🛡️ Admin</span>` 
        : escapeHtml(rawName);
    }
    if (profileEmail) profileEmail.textContent = user.email;
    if (profileAvatar) profileAvatar.textContent = isAdmin ? '🛡️' : initial;

    if (statListas) statListas.textContent = state.lists.length;
    if (statItens) {
      const totalItens = state.lists.reduce((sum, l) => sum + (l.items || []).length, 0);
      statItens.textContent = totalItens;
    }
  } else {
    if (btnHeader) {
      btnHeader.classList.remove('logged-in');
      btnHeader.title = 'Entrar / Criar Conta';
    }
    if (iconHeader) iconHeader.textContent = '👤';
    if (labelHeader) labelHeader.textContent = 'Entrar';
  }
}

function showAuthTab(tab) {
  const formLogin = document.getElementById('form-auth-login');
  const formSignup = document.getElementById('form-auth-signup');
  const formRecovery = document.getElementById('form-auth-recovery');
  const tabLogin = document.getElementById('tab-btn-login');
  const tabSignup = document.getElementById('tab-btn-signup');
  const alertBox = document.getElementById('auth-alert-msg');
  const title = document.getElementById('auth-sheet-title');

  if (alertBox) {
    alertBox.classList.add('hidden');
    alertBox.textContent = '';
  }

  if (tab === 'login') {
    if (formLogin) formLogin.classList.remove('hidden');
    if (formSignup) formSignup.classList.add('hidden');
    if (formRecovery) formRecovery.classList.add('hidden');
    if (tabLogin) tabLogin.classList.add('active');
    if (tabSignup) tabSignup.classList.remove('active');
    if (title) title.textContent = 'Entrar no Compras Plus';
  } else if (tab === 'signup') {
    if (formLogin) formLogin.classList.add('hidden');
    if (formSignup) formSignup.classList.remove('hidden');
    if (formRecovery) formRecovery.classList.add('hidden');
    if (tabLogin) tabLogin.classList.remove('active');
    if (tabSignup) tabSignup.classList.add('active');
    if (title) title.textContent = 'Criar Conta Grátis';
  } else if (tab === 'recovery') {
    if (formLogin) formLogin.classList.add('hidden');
    if (formSignup) formSignup.classList.add('hidden');
    if (formRecovery) formRecovery.classList.remove('hidden');
    if (title) title.textContent = 'Recuperar Senha';
  }
}

function showAuthAlert(msg, type = 'error') {
  const alertBox = document.getElementById('auth-alert-msg');
  if (alertBox) {
    alertBox.className = `auth-alert ${type}`;
    alertBox.textContent = msg;
    alertBox.classList.remove('hidden');
  }
}

function formatPhoneInput(value) {
  let clean = value.replace(/\D/g, '');
  if (clean.length > 11) clean = clean.slice(0, 11);
  if (clean.length > 10) {
    return clean.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  } else if (clean.length > 6) {
    return clean.replace(/^(\d{2})(\d{4})(\d{0,4})$/, '($1) $2-$3');
  } else if (clean.length > 2) {
    return clean.replace(/^(\d{2})(\d{0,5})$/, '($1) $2');
  } else if (clean.length > 0) {
    return clean.replace(/^(\d{0,2})$/, '($1');
  }
  return clean;
}

function setupPasswordToggles() {
  document.querySelectorAll('.btn-toggle-password').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;

      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
        btn.title = 'Ocultar senha';
      } else {
        input.type = 'password';
        btn.textContent = '👁️';
        btn.title = 'Visualizar senha';
      }
    });
  });
}

async function handleAuthLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-password').value;
  const rememberMe = document.getElementById('login-remember-me') ? document.getElementById('login-remember-me').checked : true;
  const btnSubmit = document.getElementById('btn-submit-login');

  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Autenticando...';

  try {
    await db.signIn(email, pass, rememberMe);
    vibrateDevice(25);
    closeSheet('sheet-auth');
    document.getElementById('form-auth-login').reset();
    await db.migrateLocalListsToCloud();
    await loadDataFromDb();
  } catch (err) {
    vibrateDevice(40);
    showAuthAlert(err.message, 'error');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Entrar no Compras Plus';
  }
}

async function handleAuthSignup(e) {
  e.preventDefault();
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const phone = document.getElementById('signup-phone').value.trim();
  const pass = document.getElementById('signup-password').value;
  const marketingConsent = document.getElementById('signup-marketing-consent') ? document.getElementById('signup-marketing-consent').checked : true;
  const btnSubmit = document.getElementById('btn-submit-signup');

  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length < 10) {
    showAuthAlert('Por favor, digite um número de WhatsApp/Telefone válido com DDD (ex: (11) 99999-9999).', 'error');
    document.getElementById('signup-phone').focus();
    return;
  }

  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Criando conta...';

  try {
    const res = await db.signUp(email, pass, name, phone, marketingConsent);
    vibrateDevice(30);

    if (db.isAuthenticated()) {
      closeSheet('sheet-auth');
      document.getElementById('form-auth-signup').reset();
      await db.migrateLocalListsToCloud();
      await loadDataFromDb();
    } else {
      showAuthAlert('Conta criada com sucesso! Verifique seu e-mail para confirmar seu cadastro e faça login.', 'success');
      setTimeout(() => showAuthTab('login'), 3500);
    }
  } catch (err) {
    vibrateDevice(40);
    showAuthAlert(err.message, 'error');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Criar Minha Conta Grátis';
  }
}

async function handleAuthRecovery(e) {
  e.preventDefault();
  const email = document.getElementById('recovery-email').value;

  try {
    await db.resetPassword(email);
    showAuthAlert('Instruções de recuperação enviadas para o seu e-mail!', 'success');
  } catch (err) {
    showAuthAlert(err.message, 'error');
  }
}

async function handleLogout() {
  if (confirm('Deseja realmente sair da sua conta?')) {
    vibrateDevice(20);
    await db.signOut();
    closeSheet('sheet-perfil');
    await loadDataFromDb();
  }
}

async function handleSyncNow() {
  const btn = document.getElementById('btn-sincronizar-nuvem');
  btn.disabled = true;
  btn.textContent = 'Sincronizando...';

  try {
    await db.migrateLocalListsToCloud();
    await loadDataFromDb();
    vibrateDevice(25);
    alert('Listas sincronizadas com a nuvem com sucesso!');
  } catch (err) {
    alert('Erro ao sincronizar: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 Sincronizar Listas Agora';
  }
}

// ==========================================================
// Painel Administrativo & Gestão de Leads SaaS
// ==========================================================

let adminLeadsCache = [];

async function openAdminPanel() {
  openSheet('sheet-admin');
  await loadAdminData();
}

async function loadAdminData() {
  const loading = document.getElementById('admin-leads-loading');
  const container = document.getElementById('admin-leads-container');
  const empty = document.getElementById('admin-leads-empty');
  const statUsers = document.getElementById('admin-stat-users');
  const statPhones = document.getElementById('admin-stat-phones');
  const statLists = document.getElementById('admin-stat-lists');

  if (loading) loading.classList.remove('hidden');
  if (container) container.classList.add('hidden');
  if (empty) empty.classList.add('hidden');

  try {
    const stats = await db.getAdminStats();
    if (statUsers) statUsers.textContent = stats.totalUsers || 0;
    if (statPhones) statPhones.textContent = stats.usersWithPhone || 0;
    if (statLists) statLists.textContent = stats.totalLists || 0;

    adminLeadsCache = stats.profiles || [];
    renderAdminLeads(adminLeadsCache);
  } catch (err) {
    if (loading) loading.classList.add('hidden');
    alert('Erro ao carregar dados do painel admin: ' + err.message);
  }
}

function renderAdminLeads(leads) {
  const loading = document.getElementById('admin-leads-loading');
  const container = document.getElementById('admin-leads-container');
  const empty = document.getElementById('admin-leads-empty');

  if (loading) loading.classList.add('hidden');

  if (!leads || leads.length === 0) {
    if (container) container.classList.add('hidden');
    if (empty) empty.classList.remove('hidden');
    return;
  }

  if (empty) empty.classList.add('hidden');
  if (container) {
    container.classList.remove('hidden');
    container.innerHTML = leads.map(lead => {
      const name = lead.name || 'Sem nome';
      const email = lead.email || 'Sem e-mail';
      const phone = lead.phone ? formatPhoneInput(lead.phone) : 'Não informado';
      const isAdmin = (lead.role === 'admin') || (email.toLowerCase() === 'viniciuscirne@gmail.com');
      const badgeClass = isAdmin ? 'badge-admin' : 'badge-user';
      const badgeLabel = isAdmin ? '👑 Admin' : '👤 Lead';
      
      const rawDate = lead.created_at ? new Date(lead.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Data n/d';
      
      let waButton = '';
      if (lead.phone && lead.phone.replace(/\D/g, '').length >= 10) {
        let cleanDigits = lead.phone.replace(/\D/g, '');
        if (cleanDigits.length === 10 || cleanDigits.length === 11) {
          cleanDigits = '55' + cleanDigits;
        }
        const textMsg = encodeURIComponent(`Olá ${name}, tudo bem? Sou da equipe do Lista de Compras Plus!`);
        waButton = `
          <a href="https://wa.me/${cleanDigits}?text=${textMsg}" target="_blank" rel="noopener" class="btn-lead-whatsapp">
            <span>💬</span> Conversar no WhatsApp
          </a>
        `;
      } else {
        waButton = `<span style="font-size: 0.72rem; color: var(--text-light);">Sem WhatsApp cadastrado</span>`;
      }

      return `
        <div class="admin-lead-card ${isAdmin ? 'is-admin' : ''}">
          <div class="admin-lead-header">
            <span class="admin-lead-name">${escapeHtml(name)}</span>
            <span class="admin-lead-badge ${badgeClass}">${badgeLabel}</span>
          </div>
          <div class="admin-lead-details">
            <div class="admin-lead-row">
              <span>📧</span>
              <span>${escapeHtml(email)}</span>
            </div>
            <div class="admin-lead-row">
              <span>📲</span>
              <strong>${escapeHtml(phone)}</strong>
            </div>
            <div class="admin-lead-row" style="justify-content: space-between; margin-top: 2px;">
              <span style="font-size: 0.7rem; color: var(--text-light);">📅 ${rawDate}</span>
              ${lead.marketing_consent !== false ? '<span class="admin-lead-consent-tag">✅ Aceita Marketing</span>' : '<span style="font-size:0.68rem; color:#ef4444;">❌ Não aceitou</span>'}
            </div>
          </div>
          <div class="admin-lead-actions">
            ${waButton}
          </div>
        </div>
      `;
    }).join('');
  }
}

function filterAdminLeads(searchTerm) {
  const term = (searchTerm || '').toLowerCase().trim();
  if (!term) {
    renderAdminLeads(adminLeadsCache);
    return;
  }

  const filtered = adminLeadsCache.filter(lead => {
    const name = (lead.name || '').toLowerCase();
    const email = (lead.email || '').toLowerCase();
    const phone = (lead.phone || '').replace(/\D/g, '');
    const cleanTerm = term.replace(/\D/g, '');

    return name.includes(term) || email.includes(term) || (cleanTerm && phone.includes(cleanTerm));
  });

  renderAdminLeads(filtered);
}

function exportLeadsToCsv() {
  if (!adminLeadsCache || adminLeadsCache.length === 0) {
    alert('Nenhum lead disponível para exportação no momento.');
    return;
  }

  // Cabeçalho do CSV
  const headers = ['Nome', 'Email', 'Telefone', 'WhatsApp_Link', 'Marketing_Consent', 'Funcao', 'Data_Cadastro'];
  
  const rows = adminLeadsCache.map(lead => {
    const name = `"${(lead.name || '').replace(/"/g, '""')}"`;
    const email = `"${(lead.email || '').replace(/"/g, '""')}"`;
    const phone = `"${(lead.phone || '').replace(/"/g, '""')}"`;
    
    let waLink = '';
    if (lead.phone && lead.phone.replace(/\D/g, '').length >= 10) {
      let digits = lead.phone.replace(/\D/g, '');
      if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
      waLink = `"https://wa.me/${digits}"`;
    }

    const consent = lead.marketing_consent !== false ? '"SIM"' : '"NAO"';
    const role = `"${lead.role || 'user'}"`;
    const date = `"${lead.created_at || ''}"`;

    return [name, email, phone, waLink, consent, role, date].join(';');
  });

  // BOM UTF-8 (\uFEFF) para garantir acentuação correta no Excel brasileiro
  const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `leads_compras_plus_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  vibrateDevice(20);
}

// Inicializar aplicação
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadDataFromDb();
});

