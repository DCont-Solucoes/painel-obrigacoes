import { supabase } from '../supabaseClient.js';

// Caminho dentro do bucket: obligationId/occurrenceDate-timestamp-nome —
// gerado ANTES de existir uma linha de conclusão, porque agora o
// comprovante é obrigatório e precisa ser enviado antes da conclusão ser
// gravada (não depois, como numa versão anterior).
export async function uploadAttachment(file, obligationId, occurrenceDate) {
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = `${obligationId}/${occurrenceDate}-${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from('comprovantes').upload(path, file, { upsert: true });
  if (error) throw error;
  return path;
}

// O bucket é privado, então a visualização exige um link assinado
// (expira em 1 hora — suficiente para abrir/baixar o arquivo na hora).
export async function getAttachmentUrl(path) {
  const { data, error } = await supabase.storage.from('comprovantes').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
