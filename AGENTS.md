# Instruções para agentes

## Projeto

Portal executivo em Next.js 14 (App Router), React, TypeScript e Tailwind CSS, com autenticação e dados no Supabase. Use npm e preserve o `package-lock.json`.

## Estrutura

- `src/app/`: rotas, layouts, Server Actions e endpoints; `(app)` agrupa as telas autenticadas.
- `src/components/`: componentes compartilhados; `src/lib/`: regras de negócio e integrações. O alias `@/` aponta para `src/`.
- `src/middleware.ts`: renovação de sessão e redirecionamento de autenticação.
- `supabase/migrations/`: histórico numerado de mudanças no banco. Acrescente novas migrations em sequência; não reescreva migrations já aplicadas.
- `public/`: arquivos estáticos. `.github/workflows/sync-planilha.yml` agenda a sincronização.

## Desenvolvimento e verificação

- Instale as dependências com `npm ci`; inicie o servidor com `npm run dev`.
- Execute `npm test`, `npm run lint` e `npm run build` conforme o escopo da alteração. Os testes usam Vitest e ficam próximos das regras testadas.
- O projeto usa TypeScript em modo estrito. Mantenha os padrões locais e teste mudanças em regras de negócio com casos relevantes.
- Configure as variáveis locais a partir de `.env.local.example`. A sincronização usa `CRON_SECRET` e a integração com Anthropic usa `ANTHROPIC_API_KEY` quando habilitada. Nunca inclua valores reais ou dados sensíveis em commits ou logs.

## Dados e segurança

- Para desenvolver e testar mudanças que envolvam banco de dados, prefira uma instância local ou ambiente isolado com dados fictícios. Valide migrations e comportamento nesse ambiente antes de propor sua aplicação em produção; não use o banco de produção como ambiente de desenvolvimento ou testes.
- O Supabase local é configurado em `supabase/config.toml` e iniciado com `npm run db:start` (Docker necessário); use `npm run db:status` para verificar a instância e `npm run db:stop` para pará-la. Confira sempre a URL e as credenciais usadas pela aplicação: iniciar o banco local não altera automaticamente `.env.local`.
- Preserve a autenticação, a autorização por papel e as políticas RLS ao alterar telas, Server Actions, APIs ou consultas. Endpoints de API devem verificar suas próprias credenciais quando necessário.
- A chave de serviço do Supabase é privilegiada: use-a somente no servidor e apenas quando necessário. Não exponha segredos ao cliente.
- Não execute migrations, sincronizações ou operações destrutivas em ambientes remotos sem autorização explícita. Evite acessar ou modificar dados reais para testes.
