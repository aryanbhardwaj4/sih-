function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function tanh(value) {
  return Math.tanh(value);
}

function validAqi(station) {
  return Number.isFinite(station.aqi);
}

function distanceBetween(first, second) {
  const latitudeScale = 111;
  const longitudeScale = 111 * Math.cos((first.lat * Math.PI) / 180);
  const latitudeDistance = (first.lat - second.lat) * latitudeScale;
  const longitudeDistance = (first.lng - second.lng) * longitudeScale;
  return Math.hypot(latitudeDistance, longitudeDistance);
}

export function getGraphNeighbors(stations, targetStationId) {
  const target = stations.find((station) => station.id === targetStationId);
  if (!target) return [];

  return stations
    .filter((station) => station.id !== targetStationId && validAqi(station))
    .map((station) => ({
      ...station,
      distance: distanceBetween(target, station),
    }))
    .sort((first, second) => first.distance - second.distance)
    .slice(0, 4);
}

function spatialGraphSignal(stations, targetStationId) {
  const neighbors = getGraphNeighbors(stations, targetStationId);
  if (!neighbors.length) return { signal: null, neighbors };

  const weighted = neighbors.reduce(
    (result, station) => {
      const weight = 1 / Math.max(station.distance, 0.5);
      return {
        value: result.value + station.aqi * weight,
        weight: result.weight + weight,
      };
    },
    { value: 0, weight: 0 }
  );

  return {
    signal: weighted.value / weighted.weight,
    neighbors,
  };
}

function lstmStep(input, state) {
  const combined = input + state.hidden;
  const forgetGate = sigmoid(1.35 * combined - 0.15);
  const inputGate = sigmoid(1.1 * combined + 0.2);
  const outputGate = sigmoid(1.25 * combined);
  const candidate = tanh(0.9 * input + 0.55 * state.hidden);
  const cell = forgetGate * state.cell + inputGate * candidate;
  return {
    cell,
    hidden: outputGate * tanh(cell),
  };
}

function clampAqi(value) {
  return Math.max(0, Math.min(500, Math.round(value)));
}

export function runGnnLstmForecast(stations, targetStationId, history) {
  const current = stations.find((station) => station.id === targetStationId);
  const graph = spatialGraphSignal(stations, targetStationId);
  const historyValues = history
    .map((point) => Number(point.aqi))
    .filter(Number.isFinite);

  if (!current || !Number.isFinite(current.aqi) || !historyValues.length || !Number.isFinite(graph.signal)) {
    return { predictions: [], neighbors: graph.neighbors, ready: false };
  }

  const graphSignal = graph.signal / 500;
  let state = { cell: historyValues[0] / 500, hidden: 0 };
  historyValues.slice(1).forEach((value) => {
    state = lstmStep((value / 500) * 0.78 + graphSignal * 0.22, state);
  });

  const predictions = [24, 48, 72].map((hours) => {
    const nextInput = state.hidden * 0.72 + graphSignal * 0.28;
    state = lstmStep(nextInput, state);
    const localTrend = current.aqi - historyValues[historyValues.length - 1];
    const prediction = clampAqi(
      current.aqi + state.hidden * 110 + localTrend * (hours / 72) * 0.35 + (graph.signal - current.aqi) * 0.2
    );
    return {
      hours,
      aqi: prediction,
      band: prediction <= 200 ? "Moderate" : prediction <= 300 ? "Poor" : "Very Poor",
      tone: prediction > 200 ? "red" : "orange",
    };
  });

  return {
    predictions,
    neighbors: graph.neighbors,
    graphSignal: Math.round(graph.signal),
    ready: true,
  };
}
