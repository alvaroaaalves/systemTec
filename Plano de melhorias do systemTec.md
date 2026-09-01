# Plano de melhorias do systemTec

## Já implementado no código

- Autenticação por e-mail e senha.

- Cadastro e edição de clientes e técnicos.

- Autocomplete de endereços com geocodificação.

- Preservação de número da rua quando informado.

- Leitura de coordenadas PostGIS em formato EWKB hexadecimal.

- Mapa do dashboard com filtro por status.

- Lista de técnicos ordenada por distância, quando a função RPC está disponível.

- Edição de status na lista de chamados sem abrir o detalhe por engano.

- Histórico de alterações de endereço com valor anterior e atual.

- Exportação de chamados por período em CSV.

- CSV com ID, cliente, filial, endereço, título, técnico, criação, resolução, última informação do histórico e status atual.

- Dashboard com indicadores de total, abertos, em atendimento, atrasados, resolvidos no período, tempo médio de resolução e clientes atendidos.

- Dashboard com filtros combinados no mapa por status, período, técnico, cidade e prioridade.

- Marcadores do mapa com cores diferentes por status.

## Próximos ajustes que podem ser implementados no código

- Histórico completo antes/depois para todos os campos alterados.

- Pesquisa por ID, cliente, filial, título e endereço.

- Paginação da lista de chamados.

- Prioridade e prazo de atendimento.

- Cores e filtros adicionais no mapa.

- Indicadores de tempo médio de atendimento e resolução.

- Separação do script.js em módulos menores.

## Ajustes que dependem do Supabase

- Políticas RLS e perfis de acesso.

- Função RPC tecnicos_proximos_chamado.

- Campos específicos de data de resolução, se forem necessários.

- Armazenamento de anexos.

- Auditoria com usuário responsável por cada alteração.

## Ordem recomendada

1. Segurança com RLS e perfis.

1. Histórico completo antes/depois.

1. Pesquisa e paginação de chamados.

1. Prioridade e prazo.

1. Melhorias de mapa e indicadores.

1. Anexos.

1. Organização do código em módulos.
