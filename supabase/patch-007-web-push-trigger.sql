-- P2-B step 2: forward new chat messages to the send-chat-push Edge Function.
-- Run this AFTER patch-006 and AFTER deploying the function.
--
-- Before running, replace the three placeholders below with your own values:
--   <PROJECT_REF>       e.g. abcdefghijklmnop
--   <ANON_KEY>          the project's anon (publishable) key
--   <VAPID_PUBLIC_KEY>  the public key from `npx web-push generate-vapid-keys`
--
-- The values are stored in app_settings (not in this file) so the trigger can be
-- pointed at a different function without re-editing SQL.
-- The anon key is already shipped to every browser, so it is not a secret.

create extension if not exists pg_net with schema extensions;

update public.app_settings
set value = value
  || jsonb_build_object(
       'vapidPublicKey',
       '<VAPID_PUBLIC_KEY>',
       'pushEndpoint',
       'https://<PROJECT_REF>.supabase.co/functions/v1/send-chat-push',
       'anonKey',
       '<ANON_KEY>'
     ),
    updated_at = now()
where id = 'web_push';

create or replace function public.notify_chat_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  settings jsonb;
  endpoint_url text;
  anon_key text;
begin
  if new.is_deleted then
    return new;
  end if;

  select value into settings
  from public.app_settings
  where id = 'web_push';

  endpoint_url := nullif(settings ->> 'pushEndpoint', '');
  anon_key := nullif(settings ->> 'anonKey', '');

  if endpoint_url is null or anon_key is null then
    return new;
  end if;

  perform net.http_post(
    url := endpoint_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key
    ),
    body := jsonb_build_object('messageId', new.id, 'record', to_jsonb(new)),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists chat_messages_notify_push on public.chat_messages;

create trigger chat_messages_notify_push
  after insert on public.chat_messages
  for each row execute function public.notify_chat_push();
