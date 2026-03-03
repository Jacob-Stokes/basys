import { describe, it, expect, beforeEach } from 'vitest';
import i18n from '../../src/i18n';

describe('i18n Configuration', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en-US');
  });

  it('initialises with en-US as default language', () => {
    expect(i18n.language).toBe('en-US');
  });

  it('loads en-US translations', () => {
    expect(i18n.t('common.loading')).toBe('Loading...');
    expect(i18n.t('login.signIn')).toBe('Sign In');
    expect(i18n.t('home.yourGoals')).toBe('Your Goals');
  });

  it('supports interpolation', () => {
    const result = i18n.t('home.showingRange', { start: 1, end: 5, total: 12 });
    expect(result).toContain('1');
    expect(result).toContain('5');
    expect(result).toContain('12');
    expect(i18n.t('goalGrid.addSubGoal', { position: 3 })).toBe('Add Sub-goal 3');
    expect(i18n.t('goalGrid.activityHistory', { count: 7 })).toBe('Activity History (7)');
  });

  it('switches to en-GB and overrides specific keys', async () => {
    await i18n.changeLanguage('en-GB');
    expect(i18n.language).toBe('en-GB');

    // en-GB overrides
    expect(i18n.t('settings.colorPalette')).toBe('Colour Palette');
    expect(i18n.t('settings.centerLayout')).toBe('Centre Layout');
    expect(i18n.t('settings.centerBackground')).toBe('Centre Background');
  });

  it('falls back to en-US for keys not overridden in en-GB', async () => {
    await i18n.changeLanguage('en-GB');

    // These should fall back to en-US
    expect(i18n.t('common.loading')).toBe('Loading...');
    expect(i18n.t('login.signIn')).toBe('Sign In');
    expect(i18n.t('home.createGoal')).toBe('Create Goal');
  });

  it('switches back to en-US cleanly', async () => {
    await i18n.changeLanguage('en-GB');
    expect(i18n.t('settings.colorPalette')).toBe('Colour Palette');

    await i18n.changeLanguage('en-US');
    // en-US uses US spellings
    expect(i18n.t('settings.colorPalette')).toBe('Color Palette');
    expect(i18n.t('settings.centerLayout')).toBe('Center Layout');
  });

  it('has all expected top-level namespaces', () => {
    const enUS = i18n.getResourceBundle('en-US', 'translation');
    const expectedNamespaces = [
      'common', 'app', 'login', 'home', 'goalGrid', 'agents',
      'sharedGoal', 'settings', 'share', 'guestbook', 'fullGrid', 'palette',
    ];
    for (const ns of expectedNamespaces) {
      expect(enUS).toHaveProperty(ns);
    }
  });

  it('switches to Japanese and loads translations', async () => {
    await i18n.changeLanguage('ja');
    expect(i18n.language).toBe('ja');

    expect(i18n.t('common.loading')).toBe('読み込み中...');
    expect(i18n.t('login.signIn')).toBe('サインイン');
    expect(i18n.t('home.yourGoals')).toBe('あなたの目標');
    expect(i18n.t('settings.title')).toBe('設定');
  });

  it('supports interpolation in Japanese', async () => {
    await i18n.changeLanguage('ja');
    expect(i18n.t('goalGrid.addSubGoal', { position: 3 })).toBe('サブ目標3を追加');
    expect(i18n.t('goalGrid.activityHistory', { count: 7 })).toBe('活動履歴（7件）');
    expect(i18n.t('settings.exportedGoals', { count: 5 })).toBe('5件の目標をエクスポートしました。');
  });

  it('Japanese has all expected top-level namespaces', () => {
    const ja = i18n.getResourceBundle('ja', 'translation');
    const expectedNamespaces = [
      'common', 'app', 'login', 'home', 'goalGrid', 'agents',
      'sharedGoal', 'settings', 'share', 'guestbook', 'fullGrid', 'palette',
    ];
    for (const ns of expectedNamespaces) {
      expect(ja).toHaveProperty(ns);
    }
  });
});
