import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Inbox, Loader2, Mail, MessageCircle, PauseCircle, PlayCircle, RefreshCw, Unplug, XCircle } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

// =============================================================================
// Financeiro → Recebimento automático. Liga o WhatsApp do financeiro (QR code)
// e o robô do e-mail dos boletos. Tudo que chega vira pendência em
// "Lançar contas" (boleto/nota) ou "Registrar pagamentos" (comprovante).
// =============================================================================

type Integ = { ativo: boolean; destaEmpresa: boolean; ultimoEvento: string | null; ultimoErro: string | null } | null;
type Status = {
    whatsapp: { configurado: boolean; estado: string; numero: string | null; erro?: string; integracao: Integ };
    email: { configurado: boolean; caixa: string | null; integracao: Integ };
    ultimas: {
        id: string; canal: 'WHATSAPP' | 'EMAIL'; remetente: string | null; nomeRemetente: string | null; assunto: string | null;
        arquivoNome: string | null; tipo: 'BOLETO_NOTA' | 'COMPROVANTE'; status: 'OK' | 'DUPLICADO' | 'ERRO'; mensagem: string | null; createdAt: string;
    }[];
};

const cartao = 'bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-2xl p-5';
const botao = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50';
const quando = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const erroMsg = (e: any, p: string) => e?.response?.data?.message ?? p;

const ESTADO: Record<string, { txt: string; cor: string }> = {
    open: { txt: 'Conectado', cor: 'bg-emerald-100 text-emerald-800' },
    connecting: { txt: 'Aguardando leitura do QR code', cor: 'bg-amber-100 text-amber-800' },
    close: { txt: 'Desconectado', cor: 'bg-gray-100 text-gray-700' },
    nao_criada: { txt: 'Ainda não conectado', cor: 'bg-gray-100 text-gray-700' },
    sem_configuracao: { txt: 'Falta configurar no servidor', cor: 'bg-red-100 text-red-700' },
    erro: { txt: 'Serviço do WhatsApp fora do ar', cor: 'bg-red-100 text-red-700' },
};

