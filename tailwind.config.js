const twitterBlue = {
  50: '#E8F5FD',
  100: '#D7EDFF',
  200: '#B8DCF8',
  300: '#8ECDF8',
  400: '#1D9BF0',
  500: '#1D9BF0',
  600: '#1A8CD8',
  700: '#1577B8',
  800: '#0F5F92',
  900: '#0B4A73',
  950: '#062D46',
};

module.exports = {
  content: ['./src/**/*.{html,js,jsx,ts,tsx}', './public/**/*.html'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        blue: twitterBlue,
        'xhunt-accent': {
          DEFAULT: twitterBlue[500],
          hover: twitterBlue[600],
          soft: twitterBlue[50],
        },
      },
    },
  },
  plugins: [],
  // 生产环境优化
  ...(process.env.NODE_ENV === 'production' &&
    {
      // 移除 safelist，因为这些都是自定义 CSS 类，不是 Tailwind 工具类
      // theme-*, xhunt-*, floating-* 都是在 CSS 文件中定义的自定义类
      // Tailwind 的 purge 功能不会移除这些类，因为它们不是 Tailwind 的工具类
    }),
};
