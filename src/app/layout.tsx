import type { Metadata } from "next";
import localFont from "next/font/local";
import { Cinzel, Cormorant_Garamond } from "next/font/google";
import ColosseumWatermark from "@/components/ui/ColosseumWatermark";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});
const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-cinzel",
});
const garamond = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-garamond",
});

export const metadata: Metadata = {
  title: "SENATUS — Matri Bank",
  description: "Sistema interno de rotina, indicadores e carreira",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} ${garamond.variable} antialiased bg-imperium-bg text-stone-100`}
      >
        <script
          // roda antes da hidratação pra não piscar o tema errado (padrão: Roma)
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('imperium-theme');if(location.pathname.indexOf('/academy/imperioflix')===0)t='imperioflix';if(t)document.documentElement.setAttribute('data-theme',t);var v=document.cookie.match(/(?:^|; )visual_atual=([a-z0-9-]+)/);var m=document.cookie.match(/(?:^|; )negocio_atual=([a-z0-9-]+)/);var q=v&&v[1]!=='auto'?(v[1]==='padrao'?null:v[1]):(m&&m[1]!=='todos'?m[1]:null);if(q){document.documentElement.setAttribute('data-negocio',q);var d=document.cookie.match(/(?:^|; )visual_modo=([a-z]+)/);var md=d&&(d[1]==='claro'||d[1]==='escuro')?d[1]:((q==='vorp-finance'||q==='matchsales')?'claro':'escuro');document.documentElement.setAttribute('data-modo',md)}}catch(e){}",
          }}
        />
        <ColosseumWatermark className="coliseu-bg pointer-events-none fixed inset-x-0 bottom-0 -z-10 h-[42vh] w-full text-gold/[0.07]" />
        {children}
      </body>
    </html>
  );
}