export function RecebimentoAutomatico() {
    const { usuario } = useAuth();
    const admin = !!usuario?.isAdminMaster || usuario?.perfil === 'ADMIN';
    const [st, setSt] = useState<Status | null>(null);
    const [qr, setQr] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);

    const carregar = useCallback(async () => {
        const r = await api.get('/financeiro-nf/recebimento-automatico');
        setSt(r.data);
        if (r.data?.whatsapp?.estado === 'open') setQr(null);
    }, []);
    useEffect(() => { carregar().catch(() => setSt(null)); }, [carregar]);

    // Enquanto o QR está na tela, confere a cada 4s se já conectou (e renova o QR).
    useEffect(() => {
        if (!qr) return;
        const t = setInterval(() => { carregar().catch(() => { }); }, 4000);
        return () => clearInterval(t);
    }, [qr, carregar]);

    async function acao(nome: string, fn: () => Promise<void>) {
        setOcupado(nome); setAviso(null);
        try { await fn(); } catch (e: any) { setAviso(erroMsg(e, 'Não foi possível concluir.')); } finally { setOcupado(null); }
    }

    if (!st) return <div className="py-16 text-center text-gray-500"><Loader2 className="inline animate-spin" /> Carregando…</div>;
    const wa = st.whatsapp, em = st.email;
    const est = ESTADO[wa.estado] ?? ESTADO.close;

    return (
        <div className="space-y-5">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Recebimento automático</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Boletos, notas e comprovantes que chegam pelo <b>WhatsApp do financeiro</b> ou pelo <b>e-mail dos boletos</b> entram sozinhos no sistema — e ficam esperando alguém conferir:
                    boleto/nota em <Link to="/financeiro-nf/lancar-contas" className="text-blue-600 hover:underline">Lançar contas</Link>,
                    comprovante em <Link to="/financeiro-nf/conta-paga" className="text-blue-600 hover:underline">Registrar pagamentos</Link>.
                </p>
            </div>
            {aviso && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-500/10 px-4 py-2 text-sm text-red-700 dark:text-red-300">{aviso}</div>}

            <div className="grid lg:grid-cols-2 gap-4">
                {/* WhatsApp */}
                <div className={`${cartao} space-y-3`}>
                    <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><MessageCircle size={18} className="text-emerald-600" /> WhatsApp do financeiro</p>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${est.cor}`}>{est.txt}</span>
                    </div>
                    {wa.numero && <p className="text-sm text-gray-700 dark:text-gray-200">Número: <b>+{wa.numero}</b></p>}
                    {wa.integracao && <p className="text-xs text-gray-500">Última mensagem tratada: {quando(wa.integracao.ultimoEvento)}{wa.integracao.ativo ? '' : ' · PAUSADO'}{wa.integracao.ultimoErro ? ` · erro: ${wa.integracao.ultimoErro}` : ''}</p>}
                    {!wa.configurado && (
                        <p className="text-sm text-gray-600 dark:text-gray-300">Falta subir o serviço do WhatsApp no servidor: defina <code>EVOLUTION_API_KEY</code> no <code>.env</code> e rode <code>docker compose up -d --build</code>.</p>
                    )}
                    {qr && (
                        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 flex flex-col sm:flex-row gap-4 items-center">
                            <img src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`} alt="QR code do WhatsApp" className="w-56 h-56 bg-white rounded-lg" />
                            <ol className="text-sm text-gray-600 dark:text-gray-300 list-decimal pl-5 space-y-1">
                                <li>No celular do <b>número novo</b>, abra o WhatsApp.</li>
                                <li>Toque em <b>⋮ → Dispositivos conectados → Conectar dispositivo</b>.</li>
                                <li>Aponte a câmera para este QR code.</li>
                                <li>Esta tela muda para <b>Conectado</b> sozinha.</li>
                            </ol>
                        </div>
                    )}
                    {admin && wa.configurado && (
                        <div className="flex flex-wrap gap-2">
                            {wa.estado !== 'open' && (
                                <button disabled={!!ocupado} onClick={() => acao('wa', async () => { const r = await api.post('/financeiro-nf/recebimento-automatico/whatsapp/conectar'); setQr(r.data?.qr ?? null); await carregar(); })}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white disabled:opacity-50">
                                    {ocupado === 'wa' ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />} {qr ? 'Gerar novo QR code' : 'Conectar (mostrar QR code)'}
                                </button>
                            )}
                            {wa.estado === 'open' && (
                                <button disabled={!!ocupado} onClick={() => acao('wa-reconf', async () => { await api.post('/financeiro-nf/recebimento-automatico/whatsapp/conectar'); await carregar(); setAviso(null); })} className={botao} title="Reaponta o recebimento para esta empresa">
                                    <RefreshCw size={15} /> Reconfigurar
                                </button>
                            )}
                            {wa.integracao && (
                                <button disabled={!!ocupado} onClick={() => acao('wa-pausa', async () => { await api.post('/financeiro-nf/recebimento-automatico/whatsapp/pausar', { ativo: !wa.integracao!.ativo }); await carregar(); })} className={botao}>
                                    {wa.integracao.ativo ? <><PauseCircle size={15} /> Pausar</> : <><PlayCircle size={15} /> Retomar</>}
                                </button>
                            )}
                            {wa.estado === 'open' && (
                                <button disabled={!!ocupado} onClick={() => acao('wa-sair', async () => { if (!confirm('Desconectar o WhatsApp? Para voltar será preciso ler o QR code de novo.')) return; await api.post('/financeiro-nf/recebimento-automatico/whatsapp/desconectar'); await carregar(); })} className={`${botao} !text-red-600`}>
                                    <Unplug size={15} /> Desconectar
                                </button>
                            )}
                        </div>
                    )}
                    <p className="text-xs text-gray-500">
                        Cada PDF ou foto recebido é registrado e a pessoa recebe uma resposta confirmando. Foto sem legenda vira <b>comprovante</b>; escrevendo &quot;boleto&quot; ou &quot;nota&quot; na legenda, vira conta a lançar.
                        Grupos são ignorados. Integração não oficial: se o WhatsApp desconectar, é só ler o QR code de novo.
                    </p>
                </div>

                {/* E-mail */}
                <div className={`${cartao} space-y-3`}>
                    <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Mail size={18} className="text-blue-600" /> E-mail dos boletos</p>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${!em.configurado ? 'bg-red-100 text-red-700' : em.integracao?.ativo ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'}`}>
                            {!em.configurado ? 'Falta configurar no servidor' : em.integracao?.ativo ? 'Ativo (a cada 5 min)' : 'Desligado'}
                        </span>
                    </div>
                    {em.caixa && <p className="text-sm text-gray-700 dark:text-gray-200">Caixa: <b>{em.caixa}</b></p>}
                    {em.integracao && <p className="text-xs text-gray-500">Última leitura: {quando(em.integracao.ultimoEvento)}{em.integracao.ultimoErro ? ` · erro: ${em.integracao.ultimoErro}` : ''}</p>}
                    {!em.configurado && (
                        <p className="text-sm text-gray-600 dark:text-gray-300">Defina no <code>.env</code> do servidor: <code>IMAP_HOST=imap.hostinger.com</code>, <code>IMAP_USER</code> (o e-mail) e <code>IMAP_PASS</code> (a senha da caixa) e rode <code>docker compose up -d --build</code>.</p>
                    )}
                    {admin && em.configurado && (
                        <div className="flex flex-wrap gap-2">
                            <button disabled={!!ocupado} onClick={() => acao('em-ativo', async () => { await api.post('/financeiro-nf/recebimento-automatico/email/ativar', { ativo: !em.integracao?.ativo }); await carregar(); })}
                                className={em.integracao?.ativo ? botao : 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white disabled:opacity-50'}>
                                {em.integracao?.ativo ? <><PauseCircle size={15} /> Desligar</> : <><PlayCircle size={15} /> Ligar</>}
                            </button>
                            {em.integracao?.ativo && (
                                <button disabled={!!ocupado} onClick={() => acao('em-ler', async () => {
                                    const r = await api.post('/financeiro-nf/recebimento-automatico/email/verificar');
                                    setAviso(r.data.ok ? null : r.data.erro);
                                    if (r.data.ok) alert(`${r.data.emails} e-mail(s) lido(s), ${r.data.anexos} anexo(s) registrado(s).`);
                                    await carregar();
                                })} className={botao}>
                                    {ocupado === 'em-ler' ? <Loader2 size={15} className="animate-spin" /> : <Inbox size={15} />} Ler a caixa agora
                                </button>
                            )}
                        </div>
                    )}
                    <p className="text-xs text-gray-500">Lê os e-mails <b>não lidos</b>, pega os anexos (PDF, XML de nota ou foto), registra e marca o e-mail como lido. Logo/assinatura do e-mail é ignorada.</p>
                </div>
            </div>

            <div className={`${cartao} !p-0 overflow-x-auto`}>
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800">
                    <p className="font-semibold text-gray-900 dark:text-white">Últimos recebidos</p>
                    <button onClick={() => carregar()} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"><RefreshCw size={12} /> Atualizar</button>
                </div>
                <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-gray-500">
                        <tr><th className="px-5 py-2">Quando</th><th className="px-3 py-2">De</th><th className="px-3 py-2">Arquivo</th><th className="px-3 py-2">Virou</th><th className="px-3 py-2">Resultado</th></tr>
                    </thead>
                    <tbody>
                        {st.ultimas.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-500">Nada recebido ainda.</td></tr>}
                        {st.ultimas.map((u) => (
                            <tr key={u.id} className="border-t border-gray-100 dark:border-gray-800 align-top">
                                <td className="px-5 py-2 whitespace-nowrap text-gray-500">{quando(u.createdAt)}<div className="text-[11px]">{u.canal === 'WHATSAPP' ? 'WhatsApp' : 'E-mail'}</div></td>
                                <td className="px-3 py-2 text-gray-900 dark:text-white">{u.nomeRemetente || u.remetente || '—'}{u.nomeRemetente && u.remetente && <div className="text-[11px] text-gray-500">{u.remetente}</div>}</td>
                                <td className="px-3 py-2 text-gray-700 dark:text-gray-200 break-all">{u.arquivoNome ?? '—'}{u.assunto && <div className="text-[11px] text-gray-500">{u.assunto}</div>}</td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                    {u.tipo === 'COMPROVANTE'
                                        ? <Link to="/financeiro-nf/conta-paga" className="text-blue-600 hover:underline">Comprovante</Link>
                                        : <Link to="/financeiro-nf/lancar-contas" className="text-blue-600 hover:underline">Boleto / nota</Link>}
                                </td>
                                <td className="px-3 py-2">
                                    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${u.status === 'OK' ? 'text-emerald-600' : u.status === 'DUPLICADO' ? 'text-amber-600' : 'text-red-600'}`}>
                                        {u.status === 'OK' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                                        {u.status === 'OK' ? 'Registrado' : u.status === 'DUPLICADO' ? 'Já tinha sido enviado' : 'Erro'}
                                    </span>
                                    {u.mensagem && <div className="text-[11px] text-gray-500">{u.mensagem}</div>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
