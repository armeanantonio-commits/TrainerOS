import { Link } from 'react-router-dom';
import { useI18n } from '@/hooks/useI18n';

export default function Footer() {
  const { t } = useI18n();
  const productLinks = [
    { name: t('footer.features'), path: '/features' },
    { name: t('footer.pricing'), path: '/pricing' },
  ];

  const companyLinks = [
    { name: t('footer.about'), path: '/about' },
    { name: t('footer.contact'), path: '/contact' },
  ];

  const legalLinks = [
    { name: t('footer.terms'), path: '/terms' },
    { name: t('footer.privacy'), path: '/privacy' },
  ];

  return (
    <footer className="relative z-10 mt-20 px-3 pb-6 sm:px-5">
      <div className="console-panel mx-auto max-w-7xl rounded-[32px] px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-white/8 bg-white/[0.03] px-4 py-4">
          <div>
            <p className="console-kicker mb-1">{t('footer.systemStatus')}</p>
            <p className="text-sm text-slate-300/78">{t('footer.systemText')}</p>
          </div>
          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.24em] text-slate-400">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-300 animate-pulse-soft" />
              {t('footer.live')}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-300 animate-pulse-soft" />
              {t('footer.ready')}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Logo & Description */}
          <div className="col-span-1">
            <div className="flex items-center gap-3 mb-4">
              <img
                src="/logo.jpeg"
                alt={t('footer.logoAlt')}
                className="h-11 w-11 rounded-2xl border border-cyan-300/20 object-cover"
              />
              <div>
                <p className="console-kicker text-[10px]">{t('footer.operatingLayer')}</p>
                <span className="text-white font-bold text-xl font-display">TrainerOS</span>
              </div>
            </div>
            <p className="text-sm text-slate-300/72">
              {t('footer.description')}
            </p>
          </div>

          {/* Product Links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/84">{t('footer.product')}</h3>
            <ul className="space-y-2">
              {productLinks.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className="text-sm text-slate-300/68 transition-colors hover:text-white"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/84">{t('footer.company')}</h3>
            <ul className="space-y-2">
              {companyLinks.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className="text-sm text-slate-300/68 transition-colors hover:text-white"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/84">{t('footer.legal')}</h3>
            <ul className="space-y-2">
              {legalLinks.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className="text-sm text-slate-300/68 transition-colors hover:text-white"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="console-divider mt-8 border-t pt-8 text-center">
          <p className="text-sm text-slate-400/80">
            {t('footer.copyright', { year: new Date().getFullYear() })}
          </p>
        </div>
      </div>
    </footer>
  );
}
