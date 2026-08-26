// Credenciais integradas do Supabase
const SUPABASE_URL = 'https://ciumwhcahcekrryeppoip.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpdW13aGNhaGNla3JyeWVwcG9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NjM5NTMsImV4cCI6MjEwMzMzOTk1M30.Rnq8Ob1kXwRr9jn7UcBF80Rh61hAxxVnABEXAD1sAKo';

// Usando 'db' para evitar qualquer conflito com o nome global da biblioteca
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Verificar sessão ao carregar a página
document.addEventListener("DOMContentLoaded", async () => {
    const { data: { session } } = await db.auth.getSession();
    controlarExibicaoTela(session);

    db.auth.onAuthStateChange((event, session) => {
        controlarExibicaoTela(session);
    });
});

function controlarExibicaoTela(session) {
    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');

    if (session) {
        loginContainer.style.display = 'none';
        appContainer.style.display = 'block';
        carregarTecnicosSelect();
    } else {
        loginContainer.style.display = 'flex';
        appContainer.style.display = 'none';
    }
}

// Ação de Login
document.getElementById('formLogin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login_email').value;
    const senha = document.getElementById('login_senha').value;

    const { error } = await db.auth.signInWithPassword({
        email: email,
        password: senha,
    });

    if (error) {
        alert('Erro ao fazer login: ' + error.message);
    }
});

// Ação de Logout
async function fazerLogout() {
    await db.auth.signOut();
}

// Obter coordenadas geográficas pelo Nominatim (OpenStreetMap)
async function obterCoordenadas(rua, bairro, cidade, estado) {
    const enderecoCompleto = `${rua}, ${bairro}, ${cidade} - ${estado}, Brasil`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(enderecoCompleto)}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon)
            };
        }
    } catch (e) {
        console.error("Erro ao buscar coordenadas", e);
    }
    return null;
}

// 1. Cadastrar Técnico
document.getElementById('formTecnico').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const rua = document.getElementById('tec_rua').value;
    const bairro = document.getElementById('tec_bairro').value;
    const cidade = document.getElementById('tec_cidade').value;
    const estado = document.getElementById('tec_estado').value;

    const coords = await obterCoordenadas(rua, bairro, cidade, estado);
    const pontoGeo = coords ? `POINT(${coords.lon} ${coords.lat})` : null;

    const ferramentasArray = document.getElementById('tec_ferramentas').value
        ? document.getElementById('tec_ferramentas').value.split(',').map(i => i.trim())
        : [];

    const { error } = await db.from('tecnicos').insert([{
        nome: document.getElementById('tec_nome').value,
        cpf: document.getElementById('tec_cpf').value,
        cnpj: document.getElementById('tec_cnpj').value || null,
        estado, cidade, bairro, rua,
        contato: document.getElementById('tec_contato').value,
        email: document.getElementById('tec_email').value,
        ferramentas: ferramentasArray,
        observacao_tecnico: document.getElementById('tec_obs').value,
        localizacao: pontoGeo
    }]);

    if (error) {
        alert('Erro ao cadastrar técnico: ' + error.message);
    } else {
        alert('Técnico cadastrado com sucesso!');
        document.getElementById('formTecnico').reset();
        carregarTecnicosSelect();
    }
});

// 2. Buscar Técnico Mais Próximo
async function buscarTecnicoMaisProximo() {
    const rua = document.getElementById('chamado_rua').value;
    const bairro = document.getElementById('chamado_bairro').value;
    const cidade = document.getElementById('chamado_cidade').value;
    const estado = document.getElementById('chamado_estado').value;

    if (!cidade || !bairro) {
        alert('Preencha pelo menos a Cidade e o Bairro do local do chamado!');
        return;
    }

    const coordsChamado = await obterCoordenadas(rua, bairro, cidade, estado);
    if (!coordsChamado) {
        alert('Não foi possível localizar este endereço no mapa.');
        return;
    }

    const { data: tecnicos, error } = await db.rpc('buscar_tecnicos_proximos', {
        lat_chamado: coordsChamado.lat,
        lon_chamado: coordsChamado.lon
    });

    const select = document.getElementById('chamado_tecnico');
    select.innerHTML = '<option value="">Selecione um técnico</option>';

    if (error || !tecnicos || tecnicos.length === 0) {
        alert('Nenhum técnico próximo encontrado.');
        carregarTecnicosSelect();
        return;
    }

    tecnicos.forEach(tec => {
        const opt = document.createElement('option');
        opt.value = tec.id;
        opt.textContent = `${tec.nome} — Aproximadamente ${tec.distancia_km} km de distância (${tec.bairro})`;
        select.appendChild(opt);
    });

    select.value = tecnicos[0].id;
    alert(`Técnico mais próximo selecionado: ${tecnicos[0].nome} (${tecnicos[0].distancia_km} km)!`);
}

