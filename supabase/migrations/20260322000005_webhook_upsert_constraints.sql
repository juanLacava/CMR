drop index if exists public.conversations_source_idx;
create unique index if not exists conversations_source_idx
  on public.conversations (tenant_id, source, source_conversation_id);

drop index if exists public.messages_source_idx;
create unique index if not exists messages_source_idx
  on public.messages (tenant_id, source, source_message_id);
