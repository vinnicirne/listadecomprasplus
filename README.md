# 🛒 Lista de Compras Plus (PWA & Android)

Um aplicativo web e mobile moderno, intuitivo e responsivo para gerenciamento de listas de compras com **controle de orçamento inteligente**, **saldo disponível em tempo real** e suporte a **instalação nativa (PWA e Android)**.

---

## ✨ Principais Funcionalidades

- 📱 **Instalável no Celular (PWA & Android)**:
  - Adicione diretamente à tela inicial do Android pelo Chrome/Edge com visual de aplicativo nativo (sem barra de navegação do browser).
  - Suporte completo a **funcionamento offline** via Service Worker (`sw.js`). Seus dados ficam acessíveis no supermercado mesmo sem sinal de internet!
  - Suporte tátil com vibração sutil (`haptic feedback`) ao adicionar itens ou marcar no carrinho.
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

## 📲 Como Instalar no Celular (Android & iOS)

### No Android:
1. Abra o link da aplicação no Google Chrome.
2. Toque no botão **"📲 Instalar App"** que aparecerá no topo da página ou no menu de 3 pontinhos do Chrome e selecione **"Instalar aplicativo"** / **"Adicionar à tela inicial"**.
3. O ícone do app será criado na sua tela inicial e funcionará como um app nativo, mesmo sem internet.

### No iPhone / iPad (iOS):
1. Abra a página no Safari.
2. Toque no botão de Compartilhar (ícone do quadrado com a seta para cima).
3. Selecione **"Adicionar à Tela de Início"**.

---

## 🤖 Compilação Nativa Android (Capacitor / APK)

Para gerar um arquivo `.apk` compilado para Android ou publicar na Google Play Store, o projeto já possui o Capacitor configurado:

```bash
# 1. Instalar dependências
npm install

# 2. Adicionar plataforma Android nativa
npx cap add android

# 3. Sincronizar arquivos web com o projeto Android
npx cap sync

# 4. Abrir no Android Studio para gerar o APK
npx cap open android
```

---

## 🛠️ Tecnologias Utilizadas

- **HTML5 & PWA**: Manifesto (`manifest.json`), Service Worker (`sw.js`) com cache offline e meta tags mobile.
- **CSS3 (Vanilla)**: Design system moderno, variáveis CSS, suporte a safe-area em celulares com entalhes e responsividade mobile-first.
- **JavaScript (Vanilla)**: Manipulação reativa do DOM, cálculos instantâneos, vibração tátil e persistência no `localStorage`.
- **Capacitor**: Ponte para empacotamento nativo no ecossistema Android.
