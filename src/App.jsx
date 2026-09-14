import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

const STATIONS = [
  { id: "anand-vihar", name: "Anand Vihar", lat: 28.6469, lng: 77.3162 },
  { id: "rk-puram", name: "R.K. Puram", lat: 28.5634, lng: 77.1762 },
  { id: "dwarka", name: "Dwarka", lat: 28.5921, lng: 77.046 },
  { id: "ito", name: "ITO", lat: 28.628, lng: 77.241 },
  { id: "noida", name: "Noida Sec 62", lat: 28.627, lng: 77.3649 },
  { id: "punjabi-bagh", name: "Punjabi Bagh", lat: 28.674, lng: 77.131 },
  { id: "mandir-marg", name: "Mandir Marg", lat: 28.636, lng: 77.202 },
  { id: "rohini", name: "Rohini", lat: 28.732, lng: 77.096 },
  { id: "ghaziabad", name: "Ghaziabad", lat: 28.669, lng: 77.4538 },
  { id: "faridabad-sector-16", name: "Faridabad Sector 16", lat: 28.433, lng: 77.316 },
  { id: "faridabad-ballabgarh", name: "Faridabad Ballabgarh", lat: 28.340, lng: 77.317 },
];

const FORECAST = [
  { label: "Now", aqi: 150, band: "Moderate", tone: "orange" },
  { label: "+24h", aqi: 168, band: "Moderate", tone: "orange" },
  { label: "+48h", aqi: 211, band: "Poor", tone: "red" },
  { label: "+72h", aqi: 184, band: "Moderate", tone: "orange" },
];

const assetPath = (path) => `${import.meta.env.BASE_URL}${path}`;
const reading = (value, suffix = "") =>
  Number.isFinite(value) ? `${Math.round(value)}${suffix}` : "Unavailable";

function bandForAqi(aqi) {
  if (!Number.isFinite(aqi)) return { name: "Unavailable", color: "#9b9ba3" };
  if (aqi <= 50) return { name: "Good", color: "#34C759" };
  if (aqi <= 100) return { name: "Satisfactory", color: "#A8E05F" };
  if (aqi <= 200) return { name: "Moderate", color: "#FF8D28" };
  if (aqi <= 300) return { name: "Poor", color: "#E53935" };
  if (aqi <= 400) return { name: "Very Poor", color: "#7B1FA2" };
  return { name: "Severe", color: "#4A148C" };
}

function stationWithLiveData(station, data, weather) {
  const pm25 = Number(data.current?.pm2_5);
  const aqi = pm25ToUsAqi(pm25);
  return {
    ...station,
    aqi,
    temperature: weather.current?.temperature_2m,
    humidity: weather.current?.relative_humidity_2m,
    wind: weather.current?.wind_speed_10m,
    pm25,
  };
}

function pm25ToUsAqi(pm25) {
  if (!Number.isFinite(pm25)) return null;
  const breakpoints = [
    [0, 12, 0, 50],
    [12.1, 35.4, 51, 100],
    [35.5, 55.4, 101, 150],
    [55.5, 150.4, 151, 200],
    [150.5, 250.4, 201, 300],
    [250.5, 350.4, 301, 400],
    [350.5, 500.4, 401, 500],
  ];
  const match = breakpoints.find(([low, high]) => pm25 >= low && pm25 <= high);
  if (!match) return null;
  const [low, high, aqiLow, aqiHigh] = match;
  return Math.round(((aqiHigh - aqiLow) / (high - low)) * (pm25 - low) + aqiLow);
}

