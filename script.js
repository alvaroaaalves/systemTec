const SUPABASE_URL = 'https://ciumwhcahcekrryeppoi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpdW13aGNhaGNla3JyeWVwcG9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NjM5NTMsImV4cCI6MjEwMzMzOTk1M30.Rnq8Ob1kXwRr9jn7UcBF80Rh61hAxxVnABEXAD1sAKo';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STATUS_OPCOES = ['Criado', 'Em Atendimento', 'Resolvido', 'Cancelado', 'Validado'];
let listaTecnicosCache = [];
let listaClientesCache = [];
let mapaDashboard = null;
let marcadoresDashboard = null;
let mapaDetalhe = null; // Mapa da tela de detalhes do chamado

document.addEventListener("DOMContentLoaded", async () => {
    const { data: { session } } = await db.auth.getSession();
    const paginaAtual = window.location.pathname.split("/").pop();

    const paginasPublicas = ['', 'index.html', 'recuperar-senha.html', 'redefinir-senha.html'];
    if (!session && !paginasPublicas.includes(paginaAtual)) {
        window.location.href = "index.html";
        return;
    }
    let clienteVinculado = null;
    if (session) {
        const resultadoCliente = await db.from('clientes').select('id').eq('usuario_id', session.user.id).maybeSingle();
        clienteVinculado = resultadoCliente.data || null;
    }
    if (clienteVinculado && !paginasPublicas.includes(paginaAtual) && paginaAtual !== 'portal-cliente.html') {
        window.location.href = 'portal-cliente.html';
        return;
    }
    if (session && (paginaAtual === "" || paginaAtual === "index.html")) {
        window.location.href = clienteVinculado ? 'portal-cliente.html' : 'dashboard.html';
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
        const statusInicial = new URLSearchParams(window.location.search).get('status');
        const filtroStatus = document.getElementById('filtroStatus');
        if (filtroStatus && STATUS_OPCOES.includes(statusInicial)) filtroStatus.value = statusInicial;
        carregarClientesSelect('chamado_cliente');
        carregarTecnicosSelect();
        carregarChamadosRecentes();
    } else if (paginaAtual === "detalhes-chamado.html") {
        await carregarClientesSelect('detalhe_cliente');
        inicializarDetalhesChamado();
    } else if (paginaAtual === "relatorios.html") {
        carregarDadosRelatorios();
    } else if (paginaAtual === "usuarios.html") {
        inicializarTelaUsuarios();
    } else if (paginaAtual === "notificacoes.html") {
        carregarNotificacoes();
    } else if (paginaAtual === "portal-cliente.html") {
        carregarPortalCliente();
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

let usuarioHistoricoCache = null;
async function obterDadosUsuarioHistorico() {
    if (usuarioHistoricoCache) return usuarioHistoricoCache;
    const { data: { user } } = await db.auth.getUser();
    usuarioHistoricoCache = {
        usuario_id: user?.id || null,
        usuario_email: user?.email || 'Sistema'
    };
    return usuarioHistoricoCache;
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
            const { data: loginData, error } = await db.auth.signInWithPassword({ email, password: senha });
            if (error) {
                Swal.fire('Erro', 'Erro ao fazer login: ' + error.message, 'error');
            } else {
                const { data: clienteVinculado } = await db.from('clientes').select('id').eq('usuario_id', loginData.user.id).maybeSingle();
                window.location.href = clienteVinculado ? 'portal-cliente.html' : 'dashboard.html';
            }
        } catch (err) {
            console.error('Erro inesperado no login:', err);
            Swal.fire('Erro', err?.message || 'Não foi possível conectar ao servidor.', 'error');
        } finally {
            definirCarregando(botao, false);
        }
    });
}

async function solicitarRecuperacaoSenha() {
    const email = document.getElementById('recuperacao_email')?.value.trim().toLowerCase();
    const botao = document.getElementById('btnRecuperarSenha');
    if (!email) {
        Swal.fire('Atenção', 'Informe o e-mail da conta.', 'warning');
        return;
    }
    definirCarregando(botao, true, 'Enviando...');
    try {
        const { error } = await db.auth.resetPasswordForEmail(email, {
            redirectTo: new URL('redefinir-senha.html', window.location.href).href
        });
        if (error) throw error;
        Swal.fire('E-mail enviado', 'Se a conta existir, você receberá um link para redefinir a senha.', 'success');
    } catch (error) {
        Swal.fire('Erro', error.message || 'Não foi possível enviar o e-mail.', 'error');
    } finally {
        definirCarregando(botao, false);
    }
}

async function salvarNovaSenha() {
    const senha = document.getElementById('nova_senha')?.value || '';
    const confirmacao = document.getElementById('confirmar_senha')?.value || '';
    if (senha.length < 8) {
        Swal.fire('Atenção', 'A senha deve ter pelo menos 8 caracteres.', 'warning');
        return;
    }
    if (senha !== confirmacao) {
        Swal.fire('Atenção', 'As senhas não conferem.', 'warning');
        return;
    }
    const botao = document.getElementById('btnSalvarNovaSenha');
    definirCarregando(botao, true, 'Salvando...');
    try {
        const { error } = await db.auth.updateUser({ password: senha });
        if (error) throw error;
        await Swal.fire('Sucesso', 'Senha atualizada com sucesso.', 'success');
        window.location.href = 'index.html';
    } catch (error) {
        Swal.fire('Erro', error.message || 'Não foi possível atualizar a senha.', 'error');
    } finally {
        definirCarregando(botao, false);
    }
}

async function fazerLogout() {
    await db.auth.signOut();
    window.location.href = 'index.html';
}

