/**
 * scripts/generate-env.js
 * Lê as variáveis de ambiente (Vercel ou .env local) e gera o arquivo env.js
 * Suporte completo aos prefixos NEXT_PUBLIC_SUPABASE_*, NEXT_SUPABASE_* e SUPABASE_*.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const targetPath = path.join(rootDir, 'env.js');

let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 
                  process.env.NEXT_SUPABASE_URL || 
                  process.env.SUPABASE_URL || 
                  process.env.VITE_SUPABASE_URL || '';

let supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                  process.env.NEXT_PUBLIC_SUPABASE_KEY || 
                  process.env.NEXT_SUPABASE_KEY || 
                  process.env.NEXT_SUPABASE_ANON_KEY || 
                  process.env.SUPABASE_KEY || 
                  process.env.SUPABASE_ANON_KEY || 
                  process.env.VITE_SUPABASE_ANON_KEY || '';

// Se não estiver nas variáveis de ambiente do sistema, tenta ler do arquivo .env
if ((!supabaseUrl || !supabaseKey) && fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split(/\r?\n/);
    const urlKeys = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_SUPABASE_URL', 'SUPABASE_URL', 'VITE_SUPABASE_URL'];
    const keyKeys = ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_KEY', 'NEXT_SUPABASE_KEY', 'NEXT_SUPABASE_ANON_KEY', 'SUPABASE_KEY', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let val = match[2].trim();
        // Remove aspas se houver
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!supabaseUrl && urlKeys.includes(key) && val) {
          supabaseUrl = val;
        }
        if (!supabaseKey && keyKeys.includes(key) && val) {
          supabaseKey = val;
        }
      }
    }
  } catch (err) {
    console.warn('Aviso: Erro ao ler .env:', err.message);
  }
}

const fileContent = `// Arquivo de configuração de ambiente gerado automaticamente
// Não modifique manualmente. Altere o arquivo .env ou as variáveis na Vercel.
window.__ENV__ = {
  NEXT_PUBLIC_SUPABASE_URL: ${JSON.stringify(supabaseUrl || '')},
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ${JSON.stringify(supabaseKey || '')},
  NEXT_SUPABASE_URL: ${JSON.stringify(supabaseUrl || '')},
  NEXT_SUPABASE_KEY: ${JSON.stringify(supabaseKey || '')},
  SUPABASE_URL: ${JSON.stringify(supabaseUrl || '')},
  SUPABASE_KEY: ${JSON.stringify(supabaseKey || '')}
};
`;

fs.writeFileSync(targetPath, fileContent, 'utf8');
console.log('✅ env.js gerado com sucesso!');
if (supabaseUrl) {
  console.log('   NEXT_PUBLIC_SUPABASE_URL configurada:', supabaseUrl.replace(/(https:\/\/[^.]+).*/, '$1.supabase.co'));
} else {
  console.log('   ℹ️ URL do Supabase não definida no .env nem nas variáveis');
}
