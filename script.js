const SUPABASE_URL = 'https://ciumwhcahcekrryeppoi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpdW13aGNhaGNla3JyeWVwcG9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NjM5NTMsImV4cCI6MjEwMzMzOTk1M30.Rnq8Ob1kXwRr9jn7UcBF80Rh61hAxxVnABEXAD1sAKo';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STATUS_OPCOES = ['Criado', 'Em Atendimento', 'Resolvido', 'Cancelado', 'Validado'];
let listaTecnicosCache = [];
let listaClientesCache = [];
let mapaDashboard = null;
let mapaDetalhe = null; // Mapa da tela de detalhes do chamado

document.addEventListener("DOMContentLoaded", async () => {
    const { data: { session } } = await db.auth.getSession();
    const paginaAtual = window.location.pathname.split("/").pop();

    if (!session && paginaAtual !== "" && paginaAtual !== "index.html") {
        window.location.href = "index.html";
        return;
    }
    if (session && (paginaAtual === "" || paginaAtual === "index.html")) {
        window.location.href = "dashboard.html";
        return;
    }

    if (paginaAtual === "dashboard.html") {
        carregarDadosDashboard();
        inicializarMapaDashboard();
    } else if (paginaAtual === "tecnicos.html") {
        carregarListaTecnicos();
    } else if (paginaAtual === "clientes.html") {
        carregarListaClientes();
    } else if (paginaAtual === "chamados.html") {
        carregarClientesSelect('chamado_cliente');
        carregarTecnicosSelect();
        carregarChamadosRecentes();
    } else if (paginaAtual === "detalhes-chamado.html") {
        await carregarClientesSelect('detalhe_cliente');
        inicializarDetalhesChamado();
    } else if (paginaAtual === "relatorios.html") {
        carregarDadosRelatorios();
    }
});

// Utilitários
function escapeHTML(valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function definirCarregando(botao, carregando, textoCarregando) {
    if (!botao) return;
    if (carregando) {
        botao.dataset.textoOriginal = botao.textContent;
        botao.textContent = textoCarregando || 'Salvando...';
        botao.disabled = true;
    } else {
        botao.textContent = botao.dataset.textoOriginal || botao.textContent;
        botao.disabled = false;
    }
}

function obterBadgeStatus(status) {
    switch (status) {
        case 'Criado': return 'bg-secondary';
        case 'Em Atendimento': return 'bg-warning text-dark';
        case 'Resolvido': return 'bg-info text-dark';
        case 'Validado': return 'bg-success';
        case 'Cancelado': return 'bg-danger';
        default: return 'bg-dark';
    }
}

// Fecha a lista de sugestões com atraso para permitir o clique/mousedown
function fecharSugestoesComAtraso(containerId) {
    setTimeout(() => {
        const container = document.getElementById(containerId);
        if (container) container.innerHTML = '';
    }, 250);
}

// Login / Logout
const formLogin = document.getElementById('formLogin');
if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const botao = formLogin.querySelector('button[type="submit"]');
        const email = document.getElementById('login_email').value;
        const senha = document.getElementById('login_senha').value;

        definirCarregando(botao, true, 'Entrando...');
        try {
            const { error } = await db.auth.signInWithPassword({ email, password: senha });
            if (error) {
                Swal.fire('Erro', 'Erro ao fazer login: ' + error.message, 'error');
            } else {
                window.location.href = 'dashboard.html';
            }
        } catch (err) {
            console.error('Erro inesperado no login:', err);
            Swal.fire('Erro', err?.message || 'Não foi possível conectar ao servidor.', 'error');
        } finally {
            definirCarregando(botao, false);
        }
    });
}

async function fazerLogout() {
    await db.auth.signOut();
    window.location.href = 'index.html';
}

// Dashboard
async function carregarDadosDashboard() {
    try {
        const [totalChamados, criados, emAtendimento, totalTecnicos] = await Promise.all([
            db.from('chamados').select('*', { count: 'exact', head: true }),
            db.from('chamados').select('*', { count: 'exact', head: true }).eq('status', 'Criado'),
            db.from('chamados').select('*', { count: 'exact', head: true }).eq('status', 'Em Atendimento'),
            db.from('tecnicos').select('*', { count: 'exact', head: true })
        ]);

        if (document.getElementById('dash_total_chamados')) document.getElementById('dash_total_chamados').textContent = totalChamados.count ?? 0;
        if (document.getElementById('dash_abertos')) document.getElementById('dash_abertos').textContent = criados.count ?? 0;
        if (document.getElementById('dash_atendimento')) document.getElementById('dash_atendimento').textContent = emAtendimento.count ?? 0;
        if (document.getElementById('dash_total_tecnicos')) document.getElementById('dash_total_tecnicos').textContent = totalTecnicos.count ?? 0;
    } catch (err) {
        console.error('Erro ao carregar dashboard', err);
    }
}

