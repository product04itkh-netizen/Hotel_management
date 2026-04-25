/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: '#004AAD',
        'dark-navy': '#002D6E',
        gold: '#C89B3C',
        'gold-light': '#F0D080',
        'hbg': '#F7F5F0',
        'hsurface': '#FFFFFF',
        'hsurface2': '#F0EDE6',
        'hborder': '#E2DDD4',
        'htext': '#1A1714',
        'hmuted': '#6B665E',
        'hlight': '#9E9A93',
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        serif: ['"DM Serif Display"', 'serif'],
      },
      boxShadow: {
        card: '0 1px 4px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.05)',
      },
    },
  },
  plugins: [],
}
