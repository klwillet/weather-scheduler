import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type WeatherPoint = {
  time: string;
  temperature: number;
  precipitationProbability: number;
  weatherCode: number;
  isDay: number;
};

type CalendarEvent = {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
};

const DEFAULT_LOCATION = "Bay City, MI 48706";
const DEFAULT_CALENDAR_ID = "gcorser@gmail.com";

const weatherText = (code: number) => {
  if (code === 0) return "Clear";
  if ([1, 2].includes(code)) return "Partly cloudy";
  if (code === 3) return "Cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Weather";
};

const weatherIcon = (code: number, isDay = 1) => {
  if ([95, 96, 99].includes(code)) return "⛈️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "🌨️";
  if ([51, 53, 55, 56, 57].includes(code)) return "🌦️";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";
  if ([45, 48].includes(code)) return "🌫️";
  if (code === 3) return "☁️";
  if ([1, 2].includes(code)) return isDay ? "🌤️" : "☁️";
  return isDay ? "☀️" : "🌙";
};

const dateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const formatDay = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);

const formatShortDay = (date: Date) =>
  new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(date);

const formatHour = (date: Date) =>
  new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: true }).format(date);

const isSameHour = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate() &&
  a.getHours() === b.getHours();

const demoEvents: CalendarEvent[] = [
  { id: "demo-1", summary: "Example all-day event", start: "2026-09-03T00:00:00", end: "2026-09-04T00:00:00", allDay: true },
  { id: "demo-2", summary: "Example meeting", start: "2026-09-02T18:00:00", end: "2026-09-02T19:00:00", allDay: false },
];

async function geocode(query: string) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not find that location.");
  const data = await response.json();
  if (!data.results?.length) throw new Error("Location not found.");
  const place = data.results[0];
  return {
    latitude: place.latitude as number,
    longitude: place.longitude as number,
    label: [place.name, place.admin1, place.country_code].filter(Boolean).join(", "),
  };
}

async function getWeather(latitude: number, longitude: number) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("hourly", "temperature_2m,precipitation_probability,weather_code,is_day");
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "8");

  const response = await fetch(url);
  if (!response.ok) throw new Error("Weather service unavailable.");
  const data = await response.json();
  const points: WeatherPoint[] = data.hourly.time.map((time: string, i: number) => ({
    time,
    temperature: Math.round(data.hourly.temperature_2m[i]),
    precipitationProbability: Math.round(data.hourly.precipitation_probability[i] ?? 0),
    weatherCode: data.hourly.weather_code[i],
    isDay: data.hourly.is_day[i],
  }));
  return { points, daily: data.daily };
}

async function loadPublicCalendar(calendarId: string, day: Date) {
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
  if (!apiKey || apiKey.startsWith("YOUR_")) {
    throw new Error("Add the Google Calendar API key to VITE_GOOGLE_API_KEY to load the public calendar.");
  }

  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("timeMin", start.toISOString());
  url.searchParams.set("timeMax", end.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "2500");
  url.searchParams.set("showDeleted", "false");
  url.searchParams.set("timeZone", Intl.DateTimeFormat().resolvedOptions().timeZone);

  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = body?.error?.message || `Google Calendar request failed (${response.status}).`;
    throw new Error(reason);
  }

  return (body.items ?? []).map((e: any): CalendarEvent => ({
    id: e.id,
    summary: e.summary || "(No title)",
    start: e.start?.dateTime ?? e.start?.date,
    end: e.end?.dateTime ?? e.end?.date,
    allDay: Boolean(e.start?.date),
  }));
}