// Mapa Leaflet no Dashboard
async function inicializarMapaDashboard() {
    const elementoMapa = document.getElementById('mapaChamados');
    if (!elementoMapa) return;

    mapaDashboard = L.map('mapaChamados').setView([-15.7801, -47.9292], 4);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(mapaDashboard);

    const { data: chamados, error } = await db.from('chamados').select('*').not('localizacao', 'is', null);
    if (error || !chamados) return;

    let bounds = [];
    chamados.forEach(c => {
        if (c.localizacao) {
            const match = c.localizacao.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
            if (match) {
                const lon = parseFloat(match[1]);
                const lat = parseFloat(match[2]);
                
                let marker = L.marker([lat, lon]).addTo(mapaDashboard);
                marker.bindPopup(`<b>Chamado #${c.id}</b><br>Cliente: ${escapeHTML(c.cliente || 'N/A')}<br>Status: ${c.status}`);
                bounds.push([lat, lon]);
            }
        }
    });

    if (bounds.length > 0) {
        mapaDashboard.fitBounds(bounds, { padding: [50, 50] });
    }
}

// -------------------------------------------------------------------------
// GESTÃO DE TÉCNICOS (`tecnicos.html`)
// -------------------------------------------------------------------------
let timerBuscaTecnico = null;
function sugerirEnderecosTecnico(termo) {
    clearTimeout(timerBuscaTecnico);
    const container = document.getElementById('sugestoesTecnico');
    if (!container) return;

    if (!termo || termo.length < 3) {
        container.innerHTML = '';
        return;
    }

    timerBuscaTecnico = setTimeout(async () => {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(termo)}`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            
            container.innerHTML = '';
            if (data && data.length > 0) {
                data.forEach(local => {
                    const item = document.createElement('button');
                    item.type = 'button';
                    item.className = 'list-group-item list-group-item-action list-group-item-light small w-100 text-start border-0';
                    item.textContent = local.display_name;
                    item.addEventListener('pointerdown', (e) => {
                        e.preventDefault();
                        selecionarSugestaoTecnico(local);
                    });
                    item.addEventListener('click', (e) => {
                        e.preventDefault();
                        selecionarSugestaoTecnico(local);
                    });
                    container.appendChild(item);
                });
            }
        } catch (e) {
            console.error(e);
        }
    }, 400);
}

function selecionarSugestaoTecnico(local) {
    const address = local.address || {};
    const nomeRua = address.road || address.street || address.pedestrian || 'Endereço não especificado';
    const numero = address.house_number || '';
    const rua = numero ? `${nomeRua}, ${numero}` : nomeRua;
    
    const bairro = address.suburb || address.neighbourhood || address.city_district || 'Centro';
    const cidade = address.city || address.town || address.municipality || 'Cidade não informada';
    let estado = address.state || '';

    document.getElementById('tec_rua').value = rua;
    document.getElementById('tec_bairro').value = bairro;
    document.getElementById('tec_cidade').value = cidade;
    document.getElementById('tec_estado').value = estado;
    document.getElementById('tec_busca_endereco').value = local.display_name;

    document.getElementById('tec_busca_endereco').dataset.lat = local.lat;
    document.getElementById('tec_busca_endereco').dataset.lon = local.lon;

    document.getElementById('sugestoesTecnico').innerHTML = '';
}

const formTecnico = document.getElementById('formTecnico');
if (formTecnico) {
    formTecnico.addEventListener('submit', async (e) => {
        e.preventDefault();
        const botao = document.getElementById('btnSalvarTecnico');
        definirCarregando(botao, true, 'Salvando...');

        const id = document.getElementById('tec_id').value;
        const nome = document.getElementById('tec_nome').value;
        const cpf = document.getElementById('tec_cpf').value;
        const cnpj = document.getElementById('tec_cnpj').value;
        const contato = document.getElementById('tec_contato').value;
        const email = document.getElementById('tec_email').value;
        const ferramentas = document.getElementById('tec_ferramentas').value;
        const obs = document.getElementById('tec_obs').value;
        
        const rua = document.getElementById('tec_rua').value;
        const bairro = document.getElementById('tec_bairro').value;
        const cidade = document.getElementById('tec_cidade').value;
        const estado = document.getElementById('tec_estado').value;
        
        const lat = document.getElementById('tec_busca_endereco').dataset.lat;
        const lon = document.getElementById('tec_busca_endereco').dataset.lon;
        const pontoGeo = (lat && lon) ? `POINT(${lon} ${lat})` : null;

        const dadosTecnico = {
            nome, cpf, cnpj, contato, email, ferramentas, obs,
            rua, bairro, cidade, estado,
            localizacao: pontoGeo
        };

        let error;
        if (id) {
            const res = await db.from('tecnicos').update(dadosTecnico).eq('id', id);
            error = res.error;
        } else {
            const res = await db.from('tecnicos').insert([dadosTecnico]);
            error = res.error;
        }

        definirCarregando(botao, false);

        if (error) {
            Swal.fire('Erro', error.message, 'error');
        } else {
            Swal.fire('Sucesso', 'Técnico salvo com sucesso!', 'success');
            cancelarEdicao();
            carregarListaTecnicos();
        }
    });
}

async function carregarListaTecnicos() {
    const tbody = document.getElementById('tabelaTecnicosBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" class="text-muted text-center">Carregando técnicos...</td></tr>';
    
    const { data, error } = await db.from('tecnicos').select('*').order('nome', { ascending: true });
    if (error || !data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-muted text-center">Nenhum técnico cadastrado.</td></tr>';
        return;
    }

    listaTecnicosCache = data;
    tbody.innerHTML = '';
    data.forEach(t => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${escapeHTML(t.nome)}</strong><br><small class="text-muted">${escapeHTML(t.email || '')}</small></td>
                <td>${escapeHTML(t.cidade || '-')}, ${escapeHTML(t.bairro || '-')}</td>
                <td>${escapeHTML(t.contato || '-')}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="editarTecnico(${t.id})">Editar</button>
                    <button class="btn btn-sm btn-outline-danger" onclick="excluirTecnico(${t.id})">Excluir</button>
                </td>
            </tr>
        `;
    });
}

