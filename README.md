# 🛒 Lista de Compras Plus

Um aplicativo web moderno, intuitivo e responsivo para gerenciamento de listas de compras com **controle de orçamento inteligente** e **saldo disponível em tempo real**.

---

## ✨ Principais Funcionalidades

- 📋 **Gestão de Múltiplas Listas**: Crie listas para diferentes ocasiões (Supermercado, Feira, Churrasco, Farmácia, etc.).
- 💰 **Orçamento por Lista**: Defina um teto de gastos individual para cada lista de compras.
- 📉 **Dedução Automática do Saldo**: Cada produto cadastrado abate instantaneamente o valor do saldo disponível.
- 📊 **Barra de Progresso Dinâmica**: Acompanhe o consumo do orçamento com alertas visuais:
  - 🟢 **Verde**: Seguro (consumo abaixo de 75%).
  - 🟡 **Amarelo**: Atenção (consumo entre 75% e 99%).
  - 🔴 **Vermelho**: Limite ultrapassado com cálculo do valor excedido.
- 🏷️ **Categorias de Mercadorias**: Organize itens por categoria (Hortifrúti, Mercearia, Carnes, Bebidas, Limpeza, etc.) com badges coloridos e filtros rápidos.
- 🔢 **Cálculo Automático**: Multiplicação em tempo real de `Quantidade × Valor Unitário`, exibindo a prévia antes da adição.
- 🛒 **Modo Carrinho**: Marque produtos como comprados conforme coloca no carrinho.
- 💾 **Persistência Local**: Todos os dados são salvos automaticamente no navegador (`localStorage`), sem necessidade de banco de dados externo ou login.

---

## 🚀 Como Executar

Por ser construído com tecnologias web nativas, você não precisa instalar nenhuma dependência:

1. Clone o repositório:
   ```bash
   git clone https://github.com/vinnicirne/listadecomprasplus.git
   ```
2. Abra o arquivo `index.html` em qualquer navegador moderno (Chrome, Edge, Firefox, Safari).

---

## 🛠️ Tecnologias Utilizadas

- **HTML5**: Estrutura semântica e acessível.
- **CSS3 (Vanilla)**: Design system customizado, variáveis CSS, glassmorphism e responsividade mobile-first.
- **JavaScript (Vanilla)**: Manipulação reativa do DOM, cálculos matemáticos instantâneos e persistência no `localStorage`.
