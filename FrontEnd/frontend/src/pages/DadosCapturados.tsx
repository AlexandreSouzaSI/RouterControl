import { useEffect, useState } from 'react';
import {
    Database,
    Truck,
    MapPin,
    Route as RouteIcon,
    CalendarClock,
    ChevronDown,
    ChevronUp,
    RefreshCw,
    Info,
} from 'lucide-react';
import { api } from '../services/api';

// Mesma tabela de equipamentos do manual da Trucks Control — só pra
// mostrar um nome legível em vez do código numérico cru (eqp).
const EQUIPAMENTOS: Record<number, string> = {
    1: 'Satelite System',
    2: 'Hybrid System',
    3: 'Ligth GSM 1',
    4: 'Satelite Sky',
    6: 'Smart Hibrido',
    7: 'SpyTrack',
    8: 'Smart GSM',
    9: 'Slim GSM 1',
    10: 'Ligth GSM 2',
    11: 'Slim GSM 2',
    12: 'Trailer GSM System',
    13: 'Slim GSM 3',
    14: 'SpyTrack2',
    29: 'Rail Patrol',
    33: 'Slim GSM 4',
    35: 'Smart2 Hibrido',
    36: 'Smart 2 GSM',
    45: 'SmartMid Hibrido',
    46: 'SmartMid GSM',
    54: 'Connect Smart GSM',
    55: 'Connect Smart Híbrido',
};

type Veiculo = {
    veiID: number;
    placa: string | null;
    equipamento: number | null;
    motorista: string | null;
    proprietario: boolean | null;
    identificacao: string | null;
    chassi: string | null;
};

type Posicao = {
    id?: string;
    mId: number;
    veiId: number;
    placa: string | null;
    dataHora: string;
    latitude: number;
    longitude: number;
    municipio: string | null;
    uf: string | null;
    rua: string | null;
    rodovia: string | null;
    velocidade: number | null;
    motorista: string | null;
    litrosTanque: number | null;
    odometro: number | null;
    rpm: number | null;
};

type ViagemGps = {
    id: string;
    veiId: number;
    placa: string | null;
    origemMunicipio: string;
    origemUf: string | null;
    dataHoraInicio: string;
    destinoMunicipio: string | null;
    destinoUf: string | null;
    dataHoraFim: string | null;
    status: 'EM_ANDAMENTO' | 'CONCLUIDA';
};

type DiasParados = {
    mes: string;
    totalDiasParados: number;
    porVeiculo: { placa: string; diasParados: number }[];
};

function formatarDataISO(data: Date) {
    return data.toISOString().slice(0, 10);
}

function dataDiasAtras(dias: number) {
    const data = new Date();
    data.setDate(data.getDate() - dias);
    return formatarDataISO(data);
}

function Secao({
    titulo,
    subtitulo,
    icone: Icone,
    aberto,
    onToggle,
    acoes,
    children,
}: {
    titulo: string;
    subtitulo: string;
    icone: any;
    aberto: boolean;
    onToggle: () => void;
    acoes?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-2xl shadow overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between gap-3 p-5 text-left"
            >
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                        <Icone size={18} />
                    </div>

                    <div>
                        <h2 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base">
                            {titulo}
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {subtitulo}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {aberto ? (
                        <ChevronUp size={18} className="text-gray-400" />
                    ) : (
                        <ChevronDown size={18} className="text-gray-400" />
                    )}
                </div>
            </button>

            {aberto && (
                <div className="border-t border-gray-100 dark:border-gray-800 p-5 pt-4">
                    {acoes && <div className="mb-4">{acoes}</div>}
                    {children}
                </div>
            )}
        </div>
    );
}

function TabelaVazia({ texto }: { texto: string }) {
    return (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">
            {texto}
        </p>
    );
}