function editarTecnico(id) {
    const t = listaTecnicosCache.find(item => item.id === id);
    if (!t) return;

    document.getElementById('tec_id').value = t.id;
    document.getElementById('tec_nome').value = t.nome || '';
    document.getElementById('tec_cpf').value = t.cpf || '';
    document.getElementById('tec_cnpj').value = t.cnpj || '';
    document.getElementById('tec_contato').value = t.contato || '';
    document.getElementById('tec_email').value = t.email || '';
    document.getElementById('tec_ferramentas').value = t.ferramentas || '';
    document.getElementById('tec_obs').value = t.obs || '';
    
    document.getElementById('tec_rua').value = t.rua || '';
    document.getElementById('tec_bairro').value = t.bairro || '';
    document.getElementById('tec_cidade').value = t.cidade || '';
    document.getElementById('tec_estado').value = t.estado || '';
    document.getElementById('tec_busca_endereco').value = `${t.rua || ''}, ${t.bairro || ''} - ${t.cidade || ''}`;

    document.getElementById('formTecnicoTitulo').textContent = 'Editar Técnico';
    document.getElementById('btnSalvarTecnico').textContent = 'Atualizar Técnico';
    document.getElementById('btnCancelarEdicao').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelarEdicao() {
    document.getElementById('formTecnico').reset();
    document.getElementById('tec_id').value = '';
    document.getElementById('formTecnicoTitulo').textContent = 'Cadastrar Novo Técnico';
    document.getElementById('btnSalvarTecnico').textContent = 'Salvar Técnico';
    document.getElementById('btnCancelarEdicao').style.display = 'none';
}

async function excluirTecnico(id) {
    const confirm = await Swal.fire({
        title: 'Tem certeza?',
        text: 'Deseja excluir este técnico do sistema?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sim, excluir',
        cancelButtonText: 'Cancelar'
    });

    if (confirm.isConfirmed) {
        const { error } = await db.from('tecnicos').delete().eq('id', id);
        if (error) {
            Swal.fire('Erro', error.message, 'error');
        } else {
            Swal.fire('Excluído!', 'Técnico removido com sucesso.', 'success');
            carregarListaTecnicos();
        }
    }
}

// -------------------------------------------------------------------------
// GESTÃO DE CLIENTES (`clientes.html`)
// -------------------------------------------------------------------------
const formCliente = document.getElementById('formCliente');
if (formCliente) {
    formCliente.addEventListener('submit', async (e) => {
        e.preventDefault();
        const botao = document.getElementById('btnSalvarCliente');
        definirCarregando(botao, true, 'Salvando...');

        const id = document.getElementById('cli_id').value;
        const nome = document.getElementById('cli_nome').value;
        const documento = document.getElementById('cli_documento').value;
        const contato = document.getElementById('cli_contato').value;
        const email = document.getElementById('cli_email').value;

        const dadosCliente = { nome, documento, contato, email };

        let error;
        if (id) {
            const res = await db.from('clientes').update(dadosCliente).eq('id', id);
            error = res.error;
        } else {
            const res = await db.from('clientes').insert([dadosCliente]);
            error = res.error;
        }

        definirCarregando(botao, false);

        if (error) {
            Swal.fire('Erro', error.message, 'error');
        } else {
            Swal.fire('Sucesso', 'Cliente salvo com sucesso!', 'success');
            cancelarEdicaoCliente();
            carregarListaClientes();
        }
    });
}

async function carregarListaClientes() {
    const tbody = document.getElementById('tabelaClientesBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" class="text-muted text-center">Carregando clientes...</td></tr>';

    const { data, error } = await db.from('clientes').select('*').order('nome', { ascending: true });
    if (error || !data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-muted text-center">Nenhum cliente cadastrado.</td></tr>';
        return;
    }

    listaClientesCache = data;
    tbody.innerHTML = '';
    data.forEach(c => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${escapeHTML(c.nome)}</strong><br><small class="text-muted">${escapeHTML(c.email || '')}</small></td>
                <td>${escapeHTML(c.documento || '-')}</td>
                <td>${escapeHTML(c.contato || '-')}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="editarCliente(${c.id})">Editar</button>
                    <button class="btn btn-sm btn-outline-danger" onclick="excluirCliente(${c.id})">Excluir</button>
                </td>
            </tr>
        `;
    });
}

function editarCliente(id) {
    const c = listaClientesCache.find(item => item.id === id);
    if (!c) return;

    document.getElementById('cli_id').value = c.id;
    document.getElementById('cli_nome').value = c.nome || '';
    document.getElementById('cli_documento').value = c.documento || '';
    document.getElementById('cli_contato').value = c.contato || '';
    document.getElementById('cli_email').value = c.email || '';

    document.getElementById('formClienteTitulo').textContent = 'Editar Cliente';
    document.getElementById('btnSalvarCliente').textContent = 'Atualizar Cliente';
    document.getElementById('btnCancelarCliente').style.display = 'block';
}

function cancelarEdicaoCliente() {
    if (document.getElementById('formCliente')) document.getElementById('formCliente').reset();
    document.getElementById('cli_id').value = '';
    document.getElementById('formClienteTitulo').textContent = 'Cadastrar Novo Cliente';
    document.getElementById('btnSalvarCliente').textContent = 'Salvar Cliente';
    document.getElementById('btnCancelarCliente').style.display = 'none';
}

async function excluirCliente(id) {
    const confirm = await Swal.fire({
        title: 'Tem certeza?',
        text: 'Deseja excluir este cliente?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sim, excluir',
        cancelButtonText: 'Cancelar'
    });

    if (confirm.isConfirmed) {
        const { error } = await db.from('clientes').delete().eq('id', id);
        if (error) {
            Swal.fire('Erro', error.message, 'error');
        } else {
            Swal.fire('Excluído!', 'Cliente removido.', 'success');
            carregarListaClientes();
        }
    }
}

// -------------------------------------------------------------------------
// GESTÃO DE CHAMADOS (`chamados.html`)
// -------------------------------------------------------------------------
let timerBuscaChamado = null;
function sugerirEnderecosChamado(termo) {
    clearTimeout(timerBuscaChamado);
    const container = document.getElementById('sugestoesChamado');
    if (!container) return;

    if (!termo || termo.length < 3) {
        container.innerHTML = '';
        return;
    }

    timerBuscaChamado = setTimeout(async () => {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(termo)}`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            
            container.innerHTML = '';
            if (data && data.length > 0) {
                data.forEach(local => {
                    const item = document.createElement('button');
                    item.type = 'button';
                    item.className = 'list-group-item list-group-item-action list-group-item-light small w-100 text-start border-0';
                    item.textContent = local.display_name;
                    item.addEventListener('pointerdown', (e) => {
                        e.preventDefault();
                        selecionarSugestaoChamado(local);
                    });
                    item.addEventListener('click', (e) => {
                        e.preventDefault();
                        selecionarSugestaoChamado(local);
                    });
                    container.appendChild(item);
                });
            }
        } catch (e) {
            console.error(e);
        }
    }, 400);
}

