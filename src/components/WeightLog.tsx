import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Scale, Trash2, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import {
  useCalorieTracker,
  toLocalYYYYMMDD,
  parseLocalDate,
  MIN_BODY_WEIGHT,
  MAX_BODY_WEIGHT,
} from '../hooks/useCalorieTracker';
import type { WeightEntry } from '../types';
import { weeklyWeightPace, DAY_MS } from '../utils/nutrition';

// Kolory wykresu – wartości z palety motywu (SVG nie czyta zmiennych CSS w atrybutach)
const C = {
  trend: '#f5b21f',   // miód
  point: '#a095ad',   // slate-400
  grid: '#2d2637',    // slate-800
  axis: '#5a5067',    // slate-600
  tooltipBg: '#1f1a27',
};

type RangeId = '30' | '90' | 'all';
const RANGES: { id: RangeId; label: string; days: number | null }[] = [
  { id: '30', label: '30 dni', days: 30 },
  { id: '90', label: '90 dni', days: 90 },
  { id: 'all', label: 'Wszystko', days: null },
];

const ts = (date: string) => parseLocalDate(date).getTime();
const fmtKg = (v: number, digits = 1) => v.toFixed(digits).replace('.', ',');
const fmtSigned = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtKg(Math.abs(v))}`;
const fmtDay = (t: number) => {
  const d = new Date(t);
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const fmtLongDate = (date: string) =>
  parseLocalDate(date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' });

/** Średnia z pomiarów z 7 dni kończących się na danym wpisie – wygładza wahania wody. */
const withTrend = (log: WeightEntry[]) =>
  log.map((e) => {
    const end = ts(e.date);
    const window = log.filter((x) => {
      const t = ts(x.date);
      return t <= end && t > end - 7 * DAY_MS;
    });
    const avg = window.reduce((s, x) => s + x.weight, 0) / window.length;
    return { t: end, date: e.date, weight: e.weight, trend: Math.round(avg * 10) / 10 };
  });

export const WeightLog: React.FC = () => {
  const { weightLog, weight: profileWeight, isStrictLimitMode, addWeightEntry, deleteWeightEntry } = useCalorieTracker();

  const todayStr = toLocalYYYYMMDD(new Date());
  const [range, setRange] = useState<RangeId>('30');
  const [date, setDate] = useState(todayStr);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const latest = weightLog[weightLog.length - 1];
  const currentWeight = latest?.weight ?? profileWeight;
  const existingForDate = weightLog.find((e) => e.date === date);

  const chartData = useMemo(() => {
    const all = withTrend(weightLog);
    const days = RANGES.find((r) => r.id === range)?.days;
    if (!days || all.length === 0) return all;
    const from = ts(todayStr) - (days - 1) * DAY_MS;
    return all.filter((p) => p.t >= from);
  }, [weightLog, range, todayStr]);

  const pace = useMemo(() => weeklyWeightPace(weightLog), [weightLog]);
  const rangeChange = chartData.length >= 2 ? chartData[chartData.length - 1].weight - chartData[0].weight : null;

  const yDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 1];
    const vals = chartData.flatMap((p) => [p.weight, p.trend]);
    return [Math.floor(Math.min(...vals) - 1), Math.ceil(Math.max(...vals) + 1)];
  }, [chartData]);

  // Czy tempo idzie w stronę celu: redukcja = spadek, masa = wzrost
  const paceIsGood = pace === null ? null : isStrictLimitMode ? pace <= 0 : pace >= 0;
  const PaceIcon = pace === null || Math.abs(pace) < 0.05 ? Minus : pace < 0 ? TrendingDown : TrendingUp;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = parseFloat(value.replace(',', '.'));
    if (!Number.isFinite(w) || w < MIN_BODY_WEIGHT || w > MAX_BODY_WEIGHT) {
      setError(`Podaj wagę od ${MIN_BODY_WEIGHT} do ${MAX_BODY_WEIGHT} kg.`);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await addWeightEntry(date, w);
      setValue('');
    } catch (err) {
      console.error('Błąd zapisu wagi:', err);
      setError('Nie udało się zapisać pomiaru. Sprawdź połączenie i spróbuj ponownie.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="glass-card rounded-3xl p-5 space-y-5">
      {/* Nagłówek z bieżącą wagą i tempem */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Scale className="w-5 h-5 text-emerald-400" />
            Waga
          </h2>
          <p className="mt-2 font-display text-4xl font-extrabold tracking-tight text-slate-50 leading-none">
            {fmtKg(currentWeight)}
            <span className="ml-1 text-base font-semibold text-slate-500">kg</span>
          </p>
          <p className="mt-1.5 text-xs text-slate-500">
            {latest ? `Ostatni pomiar: ${latest.date === todayStr ? 'dzisiaj' : fmtLongDate(latest.date)}` : 'Waga z profilu – dodaj pierwszy pomiar'}
          </p>
        </div>

        {pace !== null && (
          <div className="text-right">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                paceIsGood ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'
              }`}
            >
              <PaceIcon className="w-3.5 h-3.5" />
              {fmtSigned(pace)} kg/tydz.
            </span>
            <p className="mt-1.5 text-[11px] text-slate-500">tempo z 30 dni</p>
          </div>
        )}
      </div>

      {/* Zakres wykresu */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="inline-flex rounded-full bg-slate-950/60 border border-slate-800 p-0.5" role="group" aria-label="Zakres wykresu">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              aria-pressed={range === r.id}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                range === r.id ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {rangeChange !== null && (
          <span className="text-xs text-slate-400 whitespace-nowrap">
            Zmiana: <span className="font-bold text-slate-200">{fmtSigned(rangeChange)} kg</span>
          </span>
        )}
      </div>

      {/* Wykres */}
      {chartData.length === 0 ? (
        <div className="h-40 grid place-items-center rounded-2xl border border-dashed border-slate-800 text-center px-6">
          <p className="text-sm text-slate-500">
            {weightLog.length === 0
              ? 'Zapisz pierwszy pomiar poniżej – wykres pojawi się po kolejnych wpisach.'
              : 'Brak pomiarów w tym zakresie.'}
          </p>
        </div>
      ) : (
        <div className="h-52 -ml-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={C.grid} strokeDasharray="3 4" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={fmtDay}
                stroke={C.axis}
                fontSize={10}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                domain={yDomain}
                stroke={C.axis}
                fontSize={10}
                tickLine={false}
                axisLine={false}
                width={44}
                tickFormatter={(v: number) => `${v}`}
              />
              <Tooltip
                contentStyle={{ backgroundColor: C.tooltipBg, borderColor: C.grid, borderRadius: 12, fontSize: 12 }}
                itemStyle={{ color: '#ded6e5' }}
                labelStyle={{ color: '#a095ad' }}
                labelFormatter={(t) => fmtLongDate(toLocalYYYYMMDD(new Date(Number(t))))}
                formatter={(v, name) => [`${fmtKg(Number(v))} kg`, name === 'trend' ? 'Trend (śr. 7 dni)' : 'Pomiar']}
              />
              <Line
                dataKey="weight"
                stroke="none"
                dot={{ r: 3, fill: C.point, stroke: 'none' }}
                activeDot={{ r: 4, fill: C.point, stroke: C.tooltipBg }}
                isAnimationActive={false}
              />
              <Line
                dataKey="trend"
                type="monotone"
                stroke={C.trend}
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 4, fill: C.trend, stroke: C.tooltipBg }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {chartData.length > 0 && (
        <div className="flex items-center gap-4 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: C.point }} />Pomiar</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-[3px] rounded-full" style={{ background: C.trend }} />Trend – średnia z 7 dni</span>
        </div>
      )}

      {/* Formularz pomiaru */}
      <form onSubmit={handleSave} className="space-y-2.5 pt-4 border-t border-slate-800">
        <div className="grid grid-cols-[1fr_1fr] gap-2.5">
          <label className="block">
            <span className="block text-xs text-slate-500 mb-1">Data</span>
            <input
              type="date"
              value={date}
              max={todayStr}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-slate-500 mb-1">Waga (kg)</span>
            <input
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={existingForDate ? fmtKg(existingForDate.weight) : fmtKg(currentWeight)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </label>
        </div>
        {error && <p className="text-xs text-red-400 font-semibold" role="alert">{error}</p>}
        <button
          type="submit"
          disabled={saving || !value.trim()}
          className="w-full py-3 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors active:scale-[0.99] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Zapisywanie…' : existingForDate ? 'Zaktualizuj pomiar' : 'Zapisz pomiar'}
        </button>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Najnowszy pomiar aktualizuje wagę w profilu. Cel TDEE przelicza się sam, chyba że został wpisany ręcznie w Ustawieniach.
        </p>
      </form>

      {/* Ostatnie pomiary */}
      {weightLog.length > 0 && (
        <ul className="divide-y divide-slate-800 rounded-2xl border border-slate-800 overflow-hidden">
          {[...weightLog].reverse().slice(0, 5).map((e, i) => {
            const prev = weightLog[weightLog.length - 2 - i];
            const delta = prev ? e.weight - prev.weight : null;
            return (
              <li key={e.date} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="flex-1 text-slate-300">{e.date === todayStr ? 'Dzisiaj' : fmtLongDate(e.date)}</span>
                {delta !== null && (
                  <span className="text-xs text-slate-500 tabular-nums">{fmtSigned(delta)}</span>
                )}
                <span className="font-display font-bold text-slate-100 tabular-nums w-16 text-right">{fmtKg(e.weight)} kg</span>
                <button
                  onClick={() => deleteWeightEntry(e.date)}
                  className="p-1 text-slate-600 hover:text-red-400 cursor-pointer"
                  aria-label={`Usuń pomiar z ${fmtLongDate(e.date)}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
