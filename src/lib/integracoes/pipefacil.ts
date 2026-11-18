// Cliente do Pipefácil (API pública v1). Só leitura: leads (deals) de um funil,
// histórico de movimentação e membros da conta.

export type DealPipefacil = {
  id: string;
  seq: number;
  name: string | null;
  value: number | null;
  status: "open" | "won" | "lost" | string;
  pipelineId: string;
  stageId: string;
  responsibleUserId: string | null;
  properties: Record<string, unknown> | null;
  tags?: { name: string }[];
  tracking?: { utmSource?: string | null } | null;
  company?: { name?: string | null } | null;
  createdAt: string;
  closedAt: string | null;
  lostReason?: string | null;
  expectedCloseAt?: string | null;
  /** Contato do lead (objeto livre na API; o telefone vem dele ou da lista de contatos pelo id). */
  contact?: Record<string, unknown> | null;
  contactId?: string | null;
};

export type ContatoPipefacil = { id: string; phone: string | null; name: string | null; displayName?: string | null; email?: string | null };

export type FunilPipefacil = { id: string; seq: number; name: string; stages: { id: string; name: string }[] };

export type AtividadePipefacil = {
  id: string;
  dealId: string;
  type: string;
  field?: string | null;
  changes: { to?: unknown; from?: unknown } | null;
  metadata: { stageId?: string; pipelineId?: string; responsibleUserId?: string } | null;
  occurredAt: string;
};

export type MembroPipefacil = { userId: string; name: string; email: string | null };

type Pagina<T> = { data: { items: T[]; nextCursor: string | null; hasMore: boolean } };

export class Pipefacil {
  constructor(
    private token: string,
    private base = process.env.PIPEFACIL_API_URL ?? "",
  ) {
    if (!this.base) throw new Error("PIPEFACIL_API_URL não configurada (endereço da API do Pipefácil).");
    this.base = this.base.replace(/\/+$/, "");
  }

  private async get<T>(caminho: string, params: Record<string, string | string[] | undefined> = {}): Promise<T> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      for (const item of Array.isArray(v) ? v : [v]) qs.append(k, item);
    }
    const q = qs.toString();
    const res = await fetch(`${this.base}/api/v1${caminho}${q ? `?${q}` : ""}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${this.token}`, "X-Api-Key": this.token },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Pipefácil respondeu ${res.status} em ${caminho}`);
    return (await res.json()) as T;
  }

  /** Todos os leads de um funil (abertos, ganhos e perdidos). */
  async dealsDoFunil(pipelineSeq: number): Promise<DealPipefacil[]> {
    const out: DealPipefacil[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 200; i++) {
      const r = await this.get<Pagina<DealPipefacil>>("/deals", { pipeline: String(pipelineSeq), limit: "200", cursor });
      out.push(...r.data.items);
      if (!r.data.hasMore || !r.data.nextCursor) break;
      cursor = r.data.nextCursor;
    }
    return out;
  }

  /**
   * Histórico de movimentação da conta, do mais novo para o mais antigo, até `desde`
   * (exclusivo). Só criação, troca de etapa e ganho.
   */
  async atividadesDesde(desde: string): Promise<AtividadePipefacil[]> {
    const limite = Date.parse(desde);
    const out: AtividadePipefacil[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 500; i++) {
      const r = await this.get<Pagina<AtividadePipefacil>>("/deals/activities", {
        type: ["STAGE_CHANGED", "DEAL_CREATED", "DEAL_WON"],
        limit: "200",
        cursor,
      });
      let passou = false;
      for (const a of r.data.items) {
        if (Date.parse(a.occurredAt) <= limite) {
          passou = true;
          continue;
        }
        out.push(a);
      }
      if (passou || !r.data.hasMore || !r.data.nextCursor) break;
      cursor = r.data.nextCursor;
    }
    return out;
  }

  /** Contatos da conta (id, telefone, nome): só leitura, para identificar o cliente de cada lead. */
  async contatos(): Promise<ContatoPipefacil[]> {
    const out: ContatoPipefacil[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 300; i++) {
      const r = await this.get<Pagina<ContatoPipefacil>>("/contacts", { limit: "200", cursor });
      out.push(...r.data.items);
      if (!r.data.hasMore || !r.data.nextCursor) break;
      cursor = r.data.nextCursor;
    }
    return out;
  }

  /** Funis da conta com as etapas (nomes para a auditoria). */
  async funis(): Promise<FunilPipefacil[]> {
    const r = await this.get<{ data: FunilPipefacil[] | { items: FunilPipefacil[] } }>("/pipelines");
    return Array.isArray(r.data) ? r.data : r.data.items ?? [];
  }

  /** Campos personalizados dos leads com as opções (valor → rótulo), para mostrar o texto do CRM. */
  async camposDosLeads(): Promise<{ slug: string; options?: { value: string; label: string }[] }[]> {
    const r = await this.get<{ data: unknown }>("/custom-fields", { entity: "deal" });
    const d = r.data as { items?: unknown[] } | unknown[];
    return (Array.isArray(d) ? d : d.items ?? []) as { slug: string; options?: { value: string; label: string }[] }[];
  }

  async membros(): Promise<MembroPipefacil[]> {
    const r = await this.get<{ data: { members: MembroPipefacil[] } }>("/users");
    return r.data.members ?? [];
  }
}