// Dashboard
async function carregarDadosDashboard() {
    try {
        const [{ data: chamados, error: erroChamados }, { count: totalTecnicos, error: erroTecnicos }] = await Promise.all([
            db.from('chamados').select('*').order('criado_em', { ascending: false }),
            db.from('tecnicos').select('*', { count: 'exact', head: true })
        ]);
        if (erroChamados) throw erroChamados;
        if (erroTecnicos) throw erroTecnicos;

        const lista = chamados || [];
        const agora = new Date();
        const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
        const atrasados = lista.filter(c => c.status === 'Criado' && c.criado_em && (agora - new Date(c.criado_em)) >= 48 * 60 * 60 * 1000).length;
        const resolvidos = lista.filter(c => ['Resolvido', 'Validado'].includes(c.status));
        const resolvidosPeriodo = resolvidos.filter(c => new Date(c.resolvido_em || c.fechado_em || c.atualizado_em || c.criado_em) >= inicioMes).length;
        const clientes = new Set(lista.map(c => String(c.cliente || '').trim()).filter(Boolean)).size;
        const tempos = resolvidos.map(c => {
            const fim = c.resolvido_em || c.fechado_em || c.atualizado_em;
            return fim && c.criado_em ? new Date(fim) - new Date(c.criado_em) : 0;
        }).filter(t => t > 0);
        const mediaHoras = tempos.length ? (tempos.reduce((a, b) => a + b, 0) / tempos.length / 3600000) : 0;
        const indicadores = {
            dash_total_chamados: lista.length,
            dash_abertos: lista.filter(c => c.status === 'Criado').length,
            dash_atendimento: lista.filter(c => c.status === 'Em Atendimento').length,
            dash_atrasados: atrasados,
            dash_resolvidos_periodo: resolvidosPeriodo,
            dash_tempo_medio: mediaHoras ? `${mediaHoras.toFixed(1)} h` : '-',
            dash_total_clientes: clientes,
            dash_total_tecnicos: totalTecnicos ?? 0
        };
        Object.entries(indicadores).forEach(([id, valor]) => {
            const elemento = document.getElementById(id);
            if (elemento) elemento.textContent = valor;
        });

        const contagemClientes = {};
        lista.forEach(c => {
            const cliente = String(c.cliente || 'Não informado').trim() || 'Não informado';
            contagemClientes[cliente] = (contagemClientes[cliente] || 0) + 1;
        });
        const tabelaClientes = document.getElementById('dash_chamados_por_cliente');
        if (tabelaClientes) {
            const linhasClientes = Object.entries(contagemClientes).sort((a, b) => b[1] - a[1]);
            tabelaClientes.innerHTML = linhasClientes.length
                ? linhasClientes.map(([cliente, quantidade]) => `<tr><td>${escapeHTML(cliente)}</td><td class="text-end fw-bold">${quantidade}</td></tr>`).join('')
                : '<tr><td colspan="2" class="text-muted">Nenhum chamado encontrado.</td></tr>';
        }
    } catch (err) {
        console.error('Erro ao carregar dashboard:', err);
    }
}

function extrairCoordenadasLocalizacao(valor) {
    if (!valor) return null;

    // Formato textual: POINT(longitude latitude)
    if (typeof valor === 'string') {
        const texto = valor.trim();
        const matchWkt = texto.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
        if (matchWkt) {
            return { lon: parseFloat(matchWkt[1]), lat: parseFloat(matchWkt[2]) };
        }

        // Formato EWKB hexadecimal retornado pelo PostgREST/PostGIS.
        const hex = texto.replace(/^\\x/i, '');
        if (/^[0-9a-f]+$/i.test(hex) && hex.length >= 42) {
            try {
                const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
                const view = new DataView(bytes.buffer);
                const littleEndian = bytes[0] === 1;
                const tipo = view.getUint32(1, littleEndian);
                let offset = 5;

                // EWKB com SRID: pula os 4 bytes do SRID antes de X/Y.
                if ((tipo & 0x20000000) !== 0) offset += 4;
                return {
                    lon: view.getFloat64(offset, littleEndian),
                    lat: view.getFloat64(offset + 8, littleEndian)
                };
            } catch (erro) {
                console.error('Não foi possível interpretar a localização:', erro);
            }
        }
    }

    return null;
}

function corMarcadorStatus(status) {
    return {
        'Criado': '#6c757d',
        'Em Atendimento': '#ffc107',
        'Resolvido': '#0dcaf0',
        'Validado': '#198754',
        'Cancelado': '#dc3545'
    }[status] || '#212529';
}