function selecionarSugestaoChamado(local) {
    const address = local.address || {};
    const nomeRua = address.road || address.street || address.pedestrian || 'Endereço não especificado';
    const numero = address.house_number || '';
    const rua = numero ? `${nomeRua}, ${numero}` : nomeRua;
    
    const bairro = address.suburb || address.neighbourhood || address.city_district || 'Centro';
    const cidade = address.city || address.town || address.municipality || 'Cidade não informada';
    let estado = address.state || '';

    document.getElementById('chamado_rua').value = rua;
    document.getElementById('chamado_bairro').value = bairro;
    document.getElementById('chamado_cidade').value = cidade;
    document.getElementById('chamado_estado').value = estado;
    document.getElementById('chamado_busca_endereco').value = local.display_name;

    document.getElementById('chamado_busca_endereco').dataset.lat = local.lat;
    document.getElementById('chamado_busca_endereco').dataset.lon = local.lon;

    document.getElementById('sugestoesChamado').innerHTML = '';
}

const formChamado = document.getElementById('formChamado');
if (formChamado) {
    formChamado.addEventListener('submit', async (e) => {
        e.preventDefault();
        const botao = formChamado.querySelector('button[type="submit"]');
        definirCarregando(botao, true, 'Cadastrando...');

        const lat = document.getElementById('chamado_busca_endereco').dataset.lat;
        const lon = document.getElementById('chamado_busca_endereco').dataset.lon;
        const pontoGeo = (lat && lon) ? `POINT(${lon} ${lat})` : null;

        try {
            const { data: novoChamado, error } = await db.from('chamados').insert([{
                cliente: document.getElementById('chamado_cliente').value,
                filial: document.getElementById('chamado_filial').value,
                titulo: document.getElementById('chamado_titulo').value,
                descricao: document.getElementById('chamado_problema').value,
                estado: document.getElementById('chamado_estado').value,
                cidade: document.getElementById('chamado_cidade').value,
                bairro: document.getElementById('chamado_bairro').value,
                rua: document.getElementById('chamado_rua').value,
                localizacao: pontoGeo,
                tecnico_id: document.getElementById('chamado_tecnico').value || null,
                status: 'Criado'
            }]).select();

            if (error) {
                Swal.fire('Erro', error.message, 'error');
            } else {
                if (novoChamado && novoChamado.length > 0) {
                    await db.from('historico_chamados').insert([{
                        chamado_id: novoChamado[0].id,
                        observacao: '[Sistema] Chamado criado e registrado no sistema.'
                    }]);
                }
                Swal.fire('Sucesso', 'Chamado criado com sucesso!', 'success');
                formChamado.reset();
                carregarChamadosRecentes();
            }
        } catch (err) {
            console.error(err);
        } finally {
            definirCarregando(botao, false);
        }
    });
}

