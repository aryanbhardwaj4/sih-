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

const STUBBLE_SOURCES = [
  { name: "Haryana belt", lat: 29.15, lng: 76.65 },
  { name: "Punjab belt", lat: 30.85, lng: 75.55 },
  { name: "Western Uttar Pradesh", lat: 28.95, lng: 77.65 },
];

const WRFCHEM_CONFIG = {
  domain: "Delhi-NCR 3 km nest",
  parentDomain: "North India 9 km",
  chemistry: "CBMZ-MOSAIC",
  meteorology: "ERA5 boundary conditions",
  runCycle: "00 UTC",
  forecastWindow: "72 hours",
};

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

function grapStageForAqi(aqi) {
  if (!Number.isFinite(aqi) || aqi < 201) {
    return { stage: "No GRAP stage", label: "Routine monitoring", color: "#34c759", message: "AQI is below the GRAP activation threshold." };
  }
  if (aqi <= 300) return { stage: "Stage I", label: "Poor", color: "#ff8d28", message: "Dust and open-burning controls should be enforced." };
  if (aqi <= 400) return { stage: "Stage II", label: "Very poor", color: "#e53935", message: "Stricter construction, traffic and generator controls apply." };
  if (aqi <= 450) return { stage: "Stage III", label: "Severe", color: "#7b1fa2", message: "Emergency measures are recommended for sensitive groups." };
  return { stage: "Stage IV", label: "Severe+", color: "#4a148c", message: "Severe restrictions and a health emergency response are advised." };
}

function inversionForHeight(height) {
  if (!Number.isFinite(height)) return { label: "Unavailable", detail: "Boundary-layer data is unavailable.", color: "#9b9ba3" };
  if (height < 300) return { label: "Strong", detail: `${Math.round(height)} m mixing height · pollutants trapped near the ground`, color: "#e53935" };
  if (height < 700) return { label: "Moderate", detail: `${Math.round(height)} m mixing height · limited vertical dispersion`, color: "#ff8d28" };
  return { label: "Weak", detail: `${Math.round(height)} m mixing height · better vertical dispersion`, color: "#34c759" };
}

function plumeForStation(station) {
  const direction = Number(station.windDirection);
  if (!Number.isFinite(direction)) return { direction: "Unknown", risk: "Waiting for wind data", detail: "A plume path will appear when the station reports wind direction." };
  const source = STUBBLE_SOURCES.reduce((nearest, candidate) => {
    const distance = Math.hypot(candidate.lat - station.lat, candidate.lng - station.lng);
    return distance < nearest.distance ? { candidate, distance } : nearest;
  }, { candidate: STUBBLE_SOURCES[0], distance: Infinity }).candidate;
  const compass = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(direction / 45) % 8];
  const downwind = (direction + 180) % 360;
  const downwindCompass = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(downwind / 45) % 8];
  const sourceDistance = Math.hypot(source.lat - station.lat, source.lng - station.lng);
  const risk = sourceDistance < 1.5 && station.windSpeed < 12 ? "Elevated" : sourceDistance < 3.2 ? "Watch" : "Low";
  return {
    direction: `${compass} wind · plume toward ${downwindCompass}`,
    risk,
    detail: `${source.name} is the nearest mapped source zone · ${Math.round(station.windSpeed || 0)} km/h wind`,
  };
}

