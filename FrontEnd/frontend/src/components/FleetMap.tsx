import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type PontoFrota = {
    veiID: number;
    placa: string;
    latitude: number;
    longitude: number;
    velocidade: number | null;
    dataHora: string;
    endereco?: string;
};

type FleetMapProps = {
    pontos: PontoFrota[];
};

// Centro de Minas Gerais — usado só como fallback enquanto não há nenhum
// ponto de frota carregado ainda (evita o mapa nascer no meio do oceano,
// em 0,0).
const CENTRO_PADRAO: [number, number] = [-18.9, -44.5];

// Pontos de referência da rota (porto de Santos -> Betim/Pouso Alegre).
// O mapa sempre enquadra essa região, mesmo que os caminhões estejam só
// numa das pontas — assim o operador já vê o trajeto inteiro de cara.
const BELO_HORIZONTE: [number, number] = [-19.9167, -43.9345];
const SANTOS: [number, number] = [-23.9608, -46.3339];

// Mostra as 3 primeiras letras da placa dentro do marcador, em vez do
// ícone genérico de caminhão — com vários caminhões no mesmo mapa isso
// ajuda a identificar cada um sem precisar clicar pra abrir o popup.
function criarIconeCaminhao(emMovimento: boolean, placa: string) {
    const cor = emMovimento ? '#22c55e' : '#6b7280';
    const sigla = (placa || '').replace(/\s/g, '').slice(0, 3).toUpperCase() || '?';

    return L.divIcon({
        className: '',
        html: `
      <div style="position:relative;width:34px;height:34px;display:flex;align-items:center;justify-content:center;">
        ${emMovimento
                ? `<div style="position:absolute;width:34px;height:34px;border-radius:9999px;background:${cor};opacity:0.3;animation:fleetPulse 1.6s ease-out infinite;"></div>`
                : ''
            }
        <div style="position:relative;width:28px;height:28px;border-radius:9999px;background:${cor};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
          <span style="font-size:8.5px;font-weight:800;letter-spacing:0.01em;color:#fff;font-family:inherit;">${sigla}</span>
        </div>
      </div>
    `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -17],
    });
}

function AjustarLimites({ pontos }: { pontos: PontoFrota[] }) {
    const map = useMap();

    useEffect(() => {
        // Enquadra sempre BH + Santos (as duas pontas da rota), somado aos
        // caminhões atuais — assim o mapa nunca fica "perdido" no meio do
        // oceano quando os pontos estão muito distantes um do outro.
        const bounds = L.latLngBounds([BELO_HORIZONTE, SANTOS]);

        pontos.forEach((p) => bounds.extend([p.latitude, p.longitude]));

        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 9 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pontos.map((p) => `${p.veiID}:${p.latitude}:${p.longitude}`).join('|')]);

    return null;
}

export function FleetMap({ pontos }: FleetMapProps) {
    // Um ícone por caminhão (não só "em movimento"/"parado" compartilhado),
    // já que cada um agora mostra a própria sigla da placa.
    const icones = useMemo(() => {
        const mapa = new Map<number, L.DivIcon>();

        pontos.forEach((ponto) => {
            const emMovimento = (ponto.velocidade ?? 0) > 3;
            mapa.set(ponto.veiID, criarIconeCaminhao(emMovimento, ponto.placa));
        });

        return mapa;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pontos.map((p) => `${p.veiID}:${p.placa}:${(p.velocidade ?? 0) > 3}`).join('|')]);

    const centroInicial = pontos[0]
        ? ([pontos[0].latitude, pontos[0].longitude] as [number, number])
        : CENTRO_PADRAO;

    return (
        <>
            <style>{`
                @keyframes fleetPulse {
                    0% { transform: scale(0.85); opacity: 0.35; }
                    70% { transform: scale(2); opacity: 0; }
                    100% { transform: scale(2); opacity: 0; }
                }
                .leaflet-container {
                    font-family: inherit;
                    background: #e5e7eb;
                }
                .leaflet-popup-content-wrapper {
                    border-radius: 12px;
                }
            `}</style>

            <MapContainer
                center={centroInicial}
                zoom={pontos.length > 0 ? 7 : 6}
                scrollWheelZoom
                style={{ width: '100%', height: '100%' }}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {pontos.map((ponto) => {
                    const icone = icones.get(ponto.veiID);
                    if (!icone) return null;

                    return (
                        <Marker
                            key={ponto.veiID}
                            position={[ponto.latitude, ponto.longitude]}
                            icon={icone}
                        >
                            <Popup>
                                <strong>{ponto.placa}</strong>
                                <br />
                                {ponto.velocidade ?? 0} km/h
                                {ponto.endereco && (
                                    <>
                                        <br />
                                        {ponto.endereco}
                                    </>
                                )}
                                <br />
                                <span style={{ fontSize: 11, color: '#6b7280' }}>
                                    {ponto.dataHora}
                                </span>
                            </Popup>
                        </Marker>
                    );
                })}

                <AjustarLimites pontos={pontos} />
            </MapContainer>
        </>
    );
}
