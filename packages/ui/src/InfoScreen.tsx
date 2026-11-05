import { useEffect, useState } from "react";

export interface AppInfo {
  name: string;
  version: string;
  schema_version: number;
}

export type LoadInfo = () => Promise<AppInfo>;

type State =
  | { kind: "loading" }
  | { kind: "ready"; info: AppInfo }
  | { kind: "error"; message: string };

/** Step 1 placeholder screen: app title plus what the Rust side reports. */
export function InfoScreen({
  title,
  loadInfo,
}: {
  title: string;
  loadInfo: LoadInfo;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    loadInfo().then(
      (info) => {
        if (!cancelled) setState({ kind: "ready", info });
      },
      (err: unknown) => {
        if (!cancelled) setState({ kind: "error", message: String(err) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [loadInfo]);

  return (
    <main className="gk-page">
      <h1>{title}</h1>
      <section className="gk-card">
        {state.kind === "loading" && <p>Loading...</p>}
        {state.kind === "error" && (
          <p className="gk-error" role="alert">
            {state.message}
          </p>
        )}
        {state.kind === "ready" && (
          <dl>
            <div className="gk-row">
              <dt>App</dt>
              <dd>{state.info.name}</dd>
            </div>
            <div className="gk-row">
              <dt>Version</dt>
              <dd>{state.info.version}</dd>
            </div>
            <div className="gk-row">
              <dt>Data version</dt>
              <dd>{state.info.schema_version}</dd>
            </div>
          </dl>
        )}
      </section>
    </main>
  );
}
