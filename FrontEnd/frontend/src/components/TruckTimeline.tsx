import { useEffect, useState } from 'react';
import { api } from '../services/api';

type TimelineItem = {
  date: string;
  label: string;
  type: 'arrival' | 'departure' | string;
  extra?: string | null;
};

type Props = {
  caminhaoId?: string;
};

export function TruckTimeline({
  caminhaoId,
}: Props) {
  const [timeline, setTimeline] = useState<
    TimelineItem[]
  >([]);

  const [loading, setLoading] =
    useState(false);

  useEffect(() => {
    if (!caminhaoId) {
      setTimeline([]);
      return;
    }

    async function loadTimeline() {
      try {
        setLoading(true);

        const res = await api.get(
          `/caminhoes/${caminhaoId}/timeline`,
        );

        setTimeline(res.data || []);
      } catch (error) {
        console.error(
          'Erro ao carregar timeline:',
          error,
        );

        setTimeline([]);
      } finally {
        setLoading(false);
      }
    }

    loadTimeline();
  }, [caminhaoId]);

  return (
    <div
      className="
            bg-white dark:bg-[#111827]
            border border-gray-200 dark:border-gray-800
            rounded-2xl shadow p-6
        "
    >
      <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-white">
        Timeline do Caminhão
      </h2>

      {!caminhaoId && (
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Selecione um caminhão.
        </p>
      )}

      {loading && (
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Carregando timeline...
        </p>
      )}

      {!loading &&
        caminhaoId &&
        timeline.length === 0 && (
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Nenhum evento encontrado.
          </p>
        )}

      <div className="border-l-2 border-gray-300 dark:border-gray-700 ml-2 mt-4">
        {timeline.map((item, index) => (
          <div
            key={index}
            className="mb-8 pl-6 relative"
          >
            <div
              className={`w-3 h-3 rounded-full absolute -left-[7px] top-1 shadow ${item.type === 'arrival'
                  ? 'bg-green-500'
                  : 'bg-blue-500'
                }`}
            />

            <div className="font-semibold text-gray-900 dark:text-gray-100">
              {item.label}
            </div>

            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {new Date(
                item.date,
              ).toLocaleString(
                'pt-BR',
              )}
            </div>

            {item.extra && (
              <div
                className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold ${item.extra.includes(
                  'Viagem',
                )
                    ? `
                                        bg-yellow-100
                                        text-yellow-800
                                        dark:bg-yellow-500/20
                                        dark:text-yellow-300
                                      `
                    : `
                                        bg-blue-100
                                        text-blue-800
                                        dark:bg-blue-500/20
                                        dark:text-blue-300
                                      `
                  }`}
              >
                {item.extra}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}