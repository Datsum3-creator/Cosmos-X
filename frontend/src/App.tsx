import { useEffect, useState } from "react";
import {
  fetchDbHealth,
  fetchHealth,
  type DbHealthResponse,
  type HealthResponse,
} from "./api/health";

export function App() {
  const [apiHealth, setApiHealth] = useState<HealthResponse | null>(null);
  const [dbHealth, setDbHealth] = useState<DbHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function check() {
      try {
        const [api, db] = await Promise.all([fetchHealth(), fetchDbHealth()]);
        if (active) {
          setApiHealth(api);
          setDbHealth(db);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Connection failed");
        }
      }
    }

    void check();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>COSMOS X — Phase 0</h1>
      {error && <p style={{ color: "crimson" }}>Error: {error}</p>}
      <section>
        <h2>Backend API</h2>
        <pre>{apiHealth ? JSON.stringify(apiHealth, null, 2) : "Checking..."}</pre>
      </section>
      <section>
        <h2>Database</h2>
        <pre>{dbHealth ? JSON.stringify(dbHealth, null, 2) : "Checking..."}</pre>
      </section>
    </main>
  );
}

export default App;