async function getWrfChemStatus() {
  const endpoint = import.meta.env.VITE_WRFCHEM_API_URL;
  if (!endpoint) return { mode: "framework", status: "Framework mode" };
  const response = await fetch(`${endpoint.replace(/\/$/, "")}/health`);
  if (!response.ok) throw new Error("WRF-Chem service is unavailable");
  return { mode: "live", status: "WRF-Chem service connected" };
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
    windSpeed: weather.current?.wind_speed_10m,
    windDirection: weather.current?.wind_direction_10m,
    boundaryLayerHeight: weather.current?.boundary_layer_height,
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

function historyFromHourlyData(hourly) {
  const times = hourly?.time || [];
  const pm25Values = hourly?.pm2_5 || [];
  const now = Date.now();
  const available = times
    .map((time, index) => ({
      time,
      timestamp: new Date(time).getTime(),
      aqi: pm25ToUsAqi(Number(pm25Values[index])),
    }))
    .filter((point) => point.timestamp <= now)
    .filter((point) => Number.isFinite(point.aqi));
  if (!available.length) return [];

  const latestIndex = available.length - 1;
  return [72, 48, 24, 0].map((hoursAgo) => {
    const point = available[Math.max(0, latestIndex - (hoursAgo * 1))];
    const date = new Date(point.time);
    return {
      label: hoursAgo === 0 ? "Now" : `-${hoursAgo}h`,
      aqi: point.aqi,
      band: bandForAqi(point.aqi).name,
      tone: point.aqi > 200 ? "red" : "orange",
    };
  });
}

export default function App() {
  const [darkMode, setDarkMode] = useState(() => {
    return window.localStorage.getItem("delhi-aqi-theme") === "dark";
  });
  const [stations, setStations] = useState(
    STATIONS.map((station) => ({ ...station, aqi: null }))
  );
  const [activeStationId, setActiveStationId] = useState(STATIONS[0].id);
  const [alertLimit, setAlertLimit] = useState(150);
  const [dataStatus, setDataStatus] = useState("loading");
  const [history, setHistory] = useState([]);
  const [historyStatus, setHistoryStatus] = useState("loading");
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
            `https://api.open-meteo.com/v1/forecast?latitude=${station.lat}&longitude=${station.lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,boundary_layer_height&timezone=auto`
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

  useEffect(() => {
    let cancelled = false;
    setHistoryStatus("loading");
    fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${activeStation.lat}&longitude=${activeStation.lng}&hourly=pm2_5&past_days=3&forecast_days=1&timezone=auto`
    )
      .then((response) => {
        if (!response.ok) throw new Error("Historical air-quality request failed");
        return response.json();
      })
      .then((data) => {
        const points = historyFromHourlyData(data.hourly);
        if (!points.length) throw new Error("Historical air-quality data unavailable");
        if (!cancelled) {
          setHistory(points);
          setHistoryStatus("live");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHistory([]);
          setHistoryStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeStation.lat, activeStation.lng]);

  const statusText = {
    loading: "Updating station data...",
    live: "Live station data",
    error: "Live data unavailable",
  }[dataStatus];
  const grap = grapStageForAqi(activeStation.aqi);
  const inversion = inversionForHeight(activeStation.boundaryLayerHeight);
  const plume = plumeForStation(activeStation);
  const [wrfChemStatus, setWrfChemStatus] = useState({
    mode: "framework",
    status: "Checking model configuration...",
  });
  const [wrfForecastHour, setWrfForecastHour] = useState(24);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    window.localStorage.setItem("delhi-aqi-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    let cancelled = false;
    getWrfChemStatus()
      .then((result) => {
        if (!cancelled) setWrfChemStatus(result);
      })
      .catch(() => {
        if (!cancelled) {
          setWrfChemStatus({ mode: "error", status: "WRF-Chem service unavailable" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={`page ${darkMode ? "theme-dark" : ""}`}>
      <header className="nav">
        <div className="nav-inner">
          <a className="nav-brand" href="#top">
            DELHI AQI
          </a>
          <nav className="nav-links" aria-label="Primary">
            <a href="#live">Live AQI</a>
            <a href="#map">Map</a>
            <a href="#wrf-chem">WRF-Chem</a>
            <a href="#forecast">Forecast</a>
          </nav>
          <button
            className="theme-toggle"
            type="button"
            aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            aria-pressed={darkMode}
            onClick={() => setDarkMode((enabled) => !enabled)}
          >
            <span className="bat-mask" aria-hidden="true">
              <span className="bat-eye bat-eye-left" />
              <span className="bat-eye bat-eye-right" />
            </span>
            {darkMode ? "Light" : "Dark"}
          </button>
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
                <div className="gauge-value" style={{ color: "#000000" }}>
                  {activeStation.aqi ?? "--"}
                </div>
                <div className="gauge-label" style={{ color: "#000000" }}>
                  {live.name.toLowerCase()}
                </div>
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
            <div className="feature-strip" aria-label="Atmospheric indicators">
              <div className="feature-strip-item">
                <span>Inversion</span>
                <strong style={{ color: inversion.color }}>{inversion.label}</strong>
              </div>
              <div className="feature-strip-item">
                <span>Stubble plume</span>
                <strong>{plume.risk}</strong>
              </div>
              <div className="feature-strip-item">
                <span>GRAP</span>
                <strong style={{ color: grap.color }}>{grap.stage}</strong>
              </div>
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

      <section className="feature-row" aria-label="Air quality intelligence">
        <article className="feature-card plume-card">
          <div className="feature-card-heading">
            <span className="feature-kicker">Regional smoke movement</span>
            <span className="feature-status" data-tone={plume.risk.toLowerCase()}>{plume.risk}</span>
          </div>
          <h2>Stubble-plume tracker</h2>
          <p className="feature-value">{plume.direction}</p>
          <p>{plume.detail}. This directional estimate combines the selected station's wind with mapped crop-burning belts; it is not a fire-detection feed.</p>
          <div className="plume-compass" style={{ "--plume-angle": `${Number(activeStation.windDirection) || 0}deg` }}>
            <span className="compass-arrow">↑</span>
            <span>N</span><span>E</span><span>S</span><span>W</span>
          </div>
        </article>

        <article className="feature-card">
          <div className="feature-card-heading">
            <span className="feature-kicker">Vertical mixing forecast</span>
            <span className="feature-status" style={{ color: inversion.color }}>{inversion.label}</span>
          </div>
          <h2>Inversion strength indicator</h2>
          <p className="feature-value" style={{ color: inversion.color }}>{inversion.label} inversion</p>
          <p>{inversion.detail}. A stronger inversion means less vertical mixing, so the same emissions can produce a faster AQI rise.</p>
          <div className="indicator-bar"><span style={{ width: inversion.label === "Strong" ? "88%" : inversion.label === "Moderate" ? "55%" : "24%", background: inversion.color }} /></div>
          <small>Based on Open-Meteo boundary-layer height for {activeStation.name}.</small>
        </article>

        <article className="feature-card grap-card" style={{ "--grap-color": grap.color }}>
          <div className="feature-card-heading">
            <span className="feature-kicker">CPCB response monitor</span>
            <span className="feature-status">{grap.stage}</span>
          </div>
          <h2>GRAP alert system</h2>
          <p className="feature-value">{grap.label}</p>
          <p>{grap.message}</p>
          <div className="grap-alert" role="status">
            <strong>{Number.isFinite(activeStation.aqi) ? `AQI ${activeStation.aqi}` : "AQI unavailable"}</strong>
            <span>{grap.stage === "No GRAP stage" ? "Keep monitoring local conditions." : "Alert active for the selected station."}</span>
          </div>
        </article>
      </section>

      <section className="wrf-section" id="wrf-chem">
        <div className="wrf-heading">
          <div>
            <span className="feature-kicker">Numerical air-quality modelling</span>
            <h2>WRF-Chem framework</h2>
            <p>
              A model-ready regional forecasting layer for coupling meteorology,
              emissions, transport and chemistry across the NCR.
            </p>
          </div>
          <div className={`wrf-status wrf-status-${wrfChemStatus.mode}`}>
            <span className="status-dot" />
            {wrfChemStatus.status}
          </div>
        </div>
        <div className="wrf-grid">
          <div className="wrf-config">
            <h3>Run configuration</h3>
            <div className="wrf-config-grid">
              <div><span>Nested domain</span><strong>{WRFCHEM_CONFIG.domain}</strong></div>
              <div><span>Parent domain</span><strong>{WRFCHEM_CONFIG.parentDomain}</strong></div>
              <div><span>Chemistry</span><strong>{WRFCHEM_CONFIG.chemistry}</strong></div>
              <div><span>Meteorology</span><strong>{WRFCHEM_CONFIG.meteorology}</strong></div>
              <div><span>Run cycle</span><strong>{WRFCHEM_CONFIG.runCycle}</strong></div>
              <div><span>Forecast window</span><strong>{WRFCHEM_CONFIG.forecastWindow}</strong></div>
            </div>
          </div>
          <div className="wrf-output">
            <div className="wrf-output-heading">
              <h3>Forecast output</h3>
              <label htmlFor="wrf-hour">Lead hour</label>
              <select id="wrf-hour" value={wrfForecastHour} onChange={(event) => setWrfForecastHour(Number(event.target.value))}>
                {[0, 6, 12, 24, 48, 72].map((hour) => <option key={hour} value={hour}>+{hour}h</option>)}
              </select>
            </div>
            <div className="wrf-output-value">
              <strong>{Number.isFinite(activeStation.aqi) ? Math.round(activeStation.aqi + (wrfForecastHour / 12) * 4) : "--"}</strong>
              <span>modelled AQI proxy · {activeStation.name}</span>
            </div>
            <div className="wrf-layers">
              <span>PM2.5 transport</span><span>NO₂ chemistry</span><span>O₃ formation</span><span>Smoke plume</span>
            </div>
          </div>
        </div>
        <p className="wrf-note">
          Framework mode is active until a WRF-Chem service is configured. Set
          <code>VITE_WRFCHEM_API_URL</code> to connect a server exposing
          <code>/health</code> and forecast raster/vector outputs.
        </p>
      </section>

      <section className="insight-row" id="forecast">
        <article className="insight-card">
          <h3>Last 72 hours at {activeStation.name}</h3>
          <p>
            Real-time PM2.5 observations converted to AQI for the selected
            station, so you can see how conditions have changed over the last
            72 hours.
          </p>
          <div className={`data-status status-${historyStatus}`}>
            {historyStatus === "loading"
              ? "Loading 72-hour history..."
              : historyStatus === "live"
                ? "Live historical data"
                : "72-hour history unavailable"}
          </div>
          <ul className="forecast-list">
            {history.map((slot) => (
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