async function carregarClientesSelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const valorAtual = select.value;
    select.innerHTML = '<option value="">Carregando clientes...</option>';
    select.disabled = true;

    const { data, error } = await db.from('clientes').select('id, nome').order('nome', { ascending: true });

    if (error) {
        console.error('Erro ao carregar clientes:', error);
        select.innerHTML = '<option value="">Erro ao carregar clientes</option>';
        select.disabled = false;
        return;
    }

    select.innerHTML = '<option value="">Selecione o cliente...</option>';
    (data || []).forEach(cliente => {
        const option = document.createElement('option');
        option.value = cliente.nome;
        option.textContent = cliente.nome;
        select.appendChild(option);
    });

    if (valorAtual) select.value = valorAtual;
    select.disabled = false;
}

async function carregarTecnicosSelect() {
    const select = document.getElementById('chamado_tecnico');
    if (!select) return;
    const { data } = await db.from('tecnicos').select('id, nome, bairro');
    if (data) {
        select.innerHTML = '<option value="">Selecione um técnico</option>';
        data.forEach(t => {
            select.innerHTML += `<option value="${t.id}">${escapeHTML(t.nome)} (${escapeHTML(t.bairro)})</option>`;
        });
    }
}

async function carregarChamadosRecentes() {
    const tbody = document.getElementById('tabelaChamadosBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="3" class="text-muted text-center">Carregando chamados...</td></tr>';
    const filtro = document.getElementById('filtroStatus')?.value || '';
    let consulta = db.from('chamados').select('*').order('criado_em', { ascending: false }).limit(20);
    if (filtro) consulta = consulta.eq('status', filtro);
    const { data, error } = await consulta;

    if (error || !data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-muted text-center">Nenhum chamado encontrado.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    data.forEach(c => {
        tbody.innerHTML += `
            <tr style="cursor: pointer;" onclick="window.location.href='detalhes-chamado.html?id=${c.id}'">
                <td>
                    <strong>#${c.id} - ${escapeHTML(c.cliente)}</strong><br>
                    <small class="text-muted">${escapeHTML(c.filial || '')} | ${escapeHTML(c.titulo)}</small>
                </td>
                <td>
                    <select class="form-select form-select-sm" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()" onchange="alterarStatusChamado(${c.id}, this.value, event)">
                        ${STATUS_OPCOES.map(status => `<option value="${status}" ${status === c.status ? 'selected' : ''}>${status}</option>`).join('')}
                    </select>
                </td>
                <td>${escapeHTML(c.cidade || '-')}</td>
            </tr>
        `;
    });
}

async function alterarStatusChamado(chamadoId, novoStatus, evento) {
    if (evento) evento.stopPropagation();
    if (!STATUS_OPCOES.includes(novoStatus)) return;

    const { error } = await db.from('chamados')
        .update({ status: novoStatus })
        .eq('id', chamadoId);

    if (error) {
        console.error('Erro ao atualizar status:', error);
        Swal.fire('Erro', 'Não foi possível atualizar o status: ' + error.message, 'error');
        carregarChamadosRecentes();
        return;
    }

    await db.from('historico_chamados').insert([{
        chamado_id: chamadoId,
        observacao: `[Sistema] Status alterado para '${novoStatus}'.`
    }]);

    carregarChamadosRecentes();
}

