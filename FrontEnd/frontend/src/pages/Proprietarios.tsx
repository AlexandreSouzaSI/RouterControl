import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

type Caminhao = {
    id: string;
    placa: string;
};

export function Proprietarios() {
    const [caminhoes, setCaminhoes] = useState<Caminhao[]>([]);
    const [placa, setPlaca] = useState('');
    const [mes, setMes] = useState('');
    const [dataInicio, setDataInicio] = useState('');
    const [dataFim, setDataFim] = useState('');
    const [faturamentoBruto, setFaturamentoBruto] = useState('');

    const [relatorios, setRelatorios] = useState<any[]>([]);
    const [pagamentos, setPagamentos] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const [exportandoPDF, setExportandoPDF] = useState(false);
    const [exportandoMobile, setExportandoMobile] = useState(false);

    function moeda(valor: number) {
        return Number(valor || 0).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        });
    }

    function dataBR(data: string | Date) {
        return new Date(data).toLocaleDateString('pt-BR');
    }

    function dataHoraBR(data: string | Date) {
        return new Date(data).toLocaleString('pt-BR');
    }

    async function carregarCaminhoes() {
        const res = await api.get('/caminhoes');
        setCaminhoes(Array.isArray(res.data) ? res.data : res.data.data || []);
    }

    async function buscar() {
        try {
            setLoading(true);

            const params: any = {};

            if (placa) params.placa = placa;
            if (mes) params.mes = mes;
            if (dataInicio) params.dataInicio = dataInicio;
            if (dataFim) params.dataFim = dataFim;

            const [relatorioRes, pagamentoRes] = await Promise.all([
                api.get('/relatorio', { params }),
                api.get('/pagamentos/calcular', {
                    params: {
                        ...params,
                        ...(faturamentoBruto.trim() !== ''
                            ? { faturamentoBruto: Number(faturamentoBruto) }
                            : {}),
                    },
                }),
            ]);

            setRelatorios(relatorioRes.data.data || []);
            setPagamentos(pagamentoRes.data.resultados || []);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        carregarCaminhoes();
    }, []);

    const pagamentoPorPlaca = useMemo(() => {
        const map = new Map<string, any>();

        pagamentos.forEach((p) => {
            map.set(p.placa, p);
        });

        return map;
    }, [pagamentos]);

    function montarTimeline(item: any) {
        let acumuladoParado = 0;

        const eventos = [
            ...(item.paradas || []).flatMap((p: any) => {
                const dias = p.diasParadosFiltro ?? p.diasParados ?? 0;
                acumuladoParado += dias;

                return [
                    {
                        data: p.dataHoraEntrada,
                        titulo: `Entrou em ${p.cidadeEntrada}`,
                        tipo: 'entrada',
                        detalhe: null,
                    },
                    {
                        data: p.dataHoraSaida,
                        titulo: `Saiu de ${p.cidadeEntrada}`,
                        tipo: 'saida',
                        detalhe: `${dias} dia(s) parado(s) — acumulado ${acumuladoParado}/${item.diasParados}`,
                    },
                ];
            }),

            ...(item.viagens || []).map((v: any, index: number) => ({
                data: v.dataHoraChegada,
                titulo: `Chegou em ${v.cidade}`,
                tipo: 'santos',
                detalhe: `Viagem #${index + 1}`,
            })),
        ];

        return eventos
            .filter((e) => e.data)
            .sort(
                (a, b) =>
                    new Date(a.data).getTime() - new Date(b.data).getTime(),
            );
    }

    async function exportarPDF() {
        const element = document.getElementById('proprietarios-pdf');

        if (!element) return;

        try {
            setExportandoPDF(true);

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');

            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();

            const imgWidth = pageWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            const nomeArquivo =
                placa && placa.trim() !== ''
                    ? `${placa}.pdf`
                    : 'relatorio-proprietarios.pdf';

            pdf.save(nomeArquivo);
        } finally {
            setTimeout(() => {
                setExportandoPDF(false);
            }, 800);
        }
    }

    async function exportarPDFMobile() {
        try {
            setExportandoMobile(true);

            // Formato estreito, estilo recibo/mobile.
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: [80, 200],
            });

            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin = 6;
            const maxWidth = pageWidth - margin * 2;
            let y = 10;

            function checkPage(space = 10) {
                if (y + space > pageHeight - 8) {
                    pdf.addPage([80, 200], 'portrait');
                    y = 10;
                }
            }

            function divider() {
                checkPage(4);
                pdf.setDrawColor(220, 220, 220);
                pdf.line(margin, y, pageWidth - margin, y);
                y += 5;
            }

            function title(text: string) {
                checkPage(10);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(13);
                const lines = pdf.splitTextToSize(text, maxWidth);
                pdf.text(lines, margin, y);
                y += lines.length * 6 + 2;
            }

            function subtitle(text: string) {
                checkPage(8);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(10);
                pdf.text(text, margin, y);
                y += 6;
            }

            function line(label: string, value: string, danger = false) {
                checkPage(8);

                pdf.setFontSize(8);
                pdf.setFont('helvetica', 'normal');
                pdf.setTextColor(danger ? 180 : 50, danger ? 30 : 50, danger ? 30 : 50);

                const labelMaxWidth = 38;
                const labelLines = pdf.splitTextToSize(label, labelMaxWidth);
                pdf.text(labelLines, margin, y);

                pdf.setFont('helvetica', 'bold');
                pdf.text(value, pageWidth - margin, y, { align: 'right' });

                pdf.setTextColor(0, 0, 0);
                y += Math.max(labelLines.length * 4, 5);
            }

            function boxResumo(label: string, value: number, x: number) {
                pdf.setFillColor(245, 246, 248);
                pdf.roundedRect(x, y, 20, 18, 3, 3, 'F');

                pdf.setFontSize(6);
                pdf.setFont('helvetica', 'normal');
                pdf.text(label, x + 10, y + 6, { align: 'center' });

                pdf.setFontSize(11);
                pdf.setFont('helvetica', 'bold');
                pdf.text(String(value), x + 10, y + 14, { align: 'center' });
            }

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(15);
            pdf.text('RotaApp', margin, y);
            y += 7;

            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'normal');
            pdf.text('Relatório do Proprietário', margin, y);
            y += 8;

            for (const item of relatorios) {
                const pagamento = pagamentoPorPlaca.get(item.caminhao?.placa);
                const timeline = montarTimeline(item);

                divider();
                title(`Caminhão ${item.caminhao?.placa}`);

                pdf.setFontSize(8);
                pdf.setFont('helvetica', 'normal');
                const periodoTexto = `${dataBR(
                    item.dataInicioFiltro || item.dataInicio,
                )} até ${dataBR(item.dataFimFiltro || item.dataFim)}`;
                pdf.text(periodoTexto, margin, y);
                y += 8;

                checkPage(24);
                boxResumo('Viagens', item.numeroViagens, margin);
                boxResumo('Parados', item.diasParados, margin + 23);
                boxResumo('Rodando', item.diasRodando, margin + 46);
                y += 24;

                if (pagamento) {
                    subtitle('Pagamento');

                    line('Salário', moeda(pagamento.calculo.salario));
                    line('Diárias', moeda(pagamento.calculo.valorDiarias));

                    if (pagamento.calculo.tipoCalculo === 'FATURAMENTO') {
                        line(
                            `Faturamento ${pagamento.calculo.percentualFaturamento}%`,
                            moeda(pagamento.calculo.valorViagens),
                        );
                    } else {
                        line('Viagens', moeda(pagamento.calculo.valorViagens));
                        line(
                            `${pagamento.calculo.metaViagens} viagens`,
                            moeda(pagamento.calculo.valorBonusMeta),
                        );
                    }

                    line(
                        'Adiantamento',
                        `- ${moeda(pagamento.calculo.adiantamento)}`,
                        true,
                    );

                    divider();

                    for (const c of pagamento.cenarios) {
                        const label =
                            c.bonusManual === 0
                                ? 'Total s/ bônus'
                                : `Total +${c.bonusManual}`;

                        line(label, moeda(c.total));
                    }

                    y += 3;
                }

                subtitle('Timeline');

                for (const evento of timeline) {
                    checkPage(18);

                    pdf.setFontSize(8);
                    pdf.setFont('helvetica', 'bold');
                    const tituloLines = pdf.splitTextToSize(evento.titulo, maxWidth);
                    pdf.text(tituloLines, margin, y);
                    y += tituloLines.length * 4;

                    pdf.setFont('helvetica', 'normal');
                    pdf.setTextColor(90, 90, 90);
                    pdf.text(dataHoraBR(evento.data), margin, y);
                    pdf.setTextColor(0, 0, 0);
                    y += 4;

                    if (evento.detalhe) {
                        const detalheLines = pdf.splitTextToSize(evento.detalhe, maxWidth);
                        pdf.setFontSize(7);
                        pdf.setTextColor(40, 100, 180);
                        pdf.text(detalheLines, margin, y);
                        pdf.setTextColor(0, 0, 0);
                        y += detalheLines.length * 4;
                    }

                    y += 3;
                }

                y += 4;
            }

            const nomeArquivo =
                placa && placa.trim() !== ''
                    ? `${placa}-mobile.pdf`
                    : 'relatorio-proprietarios-mobile.pdf';

            pdf.save(nomeArquivo);
        } finally {
            setTimeout(() => {
                setExportandoMobile(false);
            }, 800);
        }
    }

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-[#0B1120] text-gray-900 dark:text-gray-100 p-4">
            <h1 className="text-2xl font-bold mb-4">
                Visão dos Proprietários
            </h1>

            <div className="bg-white dark:bg-[#111827] rounded-2xl shadow p-4 mb-4 space-y-3">
                <div>
                    <label className="text-sm text-gray-500">Caminhão</label>
                    <select
                        value={placa}
                        onChange={(e) => setPlaca(e.target.value)}
                        className="w-full mt-1 px-3 py-3 rounded-xl border bg-white dark:bg-[#0B1120]"
                    >
                        <option value="">Todos</option>
                        {caminhoes.map((c) => (
                            <option key={c.id} value={c.placa}>
                                {c.placa}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="text-sm text-gray-500">Mês</label>
                    <input
                        type="month"
                        value={mes}
                        onChange={(e) => {
                            setMes(e.target.value);
                            setDataInicio('');
                            setDataFim('');
                        }}
                        className="w-full mt-1 px-3 py-3 rounded-xl border bg-white dark:bg-[#0B1120]"
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-sm text-gray-500">
                            Data inicial
                        </label>
                        <input
                            type="date"
                            value={dataInicio}
                            onChange={(e) => {
                                setDataInicio(e.target.value);
                                setMes('');
                            }}
                            className="w-full mt-1 px-3 py-3 rounded-xl border bg-white dark:bg-[#0B1120]"
                        />
                    </div>

                    <div>
                        <label className="text-sm text-gray-500">
                            Data final
                        </label>
                        <input
                            type="date"
                            value={dataFim}
                            onChange={(e) => {
                                setDataFim(e.target.value);
                                setMes('');
                            }}
                            className="w-full mt-1 px-3 py-3 rounded-xl border bg-white dark:bg-[#0B1120]"
                        />
                    </div>
                </div>

                <div>
                    <label className="text-sm text-gray-500">
                        Faturamento Bruto
                    </label>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={faturamentoBruto}
                        onChange={(e) => setFaturamentoBruto(e.target.value)}
                        placeholder="Ex: 79500"
                        className="w-full mt-1 px-3 py-3 rounded-xl border bg-white dark:bg-[#0B1120]"
                    />
                </div>

                <button
                    onClick={buscar}
                    className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold"
                >
                    {loading ? 'Carregando...' : 'Buscar'}
                </button>
            </div>

            {relatorios.length > 0 && (
                <div className="flex flex-wrap gap-3 mb-4">
                    <button
                        onClick={exportarPDF}
                        disabled={exportandoPDF || exportandoMobile}
                        className={`px-4 py-2 rounded-xl text-white font-semibold transition-all ${exportandoPDF
                            ? 'bg-green-700 opacity-80 cursor-wait scale-95'
                            : 'bg-green-600 hover:bg-green-700 hover:scale-105'
                            }`}
                    >
                        {exportandoPDF ? 'Gerando Desktop...' : 'PDF Desktop'}
                    </button>

                    <button
                        onClick={exportarPDFMobile}
                        disabled={exportandoPDF || exportandoMobile}
                        className={`px-4 py-2 rounded-xl text-white font-semibold transition-all ${exportandoMobile
                            ? 'bg-blue-700 opacity-80 cursor-wait scale-95'
                            : 'bg-blue-600 hover:bg-blue-700 hover:scale-105'
                            }`}
                    >
                        {exportandoMobile ? 'Gerando Mobile...' : 'PDF Mobile'}
                    </button>
                </div>
            )}

            <div id="proprietarios-pdf" className="space-y-4">
                {relatorios.map((item) => {
                    const pagamento = pagamentoPorPlaca.get(item.caminhao?.placa);
                    const timeline = montarTimeline(item);

                    return (
                        <div
                            key={item.caminhaoId}
                            className="bg-white dark:bg-[#111827] rounded-2xl shadow p-4"
                        >
                            <div className="mb-4">
                                <h2 className="text-xl font-bold">
                                    🚚 {item.caminhao?.placa}
                                </h2>

                                <p className="text-sm text-gray-500">
                                    {dataBR(item.dataInicioFiltro || item.dataInicio)} até{' '}
                                    {dataBR(item.dataFimFiltro || item.dataFim)}
                                </p>
                            </div>

                            <div className="grid grid-cols-3 gap-2 mb-4">
                                <Card label="Viagens" value={item.numeroViagens} />
                                <Card label="Parados" value={item.diasParados} />
                                <Card label="Rodando" value={item.diasRodando} />
                            </div>

                            {pagamento && (
                                <div className="bg-gray-100 dark:bg-[#0B1120] rounded-xl p-3 mb-4">
                                    <h3 className="font-semibold mb-2">
                                        Pagamento do período
                                    </h3>

                                    <Linha
                                        label="Salário"
                                        value={moeda(pagamento.calculo.salario)}
                                    />

                                    <Linha
                                        label="Diárias"
                                        value={moeda(
                                            pagamento.calculo.valorDiarias,
                                        )}
                                    />

                                    {pagamento.calculo.tipoCalculo ===
                                        'FATURAMENTO' ? (
                                        <Linha
                                            label={`Faturamento (${pagamento.calculo.percentualFaturamento}%)`}
                                            value={moeda(
                                                pagamento.calculo.valorViagens,
                                            )}
                                        />
                                    ) : (
                                        <Linha
                                            label="Viagens"
                                            value={moeda(
                                                pagamento.calculo.valorViagens,
                                            )}
                                        />
                                    )}

                                    {pagamento.calculo.tipoCalculo ===
                                        'TRADICIONAL' && (
                                            <Linha
                                                label={`${pagamento.calculo.metaViagens} Viagens`}
                                                value={moeda(
                                                    pagamento.calculo.valorBonusMeta,
                                                )}
                                            />
                                        )}

                                    <Linha
                                        label="Adiantamento"
                                        danger
                                        value={`- ${moeda(
                                            pagamento.calculo.adiantamento,
                                        )}`}
                                    />

                                    <div className="border-t mt-3 pt-3 space-y-2">
                                        {pagamento.cenarios.map((c: any) => (
                                            <div
                                                key={c.bonusManual}
                                                className="flex justify-between font-bold"
                                            >
                                                <span>
                                                    Total com bônus{' '}
                                                    {moeda(c.bonusManual)}
                                                </span>
                                                <span>{moeda(c.total)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <h3 className="font-semibold mb-3">Timeline</h3>

                                <div className="border-l-2 border-gray-300 ml-2 space-y-4">
                                    {timeline.map((evento, index) => (
                                        <div
                                            key={index}
                                            className="relative pl-5"
                                        >
                                            <div
                                                className={`absolute -left-[7px] top-1 w-3 h-3 rounded-full ${evento.tipo === 'santos'
                                                    ? 'bg-yellow-500'
                                                    : evento.tipo === 'saida'
                                                        ? 'bg-blue-500'
                                                        : 'bg-green-500'
                                                    }`}
                                            />

                                            <p className="font-medium">
                                                {evento.titulo}
                                            </p>

                                            <p className="text-sm text-gray-500">
                                                {dataHoraBR(evento.data)}
                                            </p>

                                            {evento.detalhe && (
                                                <span className="inline-block mt-1 px-2 py-1 rounded-full bg-blue-100 text-blue-800 text-xs">
                                                    {evento.detalhe}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function Card({ label, value }: { label: string; value: number }) {
    return (
        <div className="bg-gray-100 dark:bg-[#0B1120] rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-xl font-bold">{value}</p>
        </div>
    );
}

function Linha({
    label,
    value,
    danger = false,
}: {
    label: string;
    value: string;
    danger?: boolean;
}) {
    return (
        <div
            className={`flex justify-between text-sm py-1 ${danger ? 'bg-red-50 text-red-700 px-2 rounded-lg' : ''
                }`}
        >
            <span className={danger ? 'font-medium' : 'text-gray-500'}>
                {label}
            </span>
            <span className="font-medium">{value}</span>
        </div>
    );
}