// 3. Criar Chamado
document.getElementById('formChamado').addEventListener('submit', async (e) => {
    e.preventDefault();

    const rua = document.getElementById('chamado_rua').value;
    const bairro = document.getElementById('chamado_bairro').value;
    const cidade = document.getElementById('chamado_cidade').value;
    const estado = document.getElementById('chamado_estado').value;

    const coords = await obterCoordenadas(rua, bairro, cidade, estado);
    const pontoGeo = coords ? `POINT(${coords.lon} ${coords.lat})` : null;

    const { error } = await db.from('chamados').insert([{
        titulo: document.getElementById('chamado_titulo').value,
        estado, cidade, bairro, rua,
        localizacao: pontoGeo,
        tecnico_id: document.getElementById('chamado_tecnico').value || null,
        status: 'Criado'
    }]);

    if (error) {
        alert('Erro ao criar chamado: ' + error.message);
    } else {
        alert('Chamado criado com sucesso!');
        document.getElementById('formChamado').reset();
        carregarTecnicosSelect();
    }
});

async function carregarTecnicosSelect() {
    const select = document.getElementById('chamado_tecnico');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione um técnico</option>';
    const { data } = await db.from('tecnicos').select('id, nome, bairro');
    if (data) {
        data.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = `${t.nome} (${t.bairro})`;
            select.appendChild(opt);
        });
    }
}

// 4. Relatório CSV
async function gerarRelatorioCSV() {
    const dataInicio = document.getElementById('rel_data_inicio').value;
    const dataFim = document.getElementById('rel_data_fim').value;

    if (!dataInicio || !dataFim) {
        alert('Selecione a Data Início e a Data Fim.');
        return;
    }

    let query = db
        .from('chamados')
        .select(`
            id,
            titulo,
            status,
            cidade,
            bairro,
            rua,
            criado_em,
            tecnicos (nome, cpf, contato, email),
            atendimento_historico (observacao_atendimento, nota_estrelas, data_conclusao)
        `)
        .gte('criado_em', `${dataInicio}T00:00:00`)
        .lte('criado_em', `${dataFim}T23:59:59`)
        .order('id', { ascending: false });

    const { data, error } = await query;

    if (error) {
        alert('Erro ao gerar relatório: ' + error.message);
        return;
    }

    if (!data || data.length === 0) {
        alert('Nenhum chamado encontrado neste período.');
        return;
    }

    let csvContent = "ID;Titulo;Status;Data Criacao;Cidade;Bairro;Tecnico;Contato Tecnico;Nota Estrelas;Observacao Resolucao\n";

    data.forEach(item => {
        const id = item.id;
        const titulo = `"${(item.titulo || '').replace(/"/g, '""')}"`;
        const status = item.status;
        const dataCriacao = new Date(item.criado_em).toLocaleDateString('pt-BR');
        const cidade = item.cidade || '';
        const bairro = item.bairro || '';
        
        const nomeTecnico = item.tecnicos ? `"${item.tecnicos.nome}"` : '"Não Alocado"';
        const contatoTecnico = item.tecnicos ? item.tecnicos.contato : '';

        const historico = (item.atendimento_historico && item.atendimento_historico.length > 0) ? item.atendimento_historico[0] : null;
        const nota = historico ? historico.nota_estrelas : '';
        const observacao = historico ? `"${(historico.observacao_atendimento || '').replace(/"/g, '""')}"` : '""';

        csvContent += `${id};${titulo};${status};${dataCriacao};${cidade};${bairro};${nomeTecnico};${contatoTecnico};${nota};${observacao}\n`;
    });

    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `relatorio_chamados_${dataInicio}_a_${dataFim}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
