import { Button } from "@/components/ui/button";

export function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-(--texte-note-corps-largeur-max) flex-col justify-center gap-4 p-8">
      <h1 className="titre-page">Harvey</h1>
      <p className="corps text-muted-foreground">Votre cabinet, vos dossiers, votre temps — au même endroit.</p>
      <p className="note-corps">
        Vous retrouvez ici chaque note de dossier, <em>exactement</em> telle que vous l’avez écrite.
      </p>
      <p className="mono">2026-0001</p>
      <div>
        <Button type="button">Commencer</Button>
      </div>
    </main>
  );
}
