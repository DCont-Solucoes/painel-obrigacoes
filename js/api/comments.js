import { supabase } from '../supabaseClient.js';
import { withCurrentWorkspace } from './workspaceContext.js';

export async function fetchComments(obligationId) {
  const { data, error } = await supabase
    .from('obligation_comments')
    .select('*')
    .eq('obligation_id', obligationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createComment({ obligationId, authorId, authorName, body }) {
  const { data, error } = await supabase
    .from('obligation_comments')
    .insert(withCurrentWorkspace({ obligation_id: obligationId, author_id: authorId, author_name: authorName, body }))
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteComment(id) {
  const { error } = await supabase.from('obligation_comments').delete().eq('id', id);
  if (error) throw error;
}