function iconeMarcadorStatus(status) {
    const cor = corMarcadorStatus(status);
    return L.divIcon({
        className: 'marcador-status',
        html: `<span style="display:block;width:22px;height:22px;border-radius:50%;background:${cor};border:3px solid #fff;box-shadow:0 1px 5px #555;"></span>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -10]
    });
}

// Mapa Leaflet no Dashboard
async function inicializarMapaDashboard() {
    const elementoMapa = document.getElementById('mapaChamados');
    if (!elementoMapa || typeof L === 'undefined') return;

    if (!mapaDashboard) {
        mapaDashboard = L.map('mapaChamados').setView([-15.7801, -47.9292], 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
        }).addTo(mapaDashboard);
        marcadoresDashboard = L.layerGroup().addTo(mapaDashboard);
    }

    const status = document.getElementById('filtroMapaStatus')?.value || '';
    const dataInicial = document.getElementById('filtroMapaDataInicial')?.value || '';
    const dataFinal = document.getElementById('filtroMapaDataFinal')?.value || '';
    const tecnicoId = document.getElementById('filtroMapaTecnico')?.value || '';
    const cidade = (document.getElementById('filtroMapaCidade')?.value || '').trim().toLowerCase();
    const prioridade = document.getElementById('filtroMapaPrioridade')?.value || '';

    const [{ data: chamados, error }, { data: tecnicos }] = await Promise.all([
        db.from('chamados').select('*').not('localizacao', 'is', null),
        db.from('tecnicos').select('id, nome').order('nome', { ascending: true })
    ]);
    if (error) {
        console.error('Erro ao carregar chamados do mapa:', error);
        return;
    }

    const tecnicoSelect = document.getElementById('filtroMapaTecnico');
    if (tecnicoSelect) {
        const valorAtual = tecnicoSelect.value;
        tecnicoSelect.innerHTML = '<option value="">Todos os técnicos</option>';
        (tecnicos || []).forEach(t => {
            const option = document.createElement('option');
            option.value = t.id;
            option.textContent = t.nome;
            tecnicoSelect.appendChild(option);
        });
        tecnicoSelect.value = valorAtual;
    }

    const inicio = dataInicial ? new Date(`${dataInicial}T00:00:00`) : null;
    const fim = dataFinal ? new Date(`${dataFinal}T23:59:59.999`) : null;
    const filtrados = (chamados || []).filter(c => {
        const criado = c.criado_em ? new Date(c.criado_em) : null;
        return (!status || c.status === status)
            && (!inicio || (criado && criado >= inicio))
            && (!fim || (criado && criado <= fim))
            && (!tecnicoId || String(c.tecnico_id || '') === String(tecnicoId))
            && (!cidade || String(c.cidade || '').toLowerCase().includes(cidade))
            && (!prioridade || c.prioridade === prioridade);
    });

    marcadoresDashboard.clearLayers();
    const bounds = [];
    filtrados.forEach(c => {
        const coordenadas = extrairCoordenadasLocalizacao(c.localizacao);
        if (coordenadas && Number.isFinite(coordenadas.lat) && Number.isFinite(coordenadas.lon)) {
            const marker = L.marker([coordenadas.lat, coordenadas.lon], { icon: iconeMarcadorStatus(c.status) });
            const detalheUrl = `detalhes-chamado.html?id=${encodeURIComponent(c.id)}`;
            marker.bindPopup(`<b><a href="${detalheUrl}" class="text-decoration-none">Chamado #${escapeHTML(c.id)}</a></b><br>Cliente: ${escapeHTML(c.cliente || 'N/A')}<br>Status: ${escapeHTML(c.status || '')}<br>Cidade: ${escapeHTML(c.cidade || '')}<br><a href="${detalheUrl}" class="btn btn-sm btn-primary mt-2">Abrir detalhe</a>`);
            marcadoresDashboard.addLayer(marker);
            bounds.push([coordenadas.lat, coordenadas.lon]);
        }
    });

    if (bounds.length > 0) {
        mapaDashboard.fitBounds(bounds, { padding: [50, 50] });
    } else {
        mapaDashboard.setView([-15.7801, -47.9292], 4);
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
        const ferramentas = document.getElementById('tec_ferramentas').value
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
        const observacaoTecnico = document.getElementById('tec_obs').value;
        
        const rua = document.getElementById('tec_rua').value;
        const bairro = document.getElementById('tec_bairro').value;
        const cidade = document.getElementById('tec_cidade').value;
        const estado = document.getElementById('tec_estado').value;
        
        const campoEndereco = document.getElementById('tec_busca_endereco');
        const lat = campoEndereco.dataset.lat;
        const lon = campoEndereco.dataset.lon;
        const tecnicoAnterior = id ? listaTecnicosCache.find(t => String(t.id) === String(id)) : null;
        const pontoGeo = (lat && lon) ? `POINT(${lon} ${lat})` : (tecnicoAnterior?.localizacao || null);

        const dadosTecnico = {
            nome, cpf, cnpj, contato, email, ferramentas,
            observacao_tecnico: observacaoTecnico,
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
    document.getElementById('tec_ferramentas').value = Array.isArray(t.ferramentas) ? t.ferramentas.join(', ') : (t.ferramentas || '');
    document.getElementById('tec_obs').value = t.observacao_tecnico || '';
    
    document.getElementById('tec_rua').value = t.rua || '';
    document.getElementById('tec_bairro').value = t.bairro || '';
    document.getElementById('tec_cidade').value = t.cidade || '';
    document.getElementById('tec_estado').value = t.estado || '';
    const enderecoTecnico = [t.rua, t.bairro, t.cidade, t.estado].filter(Boolean).join(', ');
    document.getElementById('tec_busca_endereco').value = enderecoTecnico;
    document.getElementById('tec_busca_endereco').dataset.lat = '';
    document.getElementById('tec_busca_endereco').dataset.lon = '';
    const coordenadasTecnico = extrairCoordenadasLocalizacao(t.localizacao);
    if (coordenadasTecnico) {
        document.getElementById('tec_busca_endereco').dataset.lat = coordenadasTecnico.lat;
        document.getElementById('tec_busca_endereco').dataset.lon = coordenadasTecnico.lon;
    }

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
let chamadosListaCache = [];
let paginaChamadosAtual = 1;
const ITENS_POR_PAGINA = 10;
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
                estado: document.getElementById('chamado_estado').value,
                cidade: document.getElementById('chamado_cidade').value,
                bairro: document.getElementById('chamado_bairro').value,
                rua: document.getElementById('chamado_rua').value,
                localizacao: pontoGeo,
                tecnico_id: document.getElementById('chamado_tecnico').value || null,
                prioridade: document.getElementById('chamado_prioridade')?.value || 'Média',
                prazo: document.getElementById('chamado_prazo')?.value || null,
                status: 'Criado'
            }]).select();

            if (error) {
                Swal.fire('Erro', error.message, 'error');
            } else {
                if (novoChamado && novoChamado.length > 0) {
                    await db.from('historico_chamados').insert([{
                        chamado_id: novoChamado[0].id,
                        observacao: `[Sistema] Chamado criado e registrado no sistema. Descrição inicial: ${document.getElementById('chamado_problema').value.trim() || '(não informada)'}`,
                        ...(await obterDadosUsuarioHistorico())
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

function abrirChamadosComFiltro(status) {
    const parametro = status ? `?status=${encodeURIComponent(status)}` : '';
    window.location.href = `chamados.html${parametro}`;
}

async function carregarChamadosRecentes() {
    const tbody = document.getElementById('tabelaChamadosBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="text-muted text-center">Carregando chamados...</td></tr>';
    const { data, error } = await db.from('chamados').select('*').order('criado_em', { ascending: false });
    if (error) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-danger text-center">Erro: ${escapeHTML(error.message)}</td></tr>`;
        return;
    }
    chamadosListaCache = data || [];
    paginaChamadosAtual = 1;
    renderizarPaginaChamados();
}

function pesquisarChamados() {
    paginaChamadosAtual = 1;
    renderizarPaginaChamados();
}

function mudarPaginaChamados(delta) {
    const busca = (document.getElementById('buscaChamados')?.value || '').trim().toLowerCase();
    const filtro = document.getElementById('filtroStatus')?.value || '';
    const filtrados = chamadosListaCache.filter(c => {
        const texto = [c.id, c.cliente, c.filial, c.titulo, c.rua, c.bairro, c.cidade, c.estado].join(' ').toLowerCase();
        return (!filtro || c.status === filtro) && (!busca || texto.includes(busca));
    });
    const totalPaginas = Math.max(1, Math.ceil(filtrados.length / ITENS_POR_PAGINA));
    paginaChamadosAtual = Math.min(totalPaginas, Math.max(1, paginaChamadosAtual + delta));
    renderizarPaginaChamados();
}

function renderizarPaginaChamados() {
    const tbody = document.getElementById('tabelaChamadosBody');
    if (!tbody) return;
    const busca = (document.getElementById('buscaChamados')?.value || '').trim().toLowerCase();
    const filtro = document.getElementById('filtroStatus')?.value || '';
    const filtrados = chamadosListaCache.filter(c => {
        const texto = [c.id, c.cliente, c.filial, c.titulo, c.rua, c.bairro, c.cidade, c.estado].join(' ').toLowerCase();
        return (!filtro || c.status === filtro) && (!busca || texto.includes(busca));
    });
    const inicio = (paginaChamadosAtual - 1) * ITENS_POR_PAGINA;
    const pagina = filtrados.slice(inicio, inicio + ITENS_POR_PAGINA);
    if (!pagina.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-muted text-center">Nenhum chamado encontrado.</td></tr>';
    } else {
        tbody.innerHTML = pagina.map(c => {
            const prazo = c.prazo ? new Date(c.prazo).toLocaleString('pt-BR') : '-';
            return `<tr style="cursor:pointer" onclick="window.location.href='detalhes-chamado.html?id=${encodeURIComponent(c.id)}'">
                <td><strong>#${escapeHTML(c.id)} - ${escapeHTML(c.cliente || '')}</strong><br><small class="text-muted">${escapeHTML(c.filial || '')} | ${escapeHTML(c.titulo || '')}</small><br><small>${escapeHTML(c.rua || '')}</small></td>
                <td><select class="form-select form-select-sm" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()" onchange="alterarStatusChamado(${c.id}, this.value, event)">${STATUS_OPCOES.map(status => `<option value="${status}" ${status === c.status ? 'selected' : ''}>${status}</option>`).join('')}</select></td>
                <td><span class="badge text-bg-${c.prioridade === 'Alta' ? 'danger' : c.prioridade === 'Baixa' ? 'secondary' : 'warning'}">${escapeHTML(c.prioridade || 'Média')}</span><br><small>${escapeHTML(prazo)}</small></td>
                <td>${escapeHTML(c.cidade || '-')}</td>
            </tr>`;
        }).join('');
    }
    const totalPaginas = Math.max(1, Math.ceil(filtrados.length / ITENS_POR_PAGINA));
    const info = document.getElementById('paginacaoInfo');
    if (info) info.textContent = filtrados.length ? `Página ${paginaChamadosAtual} de ${totalPaginas} — ${filtrados.length} chamado(s)` : '';
    const anterior = document.getElementById('paginaAnterior');
    const proxima = document.getElementById('paginaProxima');
    if (anterior) anterior.disabled = paginaChamadosAtual <= 1;
    if (proxima) proxima.disabled = paginaChamadosAtual >= totalPaginas;
}

async function alterarStatusChamado(chamadoId, novoStatus, evento) {
    if (evento) evento.stopPropagation();
    if (!STATUS_OPCOES.includes(novoStatus)) return;
    const chamadoAnterior = chamadosListaCache.find(c => String(c.id) === String(chamadoId));
    const statusAnterior = chamadoAnterior?.status || '(vazio)';
    if (statusAnterior === novoStatus) return;

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
        observacao: `[Sistema] Status: de "${statusAnterior}" para "${novoStatus}".`,
        ...(await obterDadosUsuarioHistorico())
    }]);

    carregarChamadosRecentes();
}

// -------------------------------------------------------------------------
// DETALHES E HISTÓRICO DO CHAMADO (`detalhes-chamado.html`)
// -------------------------------------------------------------------------
function extrairNumeroEndereco(termo) {
    const encontrados = [...String(termo || '').matchAll(/(?:\bn[ºo.]?\s*)?(\d+[A-Za-z]?)\b/gi)];
    return encontrados.length ? encontrados[encontrados.length - 1][1] : '';
}

function formatarEnderecoSugestao(local, termo) {
    const numeroDigitado = extrairNumeroEndereco(termo);
    const endereco = local.display_name || '';
    if (numeroDigitado && !new RegExp(`(?:^|\\D)${numeroDigitado}(?:\\D|$)`).test(endereco)) {
        return `${endereco}, ${numeroDigitado}`;
    }
    return endereco;
}

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
                    item.textContent = formatarEnderecoSugestao(local, termo);
                    item.addEventListener('pointerdown', (e) => {
                        e.preventDefault();
                        const numeroDigitado = extrairNumeroEndereco(termo);
                        if (!local.address) local.address = {};
                        if (!local.address.house_number && numeroDigitado) local.address.house_number = numeroDigitado;
                        selecionarSugestaoDetalhe(local);
                    });
                    item.addEventListener('click', (e) => {
                        e.preventDefault();
                        const numeroDigitado = extrairNumeroEndereco(termo);
                        if (!local.address) local.address = {};
                        if (!local.address.house_number && numeroDigitado) local.address.house_number = numeroDigitado;
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
    const enderecoCompleto = [rua, bairro, cidade, estado].filter(Boolean).join(', ');

    // O campo visível mostra a rua com número e os demais componentes do endereço.
    document.getElementById('detalhe_busca_endereco').value = enderecoCompleto || local.display_name || rua;
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

function valorHistorico(valor) {
    if (valor === null || valor === undefined || valor === '') return '(vazio)';
    return String(valor);
}

async function obterNomeTecnicoHistorico(id) {
    if (!id) return '(não designado)';
    const { data } = await db.from('tecnicos').select('nome').eq('id', id).maybeSingle();
    return data?.nome || `ID ${id}`;
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
            const campoEndereco = document.getElementById('detalhe_busca_endereco');
            const enderecoAnterior = formEdit.dataset.enderecoAnterior || '';
            const enderecoNovo = campoEndereco?.value?.trim() || '';
            const dadosAnteriores = JSON.parse(formEdit.dataset.dadosAnteriores || '{}');
            
            let dadosUpdate = {
                cliente: document.getElementById('detalhe_cliente').value,
                filial: document.getElementById('detalhe_filial').value,
                titulo: document.getElementById('detalhe_titulo').value,
                status: document.getElementById('detalhe_status').value,
                prioridade: document.getElementById('detalhe_prioridade')?.value || 'Média',
                prazo: document.getElementById('detalhe_prazo')?.value || null,
                rua: document.getElementById('detalhe_rua').value,
                bairro: document.getElementById('detalhe_bairro').value,
                cidade: document.getElementById('detalhe_cidade').value,
                estado: document.getElementById('detalhe_estado').value,
                tecnico_id: document.getElementById('detalhe_tecnico')?.value || null
            };

            if (lat && lon) {
                dadosUpdate.localizacao = `POINT(${lon} ${lat})`;
            }

            const { error } = await db.from('chamados').update(dadosUpdate).eq('id', id);

            definirCarregando(botao, false);

            if (error) {
                Swal.fire('Erro', error.message, 'error');
            } else {
                const dadosAtuais = {
                    cliente: document.getElementById('detalhe_cliente')?.value || '',
                    filial: document.getElementById('detalhe_filial')?.value || '',
                    titulo: document.getElementById('detalhe_titulo')?.value || '',
                    status: document.getElementById('detalhe_status')?.value || '',
                    prioridade: document.getElementById('detalhe_prioridade')?.value || '',
                    prazo: document.getElementById('detalhe_prazo')?.value || '',
                    tecnico_id: document.getElementById('detalhe_tecnico')?.value || '',
                    endereco: enderecoNovo,
                    bairro: document.getElementById('detalhe_bairro')?.value || '',
                    cidade: document.getElementById('detalhe_cidade')?.value || '',
                    estado: document.getElementById('detalhe_estado')?.value || ''
                };
                const nomesCampos = {
                    cliente: 'Cliente', filial: 'Filial', titulo: 'Título / descrição',
                    status: 'Status', prioridade: 'Prioridade', prazo: 'Prazo', tecnico_id: 'Técnico', endereco: 'Endereço', bairro: 'Bairro',
                    cidade: 'Cidade', estado: 'Estado'
                };
                const alteracoes = [];
                let nomeTecnicoAnterior = '';
                let nomeTecnicoAtual = '';
                if (String(dadosAnteriores.tecnico_id || '') !== String(dadosAtuais.tecnico_id || '')) {
                    [nomeTecnicoAnterior, nomeTecnicoAtual] = await Promise.all([
                        obterNomeTecnicoHistorico(dadosAnteriores.tecnico_id),
                        obterNomeTecnicoHistorico(dadosAtuais.tecnico_id)
                    ]);
                }
                Object.keys(nomesCampos).forEach(campo => {
                    if (String(dadosAnteriores[campo] || '') !== String(dadosAtuais[campo] || '')) {
                        const anterior = campo === 'tecnico_id' ? nomeTecnicoAnterior : dadosAnteriores[campo];
                        const atual = campo === 'tecnico_id' ? nomeTecnicoAtual : dadosAtuais[campo];
                        alteracoes.push(`${nomesCampos[campo]}: de "${valorHistorico(anterior)}" para "${valorHistorico(atual)}"`);
                    }
                });
                const observacao = alteracoes.length
                    ? `[Sistema] Alterações realizadas — ${alteracoes.join('; ')}.`
                    : '[Sistema] Dados do chamado salvos sem alterações nos campos.';
                await db.from('historico_chamados').insert([{ chamado_id: id, observacao, ...(await obterDadosUsuarioHistorico()) }]);
                formEdit.dataset.enderecoAnterior = enderecoNovo;
                formEdit.dataset.dadosAnteriores = JSON.stringify(dadosAtuais);
                Swal.fire('Sucesso', 'Chamado atualizado com sucesso!', 'success');
                carregarHistoricoChamado(id);
                if (lat && lon) {
                    atualizarMapaDetalhe(parseFloat(lat), parseFloat(lon));
                    // Recalcula as distâncias usando a nova localização salva.
                    await carregarTecnicosProximos(id);
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
                observacao: texto,
                ...(await obterDadosUsuarioHistorico())
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
    select.innerHTML = '<option value="">Carregando técnicos...</option>';
    const { data, error } = await db.from('tecnicos').select('id, nome, bairro, cidade').order('nome', { ascending: true });
    if (error) {
        console.error('Erro ao carregar técnicos do detalhe:', error);
        select.innerHTML = '<option value="">Erro ao carregar técnicos</option>';
        return;
    }
    select.innerHTML = '<option value="">Selecione um técnico</option>';
    (data || []).forEach(t => {
        const option = document.createElement('option');
        option.value = t.id;
        option.textContent = `${t.nome || 'Técnico'}${t.bairro ? ` — ${t.bairro}` : ''}`;
        select.appendChild(option);
    });
}

async function carregarDadosChamadoUnico(id) {
    const { data, error } = await db.from('chamados').select('*').eq('id', id).single();
    if (error || !data) {
        Swal.fire('Erro', 'Chamado não encontrado.', 'error');
        return;
    }

    if (document.getElementById('tituloCardChamado')) {
        document.getElementById('tituloCardChamado').textContent = data.titulo ? data.titulo : 'Chamado';
        const subtitulo = document.getElementById('subtituloIdChamado');
        if (subtitulo) subtitulo.textContent = `ID: ${data.id}`;
    }
    if (document.getElementById('detalhe_cliente')) document.getElementById('detalhe_cliente').value = data.cliente || '';
    if (document.getElementById('detalhe_filial')) document.getElementById('detalhe_filial').value = data.filial || '';
    if (document.getElementById('detalhe_titulo')) document.getElementById('detalhe_titulo').value = data.titulo || '';
    if (document.getElementById('detalhe_status')) document.getElementById('detalhe_status').value = data.status || 'Criado';
    if (document.getElementById('detalhe_prioridade')) document.getElementById('detalhe_prioridade').value = data.prioridade || 'Média';
    if (document.getElementById('detalhe_prazo')) document.getElementById('detalhe_prazo').value = data.prazo ? new Date(data.prazo).toISOString().slice(0, 16) : '';
    if (document.getElementById('detalhe_busca_endereco')) {
        const enderecoCompleto = [data.rua, data.bairro, data.cidade, data.estado].filter(Boolean).join(', ');
        document.getElementById('detalhe_busca_endereco').value = enderecoCompleto;
        const formulario = document.getElementById('formEditarChamadoUnico');
        if (formulario) formulario.dataset.enderecoAnterior = enderecoCompleto;
    }
    if (document.getElementById('detalhe_rua')) document.getElementById('detalhe_rua').value = data.rua || '';
    if (document.getElementById('detalhe_bairro')) document.getElementById('detalhe_bairro').value = data.bairro || '';
    if (document.getElementById('detalhe_cidade')) document.getElementById('detalhe_cidade').value = data.cidade || '';
    if (document.getElementById('detalhe_estado')) document.getElementById('detalhe_estado').value = data.estado || '';
    if (document.getElementById('detalhe_descricao')) document.getElementById('detalhe_descricao').value = data.descricao || '';
    
    if (document.getElementById('detalhe_rua')) {
        document.getElementById('detalhe_rua').value = data.rua || '';
    }

    if (document.getElementById('detalhe_tecnico')) {
        document.getElementById('detalhe_tecnico').dataset.tecnicoAtual = data.tecnico_id || '';
        if (data.tecnico_id) document.getElementById('detalhe_tecnico').value = data.tecnico_id;
    }

    const formulario = document.getElementById('formEditarChamadoUnico');
    if (formulario) {
        formulario.dataset.dadosAnteriores = JSON.stringify({
            cliente: data.cliente || '', filial: data.filial || '', titulo: data.titulo || '',
            status: data.status || '', prioridade: data.prioridade || 'Média', prazo: data.prazo || '', tecnico_id: data.tecnico_id || '',
            endereco: [data.rua, data.bairro, data.cidade, data.estado].filter(Boolean).join(', '),
            bairro: data.bairro || '', cidade: data.cidade || '', estado: data.estado || ''
        });
    }

    const coordenadasSalvas = extrairCoordenadasLocalizacao(data.localizacao);
    if (coordenadasSalvas) {
        document.getElementById('detalhe_lat').value = coordenadasSalvas.lat;
        document.getElementById('detalhe_lon').value = coordenadasSalvas.lon;
        const campoEndereco = document.getElementById('detalhe_busca_endereco');
        if (campoEndereco) {
            campoEndereco.dataset.lat = coordenadasSalvas.lat;
            campoEndereco.dataset.lon = coordenadasSalvas.lon;
        }
        inicializarMapaDetalhe(coordenadasSalvas.lat, coordenadasSalvas.lon);
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

    const descricaoInicial = data.find(h => String(h.observacao || '').startsWith('[Sistema] Chamado criado'));
    const campoDescricaoInicial = document.getElementById('detalhe_descricao_inicial');
    if (campoDescricaoInicial) {
        const marcador = 'Descrição inicial:';
        const texto = String(descricaoInicial?.observacao || '');
        const posicao = texto.indexOf(marcador);
        campoDescricaoInicial.value = posicao >= 0 ? texto.slice(posicao + marcador.length).trim() : '';
    }

    container.innerHTML = '';
    data.forEach(h => {
        const dataFormatada = new Date(h.criado_em).toLocaleString('pt-BR');
        container.innerHTML += `
            <div class="list-group-item px-0">
                <div class="d-flex w-100 justify-content-between">
                    <small class="text-muted">${escapeHTML(dataFormatada)}</small>
                    <small class="text-primary">${escapeHTML(h.usuario_email || h.usuario_id || 'Sistema')}</small>
                </div>
                <p class="mb-1 small text-dark">${escapeHTML(h.observacao)}</p>
            </div>
        `;
    });
}

async function carregarTecnicosProximos(chamadoId) {
    const select = document.getElementById('detalhe_tecnico');
    if (!select) return;

    try {
        const { data: tecnicosProximos, error } = await db.rpc('tecnicos_proximos_chamado', { p_chamado_id: Number(chamadoId) });
        if (error) console.warn('RPC de proximidade indisponível:', error.message);
        const tecnicos = tecnicosProximos || [];
        const tecnicoAtual = String(select.dataset.tecnicoAtual || '');
        select.innerHTML = '<option value="">Selecione um técnico por proximidade</option>';

        if (tecnicos.length) {
            tecnicos.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                const distancia = Number(t.distancia_km);
                opt.textContent = `${t.nome || 'Técnico'} — ${Number.isFinite(distancia) ? `${distancia.toFixed(2)} km` : 'distância indisponível'}${t.bairro ? ` (${t.bairro})` : ''}`;
                if (String(t.id) === tecnicoAtual) opt.selected = true;
                select.appendChild(opt);
            });
        } else {
            const { data: todos } = await db.from('tecnicos').select('id, nome, bairro').order('nome', { ascending: true });
            (todos || []).forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = `${t.nome || 'Técnico'} — distância indisponível${t.bairro ? ` (${t.bairro})` : ''}`;
                if (String(t.id) === tecnicoAtual) opt.selected = true;
                select.appendChild(opt);
            });
            if (!todos?.length) select.innerHTML = '<option value="">Nenhum técnico cadastrado</option>';
        }
    } catch (err) {
        console.error('Erro ao buscar técnicos próximos:', err);
        select.innerHTML = '<option value="">Não foi possível carregar técnicos</option>';
    }
}

async function atribuirTecnicoProximo() {
    const select = document.getElementById('detalhe_tecnico');
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
            observacao: `[Sistema] Técnico atribuído via geolocalização e status alterado para 'Em Atendimento'.`,
            ...(await obterDadosUsuarioHistorico())
        }]);
        Swal.fire('Sucesso', 'Técnico atribuído com sucesso!', 'success');
        carregarDadosChamadoUnico(id);
        carregarHistoricoChamado(id);
    }
}

