const SUPABASE_URL = 'https://ciumwhcahcekrryeppoi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpdW13aGNhaGNla3JyeWVwcG9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NjM5NTMsImV4cCI6MjEwMzMzOTk1M30.Rnq8Ob1kXwRr9jn7UcBF80Rh61hAxxVnABEXAD1sAKo';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener("DOMContentLoaded", async () => {
    const { data: { session } } = await db.auth.getSession();
    const paginaAtual = window.location.pathname.split("/").pop();

    // Regras de Proteção de Rota
    if (!session && paginaAtual !== "" && paginaAtual !== "index.html") {
        window.location.href = "index.html";
        return;
    }
    if (session && (paginaAtual === "" || paginaAtual === "index.html")) {
        window.location.href = "dashboard.html";
        return;
    }

    // Inicializadores específicos por página
    if (paginaAtual === "dashboard.html") {
        carregarDadosDashboard();
    } else if (paginaAtual === "tecnicos.html") {
        carregarListaTecnicos();
    } else if (paginaAtual === "chamados.html") {
        carregarTecnicosSelect();
        carregarChamadosRecentes();
    }
});

// Login
const formLogin = document.getElementById('formLogin');
if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login_email').value;
        const senha = document.getElementById('login_senha').value;

        const { error } = await db.auth.signInWithPassword({ email, password: senha });
        if (error) {
            alert('Erro ao fazer login: ' + error.message);
        } else {
            window.location.href = 'dashboard.html';
        }
    });
}

async function fazerLogout() {
    await db.auth.signOut();
    window.location.href = 'index.html';
}

// Dashboard Resumos
async function carregarDadosDashboard() {
    const { data: chamados } = await db.from('chamados').select('status');
    if (chamados) {
        document.getElementById('dash_total_chamados').textContent = chamados.length;
        document.getElementById('dash_abertos').textContent = chamados.filter(c => c.status === 'Criado' || c.status === 'Aberto').length;
        document.getElementById('dash_atendimento').textContent = chamados.filter(c => c.status === 'Em Atendimento').length;
        document.getElementById('dash_fechados').textContent = chamados.filter(c => c.status === 'Fechado' || c.status === 'Concluído').length;
    }

    const { data: tecnicos } = await db.from('tecnicos').select('id');
    if (tecnicos) {
        document.getElementById('dash_total_tecnicos').textContent = tecnicos.length;
    }
}

// Coordenadas OpenStreetMap (Nominatim)
async function obterCoordenadas(rua, bairro, cidade, estado) {
    const enderecoCompleto = `${rua}, ${bairro}, ${cidade} - ${estado}, Brasil`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(enderecoCompleto)}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data && data.length > 0) {
            return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
        }
    } catch (e) {
        console.error("Erro ao buscar coordenadas", e);
    }
    return null;
}

// Cadastrar Técnico
const formTecnico = document.getElementById('formTecnico');
if (formTecnico) {
    formTecnico.addEventListener('submit', async (e) => {
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
            alert('Erro ao cadastrar: ' + error.message);
        } else {
            alert('Técnico cadastrado com sucesso!');
            formTecnico.reset();
            carregarListaTecnicos();
        }
    });
}

