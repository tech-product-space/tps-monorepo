import {
  Cinzel,
  EB_Garamond,
  Great_Vibes,
  Inter,
  Montserrat,
  Playfair_Display,
  Roboto_Mono,
} from "next/font/google";

/**
 * The families the certificate renderer bundles, loaded into the browser too.
 *
 * The design canvas is a WYSIWYG of a server-side render, so it has to draw
 * with the same faces at the same weights — `CERTIFICATE_FONTS` in the
 * backend's `config/constants/eventCertificate.js` is the other half of this
 * list, and the weights here mirror the `faces` map for each family.
 *
 * `preload: false` throughout: these matter on exactly one screen, and
 * preloading seven families would put a request for each in the <head> of
 * every page in the panel.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "900"],
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  preload: false,
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  preload: false,
});

const ebGaramond = EB_Garamond({
  variable: "--font-eb-garamond",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  preload: false,
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  preload: false,
});

const greatVibes = Great_Vibes({
  variable: "--font-great-vibes",
  subsets: ["latin"],
  weight: ["400"],
  preload: false,
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  preload: false,
});

/** Every font variable, for the <body> className in the root layout. */
export const certificateFontVariables = [
  inter.variable,
  montserrat.variable,
  playfairDisplay.variable,
  ebGaramond.variable,
  cinzel.variable,
  greatVibes.variable,
  robotoMono.variable,
].join(" ");
