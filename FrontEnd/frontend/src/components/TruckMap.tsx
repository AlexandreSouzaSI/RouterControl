import { useEffect, useMemo } from 'react';
import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    Polyline,
    useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Ponto = { latitude: number; longitude: number };

type TruckMapProps = {
    latitude: number;
    longitude: number;
    placa: string;
    velocidade: number | null;
    dataHora: string;
    endereco?: string;
    path?: Ponto[];
};

// Mostra as 3 primeiras letras da placa dentro do marcador, em vez do
// ícone genérico de caminhão — fica mais fácil identificar de qual
// caminhão se trata direto no mapa, sem precisar abrir o popup.
function criarIconeCaminhao(emMovimento: boolean, placa: string) {
    const cor = emMovimento ? '#22c55e' : '#6b7280';
    const sigla = (placa || '').replace(/\s/g, '').slice(0, 3).toUpperCase() || '?';

    return L.divIcon({
        className: '',
        html: `
      <div style="position:relative;width:38px;height:38px;display:flex;align-items:center;justify-content:center;">
        ${emMovimento
                ? `<div style="position:absolute;width:38px;height:38px;border-radius:9999px;background:${cor};opacity:0.3;animation:truckPulse 1.6s ease-out infinite;"></div>`
                : ''
            }
        <div style="position:relative;width:32px;height:32px;border-radius:9999px;background:${cor};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
          <span style="font-size:10px;font-weight:800;letter-spacing:0.02em;color:#fff;font-family:inherit;">${sigla}</span>
        </div>
      </div>
    `,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
        popupAnchor: [0, -19],
    });
}

function Recentralizar({ latitude, longitude }: { latitude: number; longitude: number }) {
    const map = useMap();

    useEffect(() => {
        map.flyTo([latitude, longitude], Math.max(map.getZoom(), 13), {
            duration: 0.8,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [latitude, longitude]);

    return null;
}

export function TruckMap({
    latitude,
    longitude,
    placa,
    velocidade,
    dataHora,
    endereco,
    path,
}: TruckMapProps) {
    const emMovimento = (velocidade ?? 0) > 3;
    const icone = useMemo(
        () => criarIconeCaminhao(emMovimento, placa),
        [emMovimento, placa],
    );

    const posicoesRota = useMemo(() => {
        if (!path || path.length < 2) return null;
        return path.map((p) => [p.latitude, p.longitude]) as [number, number][];
    }, [path]);

    return (
        <>
            <style>{`
                @keyframes truckPulse {
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
                center={[latitude, longitude]}
                zoom={13}
                scrollWheelZoom
                style={{ width: '100%', height: '100%' }}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {posicoesRota && (
                    <Polyline
                        positions={posicoesRota}
                        pathOptions={{ color: '#3b82f6', weight: 3, opacity: 0.6 }}
                    />
                )}

                <Marker position={[latitude, longitude]} icon={icone}>
                    <Popup>
                        <strong>{placa}</strong>
                        <br />
                        {velocidade ?? 0} km/h
                        {endereco && (
                            <>
                                <br />
                                {endereco}
                            </>
                        )}
                        <br />
                        <span style={{ fontSize: 11, color: '#6b7280' }}>{dataHora}</span>
                    </Popup>
                </Marker>

                <Recentralizar latitude={latitude} longitude={longitude} />
            </MapContainer>
        </>
    );
}