// -------------------------------------------------------------------------
// DETALHES E HISTÓRICO DO CHAMADO (`detalhes-chamado.html`)
// -------------------------------------------------------------------------
let timerBuscaDetalhe = null;
function sugerirEnderecosDetalhe(termo) {
    clearTimeout(timerBuscaDetalhe);
    const container = document.getElementById('sugestoesDetalhe');
    if (!container) return;

    if (!termo || termo.length < 3) {
        container.innerHTML = '';
        return;
    }

    timerBuscaDetalhe = setTimeout(async () => {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(termo)}`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            
            container.innerHTML = '';
            if (data && data.length > 0) {
                data.forEach(local => {
                    const item = document.createElement('button');
                    item.type = 'button';
                    item.className = 'list-group-item list-group-item-action list-group-item-light small w-100 text-start border-0';
                    item.textContent = local.display_name;
                    item.addEventListener('pointerdown', (e) => {
                        e.preventDefault();
                        selecionarSugestaoDetalhe(local);
                    });
                    item.addEventListener('click', (e) => {
                        e.preventDefault();
                        selecionarSugestaoDetalhe(local);
                    });
                    container.appendChild(item);
                });
            }
        } catch (e) {
            console.error(e);
        }
    }, 400);
}

function selecionarSugestaoDetalhe(local) {
    const address = local.address || {};
    const nomeRua = address.road || address.street || address.pedestrian || 'Endereço não especificado';
    const numero = address.house_number || '';
    const rua = numero ? `${nomeRua}, ${numero}` : nomeRua;
    
    const bairro = address.suburb || address.neighbourhood || address.city_district || 'Centro';
    const cidade = address.city || address.town || address.municipality || 'Cidade não informada';
    let estado = address.state || '';

    // O campo visível mostra o endereço completo; a rua fica separada para gravação.
    document.getElementById('detalhe_busca_endereco').value = local.display_name || rua;
    document.getElementById('detalhe_rua').value = rua;
    document.getElementById('detalhe_bairro').value = bairro;
    document.getElementById('detalhe_cidade').value = cidade;
    document.getElementById('detalhe_estado').value = estado;
    document.getElementById('detalhe_lat').value = local.lat;
    document.getElementById('detalhe_lon').value = local.lon;

    document.getElementById('sugestoesDetalhe').innerHTML = '';

    // Atualiza o mapa automaticamente ao selecionar o endereço novo
    atualizarMapaDetalhe(parseFloat(local.lat), parseFloat(local.lon));
}

async function inicializarDetalhesChamado() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    if (!id) {
        Swal.fire('Erro', 'Nenhum chamado especificado.', 'error').then(() => {
            window.location.href = 'chamados.html';
        });
        return;
    }

    await carregarTecnicosSelectDetalhe();
    await carregarDadosChamadoUnico(id);
    await carregarHistoricoChamado(id);
    await carregarTecnicosProximos(id);

    const formEdit = document.getElementById('formEditarChamadoUnico');
    if (formEdit) {
        formEdit.addEventListener('submit', async (e) => {
            e.preventDefault();
            const botao = formEdit.querySelector('button[type="submit"]');
            definirCarregando(botao, true, 'Salvando...');

            const lat = document.getElementById('detalhe_lat')?.value;
            const lon = document.getElementById('detalhe_lon')?.value;
            
            let dadosUpdate = {
                cliente: document.getElementById('detalhe_cliente').value,
                filial: document.getElementById('detalhe_filial').value,
                titulo: document.getElementById('detalhe_titulo').value,
                status: document.getElementById('detalhe_status').value,
                rua: document.getElementById('detalhe_rua').value,
                bairro: document.getElementById('detalhe_bairro').value,
                cidade: document.getElementById('detalhe_cidade').value,
                estado: document.getElementById('detalhe_estado').value
            };

            if (lat && lon) {
                dadosUpdate.localizacao = `POINT(${lon} ${lat})`;
            }

            const { error } = await db.from('chamados').update(dadosUpdate).eq('id', id);

            definirCarregando(botao, false);

            if (error) {
                Swal.fire('Erro', error.message, 'error');
            } else {
                await db.from('historico_chamados').insert([{
                    chamado_id: id,
                    observacao: `[Sistema] Dados do chamado atualizados.`
                }]);
                Swal.fire('Sucesso', 'Chamado atualizado com sucesso!', 'success');
                carregarHistoricoChamado(id);
                if (lat && lon) {
                    atualizarMapaDetalhe(parseFloat(lat), parseFloat(lon));
                }
            }
        });
    }

    const formObs = document.getElementById('formNovaObservacao');
    if (formObs) {
        formObs.addEventListener('submit', async (e) => {
            e.preventDefault();
            const texto = document.getElementById('obs_texto').value;
            const { error } = await db.from('historico_chamados').insert([{
                chamado_id: id,
                observacao: texto
            }]);

            if (error) {
                Swal.fire('Erro', error.message, 'error');
            } else {
                document.getElementById('obs_texto').value = '';
                carregarHistoricoChamado(id);
            }
        });
    }
}

async function carregarTecnicosSelectDetalhe() {
    const select = document.getElementById('detalhe_tecnico');
    if (!select) return;
    const { data } = await db.from('tecnicos').select('id, nome, bairro');
    if (data) {
        select.innerHTML = '<option value="">Atribuir técnico manualmente</option>';
        data.forEach(t => {
            select.innerHTML += `<option value="${t.id}">${escapeHTML(t.nome)} (${escapeHTML(t.bairro)})</option>`;
        });
    }
}

async function carregarDadosChamadoUnico(id) {
    const { data, error } = await db.from('chamados').select('*').eq('id', id).single();
    if (error || !data) {
        Swal.fire('Erro', 'Chamado não encontrado.', 'error');
        return;
    }

    if (document.getElementById('tituloCardChamado')) {
        document.getElementById('tituloCardChamado').textContent = `Editar Chamado #${data.id}`;
    }
    if (document.getElementById('detalhe_cliente')) document.getElementById('detalhe_cliente').value = data.cliente || '';
    if (document.getElementById('detalhe_filial')) document.getElementById('detalhe_filial').value = data.filial || '';
    if (document.getElementById('detalhe_titulo')) document.getElementById('detalhe_titulo').value = data.titulo || '';
    if (document.getElementById('detalhe_status')) document.getElementById('detalhe_status').value = data.status || 'Criado';
    if (document.getElementById('detalhe_busca_endereco')) {
        document.getElementById('detalhe_busca_endereco').value = [data.rua, data.bairro, data.cidade].filter(Boolean).join(', ');
    }
    if (document.getElementById('detalhe_rua')) document.getElementById('detalhe_rua').value = data.rua || '';
    if (document.getElementById('detalhe_bairro')) document.getElementById('detalhe_bairro').value = data.bairro || '';
    if (document.getElementById('detalhe_cidade')) document.getElementById('detalhe_cidade').value = data.cidade || '';
    if (document.getElementById('detalhe_estado')) document.getElementById('detalhe_estado').value = data.estado || '';
    if (document.getElementById('detalhe_descricao')) document.getElementById('detalhe_descricao').value = data.descricao || '';
    
    if (document.getElementById('detalhe_rua')) {
        document.getElementById('detalhe_rua').value = data.rua || '';
    }

    if (document.getElementById('detalhe_tecnico') && data.tecnico_id) {
        document.getElementById('detalhe_tecnico').value = data.tecnico_id;
    }

    if (data.localizacao) {
        const match = data.localizacao.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
        if (match) {
            const lon = parseFloat(match[1]);
            const lat = parseFloat(match[2]);
            document.getElementById('detalhe_lat').value = lat;
            document.getElementById('detalhe_lon').value = lon;
            inicializarMapaDetalhe(lat, lon);
        } else {
            inicializarMapaDetalhe(-15.7801, -47.9292);
        }
    } else {
        inicializarMapaDetalhe(-15.7801, -47.9292);
    }
}

