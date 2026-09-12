/**
 * api/config.js - Vercel Serverless Function
 * Retorna as variáveis públicas de conexão ao Supabase cadastradas no painel da Vercel.
 */

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabaseUrl = process.env.SUPABASE_URL || 
                      process.env.NEXT_PUBLIC_SUPABASE_URL || 
                      process.env.VITE_SUPABASE_URL || '';

  const supabaseKey = process.env.SUPABASE_KEY || 
                      process.env.SUPABASE_ANON_KEY || 
                      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                      process.env.VITE_SUPABASE_ANON_KEY || '';

  return res.status(200).json({
    supabaseUrl,
    supabaseKey
  });
}
