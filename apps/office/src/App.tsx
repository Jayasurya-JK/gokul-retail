import { invoke } from "@tauri-apps/api/core";
import { InfoScreen } from "@gokul/ui";
import type { AppInfo, LoadInfo } from "@gokul/ui";

const loadFromTauri: LoadInfo = () => invoke<AppInfo>("app_info");

export function App({ loadInfo = loadFromTauri }: { loadInfo?: LoadInfo }) {
  return <InfoScreen title="Gokul Office" loadInfo={loadInfo} />;
}