// -------------------------------------------------------------------------
// USUÁRIOS E NOTIFICAÇÕES
// -------------------------------------------------------------------------
async function carregarPortalCliente() {
    const tabela = document.getElementById('tabelaChamadosCliente');
    const form = document.getElementById('formNovoChamadoCliente');
    const { data: { user } } = await db.auth.getUser();
    if (!user) return;
    const { data: cliente, error: clienteError } = await db.from('clientes').select('id, nome, filial').eq('usuario_id', user.id).maybeSingle();
    if (clienteError || !cliente) {
        if (tabela) tabela.innerHTML = '<tr><td colspan="6" class="text-danger text-center">Cliente não vinculado a este usuário.</td></tr>';
        return;
    }
    const nome = document.getElementById('clientePortalNome');
    if (nome) nome.textContent = cliente.nome;
    const { data: chamados, error } = await db.from('chamados').select('id, titulo, filial, status, criado_em').eq('cliente_id', cliente.id).order('criado_em', { ascending: false });
    if (tabela) tabela.innerHTML = error ? `<tr><td colspan="6" class="text-danger">${escapeHTML(error.message)}</td></tr>` : ((chamados || []).map(c => `<tr><td>#${c.id}</td><td>${escapeHTML(c.titulo)}</td><td>${escapeHTML(c.filial || '-')}</td><td><span class="badge ${obterBadgeStatus(c.status)}">${escapeHTML(c.status)}</span></td><td>${escapeHTML(new Date(c.criado_em).toLocaleString('pt-BR'))}</td><td><span class="text-muted small">Acompanhamento</span></td></tr>`).join('') || '<tr><td colspan="6" class="text-muted text-center">Nenhum chamado encontrado.</td></tr>');
    if (form) form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const titulo = document.getElementById('cliente_chamado_titulo').value.trim();
        const filial = document.getElementById('cliente_chamado_filial').value.trim();
        const descricao = document.getElementById('cliente_chamado_descricao').value.trim();
        const { data: novo, error: novoError } = await db.from('chamados').insert([{ cliente_id: cliente.id, cliente: cliente.nome, titulo: titulo || descricao, filial, status: 'Criado', prioridade: 'Média' }]).select('id').single();
        if (novoError) { Swal.fire('Erro', novoError.message, 'error'); return; }
        await db.from('historico_chamados').insert([{ chamado_id: novo.id, observacao: `[Sistema] Chamado aberto pelo cliente. Descrição: ${descricao}`, ...(await obterDadosUsuarioHistorico()) }]);
        Swal.fire('Sucesso', 'Chamado aberto com sucesso.', 'success');
        bootstrap.Modal.getInstance(document.getElementById('modalNovoChamadoCliente'))?.hide();
        form.reset();
        carregarPortalCliente();
    });
}

