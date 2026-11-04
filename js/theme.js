// Tema: "auto" segue l'impostazione del telefono; chiaro e scuro la forzano.
export function applyTheme(value) {
  const root = document.documentElement;
  if (value === 'light' || value === 'dark') root.dataset.theme = value;
  else delete root.dataset.theme;
}
