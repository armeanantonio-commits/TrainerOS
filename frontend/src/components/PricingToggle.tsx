import { useI18n } from '@/hooks/useI18n';

interface PricingToggleProps {
  isAnnual: boolean;
  onToggle: (isAnnual: boolean) => void;
}

export default function PricingToggle({ isAnnual, onToggle }: PricingToggleProps) {
  const { language } = useI18n();
  const isEn = language === 'en';

  return (
    <div className="flex items-center justify-center gap-4 mb-12">
      <span
        className={`text-lg font-medium transition-colors ${
          !isAnnual ? 'text-white' : 'text-gray-500'
        }`}
      >
        {isEn ? 'Monthly' : 'Lunar'}
      </span>
      <button
        onClick={() => onToggle(!isAnnual)}
        className={`relative w-16 h-8 rounded-full transition-colors ${
          isAnnual ? 'bg-brand-500' : 'bg-dark-100'
        }`}
      >
        <div
          className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-transform ${
            isAnnual ? 'translate-x-9' : 'translate-x-1'
          }`}
        />
      </button>
      <span
        className={`text-lg font-medium transition-colors ${
          isAnnual ? 'text-white' : 'text-gray-500'
        }`}
      >
        {isEn ? 'Annual' : 'Anual'} <span className="text-brand-500 text-sm">({isEn ? 'save 20%' : 'economisești 20%'})</span>
      </span>
    </div>
  );
}
