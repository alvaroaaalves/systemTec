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

## Próximos ajustes que podem ser implementados no código

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
2. Histórico completo antes/depois.
3. Pesquisa e paginação de chamados.
4. Prioridade e prazo.
5. Melhorias de mapa e indicadores.
6. Anexos.
7. Organização do código em módulos.
