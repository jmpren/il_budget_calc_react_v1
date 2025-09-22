/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html','./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand1:'#086788', brand2:'#07A0C3', brand3:'#F0C808', brand4:'#FFF1D0', brand5:'#DD1C1A'
      }
    }
  },
  plugins: [],
}