export function DadosCapturados() {
    const [abertas, setAbertas] = useState<Record<string, boolean>>({
        veiculos: true,
        posicoes: false,
        viagens: false,
        diasParados: false,
    });

    function toggle(chave: string) {
        setAbertas((s) => ({ ...s, [chave]: !s[chave] }));
    }

    // --- Veículos ---
    const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
    const [loadingVeiculos, setLoadingVeiculos] = useState(false);

    async function carregarVeiculos() {
        try {
            setLoadingVeiculos(true);
            const res = await api.get('/trucks-control/veiculos');
            setVeiculos(res.data?.veiculos ?? []);
        } catch {
            // silencioso — cada seção mostra "sem dados" se falhar
        } finally {
            setLoadingVeiculos(false);
        }
    }

    // --- Posições / histórico ---
    const [placaFiltro, setPlacaFiltro] = useState('');
    const [dataInicio, setDataInicio] = useState(() => dataDiasAtras(2));
    const [dataFim, setDataFim] = useState(() => formatarDataISO(new Date()));
    const [posicoes, setPosicoes] = useState<Posicao[]>([]);
    const [loadingPosicoes, setLoadingPosicoes] = useState(false);

    async function carregarPosicoes() {
        try {
            setLoadingPosicoes(true);
            const res = await api.get('/trucks-control/historico', {
                params: {
                    placa: placaFiltro || undefined,
                    dataInicio,
                    dataFim,
                },
            });
            setPosicoes(res.data?.posicoes ?? []);
        } catch {
            // idem
        } finally {
            setLoadingPosicoes(false);
        }
    }

    // --- Viagens GPS ---
    const [viagens, setViagens] = useState<ViagemGps[]>([]);
    const [loadingViagens, setLoadingViagens] = useState(false);

    async function carregarViagens() {
        try {
            setLoadingViagens(true);
            const res = await api.get('/trucks-control/viagens', {
                params: { limit: 100 },
            });
            setViagens(res.data ?? []);
        } catch {
            // idem
        } finally {
            setLoadingViagens(false);
        }
    }

    // --- Dias parados ---
    const [mesFiltro, setMesFiltro] = useState(() => {
        const agora = new Date();
        return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
    });
    const [diasParados, setDiasParados] = useState<DiasParados | null>(null);
    const [loadingDiasParados, setLoadingDiasParados] = useState(false);

    async function carregarDiasParados() {
        try {
            setLoadingDiasParados(true);
            const res = await api.get('/trucks-control/dias-parados', {
                params: { mes: mesFiltro },
            });
            setDiasParados(res.data ?? null);
        } catch {
            // idem
        } finally {
            setLoadingDiasParados(false);
        }
    }

    useEffect(() => {
        carregarVeiculos();
        carregarPosicoes();
        carregarViagens();
        carregarDiasParados();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Database size={22} className="text-blue-600 dark:text-blue-400" />
                    Dados Capturados
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Tudo que o sistema já recebe hoje da API da Trucks Control, cru —
                    base pra decidir o que ajustar em seguida.
                </p>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-sm text-blue-800 dark:text-blue-300">
                <Info size={16} className="shrink-0 mt-0.5" />
                <p>
                    Isso mostra tudo que o backend lê e grava hoje. Combustível
                    (litros no tanque), odômetro e RPM passaram a ser capturados a
                    partir de agora — pings salvos antes dessa mudança ficam com
                    esses três campos em branco, e mesmo os novos só vêm
                    preenchidos se o rastreador do veículo tiver o sensor
                    correspondente.
                </p>
            </div>

            {/* VEÍCULOS */}
            <Secao
                titulo="Veículos"
                subtitulo={`RequestVeiculo — cadastro/frota (${veiculos.length} veículo${veiculos.length === 1 ? '' : 's'})`}
                icone={Truck}
                aberto={abertas.veiculos}
                onToggle={() => toggle('veiculos')}
                acoes={
                    <button
                        onClick={carregarVeiculos}
                        disabled={loadingVeiculos}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-700 disabled:opacity-50 transition"
                    >
                        <RefreshCw size={12} className={loadingVeiculos ? 'animate-spin' : ''} />
                        Atualizar
                    </button>
                }
            >
                {veiculos.length === 0 ? (
                    <TabelaVazia texto="Nenhum veículo carregado." />
                ) : (
                    <div className="overflow-x-auto -mx-1">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-800">
                                    <th className="py-2 px-2 font-medium">veiID</th>
                                    <th className="py-2 px-2 font-medium">Placa</th>
                                    <th className="py-2 px-2 font-medium">Equipamento</th>
                                    <th className="py-2 px-2 font-medium">Motorista</th>
                                    <th className="py-2 px-2 font-medium">Proprietário</th>
                                    <th className="py-2 px-2 font-medium">Identificação</th>
                                    <th className="py-2 px-2 font-medium">Chassi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {veiculos.map((v) => (
                                    <tr
                                        key={v.veiID}
                                        className="border-b border-gray-50 dark:border-gray-800/60 text-gray-700 dark:text-gray-300"
                                    >
                                        <td className="py-2 px-2">{v.veiID}</td>
                                        <td className="py-2 px-2 font-semibold text-gray-900 dark:text-white">
                                            {v.placa ?? '-'}
                                        </td>
                                        <td className="py-2 px-2">
                                            {v.equipamento != null
                                                ? `${EQUIPAMENTOS[v.equipamento] ?? 'Desconhecido'} (${v.equipamento})`
                                                : '-'}
                                        </td>
                                        <td className="py-2 px-2">{v.motorista ?? '-'}</td>
                                        <td className="py-2 px-2">
                                            {v.proprietario === null
                                                ? '-'
                                                : v.proprietario
                                                    ? 'Sim'
                                                    : 'Não'}
                                        </td>
                                        <td className="py-2 px-2">{v.identificacao ?? '-'}</td>
                                        <td className="py-2 px-2">{v.chassi ?? '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Secao>

            {/* POSIÇÕES / HISTÓRICO */}
            <Secao
                titulo="Posições (histórico salvo)"
                subtitulo={`RequestMensagemCB — pings de GPS persistidos no banco (${posicoes.length} registro${posicoes.length === 1 ? '' : 's'} no período)`}
                icone={MapPin}
                aberto={abertas.posicoes}
                onToggle={() => toggle('posicoes')}
                acoes={
                    <div className="flex flex-wrap items-end gap-2">
                        <div>
                            <label className="text-xs text-gray-500 block mb-1">Placa</label>
                            <input
                                type="text"
                                value={placaFiltro}
                                onChange={(e) => setPlacaFiltro(e.target.value.toUpperCase())}
                                placeholder="Todas"
                                className="px-2 py-1.5 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 w-28"
                            />
                        </div>

                        <div>
                            <label className="text-xs text-gray-500 block mb-1">De</label>
                            <input
                                type="date"
                                value={dataInicio}
                                onChange={(e) => setDataInicio(e.target.value)}
                                className="px-2 py-1.5 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700"
                            />
                        </div>

                        <div>
                            <label className="text-xs text-gray-500 block mb-1">Até</label>
                            <input
                                type="date"
                                value={dataFim}
                                onChange={(e) => setDataFim(e.target.value)}
                                className="px-2 py-1.5 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700"
                            />
                        </div>

                        <button
                            onClick={carregarPosicoes}
                            disabled={loadingPosicoes}
                            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                        >
                            {loadingPosicoes ? 'Buscando...' : 'Buscar'}
                        </button>
                    </div>
                }
            >
                {posicoes.length === 0 ? (
                    <TabelaVazia texto="Nenhuma posição salva nesse filtro." />
                ) : (
                    <div className="overflow-x-auto -mx-1 max-h-[480px] overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-white dark:bg-[#111827]">
                                <tr className="text-left text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-800">
                                    <th className="py-2 px-2 font-medium">mId</th>
                                    <th className="py-2 px-2 font-medium">Placa</th>
                                    <th className="py-2 px-2 font-medium">Data/Hora</th>
                                    <th className="py-2 px-2 font-medium">Lat / Lon</th>
                                    <th className="py-2 px-2 font-medium">Município/UF</th>
                                    <th className="py-2 px-2 font-medium">Rua/Rodovia</th>
                                    <th className="py-2 px-2 font-medium">Velocidade</th>
                                    <th className="py-2 px-2 font-medium">Motorista</th>
                                    <th className="py-2 px-2 font-medium">Combustível</th>
                                    <th className="py-2 px-2 font-medium">Odômetro</th>
                                    <th className="py-2 px-2 font-medium">RPM</th>
                                </tr>
                            </thead>
                            <tbody>
                                {posicoes.map((p) => (
                                    <tr
                                        key={`${p.mId}-${p.id ?? p.veiId}`}
                                        className="border-b border-gray-50 dark:border-gray-800/60 text-gray-700 dark:text-gray-300"
                                    >
                                        <td className="py-2 px-2">{p.mId}</td>
                                        <td className="py-2 px-2 font-semibold text-gray-900 dark:text-white">
                                            {p.placa ?? '-'}
                                        </td>
                                        <td className="py-2 px-2 whitespace-nowrap">{p.dataHora}</td>
                                        <td className="py-2 px-2 whitespace-nowrap">
                                            {p.latitude?.toFixed(5)}, {p.longitude?.toFixed(5)}
                                        </td>
                                        <td className="py-2 px-2">
                                            {p.municipio ?? '-'}/{p.uf ?? '-'}
                                        </td>
                                        <td className="py-2 px-2">{p.rua ?? p.rodovia ?? '-'}</td>
                                        <td className="py-2 px-2">
                                            {p.velocidade ?? 0} km/h
                                        </td>
                                        <td className="py-2 px-2">{p.motorista ?? '-'}</td>
                                        <td className="py-2 px-2">
                                            {p.litrosTanque != null ? `${p.litrosTanque} L` : '-'}
                                        </td>
                                        <td className="py-2 px-2">
                                            {p.odometro != null
                                                ? `${p.odometro.toLocaleString('pt-BR')} km`
                                                : '-'}
                                        </td>
                                        <td className="py-2 px-2">{p.rpm ?? '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Secao>

            {/* VIAGENS GPS */}
            <Secao
                titulo="Viagens detectadas por GPS"
                subtitulo={`Derivado das posições — entrada/saída de Santos, Betim e Pouso Alegre (${viagens.length} viagem${viagens.length === 1 ? '' : 'ns'})`}
                icone={RouteIcon}
                aberto={abertas.viagens}
                onToggle={() => toggle('viagens')}
                acoes={
                    <button
                        onClick={carregarViagens}
                        disabled={loadingViagens}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-700 disabled:opacity-50 transition"
                    >
                        <RefreshCw size={12} className={loadingViagens ? 'animate-spin' : ''} />
                        Atualizar
                    </button>
                }
            >
                {viagens.length === 0 ? (
                    <TabelaVazia texto="Nenhuma viagem detectada ainda." />
                ) : (
                    <div className="overflow-x-auto -mx-1 max-h-[480px] overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-white dark:bg-[#111827]">
                                <tr className="text-left text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-800">
                                    <th className="py-2 px-2 font-medium">Placa</th>
                                    <th className="py-2 px-2 font-medium">Origem</th>
                                    <th className="py-2 px-2 font-medium">Início</th>
                                    <th className="py-2 px-2 font-medium">Destino</th>
                                    <th className="py-2 px-2 font-medium">Fim</th>
                                    <th className="py-2 px-2 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {viagens.map((v) => (
                                    <tr
                                        key={v.id}
                                        className="border-b border-gray-50 dark:border-gray-800/60 text-gray-700 dark:text-gray-300"
                                    >
                                        <td className="py-2 px-2 font-semibold text-gray-900 dark:text-white">
                                            {v.placa ?? '-'}
                                        </td>
                                        <td className="py-2 px-2">
                                            {v.origemMunicipio}/{v.origemUf ?? '-'}
                                        </td>
                                        <td className="py-2 px-2 whitespace-nowrap">
                                            {v.dataHoraInicio}
                                        </td>
                                        <td className="py-2 px-2">
                                            {v.destinoMunicipio
                                                ? `${v.destinoMunicipio}/${v.destinoUf ?? '-'}`
                                                : '-'}
                                        </td>
                                        <td className="py-2 px-2 whitespace-nowrap">
                                            {v.dataHoraFim ?? '-'}
                                        </td>
                                        <td className="py-2 px-2">
                                            <span
                                                className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${v.status === 'CONCLUIDA'
                                                        ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400'
                                                        : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                                                    }`}
                                            >
                                                {v.status === 'CONCLUIDA' ? 'Concluída' : 'Em andamento'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Secao>

            {/* DIAS PARADOS */}
            <Secao
                titulo="Dias parados em Betim"
                subtitulo="Calculado a partir das posições — estadias com velocidade zero em Betim"
                icone={CalendarClock}
                aberto={abertas.diasParados}
                onToggle={() => toggle('diasParados')}
                acoes={
                    <div className="flex items-end gap-2">
                        <div>
                            <label className="text-xs text-gray-500 block mb-1">Mês</label>
                            <input
                                type="month"
                                value={mesFiltro}
                                onChange={(e) => setMesFiltro(e.target.value)}
                                className="px-2 py-1.5 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700"
                            />
                        </div>

                        <button
                            onClick={carregarDiasParados}
                            disabled={loadingDiasParados}
                            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                        >
                            {loadingDiasParados ? 'Buscando...' : 'Buscar'}
                        </button>
                    </div>
                }
            >
                {!diasParados || diasParados.porVeiculo.length === 0 ? (
                    <TabelaVazia texto="Nenhum dia parado calculado nesse mês." />
                ) : (
                    <div className="space-y-3">
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                            Total do mês: <strong>{diasParados.totalDiasParados}</strong> dia
                            {diasParados.totalDiasParados === 1 ? '' : 's'} parado
                            {diasParados.totalDiasParados === 1 ? '' : 's'}
                        </p>

                        <div className="overflow-x-auto -mx-1">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-800">
                                        <th className="py-2 px-2 font-medium">Placa</th>
                                        <th className="py-2 px-2 font-medium">Dias parados</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {diasParados.porVeiculo.map((item) => (
                                        <tr
                                            key={item.placa}
                                            className="border-b border-gray-50 dark:border-gray-800/60 text-gray-700 dark:text-gray-300"
                                        >
                                            <td className="py-2 px-2 font-semibold text-gray-900 dark:text-white">
                                                {item.placa}
                                            </td>
                                            <td className="py-2 px-2">{item.diasParados}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </Secao>
        </div>
    );
}
