# REAPRENDER 1.0

Plataforma de aprendizagem para jovens e adultos, construída com HTML, CSS e JavaScript puro e preparada para autenticação e banco de dados Supabase.

## O que já está implementado

- Tela de entrada, criação de conta e recuperação de senha.
- Modo de demonstração local para testar sem configurar o Supabase.
- Sete disciplinas, 14 módulos e 23 aulas iniciais com explicações, exemplos, resumos e exercícios.
- Leitor de apostilas com explicações, exemplos e resumos.
- Temporizador de cinco minutos que conta apenas enquanto a aba está visível.
- Confirmação de leitura e exercício de múltipla escolha.
- Desbloqueio sequencial das aulas e dos módulos.
- Salvamento de progresso local no modo demonstração e na nuvem no modo online.
- Painel da professora para visualizar estudantes e progresso, quando conectado ao Supabase.
- Layout responsivo para celular e computador.

## Estrutura de pastas

```text
reaprender/
├── index.html                 # Página principal
├── README.md                  # Este guia
├── css/
│   └── style.css              # Identidade visual e responsividade
├── js/
│   ├── config.js              # Credenciais públicas do Supabase
│   ├── catalog.js             # Disciplinas, módulos, apostilas e exercícios
│   └── app.js                 # Login, navegação, temporizador e progresso
└── supabase/
    └── schema.sql             # Estrutura do banco e políticas de segurança
```

## Testar imediatamente

1. Descompacte a pasta `reaprender`.
2. Abra `index.html` em um navegador moderno. Se o navegador bloquear recursos locais, use a extensão Live Server do Visual Studio Code ou execute `python -m http.server 8000` dentro da pasta e acesse `http://localhost:8000`.
3. Clique em **Entrar no modo demonstração**.
4. Abra uma disciplina, entre no primeiro módulo e acesse uma aula.
5. Mantenha a página visível por cinco minutos. O contador pausa quando a aba fica oculta.
6. Marque a confirmação de leitura, responda corretamente à questão e conclua a aula.
7. Volte ao módulo e confira a liberação da aula seguinte.

O modo demonstração guarda o progresso apenas no navegador utilizado. Não é uma conta online e não sincroniza entre aparelhos.

## Configurar o Supabase para uso online

1. Crie um projeto em <https://supabase.com/>.
2. No painel do projeto, abra **SQL Editor**.
3. Copie todo o conteúdo de `supabase/schema.sql`, cole no editor e execute.
4. Em **Project Settings > API**, copie a **Project URL** e a chave **anon/public**.
5. Abra `js/config.js` e substitua os dois valores de exemplo pelas credenciais do projeto.
6. Em **Authentication > URL Configuration**, configure a URL do site. Durante o desenvolvimento local, adicione `http://localhost:8000` às Redirect URLs.
7. Publique a pasta em um serviço de hospedagem estática com HTTPS.
8. Crie sua conta pela tela do site. Para transformá-la em professora, execute no SQL Editor o comando de promoção comentado no final de `schema.sql`, substituindo o e-mail.
9. Peça aos estudantes que criem suas próprias contas. Todo cadastro público começa com o papel `student`.

**Segurança:** nunca coloque a chave `service_role` no JavaScript. Use somente a chave `anon/public` no navegador. As tabelas possuem RLS para separar os dados dos estudantes e permitir leitura docente.

## Como acrescentar ou editar conteúdos

Abra `js/catalog.js`. Cada disciplina possui `modules`, e cada módulo possui `lessons`. Uma aula contém:

- `id`: identificador único e estável. Não o altere depois que estudantes começarem a usar a plataforma, pois o progresso é associado a ele.
- `title`: título da aula.
- `minutes`: estimativa de leitura exibida no catálogo.
- `lead`: texto introdutório.
- `sections`: tópicos da apostila, cada um com título, parágrafos e exemplo opcional.
- `summary`: lista de pontos essenciais.
- `question`: enunciado, alternativas, índice da resposta correta e explicação.

Para criar uma nova aula, copie um objeto de aula existente, dê a ela um `id` exclusivo e altere o conteúdo. Para criar um módulo, copie a estrutura de um módulo e acrescente aulas.

## Personalizar o visual

As cores principais estão no início de `css/style.css`, dentro de `:root`. Altere `--navy`, `--beige`, `--gold` e `--blue` para ajustar a identidade visual.

## Observações importantes sobre a primeira versão

- O temporizador conta tempo com a página visível e salva o progresso periodicamente. Nesta versão inicial, a regra de cinco minutos é uma barreira pedagógica no navegador, não um mecanismo antifraude de prova ou certificação. Uma pessoa com conhecimentos técnicos pode manipular dados enviados pelo próprio navegador. Para uso com certificação formal, será necessário transferir a validação do tempo e das respostas para funções seguras no servidor.
- O catálogo já tem conteúdos iniciais em todas as sete disciplinas, mas ainda não representa uma coleção completa de apostilas. O projeto foi preparado para receber novos módulos e aulas gradualmente.
- O painel da professora apresenta acompanhamento geral e detalhes de conclusão. A atribuição individual de tarefas, comentários e notificações fica planejada para uma próxima versão.
- O código é comentado em português. Alguns trechos usam nomes técnicos padronizados para facilitar manutenção.

## Testes recomendados

- [ ] Abrir a aplicação sem Supabase e entrar no modo demonstração.
- [ ] Conferir se as sete disciplinas aparecem.
- [ ] Conferir se cada disciplina abre seus módulos.
- [ ] Tentar abrir uma aula bloqueada.
- [ ] Verificar se o contador pausa ao mudar de aba.
- [ ] Verificar se a confirmação fica desabilitada antes dos cinco minutos.
- [ ] Tentar enviar a atividade sem selecionar alternativa.
- [ ] Errar e depois acertar a questão.
- [ ] Concluir a aula e verificar a liberação da próxima.
- [ ] Atualizar o navegador e conferir se o progresso local continua salvo.
- [ ] Configurar Supabase e testar duas contas diferentes para validar o isolamento dos dados.
- [ ] Promover uma conta a professora e testar o painel docente.