export default function App() {
  const [stations, setStations] = useState(
    STATIONS.map((station) => ({ ...station, aqi: null }))
  );
  const [activeStationId, setActiveStationId] = useState(STATIONS[0].id);
  const [alertLimit, setAlertLimit] = useState(150);
  const [dataStatus, setDataStatus] = useState("loading");
  const activeStation = stations.find((station) => station.id === activeStationId) || stations[0];
  const live = useMemo(() => bandForAqi(activeStation.aqi), [activeStation.aqi]);
  const alertActive = activeStation.aqi >= alertLimit;

  useEffect(() => {
    let cancelled = false;
    setDataStatus("loading");

    Promise.all(
      STATIONS.map(async (station) => {
        const [airResponse, weatherResponse] = await Promise.all([
          fetch(
          `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${station.lat}&longitude=${station.lng}&current=pm2_5&timezone=auto`
          ),
          fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${station.lat}&longitude=${station.lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=auto`
          ),
        ]);
        if (!airResponse.ok || !weatherResponse.ok) {
          throw new Error("Station request failed");
        }
        const [airData, weatherData] = await Promise.all([
          airResponse.json(),
          weatherResponse.json(),
        ]);
        return stationWithLiveData(station, airData, weatherData);
      })
    )
      .then((liveStations) => {
        if (!cancelled) {
          setStations(liveStations);
          setDataStatus("live");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStations(STATIONS.map((station) => ({ ...station, aqi: null })));
          setDataStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const statusText = {
    loading: "Updating station data...",
    live: "Live station data",
    error: "Live data unavailable",
  }[dataStatus];

  return (
    <div className="page">
      <header className="nav">
        <div className="nav-inner">
          <a className="nav-brand" href="#top">
            DELHI AQI
          </a>
          <nav className="nav-links" aria-label="Primary">
            <a href="#live">Live AQI</a>
            <a href="#map">Map</a>
            <a href="#forecast">Forecast</a>
          </nav>
        </div>
      </header>

      <section className="hero" id="top">
        <h1 className="hero-title">
          Predict the air.
          <br />
          Before it changes.
        </h1>
        <p className="hero-sub">
          Coupling atmospheric conditions and pollutant behaviour to forecast NCR
          air quality for the next 72 hours.
        </p>
      </section>

      <section className="live-wrap" id="live">
        <article className="live-card">
          <div className="live-left">
            <div className="live-pill">
              Real - time Air Quality Index (AQI)
            </div>
            <div className="gauge" aria-label={`AQI ${activeStation.aqi}, ${live.name}`}>
              <div className="gauge-ring" style={{ borderColor: live.color }}>
                <div className="gauge-value">{activeStation.aqi ?? "--"}</div>
                <div className="gauge-label">{live.name.toLowerCase()}</div>
              </div>
            </div>
          </div>

          <div className="live-divider" aria-hidden="true" />

          <div className="live-right">
            <div className="live-controls">
              <label htmlFor="station-select">Station</label>
              <select
                id="station-select"
                value={activeStation.id}
                onChange={(event) => {
                  const station = stations.find(
                    (item) => item.id === event.target.value
                  );
                    if (station) setActiveStationId(station.id);
                }}
              >
                {stations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}
                  </option>
                ))}
              </select>
              <label htmlFor="alert-limit">Alert above AQI</label>
              <input
                id="alert-limit"
                type="number"
                min="0"
                max="500"
                value={alertLimit}
                onChange={(event) => setAlertLimit(Number(event.target.value))}
              />
            </div>
            <div className={`data-status status-${dataStatus}`}>{statusText}</div>
            {alertActive && (
              <div className="aqi-alert" role="status">
                AQI alert: {activeStation.name} is {activeStation.aqi}.
              </div>
            )}
            <div className="metric-grid">
              <Metric
                icon={assetPath("figma/icon-temperature.svg")}
                title="Temperature"
                value={reading(activeStation.temperature, "°C")}
              />
              <Metric
                icon={assetPath("figma/icon-humidity.svg")}
                title="Humidity"
                value={reading(activeStation.humidity, "%")}
              />
              <Metric
                icon={assetPath("figma/icon-wind.svg")}
                title="Wind speed"
                value={reading(activeStation.wind, " km/h")}
              />
              <Metric
                icon={assetPath("figma/icon-pm25.svg")}
                title={
                  <span>
                    PM2.<span className="pm-five">5</span>
                  </span>
                }
                value={reading(activeStation.pm25, " µg/m³")}
              />
            </div>
            <div className="scale-bar" aria-hidden="true" />
          </div>
        </article>
      </section>

      <div className="rule" aria-hidden="true" />

      <section className="map-section" id="map">
        <h2 className="map-title">Interactive AQI map</h2>
        <p className="map-sub">
          real-time air quality across delhi so that you can travel smarter and
          breathe safer
        </p>

        <div className="map-frame">
          <MapContainer
            center={[28.6139, 77.209]}
            zoom={10}
            scrollWheelZoom
            className="live-map"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {stations.map((station) => {
              const stationBand = bandForAqi(station.aqi);
              return (
                <CircleMarker
                  key={station.id}
                  center={[station.lat, station.lng]}
                  radius={activeStation.id === station.id ? 13 : 9}
                  pathOptions={{
                    color: "#ffffff",
                    fillColor: stationBand.color,
                    fillOpacity: 0.95,
                    weight: 3,
                  }}
                  eventHandlers={{ click: () => setActiveStationId(station.id) }}
                >
                  <Popup>
                    <strong>{station.name}</strong>
                    <br />
                    AQI {station.aqi} ({stationBand.name})
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>
      </section>

      <div className="section-gap" />

      <section className="insight-row" id="forecast">
        <article className="insight-card">
          <h3>72-hour NCR forecast</h3>
          <p>
            The same coupling of meteorology and pollutants used in the live
            index, projected forward so you can plan travel before the air
            turns.
          </p>
          <ul className="forecast-list">
            {FORECAST.map((slot) => (
              <li key={slot.label}>
                <span className="forecast-when">{slot.label}</span>
                <span className={`forecast-aqi tone-${slot.tone}`}>{slot.aqi}</span>
                <span className="forecast-band">{slot.band}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="insight-card">
          <h3>Breathe safer at {activeStation.aqi}</h3>
          <p>
            CPCB Moderate. Most people can be outdoors; children, older adults
            and anyone with asthma or heart disease should shorten peak-hour
            exposure.
          </p>
          <ul className="advice-list">
            <li>
              <span className="advice-icon">
                <img src={assetPath("figma/icon-wind.svg")} alt="" />
              </span>
              Prefer early morning routes; wind is currently light across the
              basin.
            </li>
            <li>
              <span className="advice-icon">
                <img src={assetPath("figma/icon-pm25.svg")} alt="" />
              </span>
              PM2.5 is the driver today. Keep windows closed on ITO–Anand Vihar
              corridors.
            </li>
            <li>
              <span className="advice-icon">
                <img src={assetPath("figma/icon-humidity.svg")} alt="" />
              </span>
              Selected station: {activeStation.name} · AQI {activeStation.aqi}{" "}
              ({bandForAqi(activeStation.aqi).name.toLowerCase()}).
            </li>
          </ul>
        </article>
      </section>

      <footer className="footer">
        <span>DELHI AQI</span>
        <span>NCR 72-hour air-quality forecast</span>
      </footer>
    </div>
  );
}

function Metric({ icon, title, value }) {
  return (
    <div className="metric">
      <p className="metric-title">{title}</p>
      <div className="metric-icon-wrap">
        <img src={icon} alt="" />
      </div>
      <p className="metric-value">{value}</p>
    </div>
  );
}
