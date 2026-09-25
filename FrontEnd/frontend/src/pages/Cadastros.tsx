import { useEffect, useRef, useState } from 'react';
import { Satellite, Info, Loader2, CheckCircle2, Pencil, Trash2, ShieldCheck, Upload, Users, Plus, X, ShieldAlert, Building2, Save } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

// =============================================================================
// Cadastros — ponto único pros cadastros de apoio do Financeiro/NF e da
// integração de rastreamento. Por enquanto só tem a aba Rastreador; as
// próximas fases (Fornecedor, Categoria de conta, Certificado digital)
// entram aqui como novas abas, no mesmo padrão da página Fiscal.
// =============================================================================

const campoClasse =
    'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400';
const labelClasse = 'text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1';

// =============================================================================
// Empresa (dados cadastrais + fiscais — usados pra emitir/consultar NF-e
// e NFS-e da própria empresa junto à Sefaz/ADN)
// =============================================================================

type DadosFiscaisEmpresa = {
    id: string;
    nome: string;
    email: string;
    cnpj: string | null;
    telefone: string | null;
    uf: string | null;
    logradouro: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    municipio: string | null;
    codigoMunicipioIbge: string | null;
    cep: string | null;
    inscricaoEstadual: string | null;
};

const formVazioEmpresa = {
    nome: '',
    cnpj: '',
    telefone: '',
    uf: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    municipio: '',
    codigoMunicipioIbge: '',
    cep: '',
    inscricaoEstadual: '',
};

