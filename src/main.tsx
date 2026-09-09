import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const CALENDAR_ID = "gcorser@gmail.com";
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY as string;

type CalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start: {
    date?: string;
    dateTime?: string;
  };
  end: {
    date?: string;
    dateTime?: string;
  };
};

type WeatherHour = {
  time: string;
  temperature: number;
  shortForecast: string;
  precipitationProbability: number;
  icon: string;
};

type WeatherDay = {
  date: string;
  high: number;
  low: number;
  hours: WeatherHour[];
};

const DEFAULT_ZIP = "48706";

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function dateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function weatherIcon(forecast: string) {
  const text = forecast.toLowerCase();

  if (text.includes("thunder")) return "⛈️";
  if (text.includes("snow") || text.includes("sleet")) return "❄️";
  if (text.includes("rain") || text.includes("shower")) return "🌧️";
  if (text.includes("fog")) return "🌫️";
  if (text.includes("cloud")) return "⛅";
  if (text.includes("sun") || text.includes("clear")) return "☀️";

  return "🌤️";
}

async function getCoordinates(zip: string) {
  const response = await fetch(
    `https://api.zippopotam.us/us/${encodeURIComponent(zip)}`
  );

  if (!response.ok) {
    throw new Error("Could not find that ZIP code.");
  }

  const data = await response.json();

  if (!data.places?.length) {
    throw new Error("Could not find that ZIP code.");
  }

  const place = data.places[0];

  return {
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
    city: place["place name"],
    state: place["state abbreviation"],
  };
}

async function getWeather(zip: string): Promise<WeatherDay[]> {
  const location = await getCoordinates(zip);

  const pointResponse = await fetch(
    `https://api.weather.gov/points/${location.latitude},${location.longitude}`
  );

  if (!pointResponse.ok) {
    throw new Error("Could not find weather information for that location.");
  }

  const pointData = await pointResponse.json();

  const hourlyResponse = await fetch(
    pointData.properties.forecastHourly
  );

  const dailyResponse = await fetch(
    pointData.properties.forecast
  );

  if (!hourlyResponse.ok || !dailyResponse.ok) {
    throw new Error("Weather information could not be loaded.");
  }

  const hourlyData = await hourlyResponse.json();
  const dailyData = await dailyResponse.json();

  const hourlyPeriods = hourlyData.properties.periods.slice(0, 72);
  const dailyPeriods = dailyData.properties.periods;

  const days: Record<string, WeatherDay> = {};

  for (const period of hourlyPeriods) {
    const date = new Date(period.startTime);
    const key = dateKey(date);

    if (!days[key]) {
      days[key] = {
        date: key,
        high: 0,
        low: 0,
        hours: [],
      };
    }

    days[key].hours.push({
      time: period.startTime,
      temperature: period.temperature,
      shortForecast: period.shortForecast,
      precipitationProbability:
        period.probabilityOfPrecipitation?.value ?? 0,
      icon: weatherIcon(period.shortForecast),
    });
  }

  for (const period of dailyPeriods) {
    if (!period.isDaytime) continue;

    const key = dateKey(new Date(period.startTime));

    if (days[key]) {
      days[key].high = period.temperature;
    }
  }

  for (const period of dailyPeriods) {
    if (period.isDaytime) continue;

    const key = dateKey(new Date(period.startTime));

    if (days[key]) {
      days[key].low = period.temperature;
    }
  }

  return Object.values(days);
}

async function getCalendarEvents(): Promise<CalendarEvent[]> {
  if (!GOOGLE_API_KEY) {
    throw new Error(
      "Google Calendar API key is missing. Add VITE_GOOGLE_API_KEY to GitHub Actions secrets."
    );
  }

  const now = new Date();

  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const url =
    `https://www.googleapis.com/calendar/v3/calendars/` +
    `${encodeURIComponent(CALENDAR_ID)}/events` +
    `?timeMin=${encodeURIComponent(start.toISOString())}` +
    `&timeMax=${encodeURIComponent(end.toISOString())}` +
    `&singleEvents=true` +
    `&orderBy=startTime` +
    `&maxResults=250` +
    `&key=${encodeURIComponent(GOOGLE_API_KEY)}`;

  const response = await fetch(url);

  const data = await response.json();

  if (!response.ok) {
    const message =
      data?.error?.message ||
      "The public Google Calendar could not be loaded.";

    throw new Error(message);
  }

  return data.items || [];
}

