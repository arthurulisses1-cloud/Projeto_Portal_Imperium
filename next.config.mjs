/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js limita o corpo de uma Server Action a 1MB por padrão — nunca foi
  // configurado aqui, e várias telas fazem upload de imagem via Server
  // Action (logo de Tribo em /tribo, avatar, mídia do Mural, imagem de
  // Campanhas/Recordes). Foto de celular passa de 1MB fácil, então o upload
  // falhava sem erro claro pro usuário. Achado 2026-09-02: Arthur Barbosa
  // tentando trocar a logo da Tribo dele sem sucesso. Subido de 10mb pra
  // 50mb em 2026-09-23: material de aula da Imperium Academy (enviarMaterial)
  // usa o mesmo limite global e slide/PDF de aula passa fácil de 10MB —
  // achado com o Vinícius não conseguindo subir o material da aula dele.
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
