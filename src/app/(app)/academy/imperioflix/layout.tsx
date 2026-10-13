import ImperioflixFundo from "@/components/imperioflix/ImperioflixFundo";
import ImperioflixTema from "@/components/imperioflix/ImperioflixTema";

// Todas as telas da Imperioflix (home, série e aula) usam o tema claro próprio
// e um plano de fundo de "formação" no lugar do Coliseu padrão.
export default function ImperioflixLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ImperioflixTema />
      <ImperioflixFundo />
      {children}
    </>
  );
}