function eventsForHour(
  events: CalendarEvent[],
  date: Date
) {
  const day = dateKey(date);
  const hour = date.getHours();

  return events.filter((event) => {
    if (!event.start.dateTime) return false;

    const start = new Date(event.start.dateTime);

    return (
      dateKey(start) === day &&
      start.getHours() === hour
    );
  });
}

function allDayEventsForDate(
  events: CalendarEvent[],
  date: Date
) {
  const key = dateKey(date);

  return events.filter((event) => {
    if (!event.start.date) return false;

    const start = event.start.date;
    const end = event.end.date || event.start.date;

    return key >= start && key < end;
  });
}

function EventList({
  events,
}: {
  events: CalendarEvent[];
}) {
  if (!events.length) {
    return <span className="empty-event">—</span>;
  }

  return (
    <div className="event-list">
      {events.map((event) => (
        <a
          key={event.id}
          href={event.htmlLink || "#"}
          target="_blank"
          rel="noreferrer"
          className="calendar-event"
        >
          {event.summary || "Untitled event"}
        </a>
      ))}
    </div>
  );
}

function App() {
  const [zip, setZip] = useState(
    localStorage.getItem("weatherZip") || DEFAULT_ZIP
  );

  const [location, setLocation] = useState<{
    city: string;
    state: string;
  } | null>(null);

  const [weather, setWeather] = useState<WeatherDay[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(true);

  const [weatherError, setWeatherError] = useState("");
  const [calendarError, setCalendarError] = useState("");

  const [settingsOpen, setSettingsOpen] = useState(false);

  const [selectedDate, setSelectedDate] = useState(
    dateKey(new Date())
  );

  async function loadWeather(zipCode: string) {
    try {
      setWeatherError("");

      const coordinates = await getCoordinates(zipCode);

      setLocation({
        city: coordinates.city,
        state: coordinates.state,
      });

      const forecast = await getWeather(zipCode);

      setWeather(forecast);

      localStorage.setItem("weatherZip", zipCode);
    } catch (error) {
      setWeatherError(
        error instanceof Error
          ? error.message
          : "Weather could not be loaded."
      );
    }
  }

  async function loadCalendar() {
    try {
      setCalendarLoading(true);
      setCalendarError("");

      const calendarEvents = await getCalendarEvents();

      setEvents(calendarEvents);
    } catch (error) {
      setCalendarError(
        error instanceof Error
          ? error.message
          : "Calendar could not be loaded."
      );
    } finally {
      setCalendarLoading(false);
    }
  }

  useEffect(() => {
    async function load() {
      setLoading(true);

      await Promise.all([
        loadWeather(zip),
        loadCalendar(),
      ]);

      setLoading(false);
    }

    load();
  }, []);

  const selectedDay = useMemo(
    () => weather.find((day) => day.date === selectedDate),
    [weather, selectedDate]
  );

  const selectedDateObject = new Date(`${selectedDate}T00:00:00`);

  const allDayEvents = allDayEventsForDate(
    events,
    selectedDateObject
  );

  function changeDay(offset: number) {
    const current = new Date(`${selectedDate}T00:00:00`);

    current.setDate(current.getDate() + offset);

    setSelectedDate(dateKey(current));
  }

  async function handleLocationSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const newZip = String(form.get("zip") || "").trim();

    if (!/^\d{5}$/.test(newZip)) {
      setWeatherError("Please enter a five-digit ZIP code.");
      return;
    }

    await loadWeather(newZip);
    setSettingsOpen(false);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <img
            src={`${import.meta.env.BASE_URL}icons/icon-192.png`}
            alt=""
            className="app-icon"
          />

          <div>
            <div className="app-name">Weather Scheduler</div>
            <div className="app-subtitle">
              Weather + George Corser's schedule
            </div>
          </div>
        </div>

        <button
          className="settings-button"
          onClick={() => setSettingsOpen(!settingsOpen)}
          aria-label="Open settings"
        >
          ⚙️
        </button>
      </header>

      {settingsOpen && (
        <section className="settings-panel">
          <form onSubmit={handleLocationSubmit}>
            <label htmlFor="zip">
              Weather location
            </label>

            <div className="settings-row">
              <input
                id="zip"
                name="zip"
                defaultValue={zip}
                placeholder="ZIP code"
                maxLength={5}
              />

              <button type="submit">
                Change
              </button>
            </div>
          </form>

          <div className="calendar-setting">
            <strong>Calendar</strong>

            <span>
              George Corser's public Google Calendar
            </span>
          </div>
        </section>
      )}

      <main>
        <section className="schedule-heading">
          <div>
            <div className="eyebrow">SCHEDULE</div>

            <h1>
              {formatDate(selectedDateObject)}
            </h1>

            {location && (
              <p className="location">
                📍 {location.city}, {location.state}
              </p>
            )}
          </div>

          <div className="day-controls">
            <button
              onClick={() => changeDay(-1)}
              aria-label="Previous day"
            >
              ←
            </button>

            <button
              onClick={() => setSelectedDate(dateKey(new Date()))}
            >
              Today
            </button>

            <button
              onClick={() => changeDay(1)}
              aria-label="Next day"
            >
              →
            </button>
          </div>
        </section>

        {weatherError && (
          <div className="error-message">
            {weatherError}
          </div>
        )}

        {calendarError && (
          <div className="error-message">
            Google Calendar: {calendarError}
          </div>
        )}

        {calendarLoading && (
          <div className="loading-message">
            Loading calendar…
          </div>
        )}

        <div className="schedule-card">
          <div className="schedule-header">
            <div>TIME</div>
            <div>WEATHER</div>
            <div>CALENDAR</div>
          </div>

          {loading ? (
            <div className="loading-row">
              Loading weather…
            </div>
          ) : !selectedDay ? (
            <div className="loading-row">
              No weather information is available for this date.
            </div>
          ) : (
            <>
              {allDayEvents.length > 0 && (
                <div className="all-day-row">
                  <div className="all-day-label">
                    ALL DAY
                  </div>

                  <div className="all-day-events">
                    <EventList events={allDayEvents} />
                  </div>
                </div>
              )}

              {selectedDay.hours.map((hour) => {
                const date = new Date(hour.time);

                const hourEvents = eventsForHour(
                  events,
                  date
                );

                const isCurrentHour =
                  dateKey(new Date()) ===
                    selectedDate &&
                  new Date().getHours() ===
                    date.getHours();

                return (
                  <div
                    className={`schedule-row ${
                      isCurrentHour
                        ? "current-hour"
                        : ""
                    }`}
                    key={hour.time}
                  >
                    <div className="time-cell">
                      {formatTime(date)}
                    </div>

                    <div className="weather-cell">
                      <span className="weather-icon">
                        {hour.icon}
                      </span>

                      <span className="temperature">
                        {hour.temperature}°
                      </span>

                      <span className="forecast">
                        {hour.shortForecast}
                      </span>

                      {hour.precipitationProbability >
                        0 && (
                        <span className="rain">
                          {hour.precipitationProbability}%
                          rain
                        </span>
                      )}
                    </div>

                    <div className="calendar-cell">
                      <EventList
                        events={hourEvents}
                      />
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <footer className="app-footer">
          <span>
            Weather Scheduler
          </span>

          <span>
            Public calendar · Updated automatically
          </span>
        </footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