function inicializarMapaDetalhe(lat, lon) {
    const elementoMapa = document.getElementById('mapaDetalheChamado') || document.getElementById('mapaDetalhe');
    if (!elementoMapa) return;

    if (!mapaDetalhe) {
        mapaDetalhe = L.map(elementoMapa).setView([lat, lon], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
        }).addTo(mapaDetalhe);
    } else {
        mapaDetalhe.setView([lat, lon], 15);
    }

    mapaDetalhe.eachLayer((layer) => {
        if (layer instanceof L.Marker) {
            mapaDetalhe.removeLayer(layer);
        }
    });

    L.marker([lat, lon]).addTo(mapaDetalhe).bindPopup('Localização do Chamado').openPopup();
}

function atualizarMapaDetalhe(lat, lon) {
    if (mapaDetalhe) {
        mapaDetalhe.setView([lat, lon], 15);
        mapaDetalhe.eachLayer((layer) => {
            if (layer instanceof L.Marker) {
                mapaDetalhe.removeLayer(layer);
            }
        });
        L.marker([lat, lon]).addTo(mapaDetalhe).bindPopup('Localização Atualizada').openPopup();
    } else {
        inicializarMapaDetalhe(lat, lon);
    }
}

async function carregarHistoricoChamado(chamadoId) {
    const container = document.getElementById('timelineHistorico');
    if (!container) return;

    const { data, error } = await db.from('historico_chamados')
        .select('*')
        .eq('chamado_id', chamadoId)
        .order('criado_em', { ascending: false });

    if (error || !data || data.length === 0) {
        container.innerHTML = '<p class="text-muted small text-center py-2">Nenhum histórico registrado.</p>';
        return;
    }

    container.innerHTML = '';
    data.forEach(h => {
        const dataFormatada = new Date(h.criado_em).toLocaleString('pt-BR');
        container.innerHTML += `
            <div class="list-group-item px-0">
                <div class="d-flex w-100 justify-content-between">
                    <small class="text-muted">${escapeHTML(dataFormatada)}</small>
                </div>
                <p class="mb-1 small text-dark">${escapeHTML(h.observacao)}</p>
            </div>
        `;
    });
}

