// O Supabase/PostgREST corta qualquer resposta em no máximo 1000 linhas por
// padrão (db.max_rows), SEM erro — só devolve as 1000 primeiras (ordem não
// garantida sem .order()) e o `Content-Range` no header denuncia o corte,
// mas o client comum nem olha pra isso. Query grande sem paginação =
// dado sumindo em silêncio (foi exatamente isso que zerava entrevistas/
// tentativas de metade do time na Weekly de Receita: a query pedia o ano
// inteiro, tinha ~7000 linhas, e só as 1000 primeiras voltavam).
//
// `build` deve retornar a query JÁ com todos os filtros/order aplicados,
// exceto range — essa função cuida da paginação chamando `.range()` em loop.
export async function buscarTudoPaginado<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  tamanhoPagina = 1000
): Promise<T[]> {
  const resultado: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build(from, from + tamanhoPagina - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    resultado.push(...data);
    if (data.length < tamanhoPagina) break;
    from += tamanhoPagina;
  }
  return resultado;
}
