import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import enUS from './locales/en-US.json';
import enGB from './locales/en-GB.json';
import ja from './locales/ja.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'en-US': { translation: enUS },
      'en-GB': { translation: enGB },
      'ja': { translation: ja },
    },
    fallbackLng: 'en-US',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'haradaLanguage',
      caches: ['localStorage'],
    },
  });

export default i18n;