function App() {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [locationText, setLocationText] = useState(DEFAULT_LOCATION);
  const [location, setLocation] = useState({ latitude: 43.5945, longitude: -83.8889, label: DEFAULT_LOCATION });
  const [calendarId, setCalendarId] = useState(DEFAULT_CALENDAR_ID);
  const [weather, setWeather] = useState<{ points: WeatherPoint[]; daily: any } | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [calendarStatus, setCalendarStatus] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [currentHour, setCurrentHour] = useState(new Date());
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    setLoading(true);
    getWeather(location.latitude, location.longitude)
      .then(setWeather)
      .catch((e) => setStatus(e.message))
      .finally(() => setLoading(false));
  }, [location]);

  useEffect(() => {
    const id = window.setInterval(() => setCurrentHour(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);

  async function refreshCalendar() {
    setCalendarLoading(true);
    setCalendarStatus("");
    try {
      const nextEvents = await loadPublicCalendar(calendarId.trim(), selectedDate);
      setEvents(nextEvents);
      setCalendarStatus(nextEvents.length ? `${nextEvents.length} calendar event${nextEvents.length === 1 ? "" : "s"} loaded.` : "No public events scheduled for this day.");
    } catch (e: any) {
      setEvents([]);
      setCalendarStatus(e.message || "Could not load the public calendar.");
    } finally {
      setCalendarLoading(false);
    }
  }

  useEffect(() => {
    refreshCalendar();
    // calendarId is intentionally part of the refresh trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, calendarId]);

  useEffect(() => {
    const key = `${dateKey(currentHour)}T${String(currentHour.getHours()).padStart(2, "0")}:00`;
    const row = rowRefs.current[key];
    if (row && dateKey(currentHour) === dateKey(selectedDate)) {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [weather, selectedDate, currentHour]);

  const dayPoints = useMemo(() => {
    if (!weather) return [];
    const key = dateKey(selectedDate);
    return weather.points.filter((p) => p.time.startsWith(key));
  }, [weather, selectedDate]);

  const dayEvents = useMemo(() => {
    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return events.filter((e) => {
      const s = new Date(e.start);
      const en = new Date(e.end);
      return s < end && en > start;
    });
  }, [events, selectedDate]);

  const dailySummary = useMemo(() => {
    if (!weather) return null;
    const index = weather.daily.time.findIndex((d: string) => d === dateKey(selectedDate));
    if (index < 0) return null;
    return {
      high: Math.round(weather.daily.temperature_2m_max[index]),
      low: Math.round(weather.daily.temperature_2m_min[index]),
      rain: Math.round(weather.daily.precipitation_probability_max[index] ?? 0),
    };
  }, [weather, selectedDate]);

  function eventsForHour(hour: Date) {
    const start = new Date(hour);
    const end = new Date(hour);
    end.setHours(end.getHours() + 1);
    return dayEvents.filter((e) => {
      if (e.allDay) return false;
      return new Date(e.start) < end && new Date(e.end) > start;
    });
  }

  const allDayEvents = dayEvents.filter((e) => e.allDay);
  const isToday = dateKey(selectedDate) === dateKey(new Date());

  function moveDay(delta: number) {
    setSelectedDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + delta);
      return d;
    });
  }

  async function changeLocation() {
    try {
      setStatus("Finding location…");
      const result = await geocode(locationText);
      setLocation(result);
      setStatus(`Weather location set to ${result.label}.`);
    } catch (e: any) {
      setStatus(e.message);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <img className="brand-icon" src={`${import.meta.env.BASE_URL}icon.svg`} alt="Weather Scheduler icon" />
          <div>
            <div className="brand">weather-scheduler</div>
            <div className="subbrand">A clean hourly view of weather and your public calendar.</div>
          </div>
        </div>
        <div className="actions">
          <button className="ghost-button" onClick={() => setShowSettings((v) => !v)}>{showSettings ? "Close settings" : "Settings"}</button>
          <button className="primary-button" onClick={refreshCalendar} disabled={calendarLoading}>
            {calendarLoading ? "Refreshing…" : "Refresh calendar"}
          </button>
        </div>
      </header>

      {showSettings && (
        <section className="settings-card">
          <div className="settings-title">Schedule settings</div>
          <div className="settings-grid">
            <label>
              <span>Weather location</span>
              <div className="location-control">
                <input value={locationText} onChange={(e) => setLocationText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && changeLocation()} />
                <button onClick={changeLocation}>Update</button>
              </div>
            </label>
            <label>
              <span>Public Google Calendar ID</span>
              <input value={calendarId} onChange={(e) => setCalendarId(e.target.value)} placeholder="calendar-id@group.calendar.google.com" />
            </label>
          </div>
          <div className="settings-note">No Google sign-in is used. The calendar must be public and visible to anyone with access to its public calendar data.</div>
        </section>
      )}

      <section className="hero">
        <div>
          <div className="eyebrow">HOURLY PLANNER</div>
          <div className="date-title">{formatDay(selectedDate)}</div>
          <div className="summary-line">
            {dailySummary ? `High ${dailySummary.high}°  ·  Low ${dailySummary.low}°  ·  Max rain ${dailySummary.rain}%` : "Loading forecast…"}
          </div>
          <div className="location-line">{location.label}</div>
        </div>
        <div className="day-controls">
          <button className="circle-button" onClick={() => moveDay(-1)} aria-label="Previous day">‹</button>
          <button className={isToday ? "day-button active" : "day-button"} onClick={() => setSelectedDate(new Date())}>Today</button>
          <button className="circle-button" onClick={() => moveDay(1)} aria-label="Next day">›</button>
        </div>
      </section>

      {(status || calendarStatus) && (
        <div className="status-stack">
          {status && <div className="status" role="status">{status}</div>}
          {calendarStatus && <div className="status calendar-status" role="status">{calendarStatus}</div>}
        </div>
      )}

      <section className="schedule-card">
        <div className="schedule-header">
          <div>Time</div>
          <div>Weather</div>
          <div>Calendar</div>
        </div>

        <div className="day-banner">
          <div>{isToday ? "Today" : formatShortDay(selectedDate)}</div>
          <div>{dailySummary ? `${dailySummary.high}° / ${dailySummary.low}°` : "—"}</div>
          <div><span className="calendar-dot" /> Public calendar</div>
        </div>

        {allDayEvents.length > 0 && (
          <div className="all-day-row">
            <div className="all-day-label">ALL DAY</div>
            <div />
            <div className="all-day-events">
              {allDayEvents.map((e) => <span key={e.id}>{e.summary}</span>)}
            </div>
          </div>
        )}

        {loading && <div className="loading-row">Loading hourly forecast…</div>}

        {!loading && dayPoints.map((point) => {
          const d = new Date(point.time);
          const current = isSameHour(d, currentHour) && isToday;
          const hourEvents = eventsForHour(d);
          return (
            <div
              className={`schedule-row ${current ? "current" : ""}`}
              key={point.time}
              ref={(el) => { rowRefs.current[point.time] = el; }}
            >
              <div className="time-cell">
                {current && <span className="now-dot" />}
                <strong>{formatHour(d)}</strong>
              </div>
              <div className="weather-cell">
                <span className="temperature">{point.temperature}°</span>
                <span className="weather-icon" title={weatherText(point.weatherCode)}>{weatherIcon(point.weatherCode, point.isDay)}</span>
                <span className="rain">{point.precipitationProbability}% rain</span>
              </div>
              <div className="calendar-cell">
                {hourEvents.length ? hourEvents.map((e) => (
                  <div className="event-chip" key={e.id}>
                    <span className="event-bar" />
                    <span>{e.summary}</span>
                  </div>
                )) : <span className="empty-event">—</span>}
              </div>
            </div>
          );
        })}

        {!loading && !dayPoints.length && (
          <div className="empty-state">No hourly forecast is available for this date.</div>
        )}
      </section>

      <footer>
        <span>Weather by Open-Meteo</span><span>·</span><span>Public calendar by Google Calendar</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