async function carregarListaTecnicos() {
    const tbody = document.getElementById('tabelaTecnicosBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const { data } = await db.from('tecnicos').select('nome, cidade, bairro, contato').order('id', { ascending: false });
    if (data) {
        data.forEach(t => {
            tbody.innerHTML += `<tr>
                <td><strong>${t.nome}</strong></td>
                <td>${t.cidade} (${t.bairro})</td>
                <td>${t.contato}</td>
            </tr>`;
        });
    }
}

// Buscar Técnico Próximo
async function buscarTecnicoMaisProximo() {
    const rua = document.getElementById('chamado_rua').value;
    const bairro = document.getElementById('chamado_bairro').value;
    const cidade = document.getElementById('chamado_cidade').value;
    const estado = document.getElementById('chamado_estado').value;

    if (!cidade || !bairro) {
        alert('Preencha pelo menos a Cidade e o Bairro!');
        return;
    }

    const coordsChamado = await obterCoordenadas(rua, bairro, cidade, estado);
    if (!coordsChamado) {
        alert('Endereço não encontrado no mapa.');
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
        return;
    }

    tecnicos.forEach(tec => {
        const opt = document.createElement('option');
        opt.value = tec.id;
        opt.textContent = `${tec.nome} — ${tec.distancia_km} km (${tec.bairro})`;
        select.appendChild(opt);
    });

    select.value = tecnicos[0].id;
    alert(`Técnico mais próximo selecionado: ${tecnicos[0].nome} (${tecnicos[0].distancia_km} km)!`);
}

// Criar Chamado
const formChamado = document.getElementById('formChamado');
if (formChamado) {
    formChamado.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rua = document.getElementById('chamado_rua').value;
        const bairro = document.getElementById('chamado_bairro').value;
        const cidade = document.getElementById('chamado_cidade').value;
        const estado = document.getElementById('chamado_estado').value;

        const coords = await obterCoordenadas(rua, bairro, cidade, estado);
        const pontoGeo = coords ? `POINT(${coords.lon} ${coords.lat})` : null;

        const tituloCompleto = `${document.getElementById('chamado_titulo').value} - Problema: ${document.getElementById('chamado_problema').value}`;

        const { error } = await db.from('chamados').insert([{
            titulo: tituloCompleto,
            estado, cidade, bairro, rua,
            localizacao: pontoGeo,
            tecnico_id: document.getElementById('chamado_tecnico').value || null,
            status: 'Criado'
        }]);

        if (error) {
            alert('Erro ao criar chamado: ' + error.message);
        } else {
            alert('Chamado criado com sucesso!');
            formChamado.reset();
            carregarTecnicosSelect();
            carregarChamadosRecentes();
        }
    });
}

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

async function carregarChamadosRecentes() {
    const tbody = document.getElementById('tabelaChamadosBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const { data } = await db.from('chamados').select('id, titulo, status, cidade').order('id', { ascending: false }).limit(10);
    if (data) {
        data.forEach(c => {
            tbody.innerHTML += `<tr>
                <td><strong>#${c.id}</strong> - ${c.titulo}</td>
                <td><span class="badge bg-primary">${c.status}</span></td>
                <td>${c.cidade}</td>
            </tr>`;
        });
    }
}

// Relatório CSV
async function gerarRelatorioCSV() {
    const dataInicio = document.getElementById('rel_data_inicio').value;
    const dataFim = document.getElementById('rel_data_fim').value;

    if (!dataInicio || !dataFim) {
        alert('Selecione a Data Início e a Data Fim.');
        return;
    }

    const { data, error } = await db
        .from('chamados')
        .select(`id, titulo, status, cidade, bairro, rua, criado_em, tecnicos (nome, contato)`)
        .gte('criado_em', `${dataInicio}T00:00:00`)
        .lte('criado_em', `${dataFim}T23:59:59`)
        .order('id', { ascending: false });

    if (error || !data || data.length === 0) {
        alert('Nenhum chamado encontrado no período.');
        return;
    }

    let csvContent = "ID;Titulo;Status;Data;Cidade;Tecnico\n";
    data.forEach(item => {
        const titulo = `"${(item.titulo || '').replace(/"/g, '""')}"`;
        const dataCriacao = new Date(item.criado_em).toLocaleDateString('pt-BR');
        const tecnico = item.tecnicos ? `"${item.tecnicos.nome}"` : '"Não Alocado"';
        csvContent += `${item.id};${titulo};${item.status};${dataCriacao};${item.cidade};${tecnico}\n`;
    });

    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `relatorio_${dataInicio}_a_${dataFim}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
