/** @type {import('tailwindcss').Config} */
// Charte Ecclesia : configuration Tailwind (v3) de l'appli de débat.
//
// Ce fichier remplace `tailwind.config.js` à la racine de l'appli. Il reprend
// tel quel tout ce que contenait l'ancien fichier (`content`, animations
// `speaking` et `toast-in`) et y ajoute la charte du site Ecclesia
// (https://github.com/Antrimas/ecclesia-centralesupelec, src/app/globals.css).
//
// Trois étages :
// 1. Les cinq couleurs du site, sous les mêmes noms que dans son code
//    (`bg-bleu-fonce`, `text-anthracite/70`, `bg-creme`…). À utiliser pour
//    tout nouvel élément de marque.
// 2. Les palettes Tailwind que l'appli utilise déjà (gray, indigo, slate,
//    teal…), réaccordées à la charte. Chaque palette garde sa teinte et son
//    sens (indigo = action principale, teal = file « sujet actuel », red = erreur…) :
//    l'appli prend les couleurs Ecclesia sans qu'on touche une seule classe.
//    Repères : indigo-600 = bleu-fonce, indigo-300 = bleu-clair,
//    gray-50 = crème, gray-900 = anthracite, slate-900 = bleu-fonce.
// 3. Polices, arrondis et ombres du site : Newsreader (titres), Archivo
//    (texte), angles quasi droits, ombres douces teintées de bleu marine.

