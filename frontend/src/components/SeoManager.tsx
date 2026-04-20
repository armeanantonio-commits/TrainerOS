import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_NAME = 'TrainerOS';
const SITE_URL = 'https://traineros.org';
const DEFAULT_IMAGE_URL = `${SITE_URL}/logo.jpeg`;
const DEFAULT_TITLE = 'TrainerOS - Content & Client System pentru Antrenori Fitness';
const DEFAULT_DESCRIPTION = 'Sistemul de content care transformă postările în clienți pentru antrenori fitness.';
const DEFAULT_KEYWORDS = [
  'TrainerOS',
  'content marketing pentru antrenori',
  'marketing fitness',
  'idei content fitness',
  'AI pentru antrenori',
  'social media fitness',
  'lead generation fitness',
  'traineros.org',
].join(', ');

type RouteSeo = {
  title: string;
  description: string;
  keywords?: string;
  robots?: string;
};

const routeSeo: Record<string, RouteSeo> = {
  '/': {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  '/features': {
    title: 'Funcționalități TrainerOS pentru Antrenori Fitness',
    description:
      'Descoperă workflow-urile TrainerOS pentru idei de content, research de nișă, review de postări și conversie mai bună pentru antrenori fitness.',
  },
  '/pricing': {
    title: 'Prețuri TrainerOS',
    description:
      'Vezi planurile TrainerOS și alege sistemul potrivit pentru a crea content constant și a atrage clienți pentru business-ul tău de fitness.',
  },
  '/about': {
    title: 'Despre TrainerOS',
    description:
      'Află cum TrainerOS ajută antrenorii fitness să transforme strategia de content într-un sistem clar pentru creștere și clienți.',
  },
  '/contact': {
    title: 'Contact TrainerOS',
    description:
      'Contactează echipa TrainerOS pentru întrebări despre platformă, planuri, suport și implementare pentru business-ul tău de fitness.',
  },
  '/terms': {
    title: 'Termeni și Condiții TrainerOS',
    description: 'Termenii și condițiile de utilizare pentru platforma TrainerOS.',
    robots: 'noindex, follow',
  },
  '/privacy': {
    title: 'Politica de Confidențialitate TrainerOS',
    description: 'Politica de confidențialitate pentru TrainerOS și modul în care sunt tratate datele utilizatorilor.',
    robots: 'noindex, follow',
  },
  '/gdpr': {
    title: 'GDPR TrainerOS',
    description: 'Informații GDPR și drepturile utilizatorilor în cadrul platformei TrainerOS.',
    robots: 'noindex, follow',
  },
  '/login': {
    title: 'Login TrainerOS',
    description: 'Autentificare în contul TrainerOS.',
    robots: 'noindex, nofollow',
  },
  '/register': {
    title: 'Înregistrare TrainerOS',
    description: 'Creează un cont TrainerOS pentru a începe să construiești content care aduce clienți.',
    robots: 'noindex, nofollow',
  },
  '/forgot-password': {
    title: 'Resetare Parolă TrainerOS',
    description: 'Recuperează accesul la contul tău TrainerOS.',
    robots: 'noindex, nofollow',
  },
  '/reset-password': {
    title: 'Setează o Parolă Nouă TrainerOS',
    description: 'Setează o parolă nouă pentru contul tău TrainerOS.',
    robots: 'noindex, nofollow',
  },
  '/activate-account': {
    title: 'Activare Cont TrainerOS',
    description: 'Activează contul tău TrainerOS pentru a accesa platforma.',
    robots: 'noindex, nofollow',
  },
};

const privateRoutePrefixes = [
  '/dashboard',
  '/niche-finder',
  '/niche-quick',
  '/niche-discover',
  '/content-preferences',
  '/cum-vrei-sa-creezi-content',
  '/daily-idea',
  '/idea-structure',
  '/idea/',
  '/content-review',
  '/feedback/',
  '/idea-history',
  '/settings',
  '/chat',
  '/email',
  '/client-nutrition',
];

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;

  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attr, key);
    document.head.appendChild(element);
  }

  element.setAttribute('content', content);
}

function upsertLink(rel: string, href: string) {
  let element = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;

  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', rel);
    document.head.appendChild(element);
  }

  element.setAttribute('href', href);
}

function upsertJsonLd(canonicalUrl: string, title: string, description: string) {
  const id = 'traineros-seo-jsonld';
  let element = document.getElementById(id) as HTMLScriptElement | null;

  if (!element) {
    element = document.createElement('script');
    element.id = id;
    element.type = 'application/ld+json';
    document.head.appendChild(element);
  }

  element.textContent = JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': `${SITE_URL}/#organization`,
          name: SITE_NAME,
          url: SITE_URL,
          logo: DEFAULT_IMAGE_URL,
        },
        {
          '@type': 'WebSite',
          '@id': `${SITE_URL}/#website`,
          url: SITE_URL,
          name: SITE_NAME,
          inLanguage: 'ro-RO',
        },
        {
          '@type': 'WebPage',
          '@id': `${canonicalUrl}#webpage`,
          url: canonicalUrl,
          name: title,
          description,
          isPartOf: {
            '@id': `${SITE_URL}/#website`,
          },
          about: {
            '@id': `${SITE_URL}/#organization`,
          },
          primaryImageOfPage: {
            '@type': 'ImageObject',
            url: DEFAULT_IMAGE_URL,
          },
          inLanguage: 'ro-RO',
        },
      ],
    },
    null,
    0
  );
}

export default function SeoManager() {
  const location = useLocation();

  useEffect(() => {
    const canonicalUrl = `${SITE_URL}${location.pathname}`;
    const isPrivateRoute = privateRoutePrefixes.some((route) => location.pathname === route || location.pathname.startsWith(route));
    const config = routeSeo[location.pathname];

    const title = config?.title ?? DEFAULT_TITLE;
    const description = config?.description ?? DEFAULT_DESCRIPTION;
    const keywords = config?.keywords ?? DEFAULT_KEYWORDS;
    const robots = isPrivateRoute ? 'noindex, nofollow' : config?.robots ?? 'index, follow';

    document.title = title;

    upsertLink('canonical', canonicalUrl);
    upsertMeta('name', 'description', description);
    upsertMeta('name', 'keywords', keywords);
    upsertMeta('name', 'author', SITE_NAME);
    upsertMeta('name', 'robots', robots);
    upsertMeta('property', 'og:type', 'website');
    upsertMeta('property', 'og:locale', 'ro_RO');
    upsertMeta('property', 'og:site_name', SITE_NAME);
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:url', canonicalUrl);
    upsertMeta('property', 'og:image', DEFAULT_IMAGE_URL);
    upsertMeta('property', 'og:image:type', 'image/jpeg');
    upsertMeta('property', 'og:image:width', '1024');
    upsertMeta('property', 'og:image:height', '1024');
    upsertMeta('property', 'twitter:card', 'summary_large_image');
    upsertMeta('property', 'twitter:title', title);
    upsertMeta('property', 'twitter:description', description);
    upsertMeta('property', 'twitter:image', DEFAULT_IMAGE_URL);
    upsertJsonLd(canonicalUrl, title, description);
  }, [location.pathname]);

  return null;
}
