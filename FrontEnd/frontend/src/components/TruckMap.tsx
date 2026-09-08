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

function criarIconeCaminhao(emMovimento: boolean) {
    const cor = emMovimento ? '#22c55e' : '#6b7280';

    return L.divIcon({
        className: '',
        html: `
      <div style="position:relative;width:38px;height:38px;display:flex;align-items:center;justify-content:center;">
        ${emMovimento
                ? `<div style="position:absolute;width:38px;height:38px;border-radius:9999px;background:${cor};opacity:0.3;animation:truckPulse 1.6s ease-out infinite;"></div>`
                : ''
            }
        <div style="position:relative;width:30px;height:30px;border-radius:9999px;background:${cor};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 17h4V5H2v12h3"/>
            <path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1"/>
            <circle cx="7.5" cy="17.5" r="2.5"/>
            <circle cx="17.5" cy="17.5" r="2.5"/>
          </svg>
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
    const icone = useMemo(() => criarIconeCaminhao(emMovimento), [emMovimento]);

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