async function inicializarTelaUsuarios() {
    const tabela = document.getElementById('tabelaUsuariosBody');
    const form = document.getElementById('formUsuario');
    if (tabela) {
        const { data, error } = await db.from('perfis_usuario').select('id, nome, email, perfil, ativo').order('nome');
        tabela.innerHTML = error ? `<tr><td colspan="4" class="text-danger">${escapeHTML(error.message)}</td></tr>` : ((data || []).map(u => `<tr><td>${escapeHTML(u.nome)}</td><td>${escapeHTML(u.email)}</td><td>${escapeHTML(u.perfil)}</td><td>${u.ativo ? 'Ativo' : 'Inativo'}</td></tr>`).join('') || '<tr><td colspan="4" class="text-muted text-center">Nenhum usuário cadastrado.</td></tr>');
    }
    if (form) form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const nome = document.getElementById('usuario_nome').value.trim();
        const email = document.getElementById('usuario_email').value.trim().toLowerCase();
        const perfil = document.getElementById('usuario_perfil').value;
        const { error } = await db.functions.invoke('convidar-usuario', { body: { nome, email, perfil } });
        if (error) Swal.fire('Erro', error.message, 'error');
        else { Swal.fire('Sucesso', 'Convite enviado por e-mail.', 'success'); form.reset(); }
    });
}