function EmpresaTab() {
    const [empresa, setEmpresa] = useState<DadosFiscaisEmpresa | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [salvo, setSalvo] = useState(false);

    const [form, setForm] = useState(formVazioEmpresa);

    async function carregar() {
        setCarregando(true);
        try {
            const res = await api.get('/financeiro-nf/empresa');
            const dados: DadosFiscaisEmpresa = res.data;
            setEmpresa(dados);
            setForm({
                nome: dados.nome || '',
                cnpj: dados.cnpj || '',
                telefone: dados.telefone || '',
                uf: dados.uf || '',
                logradouro: dados.logradouro || '',
                numero: dados.numero || '',
                complemento: dados.complemento || '',
                bairro: dados.bairro || '',
                municipio: dados.municipio || '',
                codigoMunicipioIbge: dados.codigoMunicipioIbge || '',
                cep: dados.cep || '',
                inscricaoEstadual: dados.inscricaoEstadual || '',
            });
        } catch {
            setErro('Não foi possível carregar os dados da empresa.');
        } finally {
            setCarregando(false);
        }
    }

    useEffect(() => {
        carregar();
    }, []);

    async function salvar() {
        if (!form.nome.trim()) {
            setErro('Informe o nome da empresa.');
            return;
        }

        setSalvando(true);
        setErro(null);
        setSalvo(false);
        try {
            const res = await api.patch('/financeiro-nf/empresa', form);
            setEmpresa(res.data);
            setSalvo(true);
            setTimeout(() => setSalvo(false), 2500);
        } catch (e: any) {
            setErro(e?.response?.data?.message || 'Não foi possível salvar os dados da empresa.');
        } finally {
            setSalvando(false);
        }
    }

    if (carregando) {
        return <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>;
    }

    return (
        <div className="space-y-5 max-w-2xl">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-sm text-blue-800 dark:text-blue-300">
                <Info size={16} className="shrink-0 mt-0.5" />
                <p>
                    Esses dados são usados para emitir e consultar notas fiscais da
                    empresa junto à Sefaz (NF-e de compra e NFS-e de serviço). Sem UF,
                    Município e CNPJ preenchidos, a busca automática de notas pode
                    ficar limitada.
                </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 space-y-5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0">
                        <Building2 size={18} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{empresa?.nome}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{empresa?.email}</p>
                    </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                        <label className={labelClasse}>Nome *</label>
                        <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={campoClasse} />
                    </div>
                    <div>
                        <label className={labelClasse}>CNPJ</label>
                        <input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} className={campoClasse} placeholder="Só números" />
                    </div>
                    <div>
                        <label className={labelClasse}>Telefone</label>
                        <input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className={campoClasse} />
                    </div>
                    <div>
                        <label className={labelClasse}>Inscrição Estadual</label>
                        <input value={form.inscricaoEstadual} onChange={(e) => setForm({ ...form, inscricaoEstadual: e.target.value })} className={campoClasse} placeholder="Ou deixe em branco se isento" />
                    </div>
                </div>

                <div className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Endereço</h3>

                    <div className="grid sm:grid-cols-4 gap-3">
                        <div>
                            <label className={labelClasse}>UF</label>
                            <input
                                value={form.uf}
                                maxLength={2}
                                placeholder="Ex: SP, MG"
                                onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })}
                                className={campoClasse}
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <label className={labelClasse}>Município</label>
                            <input value={form.municipio} onChange={(e) => setForm({ ...form, municipio: e.target.value })} className={campoClasse} />
                        </div>
                        <div>
                            <label className={labelClasse}>Código IBGE do município</label>
                            <input value={form.codigoMunicipioIbge} onChange={(e) => setForm({ ...form, codigoMunicipioIbge: e.target.value })} className={campoClasse} placeholder="Ex: 3106200" />
                        </div>
                    </div>

                    <div className="grid sm:grid-cols-4 gap-3">
                        <div className="sm:col-span-2">
                            <label className={labelClasse}>Logradouro</label>
                            <input value={form.logradouro} onChange={(e) => setForm({ ...form, logradouro: e.target.value })} className={campoClasse} />
                        </div>
                        <div>
                            <label className={labelClasse}>Número</label>
                            <input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className={campoClasse} />
                        </div>
                        <div>
                            <label className={labelClasse}>Complemento</label>
                            <input value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} className={campoClasse} />
                        </div>
                    </div>

                    <div className="grid sm:grid-cols-4 gap-3">
                        <div className="sm:col-span-2">
                            <label className={labelClasse}>Bairro</label>
                            <input value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} className={campoClasse} />
                        </div>
                        <div>
                            <label className={labelClasse}>CEP</label>
                            <input value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} className={campoClasse} />
                        </div>
                    </div>
                </div>

                {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

                <div className="flex items-center justify-end gap-3 pt-2">
                    {salvo && (
                        <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                            <CheckCircle2 size={14} />
                            Salvo
                        </span>
                    )}
                    <button
                        onClick={salvar}
                        disabled={salvando}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                    >
                        {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Salvar
                    </button>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// Rastreador (Trucks Control)
// =============================================================================

type CredencialTrucksControl = {
    configurado: boolean;
    login: string | null;
    ativo: boolean;
};

function RastreadorTab() {
    const [credencial, setCredencial] = useState<CredencialTrucksControl | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [editando, setEditando] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [alternando, setAlternando] = useState(false);
    const [removendo, setRemovendo] = useState(false);

    const [login, setLogin] = useState('');
    const [senha, setSenha] = useState('');

    async function carregar() {
        setCarregando(true);
        try {
            const res = await api.get('/trucks-control/credencial');
            const dados: CredencialTrucksControl = res.data;
            setCredencial(dados);
            setEditando(!dados.configurado);
        } catch {
            setCredencial({ configurado: false, login: null, ativo: false });
            setEditando(true);
        } finally {
            setCarregando(false);
        }
    }

    useEffect(() => {
        carregar();
    }, []);

    async function salvar() {
        if (!login.trim() || !senha.trim()) return;
        setSalvando(true);
        try {
            await api.put('/trucks-control/credencial', { login: login.trim(), senha: senha.trim() });
            setSenha('');
            setEditando(false);
            carregar();
        } catch (e: any) {
            alert(e?.response?.data?.message || 'Não foi possível salvar a credencial.');
        } finally {
            setSalvando(false);
        }
    }

    async function alternarAtivo(ativo: boolean) {
        setAlternando(true);
        try {
            await api.patch('/trucks-control/credencial/ativo', { ativo });
            carregar();
        } catch {
            alert('Não foi possível alterar o status da credencial.');
        } finally {
            setAlternando(false);
        }
    }

    async function remover() {
        if (!confirm('Remover a credencial da Trucks Control? A empresa vai parar de receber localização dos caminhões até cadastrar de novo.')) return;
        setRemovendo(true);
        try {
            await api.delete('/trucks-control/credencial');
            setLogin('');
            setSenha('');
            carregar();
        } catch {
            alert('Não foi possível remover a credencial.');
        } finally {
            setRemovendo(false);
        }
    }

    if (carregando) {
        return <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>;
    }

    return (
        <div className="space-y-5 max-w-xl">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-sm text-blue-800 dark:text-blue-300">
                <Info size={16} className="shrink-0 mt-0.5" />
                <p>
                    Login e senha da conta desta empresa na Trucks Control (rastreador
                    GPS). Cada empresa tem sua própria conta — os caminhões encontrados
                    aparecem automaticamente aqui no sistema, vinculados só a essa
                    empresa. A senha fica cifrada no banco e nunca é exibida de volta.
                </p>
            </div>

            {credencial?.configurado && !editando && (
                <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                                <Satellite size={18} className="text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                                <p className="font-semibold text-gray-900 dark:text-white text-sm">{credencial.login}</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 tracking-widest">••••••••</p>
                                <p className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                    {credencial.ativo ? (
                                        <>
                                            <CheckCircle2 size={12} className="text-green-500" />
                                            Ativo — sincronizando normalmente
                                        </>
                                    ) : (
                                        'Pausado — não busca localização'
                                    )}
                                </p>
                            </div>
                        </div>

                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={credencial.ativo}
                                disabled={alternando}
                                onChange={(e) => alternarAtivo(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:bg-blue-600 transition-colors" />
                            <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
                        </label>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                        <button
                            onClick={() => {
                                // Trava de segurança: enquanto a credencial está
                                // ativa e funcionando, esse botão não abre o
                                // formulário direto — exige uma confirmação
                                // explícita (OK), porque editar aqui limpa a
                                // senha salva e para o rastreamento até alguém
                                // digitar uma nova.
                                if (
                                    credencial.ativo &&
                                    !confirm(
                                        'A credencial atual está ativa e funcionando. Trocar login/senha agora vai pausar o rastreamento até você salvar a nova credencial. Deseja continuar?',
                                    )
                                ) {
                                    return;
                                }
                                setLogin(credencial.login ?? '');
                                setEditando(true);
                            }}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                        >
                            <Pencil size={14} />
                            Trocar login/senha
                        </button>
                        <button
                            onClick={remover}
                            disabled={removendo}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition disabled:opacity-50"
                        >
                            {removendo ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            Remover
                        </button>
                    </div>
                </div>
            )}

            {editando && (
                <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 space-y-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                        {credencial?.configurado ? 'Trocar login/senha' : 'Conectar conta da Trucks Control'}
                    </h3>

                    <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                            <label className={labelClasse}>Login *</label>
                            <input value={login} onChange={(e) => setLogin(e.target.value)} className={campoClasse} placeholder="Login da Trucks Control" autoComplete="off" />
                        </div>
                        <div>
                            <label className={labelClasse}>Senha *</label>
                            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} className={campoClasse} placeholder="Senha da Trucks Control" autoComplete="new-password" />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        {credencial?.configurado && (
                            <button
                                onClick={() => { setEditando(false); setLogin(''); setSenha(''); }}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                            >
                                Cancelar
                            </button>
                        )}
                        <button
                            onClick={salvar}
                            disabled={salvando || !login.trim() || !senha.trim()}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                        >
                            {salvando && <Loader2 size={14} className="animate-spin" />}
                            Salvar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// =============================================================================
// Certificado Digital (e-CNPJ, usado na Sefaz/ADN pra buscar NF-e/NFS-e)
// =============================================================================

type StatusCertificado = {
    possuiCertificado: boolean;
    nomeArquivo: string | null;
    atualizadoEm: string | null;
    nfeBloqueadoAte: string | null;
    nfseBloqueadoAte: string | null;
};

function CertificadoDigitalTab() {
    const [status, setStatus] = useState<StatusCertificado | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [editando, setEditando] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [removendo, setRemovendo] = useState(false);

    const [senha, setSenha] = useState('');
    const [arquivo, setArquivo] = useState<File | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    async function carregar() {
        setCarregando(true);
        try {
            const res = await api.get('/financeiro-nf/certificado');
            const dados: StatusCertificado = res.data;
            setStatus(dados);
            setEditando(!dados.possuiCertificado);
        } catch {
            setStatus({ possuiCertificado: false, nomeArquivo: null, atualizadoEm: null, nfeBloqueadoAte: null, nfseBloqueadoAte: null });
            setEditando(true);
        } finally {
            setCarregando(false);
        }
    }

    useEffect(() => {
        carregar();
    }, []);

    async function enviar() {
        if (!arquivo || !senha.trim()) return;
        setEnviando(true);
        try {
            const form = new FormData();
            form.append('file', arquivo);
            form.append('senha', senha.trim());
            await api.post('/financeiro-nf/certificado', form, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setSenha('');
            setArquivo(null);
            if (inputRef.current) inputRef.current.value = '';
            setEditando(false);
            carregar();
        } catch (e: any) {
            alert(e?.response?.data?.message || 'Não foi possível salvar o certificado.');
        } finally {
            setEnviando(false);
        }
    }

    async function remover() {
        if (!confirm('Remover o certificado digital? A busca automática de NF-e/NFS-e para desta empresa vai parar até cadastrar de novo.')) return;
        setRemovendo(true);
        try {
            await api.delete('/financeiro-nf/certificado');
            carregar();
        } catch {
            alert('Não foi possível remover o certificado.');
        } finally {
            setRemovendo(false);
        }
    }

    if (carregando) {
        return <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>;
    }

    return (
        <div className="space-y-5 max-w-xl">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-sm text-blue-800 dark:text-blue-300">
                <Info size={16} className="shrink-0 mt-0.5" />
                <p>
                    Certificado digital (e-CNPJ, arquivo .pfx ou .p12) desta empresa —
                    usado pra buscar automaticamente as NF-e de compra e NFS-e de
                    serviço direto na Sefaz/ADN. A senha fica cifrada no banco e nunca é
                    exibida de volta; o arquivo fica guardado fora de qualquer pasta
                    pública.
                </p>
            </div>

            {status?.possuiCertificado && !editando && (
                <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                                <ShieldCheck size={18} className="text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                                <p className="font-semibold text-gray-900 dark:text-white text-sm">{status.nomeArquivo}</p>
                                <p className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                                    <CheckCircle2 size={12} className="text-green-500" />
                                    {status.atualizadoEm ? `Enviado em ${new Date(status.atualizadoEm).toLocaleDateString('pt-BR')}` : 'Cadastrado'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {(status.nfeBloqueadoAte || status.nfseBloqueadoAte) && (
                        <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg p-3">
                            {status.nfeBloqueadoAte && <p>NF-e de compra: aguardando até {new Date(status.nfeBloqueadoAte).toLocaleString('pt-BR')} antes de tentar de novo.</p>}
                            {status.nfseBloqueadoAte && <p>NFS-e de serviço: aguardando até {new Date(status.nfseBloqueadoAte).toLocaleString('pt-BR')} antes de tentar de novo.</p>}
                        </div>
                    )}

                    <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                        <button
                            onClick={() => setEditando(true)}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                        >
                            <Pencil size={14} />
                            Trocar certificado
                        </button>
                        <button
                            onClick={remover}
                            disabled={removendo}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition disabled:opacity-50"
                        >
                            {removendo ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            Remover
                        </button>
                    </div>
                </div>
            )}

            {editando && (
                <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 space-y-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                        {status?.possuiCertificado ? 'Trocar certificado' : 'Cadastrar certificado digital'}
                    </h3>

                    <div>
                        <label className={labelClasse}>Arquivo (.pfx ou .p12) *</label>
                        <label className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-dashed border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 cursor-pointer hover:border-blue-400 transition">
                            <Upload size={14} />
                            {arquivo ? arquivo.name : 'Selecionar arquivo...'}
                            <input
                                ref={inputRef}
                                type="file"
                                accept=".pfx,.p12"
                                className="hidden"
                                onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                            />
                        </label>
                    </div>

                    <div>
                        <label className={labelClasse}>Senha do certificado *</label>
                        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} className={campoClasse} placeholder="Senha do certificado" autoComplete="new-password" />
                    </div>

                    <div className="flex justify-end gap-2">
                        {status?.possuiCertificado && (
                            <button
                                onClick={() => { setEditando(false); setSenha(''); setArquivo(null); if (inputRef.current) inputRef.current.value = ''; }}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                            >
                                Cancelar
                            </button>
                        )}
                        <button
                            onClick={enviar}
                            disabled={enviando || !arquivo || !senha.trim()}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                        >
                            {enviando && <Loader2 size={14} className="animate-spin" />}
                            Salvar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// =============================================================================
// Colaboradores (perfis por empresa: Admin/Proprietário/Funcionário)
// =============================================================================

type PerfilUsuario = 'ADMIN' | 'PROPRIETARIO' | 'FUNCIONARIO';

const PERFIS: { valor: PerfilUsuario; nome: string }[] = [
    { valor: 'ADMIN', nome: 'Admin' },
    { valor: 'PROPRIETARIO', nome: 'Proprietário' },
    { valor: 'FUNCIONARIO', nome: 'Funcionário' },
];

const nomePerfil: Record<PerfilUsuario, string> = {
    ADMIN: 'Admin',
    PROPRIETARIO: 'Proprietário',
    FUNCIONARIO: 'Funcionário',
};

type Colaborador = {
    id: string;
    nome: string | null;
    email: string;
    perfil: PerfilUsuario;
    ativo: boolean;
    isAdminMaster: boolean;
};

function NovoColaboradorForm({ onCriado }: { onCriado: () => void }) {
    const [aberto, setAberto] = useState(false);
    const [nome, setNome] = useState('');
    const [email, setEmail] = useState('');
    const [senha, setSenha] = useState('');
    const [perfil, setPerfil] = useState<PerfilUsuario>('FUNCIONARIO');
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
            await api.post('/usuarios', { nome: nome.trim() || undefined, email: email.trim(), senha, perfil });
            setNome('');
            setEmail('');
            setSenha('');
            setPerfil('FUNCIONARIO');
            setAberto(false);
            onCriado();
        } catch (e: any) {
            setErro(e?.response?.data?.message ?? 'Erro ao criar colaborador.');
        } finally {
            setSalvando(false);
        }
    }

    if (!aberto) {
        return (
            <button
                onClick={() => setAberto(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#E30613] text-white text-sm font-medium hover:bg-red-700 transition"
            >
                <Plus size={16} />
                Novo Colaborador
            </button>
        );
    }

    return (
        <div className="p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111827] space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Novo Colaborador</h3>
                <button onClick={() => setAberto(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
                    <X size={16} />
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" className={campoClasse} />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail de login" className={campoClasse} />
                <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Senha (mín. 6)" className={campoClasse} />
                <select value={perfil} onChange={(e) => setPerfil(e.target.value as PerfilUsuario)} className={campoClasse}>
                    {PERFIS.map((p) => (
                        <option key={p.valor} value={p.valor}>{p.nome}</option>
                    ))}
                </select>
            </div>

            {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

            <button
                onClick={salvar}
                disabled={salvando}
                className="px-4 py-2 rounded-lg bg-[#E30613] text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition"
            >
                {salvando ? 'Criando...' : 'Criar colaborador'}
            </button>
        </div>
    );
}

function ColaboradorLinha({ colaborador, onMudou }: { colaborador: Colaborador; onMudou: () => void }) {
    const [editandoPerfil, setEditandoPerfil] = useState(false);
    const [salvando, setSalvando] = useState(false);

    async function alternarAtivo() {
        setSalvando(true);
        try {
            await api.patch(`/usuarios/${colaborador.id}`, { ativo: !colaborador.ativo });
            onMudou();
        } finally {
            setSalvando(false);
        }
    }

    async function mudarPerfil(perfil: PerfilUsuario) {
        setSalvando(true);
        try {
            await api.patch(`/usuarios/${colaborador.id}`, { perfil });
            setEditandoPerfil(false);
            onMudou();
        } finally {
            setSalvando(false);
        }
    }

    return (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-800/60 bg-gray-50 dark:bg-gray-900/40">
            <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                    {colaborador.nome || colaborador.email}
                    {colaborador.isAdminMaster && (
                        <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400">
                            Admin do sistema
                        </span>
                    )}
                </p>
                {colaborador.nome && <p className="text-xs text-gray-400 truncate">{colaborador.email}</p>}
            </div>

            {!colaborador.isAdminMaster && (
                <div className="flex items-center gap-2 shrink-0">
                    {editandoPerfil ? (
                        <select
                            defaultValue={colaborador.perfil}
                            onChange={(e) => mudarPerfil(e.target.value as PerfilUsuario)}
                            onBlur={() => setEditandoPerfil(false)}
                            disabled={salvando}
                            className="px-2 py-1 rounded-lg text-xs bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700"
                            autoFocus
                        >
                            {PERFIS.map((p) => (
                                <option key={p.valor} value={p.valor}>{p.nome}</option>
                            ))}
                        </select>
                    ) : (
                        <button
                            onClick={() => setEditandoPerfil(true)}
                            className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400 hover:opacity-80 transition"
                        >
                            {nomePerfil[colaborador.perfil]}
                        </button>
                    )}

                    <button
                        onClick={alternarAtivo}
                        disabled={salvando}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition disabled:opacity-50 ${colaborador.ativo
                            ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
                            }`}
                    >
                        {colaborador.ativo ? <CheckCircle2 size={12} /> : null}
                        {colaborador.ativo ? 'Ativo' : 'Inativo'}
                    </button>
                </div>
            )}
        </div>
    );
}

function ColaboradoresTab() {
    const { usuario } = useAuth();
    const podeGerenciar = usuario?.isAdminMaster || usuario?.perfil === 'ADMIN';

    const [colaboradores, setColaboradores] = useState<Colaborador[] | null>(null);
    const [carregando, setCarregando] = useState(true);

    async function carregar() {
        try {
            setCarregando(true);
            const res = await api.get('/usuarios');
            setColaboradores(res.data ?? []);
        } catch {
            setColaboradores([]);
        } finally {
            setCarregando(false);
        }
    }

    useEffect(() => {
        if (podeGerenciar) carregar();
        else setCarregando(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!podeGerenciar) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <ShieldAlert size={28} className="text-gray-300 dark:text-gray-700" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                    Só quem tem perfil Admin nessa empresa mexe nos colaboradores.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4 max-w-2xl">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-sm text-blue-800 dark:text-blue-300">
                <Info size={16} className="shrink-0 mt-0.5" />
                <p>
                    Logins do seu time nesse sistema. <strong>Admin</strong> pode gerenciar
                    outros colaboradores aqui; <strong>Proprietário</strong> e{' '}
                    <strong>Funcionário</strong> têm o mesmo acesso operacional às telas do
                    sistema, só não mexem nessa aba.
                </p>
            </div>

            <NovoColaboradorForm onCriado={carregar} />

            {carregando ? (
                <p className="text-sm text-gray-400 py-6 text-center">Carregando...</p>
            ) : (colaboradores ?? []).length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">Nenhum colaborador cadastrado ainda.</p>
            ) : (
                <div className="space-y-2">
                    {(colaboradores ?? []).map((c) => (
                        <ColaboradorLinha key={c.id} colaborador={c} onMudou={carregar} />
                    ))}
                </div>
            )}
        </div>
    );
}

// =============================================================================
// Página
// =============================================================================

type AbaCadastros = 'empresa' | 'rastreador' | 'certificado' | 'colaboradores';

export function Cadastros() {
    const [aba, setAba] = useState<AbaCadastros>('empresa');

    const abas: { id: AbaCadastros; nome: string; icone: any }[] = [
        { id: 'empresa', nome: 'Empresa', icone: Building2 },
        { id: 'rastreador', nome: 'Rastreador', icone: Satellite },
        { id: 'certificado', nome: 'Certificado Digital', icone: ShieldCheck },
        { id: 'colaboradores', nome: 'Colaboradores', icone: Users },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cadastros</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Cadastros de apoio da empresa — conexão com o rastreador GPS e,
                    futuramente, fornecedores e categorias do Financeiro.
                </p>
            </div>

            <div className="flex gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-900 w-fit overflow-x-auto max-w-full">
                {abas.map((a) => {
                    const Icone = a.icone;
                    const ativa = aba === a.id;
                    return (
                        <button
                            key={a.id}
                            onClick={() => setAba(a.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${ativa
                                ? 'bg-white dark:bg-[#111827] text-gray-900 dark:text-white shadow'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                }`}
                        >
                            <Icone size={16} />
                            {a.nome}
                        </button>
                    );
                })}
            </div>

            {aba === 'empresa' && <EmpresaTab />}
            {aba === 'rastreador' && <RastreadorTab />}
            {aba === 'certificado' && <CertificadoDigitalTab />}
            {aba === 'colaboradores' && <ColaboradoresTab />}
        </div>
    );
}
