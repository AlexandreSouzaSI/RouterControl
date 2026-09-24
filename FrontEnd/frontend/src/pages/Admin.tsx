import { useEffect, useState } from 'react';
import {
    ShieldAlert,
    Plus,
    X,
    Building2,
    ChevronDown,
    ChevronUp,
    CheckCircle2,
    XCircle,
    Loader2,
    Users,
    UserPlus,
    Pencil,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

type EmpresaModulo = 'RASTREADOR' | 'FISCAL' | 'FINANCEIRO_NF';

const TODOS_MODULOS: { valor: EmpresaModulo; nome: string }[] = [
    { valor: 'RASTREADOR', nome: 'Rastreador (Dashboard/Viagens/Rotas)' },
    { valor: 'FISCAL', nome: 'Fiscal (RPA/CIOT)' },
    { valor: 'FINANCEIRO_NF', nome: 'Financeiro/NF (NF Entrada/Serviço/Contas a Pagar)' },
];

type Empresa = {
    id: string;
    nome: string;
    email: string;
    cnpj: string | null;
    ativo: boolean;
    pagamentoEmDia: boolean;
    observacoesAdmin: string | null;
    modulosHabilitados: EmpresaModulo[];
    totalUsuarios: number;
};

type UsuarioEmpresa = {
    id: string;
    nome: string | null;
    email: string;
    ativo: boolean;
    isAdminMaster: boolean;
};

const campoClasse =
    'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400';
const labelClasse = 'text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1';

function Toggle({
    ativo,
    onToggle,
    labelOn,
    labelOff,
    corOn = 'green',
}: {
    ativo: boolean;
    onToggle: () => void;
    labelOn: string;
    labelOff: string;
    corOn?: 'green' | 'blue';
}) {
    const cor = corOn === 'green'
        ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400'
        : 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400';

    return (
        <button
            onClick={onToggle}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition ${ativo
                ? cor
                : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
                }`}
        >
            {ativo ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            {ativo ? labelOn : labelOff}
        </button>
    );
}

function NovaEmpresaModal({ onClose, onCriada }: { onClose: () => void; onCriada: () => void }) {
    const [nome, setNome] = useState('');
    const [email, setEmail] = useState('');
    const [cnpj, setCnpj] = useState('');
    const [modulos, setModulos] = useState<EmpresaModulo[]>(['RASTREADOR', 'FISCAL', 'FINANCEIRO_NF']);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    function alternarModulo(m: EmpresaModulo) {
        setModulos((atual) => (atual.includes(m) ? atual.filter((x) => x !== m) : [...atual, m]));
    }

    async function salvar() {
        if (!nome.trim() || !email.trim()) {
            setErro('Informe nome e e-mail da empresa.');
            return;
        }

        try {
            setSalvando(true);
            setErro(null);
            await api.post('/admin/empresas', {
                nome: nome.trim(),
                email: email.trim(),
                cnpj: cnpj.trim() || undefined,
                modulosHabilitados: modulos,
            });
            onCriada();
            onClose();
        } catch (e: any) {
            setErro(e?.response?.data?.message ?? 'Erro ao criar empresa.');
        } finally {
            setSalvando(false);
        }
    }

    return (
        <div
            className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md bg-white dark:bg-[#111827] rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-5"
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold text-gray-900 dark:text-white">Nova Empresa</h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
                        <X size={18} />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className={labelClasse}>Nome *</label>
                        <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} className={campoClasse} placeholder="Ex.: Via Minas Transportes" />
                    </div>

                    <div>
                        <label className={labelClasse}>E-mail (identifica a empresa, não é o login de ninguém) *</label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={campoClasse} placeholder="contato@empresa.com" />
                    </div>

                    <div>
                        <label className={labelClasse}>CNPJ</label>
                        <input type="text" value={cnpj} onChange={(e) => setCnpj(e.target.value)} className={campoClasse} placeholder="Opcional" />
                    </div>

                    <div>
                        <label className={labelClasse}>Módulos habilitados</label>
                        <div className="space-y-1.5">
                            {TODOS_MODULOS.map((m) => (
                                <label key={m.valor} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={modulos.includes(m.valor)}
                                        onChange={() => alternarModulo(m.valor)}
                                        className="rounded border-gray-300 dark:border-gray-700"
                                    />
                                    {m.nome}
                                </label>
                            ))}
                        </div>
                    </div>

                    {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

                    <button
                        onClick={salvar}
                        disabled={salvando}
                        className="w-full py-2.5 rounded-xl bg-[#E30613] text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition"
                    >
                        {salvando ? 'Criando...' : 'Criar empresa'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function NovoUsuarioForm({ empresaId, onCriado }: { empresaId: string; onCriado: () => void }) {
    const [aberto, setAberto] = useState(false);
    const [nome, setNome] = useState('');
    const [email, setEmail] = useState('');
    const [senha, setSenha] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    async function salvar() {
        if (!email.trim() || senha.length < 6) {
            setErro('Informe e-mail e uma senha com pelo menos 6 caracteres.');
            return;
        }

        try {
            setSalvando(true);
            setErro(null);
            await api.post(`/admin/empresas/${empresaId}/usuarios`, {
                nome: nome.trim() || undefined,
                email: email.trim(),
                senha,
            });
            setNome('');
            setEmail('');
            setSenha('');
            setAberto(false);
            onCriado();
        } catch (e: any) {
            setErro(e?.response?.data?.message ?? 'Erro ao criar login.');
        } finally {
            setSalvando(false);
        }
    }

    if (!aberto) {
        return (
            <button
                onClick={() => setAberto(true)}
                className="flex items-center gap-2 text-sm font-medium text-[#E30613] hover:underline"
            >
                <UserPlus size={14} />
                Criar login pra essa empresa
            </button>
        );
    }

    return (
        <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (opcional)" className={campoClasse} />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail de login" className={campoClasse} />
                <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Senha (mín. 6)" className={campoClasse} />
            </div>

            {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}

            <div className="flex gap-2">
                <button
                    onClick={salvar}
                    disabled={salvando}
                    className="px-3 py-1.5 rounded-lg bg-[#E30613] text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50 transition"
                >
                    {salvando ? 'Criando...' : 'Criar login'}
                </button>
                <button
                    onClick={() => { setAberto(false); setErro(null); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                >
                    Cancelar
                </button>
            </div>
        </div>
    );
}

function EmpresaCard({ empresa, onMudou }: { empresa: Empresa; onMudou: () => void }) {
    const [expandido, setExpandido] = useState(false);
    const [usuarios, setUsuarios] = useState<UsuarioEmpresa[] | null>(null);
    const [carregandoUsuarios, setCarregandoUsuarios] = useState(false);
    const [modulosPendentes, setModulosPendentes] = useState<EmpresaModulo[]>(empresa.modulosHabilitados);
    const [salvandoModulo, setSalvandoModulo] = useState(false);
    const [editandoNome, setEditandoNome] = useState(false);
    const [nomeRascunho, setNomeRascunho] = useState(empresa.nome);
    const [salvandoNome, setSalvandoNome] = useState(false);

    useEffect(() => {
        setNomeRascunho(empresa.nome);
    }, [empresa.nome]);

    // Se a lista vinda do servidor mudar (ex.: depois de recarregar a
    // página), realinha o rascunho local com o que está salvo.
    useEffect(() => {
        setModulosPendentes(empresa.modulosHabilitados);
    }, [empresa.modulosHabilitados]);

    const mesmosItens = (a: EmpresaModulo[], b: EmpresaModulo[]) =>
        a.length === b.length && a.every((x) => b.includes(x));
    const modulosMudaram = !mesmosItens(modulosPendentes, empresa.modulosHabilitados);

    async function carregarUsuarios() {
        try {
            setCarregandoUsuarios(true);
            const res = await api.get(`/admin/empresas/${empresa.id}/usuarios`);
            setUsuarios(res.data ?? []);
        } catch {
            setUsuarios([]);
        } finally {
            setCarregandoUsuarios(false);
        }
    }

    function alternarExpandido() {
        const vaiAbrir = !expandido;
        setExpandido(vaiAbrir);
        if (vaiAbrir && usuarios === null) carregarUsuarios();
    }

    async function atualizarEmpresa(dados: Partial<Empresa>) {
        await api.patch(`/admin/empresas/${empresa.id}`, dados);
        onMudou();
    }

    async function salvarNome() {
        const nome = nomeRascunho.trim();

        if (!nome || nome === empresa.nome) {
            setEditandoNome(false);
            setNomeRascunho(empresa.nome);
            return;
        }

        try {
            setSalvandoNome(true);
            await atualizarEmpresa({ nome });
            setEditandoNome(false);
        } finally {
            setSalvandoNome(false);
        }
    }

    // Clicar só marca/desmarca localmente (fica destacado em vermelho na
    // hora) — não salva nada ainda. Só grava de fato quando clica em Salvar.
    function alternarModuloLocal(m: EmpresaModulo) {
        setModulosPendentes((atual) =>
            atual.includes(m) ? atual.filter((x) => x !== m) : [...atual, m],
        );
    }

    async function salvarModulos() {
        try {
            setSalvandoModulo(true);
            await atualizarEmpresa({ modulosHabilitados: modulosPendentes });
            // Recarrega a página pra confirmar visualmente que o menu lateral
            // (e o resto do app) já reflete os módulos recém-salvos.
            window.location.reload();
        } finally {
            setSalvandoModulo(false);
        }
    }

    async function alternarUsuarioAtivo(u: UsuarioEmpresa) {
        await api.patch(`/admin/usuarios/${u.id}`, { ativo: !u.ativo });
        carregarUsuarios();
    }

    return (
        <div className="bg-white dark:bg-[#111827] rounded-2xl shadow border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="w-full flex items-center justify-between gap-3 p-4">
                <div onClick={alternarExpandido} className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                        <Building2 size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                        {editandoNome ? (
                            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <input
                                    type="text"
                                    value={nomeRascunho}
                                    onChange={(e) => setNomeRascunho(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && salvarNome()}
                                    disabled={salvandoNome}
                                    autoFocus
                                    className="px-2 py-1 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white w-48"
                                />
                                <button
                                    onClick={salvarNome}
                                    disabled={salvandoNome}
                                    className="text-xs px-2 py-1 rounded-lg bg-[#E30613] text-white font-medium hover:bg-red-700 disabled:opacity-50 transition"
                                >
                                    {salvandoNome ? '...' : 'Salvar'}
                                </button>
                                <button
                                    onClick={() => { setEditandoNome(false); setNomeRascunho(empresa.nome); }}
                                    disabled={salvandoNome}
                                    className="text-xs px-2 py-1 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                                >
                                    Cancelar
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{empresa.nome}</p>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setEditandoNome(true); }}
                                    className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition shrink-0"
                                    title="Editar nome"
                                >
                                    <Pencil size={13} />
                                </button>
                            </div>
                        )}
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                            {empresa.email} · {empresa.totalUsuarios} login(s)
                        </p>
                    </div>
                </div>

                <button onClick={alternarExpandido} className="flex items-center gap-2 shrink-0">
                    {!empresa.ativo && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400">
                            Inativa
                        </span>
                    )}
                    {expandido ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                </button>
            </div>

            {expandido && (
                <div className="border-t border-gray-100 dark:border-gray-800 p-4 pt-4 space-y-4">
                    <div className="flex flex-wrap gap-2">
                        <Toggle
                            ativo={empresa.ativo}
                            onToggle={() => atualizarEmpresa({ ativo: !empresa.ativo })}
                            labelOn="Ativa"
                            labelOff="Inativa — sem acesso"
                        />
                        <Toggle
                            ativo={empresa.pagamentoEmDia}
                            onToggle={() => atualizarEmpresa({ pagamentoEmDia: !empresa.pagamentoEmDia })}
                            labelOn="Pagamento em dia"
                            labelOff="Pagamento atrasado"
                            corOn="blue"
                        />
                    </div>

                    <div>
                        <p className={labelClasse}>Módulos habilitados</p>
                        <div className="flex flex-wrap gap-2">
                            {TODOS_MODULOS.map((m) => {
                                const ligado = modulosPendentes.includes(m.valor);
                                return (
                                    <button
                                        key={m.valor}
                                        disabled={salvandoModulo}
                                        onClick={() => alternarModuloLocal(m.valor)}
                                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition disabled:opacity-50 ${ligado
                                            ? 'border-[#E30613] bg-[#E30613]/10 text-[#E30613]'
                                            : 'border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400'
                                            }`}
                                    >
                                        {m.nome}
                                    </button>
                                );
                            })}
                        </div>

                        {modulosMudaram && (
                            <div className="flex items-center gap-2 mt-3">
                                <button
                                    onClick={salvarModulos}
                                    disabled={salvandoModulo}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#E30613] text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50 transition"
                                >
                                    {salvandoModulo && <Loader2 size={12} className="animate-spin" />}
                                    {salvandoModulo ? 'Salvando...' : 'Salvar módulos'}
                                </button>
                                <button
                                    onClick={() => setModulosPendentes(empresa.modulosHabilitados)}
                                    disabled={salvandoModulo}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                            </div>
                        )}
                    </div>

                    <div>
                        <p className={`${labelClasse} flex items-center gap-1.5`}>
                            <Users size={12} />
                            Logins dessa empresa
                        </p>

                        {carregandoUsuarios ? (
                            <p className="text-sm text-gray-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Carregando...</p>
                        ) : (
                            <div className="space-y-1.5 mb-3">
                                {(usuarios ?? []).length === 0 && (
                                    <p className="text-sm text-gray-400">Nenhum login criado ainda.</p>
                                )}
                                {(usuarios ?? []).map((u) => (
                                    <div key={u.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-900/40 text-sm">
                                        <div className="min-w-0">
                                            <p className="text-gray-900 dark:text-white truncate">{u.nome || u.email}</p>
                                            {u.nome && <p className="text-xs text-gray-400 truncate">{u.email}</p>}
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {u.isAdminMaster && (
                                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400">
                                                    Admin
                                                </span>
                                            )}
                                            <Toggle ativo={u.ativo} onToggle={() => alternarUsuarioAtivo(u)} labelOn="Ativo" labelOff="Inativo" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <NovoUsuarioForm empresaId={empresa.id} onCriado={carregarUsuarios} />
                    </div>
                </div>
            )}
        </div>
    );
}

export function Admin() {
    const { usuario } = useAuth();
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [modalAberto, setModalAberto] = useState(false);

    async function carregar() {
        try {
            setCarregando(true);
            const res = await api.get('/admin/empresas');
            setEmpresas(res.data ?? []);
        } catch {
            setEmpresas([]);
        } finally {
            setCarregando(false);
        }
    }

    useEffect(() => {
        carregar();
    }, []);

    if (!usuario?.isAdminMaster) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                <ShieldAlert size={32} className="text-gray-300 dark:text-gray-700" />
                <p className="text-gray-500 dark:text-gray-400">
                    Essa área é restrita ao administrador do sistema.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Administração</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Empresas que usam o sistema, módulos habilitados, status de pagamento e logins.
                    </p>
                </div>

                <button
                    onClick={() => setModalAberto(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#E30613] text-white text-sm font-medium hover:bg-red-700 transition"
                >
                    <Plus size={16} />
                    Nova Empresa
                </button>
            </div>

            {carregando ? (
                <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>
            ) : empresas.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">Nenhuma empresa cadastrada ainda.</p>
            ) : (
                <div className="space-y-3">
                    {empresas.map((e) => (
                        <EmpresaCard key={e.id} empresa={e} onMudou={carregar} />
                    ))}
                </div>
            )}

            {modalAberto && (
                <NovaEmpresaModal onClose={() => setModalAberto(false)} onCriada={carregar} />
            )}
        </div>
    );
}
