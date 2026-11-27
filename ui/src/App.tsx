import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { messageFor } from "@/lib/errors";
import { type AppInfo, commands, IpcError, unwrap } from "@/lib/ipc";

type InfoState = { status: "loading" } | { status: "ready"; info: AppInfo } | { status: "failed"; message: string };

function useAppInfo(): InfoState {
  const [state, setState] = useState<InfoState>({ status: "loading" });
  useEffect(() => {
    let active = true;
    unwrap(commands.appInfo()).then(
      (info) => active && setState({ status: "ready", info }),
      (e: unknown) =>
        active &&
        setState({ status: "failed", message: messageFor(e instanceof IpcError ? e.error : { kind: "internal" }) }),
    );
    return () => {
      active = false;
    };
  }, []);
  return state;
}

function appInfoLine(state: InfoState): string {
  if (state.status === "loading") return "Chargement…";
  if (state.status === "failed") return state.message;
  return `Version ${state.info.version} · ${state.info.build_channel}`;
}

export function App() {
  const info = useAppInfo();
  return (
    <main className="mx-auto flex min-h-screen max-w-(--texte-note-corps-largeur-max) flex-col justify-center gap-4 p-8">
      <h1 className="titre-page">Harvey</h1>
      <p className="corps text-muted-foreground">Votre cabinet, vos dossiers, votre temps — au même endroit.</p>
      <p className="note-corps">
        Vous retrouvez ici chaque note de dossier, <em>exactement</em> telle que vous l’avez écrite.
      </p>
      <p className="mono">2026-0001</p>
      <p className="mono text-muted-foreground" role="status">
        {appInfoLine(info)}
      </p>
      <div>
        <Button type="button">Commencer</Button>
      </div>
    </main>
  );
}