async function carregarNotificacoes() {
    const lista = document.getElementById('listaNotificacoes');
    const contador = document.getElementById('contadorNotificacoes');
    if (!lista) return;
    const { data: { user } } = await db.auth.getUser();
    if (!user) return;
    const { data, error } = await db.from('notificacoes').select('*').eq('usuario_id', user.id).order('criado_em', { ascending: false }).limit(100);
    if (error) { lista.innerHTML = `<div class="list-group-item text-danger">${escapeHTML(error.message)}</div>`; return; }
    const naoLidas = (data || []).filter(n => !n.lida).length;
    if (contador) contador.textContent = naoLidas;
    lista.innerHTML = (data || []).map(n => `<button type="button" class="list-group-item list-group-item-action ${n.lida ? '' : 'list-group-item-primary'} text-start" onclick="marcarNotificacaoLida(${n.id}, this)"><div class="d-flex justify-content-between"><strong>${escapeHTML(n.titulo)}</strong><small>${escapeHTML(new Date(n.criado_em).toLocaleString('pt-BR'))}</small></div><div>${escapeHTML(n.mensagem)}</div>${n.link ? `<small class="text-primary">Abrir detalhes</small>` : ''}</button>`).join('') || '<div class="list-group-item text-muted text-center">Nenhuma notificação.</div>';
}

