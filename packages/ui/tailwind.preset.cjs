const c = (n) => `rgb(var(--${n}) / <alpha-value>)`;
module.exports = {
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: c('bg'), surface: { DEFAULT: c('surface'), 2: c('surface-2'), 3: c('surface-3') },
        line: { DEFAULT: c('line'), strong: c('line-strong') },
        ink: c('ink'), muted: c('muted'), subtle: c('subtle'),
        primary: { DEFAULT: c('primary'), hover: c('primary-hover'), soft: c('primary-soft'), fg: c('primary-fg') },
        accent: c('accent'),
        success: { DEFAULT: c('success'), soft: c('success-soft') },
        warning: { DEFAULT: c('warning'), soft: c('warning-soft') },
        danger: { DEFAULT: c('danger'), soft: c('danger-soft') },
        info: { DEFAULT: c('info'), soft: c('info-soft') },
        chrome: { DEFAULT: c('chrome'), ink: c('chrome-ink'), muted: c('chrome-muted') },
        overlay: c('overlay'),
      },
      fontFamily: { sans: ["'Inter Variable'", 'Inter', "'Segoe UI'", 'system-ui', 'sans-serif'] },
      fontSize: {
        xs: ['12px', '16px'], sm: ['13px', '18px'], base: ['14px', '20px'], md: ['16px', '22px'],
        lg: ['20px', '26px'], xl: ['24px', '30px'], '2xl': ['32px', '38px'], '3xl': ['48px', '52px'],
      },
      borderRadius: { control: '8px', card: '12px' },
      boxShadow: {
        overlay: '0 20px 50px -12px rgb(0 0 0 / 0.35), 0 0 0 1px rgb(var(--line) / 0.8)',
        pop: '0 8px 24px -6px rgb(0 0 0 / 0.25)',
      },
    },
  },
};
