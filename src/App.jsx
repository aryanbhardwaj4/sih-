import { useMemo, useState } from "react";
import "./App.css";

const STATIONS = [
  { id: "anand-vihar", name: "Anand Vihar", aqi: 186, x: 62, y: 48 },
  { id: "rk-puram", name: "R.K. Puram", aqi: 142, x: 41, y: 58 },
  { id: "dwarka", name: "Dwarka", aqi: 128, x: 28, y: 62 },
  { id: "ito", name: "ITO", aqi: 157, x: 52, y: 54 },
  { id: "noida", name: "Noida Sec 62", aqi: 171, x: 74, y: 56 },
];

const FORECAST = [
  { label: "Now", aqi: 150, band: "Moderate", tone: "orange" },
  { label: "+24h", aqi: 168, band: "Moderate", tone: "orange" },
  { label: "+48h", aqi: 211, band: "Poor", tone: "red" },
  { label: "+72h", aqi: 184, band: "Moderate", tone: "orange" },
];

function bandForAqi(aqi) {
  if (aqi <= 50) return { name: "Good", color: "#34C759" };
  if (aqi <= 100) return { name: "Satisfactory", color: "#A8E05F" };
  if (aqi <= 200) return { name: "Moderate", color: "#FF8D28" };
  if (aqi <= 300) return { name: "Poor", color: "#E53935" };
  if (aqi <= 400) return { name: "Very Poor", color: "#7B1FA2" };
  return { name: "Severe", color: "#4A148C" };
}

export default function App() {
  const [activeStation, setActiveStation] = useState(STATIONS[0]);
  const live = useMemo(() => bandForAqi(150), []);

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
            <div className="gauge" aria-label={`AQI 150, ${live.name}`}>
              <div className="gauge-ring">
                <div className="gauge-value">150</div>
                <div className="gauge-label">moderate</div>
              </div>
            </div>
          </div>

          <div className="live-divider" aria-hidden="true" />

          <div className="live-right">
            <div className="metric-grid">
              <Metric
                icon="/figma/icon-temperature.svg"
                title="Temperature"
                value="32°C"
              />
              <Metric
                icon="/figma/icon-humidity.svg"
                title="Humidity"
                value="54%"
              />
              <Metric
                icon="/figma/icon-wind.svg"
                title="Wind speed"
                value="9 km/h"
              />
              <Metric
                icon="/figma/icon-pm25.svg"
                title={
                  <span>
                    PM2.<span className="pm-five">5</span>
                  </span>
                }
                value="62 µg/m³"
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
          <img
            src="/figma/aqi-map.png"
            alt="Map of Delhi and NCR with live air-quality stations"
          />
          {STATIONS.map((station) => (
            <button
              key={station.id}
              className={`pin ${activeStation.id === station.id ? "is-active" : ""}`}
              style={{ left: `${station.x}%`, top: `${station.y}%` }}
              onClick={() => setActiveStation(station)}
              aria-label={`${station.name}, AQI ${station.aqi}`}
              type="button"
            >
              <span className="pin-dot" />
              <span className="pin-tip">
                {station.name}
                <strong>{station.aqi}</strong>
              </span>
            </button>
          ))}
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
          <h3>Breathe safer at 150</h3>
          <p>
            CPCB Moderate. Most people can be outdoors; children, older adults
            and anyone with asthma or heart disease should shorten peak-hour
            exposure.
          </p>
          <ul className="advice-list">
            <li>
              <span className="advice-icon">
                <img src="/figma/icon-wind.svg" alt="" />
              </span>
              Prefer early morning routes; wind is currently light across the
              basin.
            </li>
            <li>
              <span className="advice-icon">
                <img src="/figma/icon-pm25.svg" alt="" />
              </span>
              PM2.5 is the driver today. Keep windows closed on ITO–Anand Vihar
              corridors.
            </li>
            <li>
              <span className="advice-icon">
                <img src="/figma/icon-humidity.svg" alt="" />
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