async function marcarNotificacaoLida(id, elemento) {
    const { error } = await db.from('notificacoes').update({ lida: true }).eq('id', id);
    if (!error && elemento) { elemento.classList.remove('list-group-item-primary'); carregarNotificacoes(); }
}

async function marcarTodasNotificacoesLidas() {
    const { data: { user } } = await db.auth.getUser();
    if (user) await db.from('notificacoes').update({ lida: true }).eq('usuario_id', user.id).eq('lida', false);
    carregarNotificacoes();
}

async function criarNotificacao(usuarioId, titulo, mensagem, tipo = 'info', link = null) {
    if (!usuarioId) return;
    return db.from('notificacoes').insert([{ usuario_id: usuarioId, titulo, mensagem, tipo, link }]);
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

function valorCSV(valor) {
    return String(valor ?? '').replace(/"/g, '""');
}

function formatarDataCSV(valor) {
    if (!valor) return '';
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? String(valor) : data.toLocaleString('pt-BR');
}

async function exportarChamadosPorPeriodo() {
    const dataInicial = document.getElementById('relatorioDataInicial')?.value;
    const dataFinal = document.getElementById('relatorioDataFinal')?.value;

    if (!dataInicial || !dataFinal) {
        Swal.fire('Atenção', 'Informe a data inicial e a data final.', 'warning');
        return;
    }
    if (dataInicial > dataFinal) {
        Swal.fire('Atenção', 'A data inicial não pode ser posterior à data final.', 'warning');
        return;
    }

    try {
        const inicio = `${dataInicial}T00:00:00.000Z`;
        const fim = `${dataFinal}T23:59:59.999Z`;
        const { data: chamados, error: erroChamados } = await db.from('chamados')
            .select('*')
            .gte('criado_em', inicio)
            .lte('criado_em', fim)
            .order('criado_em', { ascending: true });

        if (erroChamados) throw erroChamados;
        if (!chamados || chamados.length === 0) {
            Swal.fire('Aviso', 'Não há chamados criados no período informado.', 'info');
            return;
        }

        const idsTecnicos = [...new Set(chamados.map(c => c.tecnico_id).filter(Boolean))];
        const idsChamados = chamados.map(c => c.id);
        const [resTecnicos, resHistorico] = await Promise.all([
            idsTecnicos.length ? db.from('tecnicos').select('id, nome').in('id', idsTecnicos) : Promise.resolve({ data: [], error: null }),
            db.from('historico_chamados').select('*').in('chamado_id', idsChamados).order('criado_em', { ascending: false })
        ]);

        if (resTecnicos.error) throw resTecnicos.error;
        if (resHistorico.error) throw resHistorico.error;

        const nomesTecnicos = Object.fromEntries((resTecnicos.data || []).map(t => [String(t.id), t.nome]));
        const historicoPorChamado = {};
        (resHistorico.data || []).forEach(item => {
            if (!historicoPorChamado[item.chamado_id]) historicoPorChamado[item.chamado_id] = [];
            historicoPorChamado[item.chamado_id].push(item);
        });

        const cabecalho = ['ID', 'Cliente', 'Filial', 'Endereço', 'Título', 'Técnico', 'Criado em', 'Resolvido em', 'Última informação do histórico', 'Status atual'];
        const linhas = [cabecalho];

        chamados.forEach(c => {
            const historico = historicoPorChamado[c.id] || [];
            const ultimo = historico[0];
            const eventosResolucao = historico.filter(h => /resolvido|validado/i.test(h.observacao || ''));
            const chamadoFoiResolvido = ['Resolvido', 'Validado'].includes(c.status);
            const dataResolvido = chamadoFoiResolvido
                ? (c.resolvido_em || c.data_resolucao || c.fechado_em || (eventosResolucao[0]?.criado_em || ''))
                : '';
            const endereco = [c.rua, c.bairro, c.cidade, c.estado].filter(Boolean).join(', ');
            linhas.push([
                c.id,
                c.cliente,
                c.filial,
                endereco,
                c.titulo,
                nomesTecnicos[String(c.tecnico_id)] || '',
                formatarDataCSV(c.criado_em),
                formatarDataCSV(dataResolvido),
                ultimo?.observacao || '',
                c.status
            ]);
        });

        const csv = '\ufeff' + linhas.map(linha => linha.map(valor => `"${valorCSV(valor)}"`).join(';')).join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `relatorio_chamados_${dataInicial}_${dataFinal}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('Erro ao gerar relatório de chamados:', err);
        Swal.fire('Erro', err.message || 'Erro ao gerar arquivo CSV.', 'error');
    }
}

// Compatibilidade com o botão antigo, caso ainda exista em alguma página.
async function exportarCSV() {
    const hoje = new Date().toISOString().slice(0, 10);
    const inicial = document.getElementById('relatorioDataInicial');
    const final = document.getElementById('relatorioDataFinal');
    if (inicial && !inicial.value) inicial.value = hoje;
    if (final && !final.value) final.value = hoje;
    return exportarChamadosPorPeriodo();
}