async function carregarTecnicosProximos(chamadoId) {
    const select = document.getElementById('selectTecnicoProximo');
    if (!select) return;

    try {
        const { data: tecnicos, error } = await db.rpc('tecnicos_proximos_chamado', { p_chamado_id: parseInt(chamadoId) });
        if (error || !tecnicos || tecnicos.length === 0) {
            select.innerHTML = '<option value="">Nenhum técnico próximo encontrado</option>';
            return;
        }

        select.innerHTML = '<option value="">Selecione um técnico por proximidade</option>';
        tecnicos.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = `${t.nome} — ${t.distancia_km} km (${t.bairro})`;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error('Erro ao buscar técnicos próximos:', err);
    }
}

async function atribuirTecnicoProximo() {
    const select = document.getElementById('selectTecnicoProximo');
    if (!select || !select.value) {
        Swal.fire('Aviso', 'Selecione um técnico da lista de proximidade.', 'warning');
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const tecnicoId = select.value;

    const { error } = await db.from('chamados').update({ tecnico_id: tecnicoId, status: 'Em Atendimento' }).eq('id', id);
    if (error) {
        Swal.fire('Erro', error.message, 'error');
    } else {
        await db.from('historico_chamados').insert([{
            chamado_id: id,
            observacao: `[Sistema] Técnico atribuído via geolocalização e status alterado para 'Em Atendimento'.`
        }]);
        Swal.fire('Sucesso', 'Técnico atribuído com sucesso!', 'success');
        carregarDadosChamadoUnico(id);
        carregarHistoricoChamado(id);
    }
}

// -------------------------------------------------------------------------
// RELATÓRIOS (`relatorios.html`)
// -------------------------------------------------------------------------
async function carregarDadosRelatorios() {
    try {
        const agora = new Date();
        const primeiroDiaMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();

        const { count: countFechados } = await db.from('chamados')
            .select('*', { count: 'exact', head: true })
            .in('status', ['Resolvido', 'Validado'])
            .gte('criado_em', primeiroDiaMes);

        if (document.getElementById('txtFechadosMes')) {
            document.getElementById('txtFechadosMes').textContent = countFechados ?? 0;
        }

        const dataLimite48h = new Date(agora.getTime() - (48 * 60 * 60 * 1000)).toISOString();
        const { count: countParados } = await db.from('chamados')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'Criado')
            .lte('criado_em', dataLimite48h);

        if (document.getElementById('txtParados48h')) {
            document.getElementById('txtParados48h').textContent = countParados ?? 0;
        }

        const { data: resolvidos } = await db.from('chamados').select('tecnico_id, tecnicos(nome)').in('status', ['Resolvido', 'Validado']);
        if (resolvidos && resolvidos.length > 0) {
            const contagem = {};
            const nomes = {};
            resolvidos.forEach(item => {
                if (item.tecnico_id) {
                    contagem[item.tecnico_id] = (contagem[item.tecnico_id] || 0) + 1;
                    if (item.tecnicos) nomes[item.tecnico_id] = item.tecnicos.nome;
                }
            });
            let melhorId = Object.keys(contagem).reduce((a, b) => contagem[a] > contagem[b] ? a : b, '');
            if (melhorId && document.getElementById('txtMelhorTecnico')) {
                document.getElementById('txtMelhorTecnico').textContent = `${nomes[melhorId] || 'Técnico'} (${contagem[melhorId]} resolvidos)`;
            } else if (document.getElementById('txtMelhorTecnico')) {
                document.getElementById('txtMelhorTecnico').textContent = 'Nenhum registro';
            }
        } else if (document.getElementById('txtMelhorTecnico')) {
            document.getElementById('txtMelhorTecnico').textContent = 'Nenhum registro';
        }
    } catch (err) {
        console.error('Erro ao carregar relatórios', err);
    }
}

async function exportarCSV() {
    try {
        const { data, error } = await db.from('chamados').select('id, cliente, filial, titulo, status, cidade, criado_em');
        if (error || !data || data.length === 0) {
            Swal.fire('Aviso', 'Não há dados para exportar.', 'info');
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,ID;Cliente;Filial;Titulo;Status;Cidade;Criado Em\n";
        data.forEach(row => {
            csvContent += `${row.id};"${row.cliente || ''}";"${row.filial || ''}";"${row.titulo || ''}";${row.status};"${row.cidade || ''}";${row.criado_em}\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "relatorio_chamados.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        Swal.fire('Erro', 'Erro ao gerar arquivo CSV.', 'error');
    }
}