export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── 1. Couleurs du site ────────────────────────────────────────
        'bleu-fonce': '#15233f',
        anthracite: '#20242b',
        'bleu-clair': '#9bbbe2',
        creme: '#fbf9f4',
        sable: '#f1ebdd',

        // ── 2. Palettes de l'appli, réaccordées ───────────────────────
        // Bleu marine : action principale, sélection, liens, focus.
        indigo: {
          50: '#f2f6fb',
          100: '#e4ecf7',
          200: '#c9d9ee',
          300: '#9bbbe2', // bleu-clair
          400: '#6383b4',
          500: '#2b4a86',
          600: '#15233f', // bleu-fonce
          700: '#101b33',
          800: '#0c1427',
          900: '#080e1c',
          950: '#050912',
        },
        // Neutres : anthracite posé sur crème, comme `text-anthracite/60` du site.
        gray: {
          50: '#fbf9f4', // crème
          100: '#f2eee6',
          200: '#e2dfd9',
          300: '#c6c4bf',
          400: '#898a8c',
          500: '#6d6f71',
          600: '#55575a',
          700: '#3f4246',
          800: '#2f3337',
          900: '#20242b', // anthracite
          950: '#15181d',
        },
        // Neutres froids des vues sombres (vue modérateur) : nuit bleu marine,
        // comme le bandeau de la page d'accueil du site.
        slate: {
          50: '#f6f8fb',
          100: '#edf0f5',
          200: '#dde3ec',
          300: '#c0c9d8',
          400: '#97a3ba',
          500: '#6d7c9a',
          600: '#4a5d85',
          700: '#2c3f66',
          800: '#1f3155',
          900: '#15233f', // bleu-fonce
          950: '#0b1424',
        },
        // Sarcelle profond : file « Demander la parole sur le sujet actuel »
        // (l'ancien « Coupe file »).
        teal: {
          50: '#f0f7f6',
          100: '#e0efee',
          200: '#bfdedd',
          300: '#8cc2c2',
          400: '#5aa3a5',
          500: '#2f8487',
          600: '#1e6b6d',
          700: '#195a5c',
          800: '#164a4c',
          900: '#123c3e',
          950: '#0b2627',
        },
        // Ocre : « Vous avez la parole », pause, avertissements.
        amber: {
          50: '#fcf6e9',
          100: '#f8eacb',
          200: '#f0d49a',
          300: '#e5b964',
          400: '#d79e38',
          500: '#c4861f',
          600: '#9a6312',
          700: '#7d5011',
          800: '#634112',
          900: '#4f3512',
          950: '#2e1e09',
        },
        // Vert sauge : succès, accord (« sujet suivant »).
        emerald: {
          50: '#eef6f0',
          100: '#d9ecdf',
          200: '#b3d8c0',
          300: '#85bd9c',
          400: '#5b9f7b',
          500: '#3f8462',
          600: '#2f6c4f',
          700: '#265841',
          800: '#1f4635',
          900: '#19392b',
          950: '#0e2219',
        },
        green: {
          50: '#eef6f0',
          100: '#d9ecdf',
          200: '#b3d8c0',
          300: '#85bd9c',
          400: '#5b9f7b',
          500: '#3f8462',
          600: '#2f6c4f',
          700: '#265841',
          800: '#1f4635',
          900: '#19392b',
          950: '#0e2219',
        },
        // Brique : erreurs, suppression, exclusion.
        red: {
          50: '#fbf0ee',
          100: '#f6dcd7',
          200: '#ecbab1',
          300: '#df9083',
          400: '#cd6656',
          500: '#b64a3a',
          600: '#9b3a2d',
          700: '#7f2f25',
          800: '#66271f',
          900: '#52211b',
          950: '#2f120e',
        },
        // Prune : outils d'intelligence artificielle (superadmin).
        purple: {
          50: '#f5f1f8',
          100: '#e9e0f0',
          200: '#d4c2e1',
          300: '#b89dcc',
          400: '#9877b2',
          500: '#7c5a98',
          600: '#66477f',
          700: '#533a68',
          800: '#432f53',
          900: '#372743',
          950: '#211727',
        },
        violet: {
          50: '#f5f1f8',
          100: '#e9e0f0',
          200: '#d4c2e1',
          300: '#b89dcc',
          400: '#9877b2',
          500: '#7c5a98',
          600: '#66477f',
          700: '#533a68',
          800: '#432f53',
          900: '#372743',
          950: '#211727',
        },
        // Or pâle : « consensus partiel ».
        yellow: {
          50: '#fcf8e6',
          100: '#f7efc9',
          200: '#efdf95',
          300: '#e4c95c',
          400: '#d6b133',
          500: '#bf981c',
          600: '#9e7c14',
          700: '#7d6211',
          800: '#634e11',
          900: '#514011',
          950: '#2f2408',
        },
        // Cuivre.
        orange: {
          50: '#fcf3ec',
          100: '#f8e2d1',
          200: '#f0c3a2',
          300: '#e49d6d',
          400: '#d67c43',
          500: '#c26a2c',
          600: '#a4561f',
          700: '#84451b',
          800: '#6a3818',
          900: '#562f16',
          950: '#311a0b',
        },
      },

      // ── 3. Polices, arrondis, ombres ─────────────────────────────────
      // Polices auto-hébergées par @fontsource-variable/newsreader et
      // @fontsource-variable/archivo (importées en tête de src/index.css).
      fontFamily: {
        serif: ['"Newsreader Variable"', 'Newsreader', 'Georgia', 'serif'],
        sans: ['"Archivo Variable"', 'Archivo', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      // Le site est à angles droits. L'appli garde un soupçon d'arrondi sur
      // ses gros boutons tactiles, sans revenir aux angles ronds actuels.
      // `rounded-full` (pastilles, points, rotors) reste inchangé.
      borderRadius: {
        sm: '0.0625rem',
        DEFAULT: '0.125rem',
        md: '0.125rem',
        lg: '0.125rem',
        xl: '0.1875rem',
        '2xl': '0.25rem',
        '3xl': '0.375rem',
      },
      // Ombres longues et douces, teintées de bleu marine (comme les cartes du site).
      boxShadow: {
        sm: '0 1px 2px 0 rgba(21, 35, 63, 0.06)',
        DEFAULT: '0 1px 3px 0 rgba(21, 35, 63, 0.08), 0 1px 2px -1px rgba(21, 35, 63, 0.06)',
        md: '0 10px 24px -16px rgba(21, 35, 63, 0.45)',
        lg: '0 18px 36px -22px rgba(21, 35, 63, 0.45)',
        xl: '0 24px 46px -28px rgba(21, 35, 63, 0.5)',
        '2xl': '0 40px 90px -30px rgba(21, 35, 63, 0.55)',
      },

      // Animations : les deux premières existaient déjà, ne pas les retirer.
      animation: {
        speaking: 'speaking-pulse 2s ease-in-out infinite',
        'toast-in': 'toast-in 0.15s ease-out',
        entree: 'entree 0.45s cubic-bezier(0.16, 0.84, 0.44, 1) both',
        // Montée des blocs à l'arrivée sur un écran (« hero-in » du site).
        // `backwards` et non `both` : une fois jouée, l'animation ne laisse
        // aucun transform derrière elle. Un transform résiduel ferait du bloc
        // le repère des fenêtres `position: fixed` qu'il contient (Outils,
        // étapes), qui s'ouvriraient alors dans le bloc et non sur l'écran.
        montee: 'montee 0.6s cubic-bezier(0.16, 0.84, 0.44, 1) backwards',
        // Cases du fond quadrillé qui s'allument et s'éteignent (GrilleAnimee du site).
        case: 'case 8s ease-in-out infinite',
        // Halo qui s'élargit autour d'un point « en direct ».
        pouls: 'pouls 2.4s cubic-bezier(0, 0, 0.2, 1) infinite',
        // Barres de « Vous avez la parole ! ».
        onde: 'onde 1.1s ease-in-out infinite',
        // Apparition d'une position dans la file.
        pop: 'pop 0.45s cubic-bezier(0.16, 0.84, 0.44, 1) both',
      },
      keyframes: {
        'speaking-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateY(0.5rem)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Entrée douce d'un panneau ou d'une modale (« hero-in » du site, raccourci).
        entree: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        montee: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        case: {
          '0%, 100%': { opacity: '0' },
          '35%, 55%': { opacity: '1' },
          '85%': { opacity: '0' },
        },
        pouls: {
          '0%': { transform: 'scale(1)', opacity: '0.75' },
          '80%, 100%': { transform: 'scale(2.8)', opacity: '0' },
        },
        onde: {
          '0%, 100%': { transform: 'scaleY(0.35)' },
          '50%': { transform: 'scaleY(1)' },
        },
        pop: {
          '0%': { opacity: '0', transform: 'scale(0.6)' },
          '60%': { opacity: '1', transform: 'scale(1.08)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
