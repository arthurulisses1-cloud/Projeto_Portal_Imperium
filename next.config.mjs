/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js limita o corpo de uma Server Action a 1MB por padrão — nunca foi
  // configurado aqui, e várias telas fazem upload de imagem via Server
  // Action (logo de Tribo em /tribo, avatar, mídia do Mural, imagem de
  // Campanhas/Recordes). Foto de celular passa de 1MB fácil, então o upload
  // falhava sem erro claro pro usuário. Achado 2026-09-02: Arthur Barbosa
  // tentando trocar a logo da Tribo dele sem sucesso.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
